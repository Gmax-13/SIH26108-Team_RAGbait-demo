"""Internet Archive client for BIS standard full text.

Public.Resource.Org mirrors BIS standards under identifiers shaped like
    gov.in.is.<number>[.<part>].<year>        e.g. gov.in.is.1554.1.1988

Each item carries a pre-OCR'd `<name>_djvu.txt`, so we fetch plain text
directly and never download or OCR a PDF. Content is CC0 / RTI-released.
"""
from __future__ import annotations
import json, re, ssl, urllib.parse, urllib.request


UA = "SIH-IS-Recommender/1.0 (academic prototype; contact via project repo)"
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


def _get(url: str, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=timeout, context=_CTX).read()


def _num_from_base(is_base: str) -> str | None:
    """'IS 1554' -> '1554'. Returns None for non-IS families (IEC/ISO mirrors)."""
    m = re.match(r"^IS\s+(\d+(?:\.\d+)*)$", is_base.strip(), re.I)
    return m.group(1) if m else None


def find_identifiers(is_base: str, part: str | None = None,
                     section: str | None = None, rows: int = 60) -> list[str]:
    """Every mirrored edition of THIS EXACT standard (number + part + section).

    The identifier layout is `gov.in.is.<num>[.<part>[.<section>]].<year>`, so a
    loose prefix match is dangerous: searching `gov.in.is.302.2.` also matches
    `gov.in.is.302.2.21.2018`, which is Part 2 *Section 21* — a different
    document. Attaching that to Part 2/Sec 28 would cite the wrong standard's
    text under the right standard's name. So the match is anchored exactly, and
    a standard whose own part/section was never mirrored simply stays
    metadata-only rather than borrowing a sibling's text.
    """
    num = _num_from_base(is_base)
    if not num:
        return []

    if part and section:
        prefix = f"gov.in.is.{num}.{part}.{section}."
        exact = rf"gov\.in\.is\.{re.escape(num)}\.{re.escape(part)}\.{re.escape(section)}\.\d{{4}}"
    elif part:
        prefix = f"gov.in.is.{num}.{part}."
        exact = rf"gov\.in\.is\.{re.escape(num)}\.{re.escape(part)}\.\d{{4}}"
    else:
        prefix = f"gov.in.is.{num}."
        exact = rf"gov\.in\.is\.{re.escape(num)}\.\d{{4}}"

    url = ("https://archive.org/advancedsearch.php?"
           + urllib.parse.urlencode({"q": f"identifier:{prefix}*", "fl[]": "identifier",
                                     "rows": rows, "page": 1, "output": "json"}))
    try:
        data = json.loads(_get(url, 60))
    except Exception:
        return []
    docs = data.get("response", {}).get("docs", [])
    idents = [d["identifier"] for d in docs if "identifier" in d]
    return sorted(i for i in idents if re.fullmatch(exact, i))


def pick_identifier(idents: list[str], want_year: int | None) -> str | None:
    """Prefer the exact published year; otherwise the newest edition available."""
    if not idents:
        return None
    def year_of(i: str) -> int:
        m = re.search(r"\.(\d{4})$", i)
        return int(m.group(1)) if m else 0
    if want_year:
        for i in idents:
            if year_of(i) == want_year:
                return i
    return max(idents, key=year_of)


def fetch_text(identifier: str) -> tuple[str | None, str | None]:
    """Return (full_text, error). Uses the item's pre-OCR'd djvu.txt."""
    try:
        meta = json.loads(_get(f"https://archive.org/metadata/{identifier}", 60))
    except Exception as e:
        return None, f"metadata: {type(e).__name__}: {e}"
    files = meta.get("files", [])
    txt = next((f["name"] for f in files if f.get("name", "").endswith("_djvu.txt")), None)
    if not txt:
        return None, "no _djvu.txt in item"
    try:
        raw = _get(f"https://archive.org/download/{identifier}/{urllib.parse.quote(txt)}", 180)
    except Exception as e:
        return None, f"download: {type(e).__name__}: {e}"
    return raw.decode("utf-8", "ignore"), None


# Public.Resource.Org prepends a fixed RTI disclosure to every scan; it ends
# with the Nehru epigraph. Everything before that is not part of the standard.
_RTI_END = re.compile(r"Step\s+Out\s+From\s+the\s+Old\s+to\s+the\s+New", re.I)
_NOISE_MARKERS = re.compile(r"^(BLANK PAGE|\*{4,}|PROTECTED BY COPYRIGHT)\s*$", re.I)


def clean_text(t: str) -> str:
    """Strip the RTI boilerplate header and OCR noise lines."""
    m = _RTI_END.search(t[:20000])
    if m:
        t = t[m.end():]
    lines: list[str] = []
    for ln in t.splitlines():
        s = ln.rstrip()
        if not s.strip():
            lines.append("")
            continue
        if _NOISE_MARKERS.match(s.strip()):
            continue
        alnum = sum(c.isalnum() for c in s)
        if alnum < max(3, len(s) * 0.35):   # mostly OCR garbage / scan artefacts
            continue
        lines.append(s)
    out = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", out).strip()
