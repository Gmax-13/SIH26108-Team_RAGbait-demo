"""Restore `archive_identifier` values lost when a catalogue merge overwrote them.

`upsert_standard` protected the full-text columns but not the identifier, so
folding a fresh catalogue scrape into the corpus set it back to NULL on every
standard that already had text. The text survived; the pointer to the document
it came from did not, which breaks the provenance trail.

The ingestion audit log recorded each identifier at fetch time
("gov.in.is.732.2019 chars=673212"), so it is recovered from there rather than
reconstructed. Rows the log cannot account for are reported, not guessed at.

Safe to re-run.
"""
import re
import sys

sys.path.insert(0, ".")
from backend.store import connect, log, new_run_id

IDENT_RE = re.compile(r"\b(gov\.in\.is\.[\w.]+?\.\d{4})\b")


def main() -> int:
    con = connect()
    run_id = new_run_id("repair")

    missing = con.execute(
        "SELECT id, is_number FROM standards "
        "WHERE has_full_text = 1 AND archive_identifier IS NULL").fetchall()
    print(f"full-text standards missing an identifier: {len(missing)}")
    if not missing:
        return 0

    # Newest successful fetch wins if a standard was fetched more than once.
    from_log: dict[str, str] = {}
    for r in con.execute(
            "SELECT target, message FROM scrape_log "
            "WHERE phase='fulltext' AND status='ok' AND message LIKE 'gov.in.is.%' "
            "ORDER BY id ASC"):
        m = IDENT_RE.search(r["message"] or "")
        if m and r["target"]:
            from_log[r["target"]] = m.group(1)
    print(f"identifiers recoverable from the audit log: {len(from_log)}")

    fixed = unresolved = 0
    for r in missing:
        ident = from_log.get(r["is_number"])
        if not ident:
            unresolved += 1
            continue
        con.execute("UPDATE standards SET archive_identifier=? WHERE id=?", (ident, r["id"]))
        fixed += 1
    log(con, run_id, "fulltext", "ok", "repair-archive-identifier",
        f"restored={fixed} unresolved={unresolved}")
    con.commit()

    print(f"  restored   : {fixed}")
    print(f"  unresolved : {unresolved}  (no successful fetch recorded; left NULL)")
    still = con.execute(
        "SELECT COUNT(*) FROM standards "
        "WHERE has_full_text=1 AND archive_identifier IS NULL").fetchone()[0]
    print(f"  remaining without an identifier: {still}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
