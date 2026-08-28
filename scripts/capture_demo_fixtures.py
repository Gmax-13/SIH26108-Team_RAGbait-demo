"""Record real pipeline runs as JSON fixtures for the static demo site.

The demo site has no backend, so it replays these. Capturing them from the real
pipeline - real stage timings, real citations, real confidence - keeps the
static build honest: it is a recording, not a mock-up.

    python scripts/capture_demo_fixtures.py

Note the shim below: Windows Application Control is currently blocking one
scipy binary on this machine, which breaks `import sklearn`, which
sentence-transformers imports at module level. Nothing in this project uses
the blocked routine (it is linprog's revised-simplex solver), so the capture
script stubs it rather than being unable to run at all. The shim lives here,
not in `backend/`, because the product itself must not depend on it.
"""
from __future__ import annotations
import json
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

from backend.config import active_departments             # noqa: E402
from backend.pipeline.recommend import recommend_events   # noqa: E402
from backend.pipeline.retrieve import Retriever           # noqa: E402
from backend.store import connect, stats                  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "demo-site" / "src" / "fixtures"

QUERIES = [
    ("earthing", "Earthing and equipotential bonding for a 33 kV distribution substation"),
    ("conduit", "Rigid non-metallic conduit for electrical wiring installations"),
    ("led", "LED luminaires for public street lighting, with photometric test methods"),
    ("switchgear", "Low-voltage switchgear and controlgear assemblies for a pump house"),
    ("vague", "good quality material for the project"),
]


def main() -> int:
    con = connect()
    retriever = Retriever(con)

    # Warm-up, discarded. The first query of a process pays a one-off cost to
    # load the embedding model onto the GPU, which showed up as a 20-second
    # "retrieval" stage in whichever query happened to be captured first. A
    # deployed server pays that once at boot, not per request, so recording it
    # would misrepresent the steady-state latency the demo is showing.
    print("warming up the embedder (discarded)...", flush=True)
    for _ in recommend_events(con, retriever, "warm up the embedding model"):
        pass

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
                      f"{ev.get('elapsed', 0):>5.2f}s  {ev.get('detail', '')}", flush=True)
        if result is None:
            print("    !! no result")
            continue
        runs.append({"slug": slug, "query": query, "events": events, "result": result})
        print(f"    => {result['status']}  confidence={result.get('confidence')}", flush=True)

    depts = active_departments()
    corpus = {
        "scoped_departments": depts,
        "scoped": stats(con, depts),
        "whole_catalogue": stats(con, None),
        "captured_at": time.strftime("%Y-%m-%d"),
    }
    print()
    print("corpus:", json.dumps(corpus["scoped"]))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "runs.json").write_text(json.dumps(runs, indent=1), encoding="utf-8")
    (OUT / "corpus.json").write_text(json.dumps(corpus, indent=1), encoding="utf-8")
    print(f"wrote {OUT / 'runs.json'}  ({len(runs)} runs)")
    print(f"wrote {OUT / 'corpus.json'}")
    return 0 if runs else 1


if __name__ == "__main__":
    sys.exit(main())
