"""Load the certification rule table into the corpus.

Phase 4's certification flagging reads `certification_rules`, and nothing in the
build populated it — so the running system reported "no scheme matched" for
every standard, including ones that are plainly CRS-notified. This is a build
stage, not a test fixture.

Idempotent: rules are keyed on (scheme, match_type, match_value).
"""
import sys

sys.path.insert(0, ".")
from backend.pipeline.certification import load_rules
from backend.store import connect, log, new_run_id

con = connect()
run_id = new_run_id("certrules")
n = load_rules(con)
log(con, run_id, "certrules", "ok", "complete", f"{n} rules loaded")
con.commit()

by_scheme = {r[0]: r[1] for r in con.execute(
    "SELECT scheme, COUNT(*) FROM certification_rules GROUP BY 1")}
print(f"loaded {n} certification rules")
for k, v in sorted(by_scheme.items()):
    print(f"  {k:<20} {v}")
