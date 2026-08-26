"""Phase 1a — ingest BIS catalogue metadata into SQLite.

Enumeration strategy: the BIS API has no "list everything" mode. Keyword search
matches WORD PREFIXES, so single-letter keyword seeds have blind spots — "e"
misses "Low-voltage switchgear and controlgear assemblies" because no word in it
starts with "e", which is how IS 8623 went missing from an earlier run.

Searching by IS NUMBER does substring matching instead, and every IS number
contains at least one digit, so the union of seeds 0-9 provably covers the whole
catalogue. Rows are de-duplicated by IS number.

Completeness is reported explicitly (captured / seen / rejected) so gaps are
visible rather than silent.

Usage:
    python -m backend.ingestion.scrape_catalogue --departments ETD,LITD
    python -m backend.ingestion.scrape_catalogue --all
"""
from __future__ import annotations
import argparse, json, sys, time
from collections import Counter

from backend.config import LOGS, SUBSET_DEPARTMENTS
from backend.ingestion.bis_client import BISClient
from backend.ingestion.normalize import normalize_row
from backend.store import init_db, log, new_run_id, stats, upsert_standard

DEFAULT_SEEDS = list("0123456789")   # provably complete; see module docstring
DEFAULT_SEACHBY = "isnumber"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--departments", default=",".join(SUBSET_DEPARTMENTS),
                    help="comma-separated dept codes to keep, e.g. ETD,LITD")
    ap.add_argument("--all", action="store_true", help="keep every department")
    ap.add_argument("--seeds", default=",".join(DEFAULT_SEEDS))
    ap.add_argument("--seachby", default=DEFAULT_SEACHBY, choices=["isnumber", "keywords"])
    ap.add_argument("--limit", type=int, default=0, help="stop after N kept records (smoke test)")
    a = ap.parse_args(argv)

    keep = None if a.all else {d.strip().upper() for d in a.departments.split(",") if d.strip()}
    seeds = [s.strip() for s in a.seeds.split(",") if s.strip()]

    con = init_db()
    run_id = new_run_id("catalogue")
    cli = BISClient()
    t0 = time.time()

    seen: set[str] = set()
    kept = rejected = 0
    dept_counts: Counter[str] = Counter()
    reject_samples: list[str] = []

    def on_page(term, start, n, total):
        print(f"  [{term}] rows {start:>6}-{start+n:<6} of {total}", flush=True)

    print(f"run_id={run_id}  seeds={seeds}  keep={'ALL' if keep is None else sorted(keep)}")
    log(con, run_id, "catalogue", "ok", "start",
        json.dumps({"seeds": seeds, "seachby": a.seachby,
                    "departments": "ALL" if keep is None else sorted(keep)}))

    for term in seeds:
        print(f"\n=== seed {term!r} ===", flush=True)
        try:
            for row in cli.iter_all(term, seachby=a.seachby, on_page=on_page):
                raw_no = (row.get("is_no") or "").strip()
                if raw_no in seen:
                    continue
                seen.add(raw_no)
                rec = normalize_row(row)
                if rec is None:
                    rejected += 1
                    if len(reject_samples) < 50:
                        reject_samples.append(raw_no)
                    log(con, run_id, "catalogue", "skip", raw_no[:120], "unparseable is_no")
                    continue
                if keep is not None and (rec["department"] or "") not in keep:
                    continue
                upsert_standard(con, rec)
                dept_counts[rec["department"] or "?"] += 1
                kept += 1
                if kept % 500 == 0:
                    con.commit()
                    print(f"    ...{kept} kept", flush=True)
                if a.limit and kept >= a.limit:
                    raise StopIteration
        except StopIteration:
            print("  limit reached")
            break
        except Exception as e:  # noqa: BLE001 — record the failure, keep other seeds alive
            log(con, run_id, "catalogue", "error", term, f"{type(e).__name__}: {e}")
            print(f"  !! seed {term!r} failed: {type(e).__name__}: {e}", file=sys.stderr)
        con.commit()

    con.commit()
    dur = time.time() - t0
    summary = {
        "run_id": run_id, "seconds": round(dur, 1), "seeds": seeds,
        "distinct_rows_seen": len(seen), "kept": kept, "rejected_unparseable": rejected,
        "reject_rate_pct": round(100 * rejected / max(len(seen), 1), 2),
        "by_department": dict(dept_counts.most_common()),
        "db": stats(con),
        "reject_samples": reject_samples[:20],
    }
    log(con, run_id, "catalogue", "ok", "complete", json.dumps(summary))
    con.commit()

    out = LOGS / f"{run_id}.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("\n" + "=" * 62)
    print(f"CATALOGUE INGEST COMPLETE in {dur:.1f}s")
    print(f"  distinct catalogue rows seen : {len(seen)}")
    print(f"  standards stored             : {kept}")
    print(f"  rejected (unparseable at BIS): {rejected}  ({summary['reject_rate_pct']}%)")
    print(f"  by department                : {dict(dept_counts.most_common(10))}")
    print(f"  db stats                     : {summary['db']}")
    print(f"  audit log                    : {out}")
    print("=" * 62)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
