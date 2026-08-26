"""Phase 4 step 3 — LLM synthesis of a recommendation from retrieved evidence.

The model is given ONLY the retrieved passages and told it may cite nothing
else. That constraint is re-checked downstream by the critic, which does not
trust this prompt to have been obeyed.
"""
from __future__ import annotations
from typing import Any

from backend.pipeline.llm import chat_json

SYSTEM = """You recommend Indian Standards (IS) for product/technical requirements.

ABSOLUTE RULES:
1. You may ONLY name standards that appear in the CANDIDATE STANDARDS block below.
   Never invent, guess, or recall an IS number from memory. If the candidates do
   not fit the requirement, say so in `summary` and return an empty
   `primary_standards` list.
2. Every entry in `claims` must cite one or more passage ids taken verbatim from
   the SOURCE PASSAGES block (they look like "IS 732:1989#c014"). Never invent a
   passage id.
3. Make claims that the cited passage actually supports. Do not extrapolate.
4. Prefer a standard whose passages directly address the requirement over one
   that merely shares vocabulary.

Reply ONLY with JSON of this exact shape:
{
  "primary_standards": [
    {"is_number": "<from candidates>", "role": "<why this is the primary standard>"}
  ],
  "supporting_standards": [
    {"is_number": "<from candidates>", "role": "<how it supports the primary>"}
  ],
  "summary": "<2-4 sentences answering the requirement>",
  "claims": [
    {"claim": "<a single factual statement>", "citations": ["<passage id>"]}
  ],
  "caveats": ["<anything you could not determine from the passages>"]
}"""


def _render_candidates(retrieved: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for c in retrieved:
        tag = " [CATALOGUE METADATA ONLY - content unverified]" if c["metadata_only"] else ""
        lines.append(
            f"- {c['is_number']} | {c['title']} | aspect={c['aspect']} | "
            f"committee={c['technical_committee']}{tag}")
    return "\n".join(lines)


def _render_passages(retrieved: list[dict[str, Any]], max_chars: int = 1400) -> str:
    blocks: list[str] = []
    for c in retrieved:
        for ch in c["chunks"]:
            sec = f" ({ch['section']})" if ch.get("section") else ""
            blocks.append(
                f"[{ch['chunk_id']}]{sec} from {c['is_number']}:\n"
                f"{ch['text'][:max_chars]}")
    return "\n\n".join(blocks)


def synthesize_rule_based(retrieved: list[dict[str, Any]]) -> dict[str, Any]:
    """Deterministic synthesis used when no LLM is configured.

    It makes exactly one assertion per candidate — that the standard covers the
    subject named in its own catalogue title — and cites the retrieved passages.
    The critic then checks that claim the same way it checks an LLM's: the title's
    terms must actually appear in the cited passage, and the standard must be
    relevant to the query. That check is not circular, because the claim comes
    from catalogue metadata while the evidence comes from the document body.

    This is weaker than LLM synthesis and is labelled as such — but it keeps the
    verification and abstention path live without an API key.
    """
    if not retrieved:
        return {"primary_standards": [], "supporting_standards": [], "summary": "",
                "claims": [], "caveats": [], "synthesis_method": "rule_based"}

    top = retrieved[0]
    cites = [c["chunk_id"] for c in top["chunks"][:2]]
    claim = f"{top['is_number']} covers {top['title']}."

    supporting = [
        {"is_number": c["is_number"],
         "role": f"Also matched this requirement ({c['aspect'] or 'unclassified'})."}
        for c in retrieved[1:4]
    ]
    caveats = [
        "Generated without an LLM: this is rule-based synthesis from catalogue "
        "titles plus semantic retrieval, not a reasoned reading of the standard.",
    ]
    if top["metadata_only"]:
        caveats.append(
            "The primary match has no ingested full text, so its content could not "
            "be verified.")

    return {
        "primary_standards": [
            {"is_number": top["is_number"],
             "role": f"Closest semantic match to the requirement "
                     f"(similarity {top['best_score']:.3f})."}],
        "supporting_standards": supporting,
        "summary": (f"{top['is_number']} — {top['title']} — is the closest match in the "
                    f"ingested corpus for this requirement."),
        "claims": [{"claim": claim, "citations": cites}],
        "caveats": caveats,
        "synthesis_method": "rule_based",
    }


def synthesize(query: str, retrieved: list[dict[str, Any]],
               graph: dict[str, Any] | None = None) -> dict[str, Any]:
    """Produce a structured, citation-bearing recommendation."""
    graph_note = ""
    if graph and graph.get("edges"):
        rel = []
        for e in graph["edges"][:20]:
            mark = "confirmed" if e["confidence"] == "confirmed" else "INFERRED-unverified"
            rel.append(f"- {e['source']} --{e['edge_type']}({mark})--> {e['target']}")
        graph_note = ("\n\nKNOWN DEPENDENCY EDGES (from ingested full text):\n"
                      + "\n".join(rel))

    user = (
        f"REQUIREMENT:\n{query}\n\n"
        f"CANDIDATE STANDARDS:\n{_render_candidates(retrieved)}\n\n"
        f"SOURCE PASSAGES:\n{_render_passages(retrieved)}"
        f"{graph_note}"
    )
    out = chat_json(
        [{"role": "system", "content": SYSTEM},
         {"role": "user", "content": user}],
        temperature=0.1, max_tokens=2000)

    # normalise shape so downstream code can rely on it
    out.setdefault("primary_standards", [])
    out.setdefault("supporting_standards", [])
    out.setdefault("summary", "")
    out.setdefault("claims", [])
    out.setdefault("caveats", [])
    for c in out["claims"]:
        c.setdefault("citations", [])
    return out
