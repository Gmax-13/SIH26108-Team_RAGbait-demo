"""Detach full text that was attached to the wrong standard.

An earlier version of `find_identifiers` matched archive.org identifiers by
prefix, so `gov.in.is.302.2.` also matched `gov.in.is.302.2.21.2018` — Part 2
*Section 21*. That text got attached to Part 2/Sec 28, Sec 16, Sec 36 and others:
the right name over the wrong document.

This detaches every row whose `archive_identifier` does not structurally match
its own number/part/section, so the fetcher re-evaluates it under strict
matching. Rows with no correct mirror simply stay metadata-only, which is the
honest outcome.

Safe to re-run.
"""
import re
import sys

sys.path.insert(0, ".")
from backend.store import connect, log, new_run_id


def expected_pattern(is_base: str, part, section) -> str | None:
    m = re.match(r"^IS\s+(\d+(?:\.\d+)*)$", (is_base or "").strip(), re.I)
    if not m:
        return None
    num = re.escape(m.group(1))
    if part and section:
        return rf"gov\.in\.is\.{num}\.{re.escape(str(part))}\.{re.escape(str(section))}\.\d{{4}}"
    if part:
        return rf"gov\.in\.is\.{num}\.{re.escape(str(part))}\.\d{{4}}"
    return rf"gov\.in\.is\.{num}\.\d{{4}}"


def main() -> int:
    con = connect()
    run_id = new_run_id("repair")
    rows = con.execute(
        "SELECT id,is_number,is_base,part,section,archive_identifier,full_text_chars "
        "FROM standards WHERE archive_identifier IS NOT NULL").fetchall()

    bad = []
    for r in rows:
        pat = expected_pattern(r["is_base"], r["part"], r["section"])
        if pat is None or not re.fullmatch(pat, r["archive_identifier"] or ""):
            bad.append(r)

    print(f"checked {len(rows)} rows with an archive identifier")
    print(f"mismatched (wrong document attached): {len(bad)}")
    for r in bad[:10]:
        print(f"   {r['is_number']:<30} had {r['archive_identifier']}")

    for r in bad:
        con.execute(
            """UPDATE standards SET full_text=NULL, full_text_chars=0, has_full_text=0,
               full_text_year=NULL, metadata_only=1, archive_identifier=NULL,
               source='bis_catalogue' WHERE id=?""", (r["id"],))
        log(con, run_id, "fulltext", "skip", r["is_number"],
            f"detached wrongly-matched archive item {r['archive_identifier']}")
    con.commit()

    left = con.execute("SELECT COUNT(*) FROM standards WHERE has_full_text=1").fetchone()[0]
    print(f"\ndetached {len(bad)} rows; {left} standards still hold full text")
    print("re-run: python -m backend.ingestion.fetch_fulltext --workers 8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
