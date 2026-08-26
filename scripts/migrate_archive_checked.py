"""Add `archive_checked` and backfill it from the ingestion audit log.

Without this flag every full-text run re-queries archive.org for the thousands
of standards that simply have no mirror, so the hit rate collapses and the run
takes far longer than it needs to.

Backfill sources (all mean "archive.org was already searched"):
  * has_full_text = 1                     -> obviously found
  * archive_identifier IS NOT NULL        -> an item was located
  * a 'skip' row in scrape_log for phase 'fulltext' -> searched, nothing found

Safe to re-run.
"""
import sys

sys.path.insert(0, ".")
from backend.store import connect

con = connect()
cols = {r["name"] for r in con.execute("PRAGMA table_info(standards)")}
if "archive_checked" not in cols:
    con.execute("ALTER TABLE standards ADD COLUMN archive_checked INTEGER NOT NULL DEFAULT 0")
    print("added column archive_checked")
else:
    print("column already present")

n1 = con.execute(
    "UPDATE standards SET archive_checked=1 "
    "WHERE archive_checked=0 AND (has_full_text=1 OR archive_identifier IS NOT NULL)").rowcount

n2 = con.execute("""
    UPDATE standards SET archive_checked=1
    WHERE archive_checked=0 AND is_number IN (
        SELECT target FROM scrape_log
        WHERE phase='fulltext' AND status='skip' AND target IS NOT NULL)""").rowcount
con.commit()

tot = con.execute("SELECT COUNT(*) FROM standards").fetchone()[0]
chk = con.execute("SELECT COUNT(*) FROM standards WHERE archive_checked=1").fetchone()[0]
print(f"backfilled {n1} from full-text/identifier, {n2} from skip log")
print(f"archive_checked: {chk}/{tot}  -> {tot - chk} still to search")
