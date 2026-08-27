"""Phase 4 steps 1-2 — semantic retrieval and graph expansion.

Retrieval returns chunks; chunks are grouped into candidate standards so the
downstream synthesiser reasons over standards while keeping every citation
anchored to a specific passage.
"""
from __future__ import annotations
from typing import Any

import re

from backend.config import GRAPH_HOPS, RETRIEVAL_TOP_K, active_departments
from backend.kb.embedder import encode_query
from backend.kb.vector_index import VectorIndex

_TITLE_STOP = set(
    "for of and the part sec section code practice indian standard specification "
    "requirements requirement general methods test tests with rated up to".split())


def _stem(w: str) -> str:
    """Fold regular plurals. Titles are written in the plural ("Conduits for
    electrical installations"), queries in the singular ("rigid conduit for..."),
    so exact matching gave the conduit standard almost no credit."""
    for suf in ("ies", "es", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def _title_terms(s: str) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", (s or "").lower())
            if len(w) > 3 and w not in _TITLE_STOP}


TITLE_BOOST = 0.18   # measured: higher values did not change the golden-set outcome


class Retriever:
    """Semantic retrieval plus graph traversal.

    The FAISS index is loaded lazily. Graph expansion is pure SQL and must keep
    working before the index exists, so browsing a standard's dependencies does
    not depend on an embedding build having finished.
    """

    def __init__(self, con, index: VectorIndex | None = None):
        self.con = con
        self._index = index
        self._idf: dict[str, float] | None = None

    def _term_idf(self) -> dict[str, float]:
        """Inverse document frequency of every title term in the corpus.

        Plain overlap counts "electrical" (in thousands of titles) the same as
        "conduit" (in dozens), so a query for a rigid non-metallic conduit gave
        a flexible-steel-conduit standard as much title credit as the right one
        — they share "electrical wiring". Weighting by rarity makes the
        distinguishing words decide the ranking.
        """
        if self._idf is None:
            import math
            df: dict[str, int] = {}
            n = 0
            for (title,) in self.con.execute("SELECT title FROM standards"):
                n += 1
                for t in _title_terms(title):
                    df[t] = df.get(t, 0) + 1
            self._idf = {t: math.log(1 + n / (1 + c)) for t, c in df.items()}
            self._idf["__default__"] = math.log(1 + n)
        return self._idf

    @property
    def index(self) -> VectorIndex:
        if self._index is None:
            self._index = VectorIndex.load()
        return self._index

    # ---------- step 1: semantic retrieval ----------
    def search_chunks(self, query: str, k: int = RETRIEVAL_TOP_K,
                      per_standard_cap: int = 3) -> list[dict[str, Any]]:
        """Retrieve chunks, capped per standard so one verbose document cannot
        monopolise the candidate list and crowd out other relevant standards.

        When a department scope is active the index is still searched whole and
        out-of-scope hits are discarded afterwards, so the search widens until
        enough in-scope chunks are found rather than returning a thin list.
        """
        depts = active_departments()
        qvec = encode_query(query)
        widths = [k * 6, k * 24, k * 80] if depts else [k * 6]

        rows: list = []
        by_id: dict[str, float] = {}
        for width in widths:
            hits = self.index.search(qvec, k=width)
            if not hits:
                return []
            by_id = {cid: score for cid, score in hits}
            sql = (f"""SELECT c.id,c.text,c.section,c.chunk_index,
                       s.is_number,s.is_base,s.title,s.department,s.aspect,
                       s.technical_committee,s.year,s.metadata_only,s.has_full_text,
                       s.is_active,s.withdrawn_status
                FROM chunks c JOIN standards s ON s.id=c.standard_id
                WHERE c.id IN ({','.join('?' * len(by_id))})""")
            params = list(by_id)
            if depts:
                sql += f" AND s.department IN ({','.join('?' * len(depts))})"
                params += depts
            rows = self.con.execute(sql, params).fetchall()
            # Enough distinct standards to rank meaningfully? Then stop widening.
            if len({r["is_number"] for r in rows}) >= k or width == widths[-1]:
                break
        out = [dict(r) | {"score": by_id[r["id"]]} for r in rows]
        out.sort(key=lambda r: -r["score"])
        kept: list[dict[str, Any]] = []
        seen: dict[str, int] = {}
        for r in out:
            n = seen.get(r["is_number"], 0)
            if n >= per_standard_cap:
                continue
            seen[r["is_number"]] = n + 1
            kept.append(r)
            if len(kept) >= k:
                break
        return kept

    def candidate_standards(self, query: str, k: int = RETRIEVAL_TOP_K,
                            max_standards: int = 6) -> list[dict[str, Any]]:
        """Group chunk hits into per-standard candidates with their best passages."""
        chunks = self.search_chunks(query, k=k)
        agg: dict[str, dict[str, Any]] = {}
        for c in chunks:
            key = c["is_number"]
            e = agg.setdefault(key, {
                "is_number": key, "is_base": c["is_base"], "title": c["title"],
                "department": c["department"], "aspect": c["aspect"],
                "technical_committee": c["technical_committee"], "year": c["year"],
                "metadata_only": bool(c["metadata_only"]),
                "has_full_text": bool(c["has_full_text"]),
                "is_active": bool(c["is_active"]),
                "best_score": c["score"], "chunks": [],
            })
            e["best_score"] = max(e["best_score"], c["score"])
            e["chunks"].append({"chunk_id": c["id"], "section": c["section"],
                                "score": c["score"], "text": c["text"]})
        # Ranking adjustments below affect ORDER ONLY. `best_score` keeps the
        # true similarity so the critic's confidence signals stay honest.
        qt = _title_terms(query)
        idf = self._term_idf() if qt else {}
        default_idf = idf.get("__default__", 1.0)
        q_weight = sum(idf.get(t, default_idf) for t in qt) or 1.0

        def rank_key(r: dict[str, Any]) -> float:
            score = r["best_score"]
            # A withdrawn standard is still worth surfacing — a tender may cite
            # one — but an active standard of equal similarity outranks it.
            if not r["is_active"]:
                score *= 0.88
            # A standard whose TITLE is the query's subject should beat one that
            # merely mentions the subject in passing. Without this, "earthing and
            # equipotential bonding" ranked a cable-television standard above
            # IS 3043 "Code of practice for earthing", because the former had
            # more body text discussing earthing.
            if qt:
                shared = qt & _title_terms(r["title"])
                overlap = sum(idf.get(t, default_idf) for t in shared) / q_weight
                score *= 1.0 + TITLE_BOOST * min(1.0, overlap / 0.5)
            return -score

        ranked = sorted(agg.values(), key=rank_key)[:max_standards]
        for r in ranked:
            r["chunks"] = sorted(r["chunks"], key=lambda c: -c["score"])[:3]
        return ranked

    # ---------- step 2: graph expansion ----------
    def expand(self, is_numbers: list[str], hops: int = GRAPH_HOPS,
               limit_per_hop: int = 25) -> dict[str, Any]:
        """Traverse dependency edges outward from the seed standards."""
        nodes: dict[str, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []
        if not is_numbers:
            return {"nodes": [], "edges": []}

        seeds = [r["id"] for r in self.con.execute(
            f"""SELECT id FROM standards WHERE is_number IN
                ({','.join('?' * len(is_numbers))})""", is_numbers)]
        if not seeds:
            return {"nodes": [], "edges": []}
        seen_ids = set(seeds)

        for r in self.con.execute(
                f"""SELECT is_number,is_base,title,department,aspect,year,metadata_only
                    FROM standards WHERE id IN ({','.join('?' * len(seeds))})""", seeds):
            nodes[r["is_number"]] = dict(r) | {"hop": 0, "seed": True}

        frontier = list(seeds)
        for hop in range(1, hops + 1):
            if not frontier:
                break
            rows = self.con.execute(
                f"""SELECT e.dst_is_base, e.edge_type, e.confidence,
                           e.evidence_section, e.evidence_snippet,
                           src.is_number AS src_is_number,
                           dst.id AS dst_id, dst.is_number AS dst_is_number,
                           dst.title AS dst_title, dst.department AS dst_department,
                           dst.aspect AS dst_aspect, dst.year AS dst_year,
                           dst.metadata_only AS dst_metadata_only
                    FROM edges e
                    JOIN standards src ON src.id = e.src_standard_id
                    LEFT JOIN standards dst ON dst.id = e.dst_standard_id
                    WHERE e.src_standard_id IN ({','.join('?' * len(frontier))})
                    ORDER BY (e.confidence='confirmed') DESC
                    LIMIT ?""", frontier + [limit_per_hop]).fetchall()

            nxt: list[int] = []
            for r in rows:
                tgt_label = r["dst_is_number"] or r["dst_is_base"]
                edges.append({
                    "source": r["src_is_number"], "target": tgt_label,
                    "edge_type": r["edge_type"], "confidence": r["confidence"],
                    "evidence_section": r["evidence_section"],
                    "evidence_snippet": r["evidence_snippet"],
                    "hop": hop,
                })
                if tgt_label not in nodes:
                    nodes[tgt_label] = {
                        "is_number": tgt_label, "is_base": r["dst_is_base"],
                        "title": r["dst_title"], "department": r["dst_department"],
                        "aspect": r["dst_aspect"], "year": r["dst_year"],
                        "metadata_only": r["dst_metadata_only"],
                        "hop": hop, "seed": False,
                        "in_corpus": r["dst_id"] is not None,
                    }
                if r["dst_id"] and r["dst_id"] not in seen_ids:
                    seen_ids.add(r["dst_id"])
                    nxt.append(r["dst_id"])
            frontier = nxt

        return {"nodes": list(nodes.values()), "edges": edges}
