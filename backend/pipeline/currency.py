"""Phase 4 step 5 — is the recommended standard the current edition?

Compares the cited edition against every edition of the same base number held
in the catalogue, and reports amendments and withdrawal explicitly.
"""
from __future__ import annotations
from typing import Any


def check_currency(con, is_number: str) -> dict[str, Any]:
    row = con.execute(
        """SELECT id,is_number,is_base,part,section,year,amendment_count,
                  withdrawn_status,is_active,status_note,metadata_only,
                  has_full_text,full_text_year,archive_identifier
           FROM standards WHERE is_number=?""", (is_number,)).fetchone()
    if row is None:
        return {"status": "unknown", "reason": "standard not present in ingested corpus",
                "is_number": is_number}

    # Editions are the SAME document in different years. Parts and sections are
    # different documents that merely share a base number: IS 9537 (Part 8):2003
    # is not a newer edition of IS 9537 (Part 3):1983, and reporting it as one
    # would tell a tender to swap in an unrelated standard.
    editions = con.execute(
        """SELECT is_number,year FROM standards
           WHERE is_base = ?
             AND IFNULL(part, '')    = IFNULL(?, '')
             AND IFNULL(section, '') = IFNULL(?, '')
             AND year IS NOT NULL
           ORDER BY year DESC""",
        (row["is_base"], row["part"], row["section"])).fetchall()
    latest = editions[0] if editions else None

    out: dict[str, Any] = {
        "is_number": row["is_number"],
        "is_base": row["is_base"],
        "year": row["year"],
        "amendment_count": row["amendment_count"] or 0,
        "withdrawn": bool((row["withdrawn_status"] or "").upper() == "W") or not row["is_active"],
        "catalogue_note": row["status_note"],
        "editions_known": [dict(e) for e in editions],
        "latest_known_edition": latest["is_number"] if latest else None,
        "flags": [],
    }

    if out["withdrawn"]:
        out["status"] = "withdrawn"
        out["flags"].append("Standard is marked withdrawn/superseded in the BIS catalogue.")
    elif latest and row["year"] and latest["year"] and latest["year"] > row["year"]:
        out["status"] = "superseded"
        out["flags"].append(
            f"A newer edition exists: {latest['is_number']} (cited edition is {row['year']}).")
    elif row["year"] is None:
        out["status"] = "unknown_year"
        out["flags"].append("No publication year recorded in the catalogue for this entry.")
    else:
        out["status"] = "current"

    if out["amendment_count"]:
        out["flags"].append(
            f"{out['amendment_count']} amendment(s) issued against this edition — "
            "check the amendment text, it is not part of the base document.")

    if row["metadata_only"]:
        out["flags"].append(
            "Catalogue metadata only — no full text was ingested for this standard, "
            "so its content could not be verified.")

    # archive.org does not mirror every edition. When the text we hold is from a
    # different edition than the one being cited, say so plainly: the passages are
    # real, but they are not this edition's text.
    out["full_text_year"] = row["full_text_year"]
    out["archive_identifier"] = row["archive_identifier"]
    out["text_edition_mismatch"] = bool(
        row["has_full_text"] and row["full_text_year"] and row["year"]
        and row["full_text_year"] != row["year"])
    if out["text_edition_mismatch"]:
        out["flags"].append(
            f"Full text held is from the {row['full_text_year']} edition, but this entry "
            f"is {row['is_base']}:{row['year']}. Cited passages come from "
            f"{row['full_text_year']} and may not reflect the current edition.")
    return out
