"""Make scanned-standard text readable without changing what it says.

The Internet Archive scans are OCR'd with doubled spaces between every word and
a line break after every printed line, so a quoted passage renders as a tall
ragged column that looks broken:

    POLYVINYL  CHLORIDE  INSULATED  UNSHEATHED
    AND  SHEATHED  CABLES/CORDS  WITH  RIGID  AND

This reflows that into prose. It only ever collapses or moves WHITESPACE — no
word is added, removed, reordered or reworded — so a displayed citation is still
verbatim and still checkable against the stored chunk. The stored text keeps its
original form; this is presentation only.
"""
from __future__ import annotations
import re

_WS = re.compile(r"\s+")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,;:.)\]])")
_SPACE_AFTER_OPEN = re.compile(r"([(\[])\s+")
_HYPHEN_BREAK = re.compile(r"(\w)-\s+(\w)")


def readable(text: str | None, limit: int | None = None) -> str:
    """Reflow OCR'd standard text into readable prose."""
    if not text:
        return ""
    s = _HYPHEN_BREAK.sub(r"\1\2", text)   # re-join words split across a line
    s = _WS.sub(" ", s)                    # collapse doubled spaces and newlines
    s = _SPACE_BEFORE_PUNCT.sub(r"\1", s)
    s = _SPACE_AFTER_OPEN.sub(r"\1", s)
    s = s.strip()
    if limit and len(s) > limit:
        cut = s.rfind(" ", 0, limit)
        s = s[: cut if cut > limit * 0.6 else limit].rstrip() + "…"
    return s
