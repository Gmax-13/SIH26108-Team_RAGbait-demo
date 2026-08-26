"""Phase 4 steps 1-2 — semantic retrieval and graph expansion.

Retrieval returns chunks; chunks are grouped into candidate standards so the
downstream synthesiser reasons over standards while keeping every citation
anchored to a specific passage.
"""
from __future__ import annotations
from typing import Any

from backend.config import GRAPH_HOPS, RETRIEVAL_TOP_K
from backend.kb.embedder import encode_query
from backend.kb.vector_index import VectorIndex


class Retriever:
    def __init__(self, con, index: VectorIndex | None = None):
        self.con = con
        self.index = index or VectorIndex.load()

    # ---------- step 1: semantic retrieval ----------
    def search_chunks(self, query: str, k: int = RETRIEVAL_TOP_K,
                      per_standard_cap: int = 3) -> list[dict[str, Any]]:
        """Retrieve chunks, capped per standard so one verbose document cannot
        monopolise the candidate list and crowd out other relevant standards."""
        hits = self.index.search(encode_query(query), k=k * 6)
        if not hits:
            return []
        by_id = {cid: score for cid, score in hits}
        rows = self.con.execute(
            f"""SELECT c.id,c.text,c.section,c.chunk_index,
                       s.is_number,s.is_base,s.title,s.department,s.aspect,
                       s.technical_committee,s.year,s.metadata_only,s.has_full_text,
                       s.is_active,s.withdrawn_status
                FROM chunks c JOIN standards s ON s.id=c.standard_id
                WHERE c.id IN ({','.join('?' * len(by_id))})""",
            list(by_id)).fetchall()
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
        # A withdrawn standard is still worth surfacing — a tender may cite one,
        # and the user needs to be told. But an active standard of equal
        # similarity should always rank above it, so withdrawn entries are
        # demoted for ORDERING only; `best_score` stays the true similarity so
        # confidence signals are not silently distorted.
        ranked = sorted(
            agg.values(),
            key=lambda r: -(r["best_score"] * (1.0 if r["is_active"] else 0.88)),
        )[:max_standards]
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
