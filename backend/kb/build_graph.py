"""Phase 2b — build the IS dependency graph.

Two edge classes, never conflated:
  confirmed : the citation was read out of the source standard's own full text,
              and the edge carries the verbatim sentence proving it.
  inferred  : no full text available, so the edge is a heuristic guess from
              shared technical committee + complementary aspect. These are
              surfaced to the user as unconfirmed.

Usage:
    python -m backend.kb.build_graph
    python -m backend.kb.build_graph --no-inferred
"""
from __future__ import annotations
import argparse, json, re, time
from collections import Counter
from typing import Any

from backend.config import LOGS
from backend.kb.references import classify_edge, extract_references
from backend.store import (add_edge, init_db, log, new_run_id,
                           resolve_dangling_edges, stats)

# A spec/code-of-practice plausibly depends on test methods and terminology
# issued by the same committee. Anything looser produces noise, not signal.
_INFER_SRC = {"Product Specification", "Code of Practice", "Safety Standard"}
_INFER_DST = {"Methods of tests": "test_method", "Terminology": "terminology"}
_MIN_INFER_OVERLAP = 0.18      # minimum title-token Jaccard to propose an edge
_MAX_INFER_PER_SOURCE = 5      # keep the graph readable and confirmed edges visible

_INFER_STOP = set(
    "specification methods test tests for of and the part sec section code practice "
    "indian standard requirements requirement general".split())


def _title_tokens(title: str | None) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (title or "").lower())
            if len(w) > 3 and w not in _INFER_STOP}


def build_confirmed(con, run_id: str) -> tuple[int, int]:
    rows = con.execute(
        "SELECT id,is_number,is_base,full_text FROM standards WHERE has_full_text=1"
    ).fetchall()
    aspect_by_base = {r["is_base"]: r["aspect"] for r in
                      con.execute("SELECT is_base,aspect FROM standards")}
    edges = 0
    for i, r in enumerate(rows, 1):
        refs = extract_references(r["full_text"], self_base=r["is_base"])
        for ref in refs:
            etype = classify_edge(ref["cue"], aspect_by_base.get(ref["dst_is_base"]))
            add_edge(con, r["id"], ref["dst_is_base"], etype, "confirmed",
                     ref["evidence_section"], ref["evidence_snippet"][:600])
            edges += 1
        log(con, run_id, "graph", "ok", r["is_number"], f"{len(refs)} refs")
        if i % 25 == 0:
            con.commit()
            print(f"  confirmed: {i}/{len(rows)} standards, {edges} edges", flush=True)
    con.commit()
    return len(rows), edges


def build_inferred(con, run_id: str) -> int:
    """Heuristic edges for standards we could not read. Explicitly low-confidence."""
    rows = con.execute(
        """SELECT id,is_number,is_base,title,aspect,technical_committee
           FROM standards WHERE has_full_text=0 AND technical_committee IS NOT NULL"""
    ).fetchall()
    by_tc: dict[str, list] = {}
    for r in con.execute(
        """SELECT is_base,title,aspect,technical_committee FROM standards
           WHERE technical_committee IS NOT NULL AND aspect IS NOT NULL"""):
        by_tc.setdefault(r["technical_committee"], []).append(r)

    edges = 0
    for r in rows:
        if r["aspect"] not in _INFER_SRC:
            continue
        src_toks = _title_tokens(r["title"])
        scored: list[tuple[float, Any, str]] = []
        for cand in by_tc.get(r["technical_committee"], []):
            etype = _INFER_DST.get(cand["aspect"])
            if not etype or cand["is_base"] == r["is_base"]:
                continue
            # Committee + aspect alone is combinatorial: every specification would
            # link to every test method in its committee, burying the confirmed
            # edges in noise. Require genuine subject overlap and keep only the
            # best few.
            ct = _title_tokens(cand["title"])
            overlap = len(src_toks & ct) / len(src_toks | ct) if (src_toks | ct) else 0.0
            if overlap < _MIN_INFER_OVERLAP:
                continue
            scored.append((overlap, cand, etype))

        scored.sort(key=lambda x: -x[0])
        for overlap, cand, etype in scored[:_MAX_INFER_PER_SOURCE]:
            add_edge(con, r["id"], cand["is_base"], etype, "inferred", None,
                     f"No full text available for {r['is_number']}. Inferred from shared "
                     f"technical committee {r['technical_committee']}, complementary "
                     f"aspect '{cand['aspect']}', and title overlap {overlap:.2f}. "
                     f"NOT verified against source text.")
            edges += 1
    con.commit()
    return edges


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-inferred", action="store_true",
                    help="only build edges confirmed from full text")
    a = ap.parse_args(argv)

    con = init_db()
    run_id = new_run_id("graph")
    t0 = time.time()
    print(f"run_id={run_id}")

    con.execute("DELETE FROM edges")
    con.commit()

    n_src, n_conf = build_confirmed(con, run_id)
    print(f"confirmed edges from {n_src} full-text standards: {n_conf}")

    n_inf = 0
    if not a.no_inferred:
        n_inf = build_inferred(con, run_id)
        print(f"inferred edges (metadata-only sources): {n_inf}")

    resolved = resolve_dangling_edges(con)
    con.commit()

    st = stats(con)
    types = dict(Counter(r["edge_type"] for r in con.execute("SELECT edge_type FROM edges")))
    summary = {"run_id": run_id, "seconds": round(time.time() - t0, 1),
               "fulltext_sources": n_src, "edges_confirmed": n_conf,
               "edges_inferred": n_inf, "late_resolved": resolved,
               "edge_types": types, "db": st}
    log(con, run_id, "graph", "ok", "complete", json.dumps(summary))
    con.commit()
    (LOGS / f"{run_id}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n" + "=" * 62)
    print(f"GRAPH BUILD COMPLETE in {summary['seconds']}s")
    print(f"  confirmed edges : {st['edges_confirmed']}")
    print(f"  inferred edges  : {st['edges_inferred']}")
    print(f"  unresolved tgts : {st['edges_dangling']} (cited but not in corpus)")
    print(f"  edge types      : {types}")
    print("=" * 62)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
