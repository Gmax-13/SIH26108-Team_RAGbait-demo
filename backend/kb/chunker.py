"""Split standard full text into citable chunks.

A chunk is the unit of citation: the recommender cites chunk ids, and the
critic re-reads those exact chunks to check grounding. Chunk ids are stable
and human-legible, e.g. "IS 732:1989#c014".
"""
from __future__ import annotations
import re
from typing import Any, Iterator

from backend.config import CHUNK_CHARS, CHUNK_OVERLAP
from backend.kb.references import _section_of  # noqa: PLC2701 - deliberate reuse

_PARA = re.compile(r"\n\s*\n")


def chunk_text(text: str, size: int = CHUNK_CHARS,
               overlap: int = CHUNK_OVERLAP) -> Iterator[tuple[int, int, str]]:
    """Yield (char_start, char_end, chunk) preferring paragraph boundaries."""
    text = text.strip()
    n = len(text)
    if n == 0:
        return
    pos = 0
    while pos < n:
        end = min(pos + size, n)
        if end < n:
            # prefer to break at a paragraph, else a sentence, else hard cut
            window = text[pos:end]
            brk = None
            m = list(_PARA.finditer(window))
            if m and m[-1].start() > size * 0.4:
                brk = pos + m[-1].start()
            if brk is None:
                s = window.rfind(". ")
                if s > size * 0.4:
                    brk = pos + s + 1
            if brk:
                end = brk
        chunk = text[pos:end].strip()
        if len(chunk) >= 80:            # skip slivers left by OCR noise
            yield pos, end, chunk
        if end <= pos:                  # safety: never stall
            end = min(pos + size, n)
        pos = max(end - overlap, end) if end >= n else end - overlap
        if pos >= n:
            break


def build_chunks(is_number: str, text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, (a, b, body) in enumerate(chunk_text(text)):
        out.append({
            "id": f"{is_number}#c{i:03d}",
            "chunk_index": i,
            "section": _section_of(text, a + len(body) // 2),
            "text": body,
            "char_start": a,
            "char_end": b,
        })
    return out


def metadata_pseudo_text(rec: dict[str, Any]) -> str:
    """For metadata-only standards, build one synthetic chunk from catalogue fields.

    This keeps them retrievable, but callers must surface `metadata_only` so the
    user knows the match was not verified against real document text.
    """
    bits = [f"{rec['is_number']} — {rec['title']}"]
    if rec.get("aspect"):
        bits.append(f"Aspect: {rec['aspect']}.")
    if rec.get("technical_committee"):
        bits.append(f"Technical committee: {rec['technical_committee']}.")
    if rec.get("iso_equivalence"):
        bits.append(f"Equivalent to {rec['iso_equivalence']} ({rec.get('iso_equiv_degree') or 'equivalence unstated'}).")
    return " ".join(bits)
