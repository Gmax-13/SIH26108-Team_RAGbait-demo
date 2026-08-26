"""Merge catalogue rows from one SQLite corpus into another.

Used when a fresh catalogue scrape is run into a side database (so it does not
contend for writes with a running full-text job) and then folded into the live
corpus. `upsert_standard` preserves already-ingested full text, so merging only
adds and refreshes metadata — it never drops document bodies.

    python scripts/merge_catalogue.py <source.db>
"""
import sys

sys.path.insert(0, ".")
from backend.store import STANDARD_COLS, connect, log, new_run_id, stats, upsert_standard


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src_path = sys.argv[1]

    src = connect(src_path)
    dst = connect()
    run_id = new_run_id("merge")

    before = stats(dst)
    existing = {r[0] for r in dst.execute("SELECT is_number FROM standards")}

    cols = ", ".join(STANDARD_COLS)
    rows = src.execute(f"SELECT {cols} FROM standards").fetchall()
    added = refreshed = 0
    for r in rows:
        rec = {c: r[c] for c in STANDARD_COLS}
        if rec["is_number"] in existing:
            refreshed += 1
        else:
            added += 1
        upsert_standard(dst, rec)
    dst.commit()

    after = stats(dst)
    log(dst, run_id, "catalogue", "ok", "merge",
        f"source={src_path} rows={len(rows)} added={added} refreshed={refreshed}")
    dst.commit()

    print(f"source rows      : {len(rows)}")
    print(f"  newly added    : {added}")
    print(f"  already present: {refreshed}")
    print(f"standards before : {before['standards']}")
    print(f"standards after  : {after['standards']}")
    print(f"full text kept   : {after['with_full_text']} (was {before['with_full_text']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
