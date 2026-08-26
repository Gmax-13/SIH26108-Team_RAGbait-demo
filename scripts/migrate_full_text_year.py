"""Add `full_text_year` and backfill it from the stored archive identifier.

Safe to re-run. Needed because the column was introduced while a full-text
ingestion run was already in flight.
"""
import re, sys
sys.path.insert(0, ".")
from backend.store import connect

con = connect()
cols = {r["name"] for r in con.execute("PRAGMA table_info(standards)")}
if "full_text_year" not in cols:
    con.execute("ALTER TABLE standards ADD COLUMN full_text_year INTEGER")
    print("added column full_text_year")
else:
    print("column already present")

rows = con.execute(
    "SELECT id, archive_identifier FROM standards "
    "WHERE has_full_text=1 AND full_text_year IS NULL AND archive_identifier IS NOT NULL"
).fetchall()
n = 0
for r in rows:
    m = re.search(r"\.(\d{4})$", r["archive_identifier"] or "")
    if m:
        con.execute("UPDATE standards SET full_text_year=? WHERE id=?", (int(m.group(1)), r["id"]))
        n += 1
con.commit()
print(f"backfilled {n} rows")

mism = con.execute(
    "SELECT COUNT(*) FROM standards WHERE has_full_text=1 AND full_text_year IS NOT NULL "
    "AND year IS NOT NULL AND full_text_year <> year").fetchone()[0]
tot = con.execute("SELECT COUNT(*) FROM standards WHERE has_full_text=1").fetchone()[0]
print(f"edition mismatches: {mism} / {tot} full-text standards")
