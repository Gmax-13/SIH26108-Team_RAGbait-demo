"""Phase 3 — input processing.

Accepts either a short free-text description or a full tender/spec document
(PDF or text) and extracts discrete, atomic requirements. Each requirement is
then run through the recommendation pipeline individually.

Extraction is LLM-based rather than regex, because tender clauses vary wildly
in structure. When no LLM is configured we fall back to a conservative
structural splitter and say so, instead of pretending the extraction is as good.
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any

from backend.pipeline.llm import LLMUnavailable, available, chat_json

SYSTEM = """You extract procurement/technical REQUIREMENTS from tender and specification documents.

A requirement is one atomic, self-contained technical demand about a product,
material, installation or test — something that could be matched to a single
Indian Standard.

Rules:
- Split compound clauses into separate requirements.
- Keep the original technical detail (ratings, materials, dimensions, voltages).
- Skip commercial/legal boilerplate (payment terms, EMD, arbitration, delivery
  schedules, eligibility criteria).
- If the document cites a standard, record it verbatim in `cited_standards`.
- Do not invent requirements that are not in the text.

Reply ONLY with JSON:
{
  "requirements": [
    {
      "id": "R1",
      "text": "<the atomic requirement, self-contained>",
      "category": "<product|material|installation|test|safety|other>",
      "cited_standards": ["<any IS/IEC number the document itself cites, verbatim>"],
      "source_excerpt": "<short verbatim snippet from the document>"
    }
  ]
}"""

_CLAUSE_RE = re.compile(r"(?m)^\s*(?:\d+(?:\.\d+)*|[a-z]\)|\([a-z0-9]+\))\s+")

# The trailing year matters: "IS 3043 - 1987" is an outdated citation, while a
# bare "IS 3043" is not. Dropping the year silently resolves the reference to the
# current edition and hides the very problem batch mode exists to find.
_CITE_RE = re.compile(
    r"\bIS[\s:/]*\d{2,5}"
    r"(?:\s*\(\s*Part\s*[\dIVX]+\s*(?:/\s*Sec(?:tion)?\s*[\dIVX]+\s*)?\))?"
    r"(?:\s*[:\-]\s*(?:19|20)\d{2})?",
    re.I)


def read_input(path: str | Path) -> str:
    """Extract text from a PDF or plain-text file."""
    p = Path(path)
    if p.suffix.lower() == ".pdf":
        import fitz
        with fitz.open(str(p)) as doc:
            return "\n".join(page.get_text() for page in doc)
    return p.read_text(encoding="utf-8", errors="ignore")


def _fallback_split(text: str, max_items: int = 60) -> list[dict[str, Any]]:
    """Structural splitter used when no LLM is available."""
    parts = _CLAUSE_RE.split(text)
    items: list[dict[str, Any]] = []
    for chunk in parts:
        s = re.sub(r"\s+", " ", chunk).strip()
        if len(s) < 40 or len(s) > 800:
            continue
        cited = _CITE_RE.findall(s)
        items.append({
            "id": f"R{len(items) + 1}", "text": s, "category": "other",
            "cited_standards": cited, "source_excerpt": s[:200],
        })
        if len(items) >= max_items:
            break
    return items


def extract_requirements(text: str, *, max_chars: int = 24000,
                         use_llm: bool = True) -> dict[str, Any]:
    """Return {'requirements': [...], 'method': 'llm'|'structural', 'notes': [...]}"""
    notes: list[str] = []
    truncated = len(text) > max_chars
    if truncated:
        notes.append(f"Document truncated to {max_chars} characters for extraction "
                     f"(original {len(text)}).")
    body = text[:max_chars]

    if use_llm and available():
        try:
            out = chat_json(
                [{"role": "system", "content": SYSTEM},
                 {"role": "user", "content": f"DOCUMENT:\n{body}"}],
                temperature=0.0, max_tokens=4000)
            reqs = out.get("requirements", []) or []
            for i, r in enumerate(reqs, 1):
                r.setdefault("id", f"R{i}")
                r.setdefault("cited_standards", [])
                r.setdefault("category", "other")
            if reqs:
                return {"requirements": reqs, "method": "llm", "notes": notes}
            notes.append("LLM extraction returned no requirements; fell back to "
                         "structural splitting.")
        except LLMUnavailable as e:
            notes.append(f"LLM extraction unavailable ({e}); fell back to "
                         f"structural splitting.")
    else:
        notes.append("No LLM configured; used structural clause splitting, which is "
                     "less accurate than LLM extraction.")

    return {"requirements": _fallback_split(body), "method": "structural", "notes": notes}
