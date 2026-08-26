"""Run the whole ingestion + knowledge-base build in the correct order.

    python scripts/build_all.py                     # full build, ETD/LITD
    python scripts/build_all.py --departments CED   # a different slice
    python scripts/build_all.py --skip catalogue    # resume a partial build
    python scripts/build_all.py --dry-run           # just show the plan

Each stage is idempotent: the catalogue scrape upserts, full-text fetch skips
standards already attempted, and the KB/graph builds rebuild from the store.
So a failed run can be resumed with --skip rather than restarted.
"""
from __future__ import annotations
import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable

STAGES = [
    ("catalogue", "Scrape the BIS catalogue (digit seeds 0-9, provably complete)",
     lambda a: [PY, "-m", "backend.ingestion.scrape_catalogue",
                "--departments", a.departments]),
    ("migrate", "Add/backfill full_text_year",
     lambda a: [PY, "scripts/migrate_full_text_year.py"]),
    ("migrate2", "Add/backfill archive_checked (avoids re-querying dead ends)",
     lambda a: [PY, "scripts/migrate_archive_checked.py"]),
    ("repair", "Detach any full text attached to the wrong standard",
     lambda a: [PY, "scripts/repair_fulltext_assignment.py"]),
    ("fulltext", "Fetch full text from the Internet Archive",
     lambda a: [PY, "-m", "backend.ingestion.fetch_fulltext",
                "--workers", str(a.workers)]),
    ("kb", "Chunk and embed into the FAISS index",
     lambda a: [PY, "-m", "backend.kb.build_kb"]),
    ("certrules", "Load the certification rule table",
     lambda a: [PY, "scripts/load_certification_rules.py"]),
    ("graph", "Build the dependency graph",
     lambda a: [PY, "-m", "backend.kb.build_graph"]),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--departments", default="ETD,LITD")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--skip", default="", help="comma-separated stage names to skip")
    ap.add_argument("--only", default="", help="comma-separated stage names to run")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    skip = {s.strip() for s in a.skip.split(",") if s.strip()}
    only = {s.strip() for s in a.only.split(",") if s.strip()}

    plan = [s for s in STAGES if s[0] not in skip and (not only or s[0] in only)]
    print("BUILD PLAN")
    for name, desc, _ in plan:
        print(f"  {name:<10} {desc}")
    if a.dry_run:
        return 0
    print()

    t_all = time.time()
    for name, desc, cmd in plan:
        argv = cmd(a)
        print("=" * 70)
        print(f"STAGE {name}: {desc}")
        print(f"  $ {' '.join(argv)}")
        print("=" * 70, flush=True)
        t0 = time.time()
        rc = subprocess.call(argv, cwd=str(ROOT))
        dur = time.time() - t0
        if rc != 0:
            print(f"\n!! stage '{name}' failed (exit {rc}) after {dur:.0f}s")
            print(f"   fix, then resume with:  python scripts/build_all.py "
                  f"--skip {','.join([s[0] for s in STAGES[:[x[0] for x in STAGES].index(name)]])}")
            return rc
        print(f"\n-- stage '{name}' done in {dur:.0f}s\n", flush=True)

    print("=" * 70)
    print(f"BUILD COMPLETE in {(time.time() - t_all) / 60:.1f} min")
    print("  start the API : python -m uvicorn backend.api.main:app --reload")
    print("  run the demo  : python scripts/demo.py")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
