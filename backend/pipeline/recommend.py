"""Phase 4 — the recommendation pipeline, steps 1-6 in order.

    1. semantic retrieval          (retrieve.Retriever.candidate_standards)
    2. graph expansion             (retrieve.Retriever.expand)
    3. LLM synthesis with citations(synthesize.synthesize)
    4. critic / grounding check    (critic.verify -> may abstain)
    5. currency check              (currency.check_currency)
    6. certification flagging      (certification.check_certification)

Abstention is a first-class outcome, not an error path.
"""
from __future__ import annotations
import time
from typing import Any

from backend.config import ABSTAIN_THRESHOLD, GRAPH_HOPS, RETRIEVAL_TOP_K
from backend.pipeline.certification import check_certification
from backend.pipeline.critic import abstention_response, verify
from backend.pipeline.currency import check_currency
from backend.pipeline.llm import LLMUnavailable, available
from backend.pipeline.retrieve import Retriever
from backend.pipeline.synthesize import synthesize, synthesize_rule_based


def _no_candidates(query: str) -> dict[str, Any]:
    return {
        "status": "abstained",
        "query": query,
        "message": "Not confident enough to recommend a specific Indian Standard for this input.",
        "reasons": ["Semantic retrieval returned no candidate standards from the "
                    "ingested corpus."],
        "confidence": 0.0,
        "threshold": ABSTAIN_THRESHOLD,
        "closest_candidates": [],
        "next_steps": ["Describe the product or requirement in more technical detail.",
                       "Confirm the domain is covered by the ingested departments."],
        "verification": {"abstain": True, "confidence": 0.0,
                         "reasons": ["no candidates retrieved"]},
    }


def recommend(con, retriever: Retriever, query: str, *,
              top_k: int = RETRIEVAL_TOP_K, hops: int = GRAPH_HOPS,
              threshold: float = ABSTAIN_THRESHOLD,
              use_llm: bool = True) -> dict[str, Any]:
    t0 = time.time()

    # --- 1. semantic retrieval ---
    candidates = retriever.candidate_standards(query, k=top_k)
    if not candidates:
        return _no_candidates(query)

    # --- 2. graph expansion ---
    seeds = [c["is_number"] for c in candidates[:3]]
    graph = retriever.expand(seeds, hops=hops)

    # --- 3. synthesis ---
    # With no LLM we fall back to rule-based synthesis rather than skipping
    # verification: the critic, and therefore the abstention path, must stay live.
    if not (use_llm and available()):
        rec = synthesize_rule_based(candidates)
    else:
        try:
            rec = synthesize(query, candidates, graph)
        except LLMUnavailable as e:
            report = {"abstain": True, "confidence": 0.0,
                      "reasons": [f"Synthesis unavailable: {e}"],
                      "threshold": threshold, "signals": {}}
            return abstention_response(query, candidates, report,
                                       elapsed_sec=round(time.time() - t0, 2))

    # --- 4. critic / grounding ---
    report = verify(con, rec, candidates, threshold=threshold, query=query, use_llm=use_llm)
    if report["abstain"]:
        return abstention_response(query, candidates, report,
                                   elapsed_sec=round(time.time() - t0, 2))

    # --- 5 & 6. currency + certification for each recommended standard ---
    primaries = [s.get("is_number") for s in rec.get("primary_standards", [])
                 if s.get("is_number")]
    currency = {n: check_currency(con, n) for n in primaries}
    certification = {n: check_certification(con, n) for n in primaries}

    by_number = {c["is_number"]: c for c in candidates}
    citations = []
    for cl in report["claim_checks"]:
        for cid in cl["citations"]:
            src = cid.split("#")[0]
            cand = by_number.get(src)
            ch = next((x for x in (cand or {}).get("chunks", [])
                       if x["chunk_id"] == cid), None)
            if ch:
                citations.append({
                    "chunk_id": cid, "is_number": src,
                    "section": ch["section"], "excerpt": ch["text"][:500],
                    "similarity": round(ch["score"], 3),
                })

    return {
        "status": "recommended",
        "synthesis_method": rec.get("synthesis_method", "llm"),
        "query": query,
        "confidence": report["confidence"],
        "threshold": threshold,
        "primary_standards": [
            {**s,
             "title": by_number.get(s.get("is_number"), {}).get("title"),
             "metadata_only": by_number.get(s.get("is_number"), {}).get("metadata_only"),
             "currency": currency.get(s.get("is_number")),
             "certification": certification.get(s.get("is_number"))}
            for s in rec.get("primary_standards", [])
        ],
        "supporting_standards": rec.get("supporting_standards", []),
        "summary": rec.get("summary", ""),
        "claims": report["claim_checks"],
        "caveats": rec.get("caveats", []),
        "citations": {c["chunk_id"]: c for c in citations},
        "dependency_graph": graph,
        "verification": report,
        "elapsed_sec": round(time.time() - t0, 2),
    }
