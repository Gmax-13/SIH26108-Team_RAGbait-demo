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
from collections.abc import Iterator
from typing import Any

from backend.config import ABSTAIN_THRESHOLD, GRAPH_HOPS, RETRIEVAL_TOP_K
from backend.textfmt import readable
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


STAGES = [
    ("retrieval", "Semantic retrieval"),
    ("graph", "Graph expansion"),
    ("synthesis", "Synthesis"),
    ("critic", "Grounding check"),
    ("currency", "Currency check"),
    ("certification", "Certification flags"),
]


def recommend(con, retriever: Retriever, query: str, **kw) -> dict[str, Any]:
    """Run the pipeline and return only the final result.

    Thin wrapper over `recommend_events`, so there is exactly one implementation
    of the pipeline and the streaming and non-streaming paths cannot drift.
    """
    result: dict[str, Any] = {}
    for ev in recommend_events(con, retriever, query, **kw):
        if ev.get("event") == "result":
            result = ev["result"]
    return result


def recommend_events(con, retriever: Retriever, query: str, *,
                     top_k: int = RETRIEVAL_TOP_K, hops: int = GRAPH_HOPS,
                     threshold: float = ABSTAIN_THRESHOLD,
                     use_llm: bool = True) -> Iterator[dict[str, Any]]:
    """Run the pipeline, yielding a stage event before and after each step.

    A recommendation takes several seconds and the slow parts are invisible from
    outside, so the caller is told which stage is actually running rather than
    being shown a spinner that implies nothing.
    """
    t0 = time.time()
    llm_error: str | None = None

    def done(stage: str, detail: str = "") -> dict[str, Any]:
        return {"event": "stage", "stage": stage, "status": "done",
                "detail": detail, "elapsed": round(time.time() - t0, 2)}

    def running(stage: str) -> dict[str, Any]:
        return {"event": "stage", "stage": stage, "status": "running",
                "elapsed": round(time.time() - t0, 2)}

    # --- 1. semantic retrieval ---
    yield running("retrieval")
    candidates = retriever.candidate_standards(query, k=top_k)
    if not candidates:
        yield {"event": "result", "result": _no_candidates(query)}
        return
    yield done("retrieval", f"{len(candidates)} candidate standards")

    # --- 2. graph expansion ---
    yield running("graph")
    seeds = [c["is_number"] for c in candidates[:3]]
    graph = retriever.expand(seeds, hops=hops)
    yield done("graph", f"{len(graph['nodes'])} standards, {len(graph['edges'])} links")

    # --- 3. synthesis ---
    # With no LLM we fall back to rule-based synthesis rather than skipping
    # verification: the critic, and therefore the abstention path, must stay live.
    yield running("synthesis")
    if not (use_llm and available()):
        rec = synthesize_rule_based(candidates)
        yield done("synthesis", "rule-based (no LLM configured)")
    else:
        try:
            rec = synthesize(query, candidates, graph)
            yield done("synthesis", f"{len(rec.get('claims', []))} claims drafted")
        except LLMUnavailable as e:
            # An unreachable or rate-limited model is NOT the same thing as
            # "the evidence does not support an answer". Reporting a quota
            # error as an abstention makes the system look appropriately
            # cautious when it is simply degraded, so fall back to rule-based
            # synthesis and label it — the critic still runs, and a genuine
            # abstention can still follow.
            llm_error = str(e)
            rec = synthesize_rule_based(candidates)
            yield done("synthesis", "LLM unavailable — fell back to rule-based")

    # --- 4. critic / grounding ---
    yield running("critic")
    report = verify(con, rec, candidates, threshold=threshold, query=query,
                    use_llm=use_llm and llm_error is None)
    if report["abstain"]:
        if llm_error:
            report.setdefault("reasons", []).append(
                f"The language model was unavailable, so this ran on weaker "
                f"rule-based synthesis: {llm_error[:160]}")
        yield done("critic", f"abstained at {report['confidence']}")
        out = abstention_response(query, candidates, report,
                                  elapsed_sec=round(time.time() - t0, 2))
        out["llm_error"] = llm_error
        yield {"event": "result", "result": out}
        return
    yield done("critic", f"confidence {report['confidence']}")

    # --- 5 & 6. currency + certification for each recommended standard ---
    yield running("currency")
    primaries = [s.get("is_number") for s in rec.get("primary_standards", [])
                 if s.get("is_number")]
    currency = {n: check_currency(con, n) for n in primaries}
    yield done("currency", ", ".join(
        f"{n} {currency[n].get('status')}" for n in primaries) or "no primary standard")

    yield running("certification")
    certification = {n: check_certification(con, n) for n in primaries}
    n_schemes = sum(len((certification[n] or {}).get("schemes", [])) for n in primaries)
    yield done("certification",
               f"{n_schemes} scheme flag(s)" if n_schemes else "no scheme matched")

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
                    "section": ch["section"],
                    # Reflowed for reading; whitespace only, so still verbatim.
                    "excerpt": readable(ch["text"], 700),
                    "similarity": round(ch["score"], 3),
                })

    result = {
        "status": "recommended",
        "synthesis_method": rec.get("synthesis_method", "llm"),
        "llm_error": llm_error,
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
    yield {"event": "result", "result": result}
