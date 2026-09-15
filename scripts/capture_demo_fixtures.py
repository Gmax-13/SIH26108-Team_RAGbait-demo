"""Record the real system as static fixtures for the offline demo site.

The demo site is the dashboard itself, built without a backend: every call its
`api.js` would make is answered from files written here. They are produced by
the real handlers and the real pipeline — real stage timings, citations,
confidence, compliance reports and catalogue records — so the static build is a
recording, not a mock-up.

    python scripts/capture_demo_fixtures.py

Writes demo-site/public/fixtures/ and copies the sample tender next to it.

Note the shim below: Windows Application Control is currently blocking one
scipy binary on this machine, which breaks `import sklearn`, which
sentence-transformers imports at module level. Nothing in this project uses
the blocked routine (it is linprog's revised-simplex solver), so the capture
script stubs it rather than being unable to run at all. The shim lives here,
not in `backend/`, because the product itself must not depend on it.
"""
from __future__ import annotations
import json
import shutil
import sys
import time
import types
from pathlib import Path

sys.path.insert(0, ".")


def _shim_blocked_scipy() -> None:
    try:
        import scipy.optimize._bglu_dense  # noqa: F401
    except ImportError:
        mod = types.ModuleType("scipy.optimize._bglu_dense")

        class _Blocked:
            def __init__(self, *a, **k):
                raise RuntimeError("scipy _bglu_dense is blocked by Application Control")

        mod.LU = mod.BGLU = _Blocked
        sys.modules["scipy.optimize._bglu_dense"] = mod
        print("note: stubbed scipy.optimize._bglu_dense (blocked by Application Control)")


_shim_blocked_scipy()

from fastapi import HTTPException                                    # noqa: E402
from backend.api.main import (get_full_graph, get_logs, get_retriever,  # noqa: E402
                              get_standard, get_stats)
from backend.pipeline.batch import run_batch                          # noqa: E402
from backend.pipeline.recommend import recommend_events               # noqa: E402
from backend.store import connect                                     # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "demo-site" / "public"
OUT = SITE / "fixtures"

# The dashboard's own example queries (frontend/src/components/QueryScreen.jsx)
# plus one that should abstain. The demo's translated chips map onto these exact
# English strings, so change them together with demo-site/src/DemoQueryScreen.jsx.
QUERIES = [
    ("pvc", "PVC insulated copper conductor cable for internal wiring, rated 1100 V"),
    ("earthing", "Earthing and equipotential bonding for a 33 kV distribution substation"),
    ("conduit", "Rigid non-metallic conduit for concealed electrical wiring"),
    ("led", "LED luminaires for public street lighting"),
    ("vague", "good quality durable product"),
]

# The batch screen's "Cap at" options; 0 means no cap.
CAPS = (0, 3, 5, 10)

# Must match shardOf() in demo-site/src/api.demo.js.
SHARDS = 64


def shard_of(is_number: str) -> int:
    h = 0
    for ch in is_number:
        h = (h * 31 + ord(ch)) % 2**32
    return h % SHARDS


def write(name: str, data) -> int:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False, default=str)
    path.write_text(body, encoding="utf-8")
    return len(body.encode("utf-8"))


def numbers_in_result(r: dict) -> set[str]:
    """Every IS number a recorded result lets the reader click through to."""
    found = set()
    for key in ("primary_standards", "supporting_standards", "allied_standards", "closest_candidates"):
        found |= {s.get("is_number") for s in r.get(key) or []}
    found |= {c.get("is_number") for c in (r.get("citations") or {}).values()}
    found |= {n.get("id") for n in (r.get("dependency_graph") or {}).get("nodes") or []}
    return {n for n in found if n}


