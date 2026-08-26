"""Phase 5b — batch tender mode.

Runs the full single-query pipeline over every requirement extracted from a
document, then aggregates into one quantified compliance report:

    N requirements extracted -> M standards identified
    -> X outdated references -> Y certification flags -> Z abstentions

Two distinct sources of "outdated reference" are tracked separately:
  * standards the DOCUMENT ITSELF cites that are superseded/withdrawn
  * standards WE recommend whose cited edition is not the latest
"""
from __future__ import annotations
import re
import time
from typing import Any


from backend.pipeline.currency import check_currency
from backend.pipeline.parse_document import extract_requirements
from backend.pipeline.recommend import recommend
from backend.pipeline.retrieve import Retriever

_IS_CITE = re.compile(
    r"\bIS[\s:/]*(\d{2,5})(?:\s*\(\s*Part\s*([\dIVX]+)\s*\))?(?:\s*[:\-]\s*((?:19|20)\d{2}))?",
    re.I)


def _resolve_cited(con, raw: str) -> dict[str, Any]:
    """Check a standard the tender document itself cites."""
    m = _IS_CITE.search(raw or "")
    if not m:
        return {"cited_as": raw, "resolved": None, "status": "unrecognised",
                "flags": ["Could not parse this as an IS number."]}
    base = f"IS {m.group(1)}"
    part, year = m.group(2), m.group(3)

    # Match the cited document identity exactly. A citation of "IS 9537 (Part 3)"
    # must not be compared against IS 9537 (Part 8) — a different document, not a
    # newer edition. A citation with no part matches only the part-less entries.
    q = ("SELECT is_number,year FROM standards WHERE is_base=? "
         "AND IFNULL(part,'') = IFNULL(?,'')")
    params: list[Any] = [base, part]
    rows = con.execute(q + " ORDER BY year DESC", params).fetchall()
    if not rows and part is None:
        # The document cited a bare base number for a standard published in parts.
        rows = con.execute(
            "SELECT is_number,year FROM standards WHERE is_base=? ORDER BY year DESC",
            (base,)).fetchall()
    if not rows:
        return {"cited_as": raw, "resolved": None, "status": "not_in_corpus",
                "flags": [f"{base} is not present in the ingested corpus, so its "
                          f"currency could not be checked."]}

    latest = rows[0]
    target = next((r for r in rows if str(r["year"]) == year), None) if year else None
    chosen = target or latest
    cur = check_currency(con, chosen["is_number"])
    cur["cited_as"] = raw
    cur["cited_year"] = int(year) if year else None

    # The cited edition is judged against the newest edition in the catalogue —
    # not against whether we happen to hold a row for that exact year. Otherwise a
    # tender citing a 1987 edition we never ingested would resolve to the current
    # 2018 row and be reported as up to date, which is the opposite of the truth.
    if year and latest["year"] and int(year) < int(latest["year"]):
        cur["status"] = "superseded"
        cur["latest_known_edition"] = latest["is_number"]
        cur["flags"] = list(cur.get("flags", [])) + [
            f"Document cites the {year} edition; the catalogue's newest edition is "
            f"{latest['is_number']}."]
        if not target:
            cur["flags"].append(
                f"The {year} edition is not in the ingested corpus, so its content "
                f"could not be compared — only its edition year.")
    return cur


def run_batch(con, retriever: Retriever, text: str, *,
              use_llm: bool = True, max_requirements: int = 0,
              progress=None) -> dict[str, Any]:
    t0 = time.time()
    parsed = extract_requirements(text, use_llm=use_llm)
    reqs = parsed["requirements"]
    if max_requirements:
        reqs = reqs[:max_requirements]

    results: list[dict[str, Any]] = []
    for i, r in enumerate(reqs, 1):
        res = recommend(con, retriever, r["text"], use_llm=use_llm)
        results.append({"requirement": r, "result": res})
        if progress:
            progress(i, len(reqs), r, res)

    # ---- aggregate ----
    identified: dict[str, dict[str, Any]] = {}
    abstained = 0
    outdated_recommended: list[dict[str, Any]] = []
    cert_flags: list[dict[str, Any]] = []

    for item in results:
        res = item["result"]
        if res["status"] == "abstained":
            abstained += 1
            continue
        for ps in res.get("primary_standards", []):
            num = ps.get("is_number")
            if not num:
                continue
            identified.setdefault(num, {
                "is_number": num, "title": ps.get("title"),
                "requirements": [], "currency": ps.get("currency"),
                "certification": ps.get("certification"),
            })["requirements"].append(item["requirement"]["id"])

            cur = ps.get("currency") or {}
            if cur.get("status") in ("superseded", "withdrawn"):
                outdated_recommended.append({
                    "is_number": num, "status": cur["status"],
                    "latest": cur.get("latest_known_edition"),
                    "requirement_id": item["requirement"]["id"],
                })
            for sch in (ps.get("certification") or {}).get("schemes", []):
                if sch.get("mandatory"):
                    cert_flags.append({
                        "is_number": num, "scheme": sch["scheme"],
                        "confidence": sch["confidence"],
                        "authority": sch.get("authority"),
                        "requirement_id": item["requirement"]["id"],
                    })

    # ---- standards the document itself cites ----
    cited_raw: list[str] = []
    for r in reqs:
        cited_raw.extend(r.get("cited_standards") or [])
    seen: set[str] = set()
    document_citations = []
    for raw in cited_raw:
        key = re.sub(r"\s+", " ", raw).strip().upper()
        if key in seen:
            continue
        seen.add(key)
        document_citations.append(_resolve_cited(con, raw))
    outdated_cited = [c for c in document_citations
                      if c.get("status") in ("superseded", "withdrawn")]

    return {
        "status": "batch_complete",
        "extraction": {"method": parsed["method"], "notes": parsed["notes"]},
        "summary": {
            "requirements_extracted": len(reqs),
            "standards_identified": len(identified),
            "requirements_abstained": abstained,
            "document_cited_standards": len(document_citations),
            "outdated_document_citations": len(outdated_cited),
            "outdated_recommended_editions": len(outdated_recommended),
            "certification_flags": len(cert_flags),
        },
        "standards_identified": list(identified.values()),
        "document_citations": document_citations,
        "outdated_document_citations": outdated_cited,
        "outdated_recommended_editions": outdated_recommended,
        "certification_flags": cert_flags,
        "results": results,
        "elapsed_sec": round(time.time() - t0, 2),
    }
