"""Turn a raw BIS catalogue row into a clean `standards` record.

BIS's `is_no` field is an HTML blob with up to three <br>-separated segments:
    "IS 1554 (Part 1):1988<br>IEC 60502<br> (Active)"
     ^ number/part/year        ^ ISO equivalent  ^ status note

Some rows are malformed at source (e.g. "IS/IEC :2023" with the number missing
entirely); for those the ISO equivalent in segment 2 carries the real identity.
We never invent an identity — unparseable rows are reported, not guessed at.
"""
from __future__ import annotations
import html, re
from typing import Any

from backend.store import now

# "IS 1554 (Part 1/Sec 2):1988"  |  "IS/ISO 9001:2015"  |  "IS 10:2013"
_NUM_RE = re.compile(
    r"""^(?P<fam>(?:IS|SP|CHD)(?:\s*/\s*[A-Za-z]+)*|)   # IS, IS/IEC, IS/ISO/IEC, SP, or bare
        \s*
        (?P<num>\d+(?:\.\d+)*)?                # 1554  (absent in malformed rows)
        (?:\s+(?P=num))?                        # BIS sometimes repeats it: "10558 10558:2013"
        \s*
        (?:\(\s*Part\s*(?P<part>[\dA-Za-z]+)   # (Part 1
           (?:\s*/\s*Sec(?:tion)?\s*(?P<sec>[\dA-Za-z]+))?   #  /Sec 2
           \s*\))?
        \s*
        (?:\(\s*Sec(?:tion)?\s*(?P<sec2>[\dA-Za-z]+)\s*\))?
        \s*
        (?::\s*(?P<year>\d{4}))?               # :1988
    """,
    re.X | re.I,
)

_ISO_RE = re.compile(r"\b((?:IEC|ISO|ISO/IEC|EN|BS|ASTM)\s*[\w\-/.]*\d[\w\-/.]*(?::\d{4})?)", re.I)

DEPT_RE = re.compile(r"^([A-Z]{2,5})")


def _segments(is_no_html: str) -> list[str]:
    txt = html.unescape(is_no_html or "")
    parts = re.split(r"<br\s*/?>", txt, flags=re.I)
    return [re.sub(r"\s+", " ", p).strip() for p in parts]


def parse_is_no(is_no_html: str) -> dict[str, Any]:
    segs = _segments(is_no_html)
    head = segs[0] if segs else ""
    rest = segs[1:]

    out: dict[str, Any] = {
        "is_number": None, "is_base": None, "part": None, "section": None,
        "year": None, "iso_equivalence": None, "status_note": None,
        "is_active": 1, "parse_ok": False, "raw": is_no_html,
    }

    # status note = last non-empty segment that looks like a remark
    for s in reversed(rest):
        if s and s.upper() != "NULL":
            if s.startswith("(") or "Reaffirm" in s or "Withdraw" in s or "Supersed" in s:
                out["status_note"] = s
                break
    note = (out["status_note"] or "")
    if re.search(r"withdraw|supersed", note, re.I):
        out["is_active"] = 0

    # ISO equivalent lives in a middle segment
    for s in rest:
        if not s or s.upper() == "NULL" or s.startswith("("):
            continue
        if s == out["status_note"]:
            continue
        m = _ISO_RE.search(s)
        if m:
            out["iso_equivalence"] = m.group(1).strip()
            break

    m = _NUM_RE.match(head)
    if not m:
        return out
    fam = re.sub(r"\s*/\s*", "/", m.group("fam").upper()) or "IS"
    num = m.group("num")
    part = m.group("part")
    sec = m.group("sec") or m.group("sec2")
    year = m.group("year")

    if not num:
        # BIS emitted e.g. "IS/IEC :2023" — identity must come from the ISO field.
        if out["iso_equivalence"]:
            out["is_base"] = out["iso_equivalence"].split(":")[0].strip().upper()
        if year:
            out["year"] = int(year)
        if out["is_base"]:
            out["is_number"] = f"{out['is_base']}:{year}" if year else out["is_base"]
            out["parse_ok"] = True
        return out

    base = f"{fam} {num}"
    label = base
    if part and sec:
        label += f" (Part {part}/Sec {sec})"
    elif part:
        label += f" (Part {part})"
    elif sec:
        label += f" (Sec {sec})"

    out.update({
        "is_base": base, "part": part, "section": sec,
        "year": int(year) if year else None,
        "is_number": f"{label}:{year}" if year else label,
        "parse_ok": True,
    })
    return out


def normalize_row(row: dict[str, Any]) -> dict[str, Any] | None:
    """Map one BIS API row to a `standards` record, or None if unidentifiable."""
    p = parse_is_no(row.get("is_no", ""))
    if not p["parse_ok"] or not p["is_number"]:
        return None

    tc = re.sub(r"\s+", " ", (row.get("technical_committee") or "")).strip()
    dept_m = DEPT_RE.match(tc)
    amend = (row.get("amendments") or "0").strip()

    return {
        "is_number": p["is_number"],
        "is_base": p["is_base"],
        "part": p["part"],
        "section": p["section"],
        "year": p["year"],
        "title": html.unescape(re.sub(r"\s+", " ", row.get("is_title") or "")).strip(),
        "technical_committee": tc or None,
        "department": dept_m.group(1) if dept_m else None,
        "aspect": (row.get("aspect") or "").strip() or None,
        "amendments": amend,
        "amendment_count": int(amend) if amend.isdigit() else 0,
        "status_note": p["status_note"],
        "withdrawn_status": row.get("withdrawn_status"),
        "is_active": 0 if (row.get("withdrawn_status") or "").upper() == "W" else p["is_active"],
        "iso_equivalence": p["iso_equivalence"],
        # BIS misnames this field 'referirmatin_year'; it is the equivalence degree.
        "iso_equiv_degree": (row.get("referirmatin_year") or "").strip() or None,
        "source": "bis_catalogue",
        "archive_identifier": None,
        "has_full_text": 0,
        "full_text": None,
        "full_text_chars": 0,
        "metadata_only": 1,
        "scraped_at": now(),
    }