def main() -> int:
    t_start = time.time()
    con = connect()
    retriever = get_retriever(con)
    OUT.mkdir(parents=True, exist_ok=True)

    # Warm-up, discarded. The first query of a process pays a one-off cost to
    # load the embedding model onto the GPU, which showed up as a 20-second
    # "retrieval" stage in whichever query happened to be captured first. A
    # deployed server pays that once at boot, not per request, so recording it
    # would misrepresent the steady-state latency the demo is showing.
    print("warming up the embedder (discarded)...", flush=True)
    for _ in recommend_events(con, retriever, "warm up the embedding model"):
        pass

    wanted: set[str] = set()

    # --- single queries, streamed exactly as /api/recommend/stream emits them
    runs = []
    for slug, query in QUERIES:
        print(f"--- {slug}: {query}", flush=True)
        events, result = [], None
        for ev in recommend_events(con, retriever, query):
            if ev.get("event") == "result":
                result = ev["result"]
            else:
                events.append(ev)
                print(f"    {ev['stage']:<14} {ev['status']:<8} "
                      f"{ev.get('elapsed', 0):>6.2f}s  {ev.get('detail', '')}", flush=True)
        if result is None:
            print("    !! no result")
            continue
        runs.append({"slug": slug, "query": query, "events": events, "result": result})
        wanted |= numbers_in_result(result)
        print(f"    => {result['status']}  confidence={result.get('confidence')}  "
              f"method={result.get('synthesis_method')}", flush=True)
    write("runs.json", runs)

    # --- the sample tender at every cap the screen offers
    tender = (ROOT / "frontend" / "public" / "sample_tender.txt").read_text(encoding="utf-8")
    uncapped = None
    for cap in CAPS:
        if uncapped and cap and cap >= uncapped["summary"]["requirements_extracted"]:
            report = uncapped
            print(f"--- batch cap={cap}: same as uncapped "
                  f"({uncapped['summary']['requirements_extracted']} requirements)", flush=True)
        else:
            print(f"--- batch cap={cap or 'none'} ...", flush=True)
            report = run_batch(con, retriever, tender, use_llm=True, max_requirements=cap)
            print(f"    => {report['summary']}  {report.get('elapsed_sec')}s", flush=True)
            if cap == 0:
                uncapped = report
        for item in report.get("results") or []:
            wanted |= numbers_in_result(item.get("result") or {})
        wanted |= {c.get("is_number") for c in report.get("outdated_document_citations") or []}
        wanted |= {c.get("is_number") for c in report.get("certification_flags") or []}
        write(f"batch-cap-{cap}.json", report)

    # --- corpus, audit trail and graph, straight from the API handlers
    stats = get_stats()
    write("stats.json", stats)
    write("logs.json", get_logs(None, None, 2000))
    graph = get_full_graph(1, 5000)
    size = write("graph.json", graph)
    print(f"--- graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges, {size / 1e6:.1f} MB", flush=True)
    wanted |= {n["is_number"] for n in graph["nodes"]}

    # --- catalogue records for everything the demo can open, plus one hop of
    # the records those link to, sharded so a click fetches ~1/64th of them.
    shards: list[dict] = [{} for _ in range(SHARDS)]
    seen: set[str] = set()
    frontier = {n for n in wanted if n}
    for hop in range(2):
        nxt: set[str] = set()
        for n in sorted(frontier - seen):
            seen.add(n)
            try:
                rec = get_standard(n)
            except HTTPException:
                continue
            rec.pop("id", None)
            shards[shard_of(n)][n] = rec
            nxt |= {e.get("dst_is_number") for e in rec.get("outgoing_edges") or []}
            nxt |= {e.get("src_is_number") for e in rec.get("incoming_edges") or []}
            nxt |= {e.get("is_number") for e in (rec.get("currency") or {}).get("editions_known") or []}
        frontier = {x for x in nxt if x}
        print(f"--- standards hop {hop}: {sum(len(s) for s in shards)} records", flush=True)
    total = sum(write(f"standards/shard-{i:02d}.json", s) for i, s in enumerate(shards))
    print(f"    {total / 1e6:.1f} MB across {SHARDS} shards", flush=True)

    for name in ("sample_tender.txt", "sample_tender.pdf", "favicon.svg", "icons.svg"):
        shutil.copyfile(ROOT / "frontend" / "public" / name, SITE / name)

    write("meta.json", {"captured_at": time.strftime("%Y-%m-%d"),
                        "queries": [q for _, q in QUERIES], "caps": list(CAPS)})
    print(f"done in {time.time() - t_start:.0f}s -> {OUT}")
    return 0 if len(runs) == len(QUERIES) else 1


if __name__ == "__main__":
    sys.exit(main())
