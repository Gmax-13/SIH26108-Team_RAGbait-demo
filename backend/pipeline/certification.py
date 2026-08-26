"""Phase 4 step 6 — flag mandatory certification schemes for a standard.

The rule table is a curated seed, not a legal source. Output is phrased as a
flag to verify, never as a compliance determination.
"""
from __future__ import annotations
import json
from typing import Any

from backend.config import ROOT

SEED = ROOT / "data" / "seed" / "certification_rules.json"


def load_rules(con) -> int:
    data = json.loads(SEED.read_text(encoding="utf-8"))
    n = 0
    for r in data["rules"]:
        con.execute(
            """INSERT OR REPLACE INTO certification_rules
               (scheme,match_type,match_value,mandatory,authority,notes,source_url)
               VALUES(?,?,?,?,?,?,?)""",
            (r["scheme"], r["match_type"], r["match_value"], r.get("mandatory", 1),
             r.get("authority"), r.get("notes"), data["_meta"]["sources"][0]))
        n += 1
    con.commit()
    return n


def check_certification(con, is_number: str) -> dict[str, Any]:
    row = con.execute(
        "SELECT is_base,title,department,aspect FROM standards WHERE is_number=?",
        (is_number,)).fetchone()
    if row is None:
        return {"schemes": [], "note": "standard not in corpus"}

    hits: list[dict[str, Any]] = []
    seen: set[str] = set()

    for r in con.execute(
            "SELECT * FROM certification_rules WHERE match_type='is_base' AND match_value=?",
            (row["is_base"],)):
        key = r["scheme"]
        if key in seen:
            continue
        seen.add(key)
        hits.append({"scheme": r["scheme"], "mandatory": bool(r["mandatory"]),
                     "match": f"exact standard match on {row['is_base']}",
                     "authority": r["authority"], "notes": r["notes"],
                     "confidence": "high", "source_url": r["source_url"]})

    title = (row["title"] or "").lower()
    for r in con.execute("SELECT * FROM certification_rules WHERE match_type='keyword'"):
        if r["match_value"].lower() in title and r["scheme"] not in seen:
            seen.add(r["scheme"])
            hits.append({"scheme": r["scheme"], "mandatory": bool(r["mandatory"]),
                         "match": f"title keyword '{r['match_value']}'",
                         "authority": r["authority"], "notes": r["notes"],
                         "confidence": "low", "source_url": r["source_url"]})

    return {
        "schemes": hits,
        "note": ("Certification flags come from a curated seed table and may be "
                 "out of date; verify against the current BIS/MeitY notifications "
                 "before relying on them."),
    }
