"""Extract IS-to-IS dependency edges from a standard's full text.

Older Indian Standards have no formal "Normative References" clause — they cite
inline, in shapes like:
    IS : 3043 - 1987      IS 3043:1987      IS 3043      IS : 1554 ( Part 1 )
so we scan the whole document and keep the surrounding sentence as evidence.
Every edge therefore carries verbatim proof, which the critic layer can re-read.
"""
from __future__ import annotations
import re
from typing import Any

# Tolerates the ':' / '-' / spacing variants produced by OCR of BIS typography.
IS_REF_RE = re.compile(
    r"""\bIS\s*:?\s*
        (?P<num>\d{1,5})
        (?:\s*\(\s*Part\s*(?P<part>[\dIVXivx]+)\s*
             (?:/\s*Sec(?:tion)?\s*(?P<sec>[\dIVXivx]+)\s*)?\))?
        (?:\s*[:\-–]\s*(?P<year>(?:19|20)\d{2}))?
    """,
    re.X,
)

# Cue phrases that reveal what kind of dependency the citation expresses.
_CUES: list[tuple[str, re.Pattern[str]]] = [
    ("test_method",  re.compile(r"\b(test(?:ed|ing|s)?|method of test|shall be tested|"
                                r"type test|routine test|sampling)\b", re.I)),
    ("terminology",  re.compile(r"\b(terminolog|definition|glossary|nomenclature|"
                                r"terms? and definition)\b", re.I)),
    ("safety",       re.compile(r"\b(safety|protection against|hazard|earthing|"
                                r"electric shock|fire)\b", re.I)),
]

# Aspect (from the BIS catalogue) is a stronger signal than local wording.
# BIS's own `aspect` taxonomy maps almost one-to-one onto the categories a
# procurement officer needs to list, so use it rather than inventing our own.
# A Code of Practice IS the installation/practice standard; a Product
# Specification cited by another product standard is an allied product standard.
# Collapsing both to "normative reference" threw that distinction away.
ASPECT_TO_EDGE = {
    "Methods of tests": "test_method",
    "Terminology": "terminology",
    "Safety Standard": "safety",
    "Code of Practice": "installation",
    "Product Specification": "related_product",
    "Dimensions": "related_product",
    "Service Specification": "installation",
}

_ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5",
          "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"}


def _norm_part(p: str | None) -> str | None:
    if not p:
        return None
    p = p.strip()
    return _ROMAN.get(p.lower(), p)


def extract_references(text: str, self_base: str | None = None,
                       window: int = 130) -> list[dict[str, Any]]:
    """Find every distinct IS reference in `text` with evidence and a guessed type.

    Returns one record per distinct (base, part) target, keeping the first
    occurrence's evidence and the most frequent contextual cue.
    """
    found: dict[str, dict[str, Any]] = {}
    for m in IS_REF_RE.finditer(text):
        num = m.group("num")
        if len(num) < 2:              # "IS 1" style hits are almost always OCR noise
            continue
        part = _norm_part(m.group("part"))
        base = f"IS {num}"
        if self_base and base == self_base:
            continue
        key = f"{base}|{part or ''}"

        lo, hi = max(0, m.start() - window), min(len(text), m.end() + window)
        snippet = re.sub(r"\s+", " ", text[lo:hi]).strip()

        cue = None
        for label, pat in _CUES:
            if pat.search(snippet):
                cue = label
                break

        rec = found.get(key)
        if rec is None:
            found[key] = {
                "dst_is_base": base, "part": part,
                "year": m.group("year"), "count": 1,
                "evidence_snippet": snippet, "cue": cue,
                "evidence_section": _section_of(text, m.start()),
            }
        else:
            rec["count"] += 1
            if cue and not rec["cue"]:
                rec["cue"] = cue
                rec["evidence_snippet"] = snippet
    return sorted(found.values(), key=lambda r: -r["count"])


# OCR'd BIS text is reflowed, so clause headings are inline rather than on their
# own line: "... 5.1.3.2 Protective Conductors shall ...". Match that shape and
# keep the last one occurring before the citation.
_CLAUSE_RE = re.compile(
    r"(?:(?<=\s)|^)(\d{1,2}(?:\.\d{1,2}){1,3})\s+([A-Z][A-Za-z][^.\n]{2,48})")
_ANNEX_RE = re.compile(r"(?:(?<=\s)|^)(?:ANNEX|APPENDIX)\s+([A-Z])\b")


def _section_of(text: str, pos: int) -> str | None:
    """Best-effort: the nearest clause or annex heading above this position."""
    start = max(0, pos - 6000)          # look back a bounded window, not the whole doc
    window = text[start:pos]
    best_clause = None
    for m in _CLAUSE_RE.finditer(window):
        best_clause = m
    best_annex = None
    for m in _ANNEX_RE.finditer(window):
        best_annex = m
    if best_clause and (not best_annex or best_clause.start() > best_annex.start()):
        title = re.sub(r"\s+", " ", best_clause.group(2)).strip(" -?,")
        return f"Clause {best_clause.group(1)} {title}"[:80]
    if best_annex:
        return f"Annex {best_annex.group(1)}"
    return None


def classify_edge(cue: str | None, dst_aspect: str | None) -> str:
    """Aspect from the catalogue wins; contextual cue is the fallback."""
    if dst_aspect and dst_aspect in ASPECT_TO_EDGE:
        return ASPECT_TO_EDGE[dst_aspect]
    return cue or "normative_reference"
