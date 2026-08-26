"""Phase 4 step 4 — grounding verification, confidence scoring, abstention.

Design principle: the guard against fabricated IS numbers is DETERMINISTIC.
It is a set-membership test against the ingested corpus, not an LLM judgement,
so it cannot itself hallucinate. The LLM entailment check refines confidence on
top of that floor; it never overrides it.

A recommendation survives only if:
  1. every IS number it names exists in the corpus              (hard gate)
  2. every citation points at a chunk that was actually retrieved (hard gate)
  3. its claims are supported by the text of those chunks       (scored)
  4. the resulting confidence clears ABSTAIN_THRESHOLD          (scored)
"""
from __future__ import annotations
import re
from typing import Any

from backend.config import ABSTAIN_THRESHOLD
from backend.kb.references import IS_REF_RE
from backend.pipeline.llm import LLMUnavailable, available, chat_json

_STOP = set(
    "a an the of for to in on and or with by as is are be shall may this that "
    "these those it its from at not no which such where when than then use used "
    "using requirement requirements standard standards indian bureau specification"
    .split()
)


def mentioned_is_numbers(text: str) -> set[str]:
    """Every 'IS ####' token appearing in a block of model output."""
    return {f"IS {m.group('num')}" for m in IS_REF_RE.finditer(text or "")
            if len(m.group("num")) >= 2}


def corpus_bases(con) -> set[str]:
    return {r[0] for r in con.execute("SELECT DISTINCT is_base FROM standards")}


def _tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower())
            if len(w) > 2 and w not in _STOP}


def lexical_support(claim: str, evidence: str) -> float:
    """Fraction of the claim's content words that appear in the cited passage."""
    c, e = _tokens(claim), _tokens(evidence)
    if not c:
        return 0.0
    return len(c & e) / len(c)


def llm_entailment(claim: str, evidence: str) -> dict[str, Any] | None:
    """Ask the model whether the passage actually supports the claim.

    Returns None when no LLM is configured, so the caller falls back to the
    lexical signal instead of assuming support.
    """
    if not available():
        return None
    system = (
        "You verify whether a SOURCE PASSAGE supports a CLAIM about an Indian Standard. "
        "Be strict: if the passage does not state or directly imply the claim, it is not "
        "supported. Reply ONLY with JSON: "
        '{"verdict":"supported|partial|unsupported","reason":"<one short sentence>"}'
    )
    try:
        return chat_json(
            [{"role": "system", "content": system},
             {"role": "user",
              "content": f"CLAIM:\n{claim}\n\nSOURCE PASSAGE:\n{evidence[:4000]}"}],
            temperature=0.0, max_tokens=200)
    except LLMUnavailable:
        return None


_VERDICT_SCORE = {"supported": 1.0, "partial": 0.5, "unsupported": 0.0}


def candidate_coherence(retrieved: list[dict[str, Any]], top_n: int = 5) -> float:
    """Do the top candidates agree with each other about what the query is about?

    A well-posed query ("PVC insulated copper cable, 1100 V") returns a coherent
    set — all cables, same committee. A vague one ("good quality durable product")
    returns a scattered set — lifts, lampholders, batteries. Measured as mean
    pairwise title-token Jaccard, nudged up when candidates share a committee.
    """
    cands = retrieved[:top_n]
    if len(cands) < 2:
        return 1.0
    toks = [_tokens(c.get("title") or "") for c in cands]
    pairs = [(len(a & b) / len(a | b)) for i, a in enumerate(toks)
             for b in toks[i + 1:] if (a | b)]
    jaccard = sum(pairs) / len(pairs) if pairs else 0.0

    committees = [c.get("technical_committee") for c in cands if c.get("technical_committee")]
    shared = 0.0
    if committees:
        modal = max(set(committees), key=committees.count)
        shared = committees.count(modal) / len(cands)

    # Jaccard dominates; committee agreement is a weaker corroborating signal.
    raw = 0.72 * jaccard + 0.28 * shared
    # Title overlap is sparse by nature — ~0.35 mean Jaccard already means
    # "clearly the same topic", so rescale rather than demanding near-1.0.
    return max(0.0, min(1.0, raw / 0.40))


def query_relevance(query: str, recommendation: dict[str, Any],
                    retrieved: list[dict[str, Any]]) -> float:
    """Does the recommended standard actually address the QUERY?

    Grounding alone cannot catch this: a claim can be perfectly supported by the
    passage it cites and still answer a different question than the one asked.
    For "good quality durable product", a model may faithfully describe a
    lift-cable standard — grounded, and useless. Measured as overlap between the
    query's content words and the recommended standard's title/aspect.
    """
    q = _tokens(query)
    if not q:
        return 0.0
    by_number = {c["is_number"]: c for c in retrieved}
    primaries = [s.get("is_number") for s in recommendation.get("primary_standards", [])
                 if s.get("is_number")]
    targets = [by_number[n] for n in primaries if n in by_number] or retrieved[:1]
    best = 0.0
    for c in targets:
        # Title only. The `aspect` field holds BIS taxonomy labels ("Product
        # Specification", "Methods of tests") whose generic words collide with
        # vague queries and manufacture relevance that isn't there.
        t = _tokens(c.get("title") or "")
        if t:
            best = max(best, len(q & t) / len(q))
    # A query rarely shares more than half its words with a title, so treat ~0.4
    # overlap as full relevance rather than demanding near-total overlap.
    return max(0.0, min(1.0, best / 0.40))


def withdrawn_primaries(con, is_numbers: list[str]) -> list[str]:
    """Named standards that the BIS catalogue marks withdrawn."""
    names = [n for n in is_numbers if n]
    if not names:
        return []
    return [r[0] for r in con.execute(
        f"""SELECT is_number FROM standards
            WHERE is_number IN ({','.join('?' * len(names))})
              AND (is_active = 0 OR UPPER(IFNULL(withdrawn_status,'')) = 'W')""",
        names)]


def _has_edition_mismatch(con, is_numbers: list[str]) -> bool:
    """True if any named standard's ingested text comes from a different edition."""
    names = [n for n in is_numbers if n]
    if not names:
        return False
    row = con.execute(
        f"""SELECT COUNT(*) FROM standards
            WHERE is_number IN ({','.join('?' * len(names))})
              AND has_full_text = 1
              AND full_text_year IS NOT NULL AND year IS NOT NULL
              AND full_text_year <> year""", names).fetchone()
    return bool(row and row[0])


def _pow(x: float, e: float) -> float:
    """x**e clamped to [0,1]; exactly 0 when x is 0 so it can collapse the product."""
    x = max(0.0, min(1.0, x))
    return 0.0 if x == 0.0 else x ** e


def verify(con, recommendation: dict[str, Any], retrieved: list[dict[str, Any]],
           *, threshold: float = ABSTAIN_THRESHOLD, query: str = "",
           use_llm: bool = True) -> dict[str, Any]:
    """Check a synthesised recommendation and decide answer-vs-abstain."""
    chunk_lookup = {c["chunk_id"]: c for cand in retrieved for c in cand["chunks"]}
    known_bases = corpus_bases(con)

    report: dict[str, Any] = {
        "hard_failures": [], "claim_checks": [], "fabricated_standards": [],
        "invalid_citations": [], "signals": {},
    }

    # ---- hard gate 1: no IS number outside the ingested corpus ----
    blob = " ".join(
        [recommendation.get("summary", "")]
        + [c.get("claim", "") for c in recommendation.get("claims", [])]
        + [s.get("is_number", "") for s in recommendation.get("primary_standards", [])]
    )
    for base in mentioned_is_numbers(blob):
        if base not in known_bases:
            report["fabricated_standards"].append(base)
    if report["fabricated_standards"]:
        report["hard_failures"].append(
            "Output names standard(s) absent from the ingested corpus: "
            + ", ".join(sorted(report["fabricated_standards"])))

    # ---- hard gate 2: citations must point at retrieved chunks ----
    claims = recommendation.get("claims", []) or []
    for cl in claims:
        for cid in cl.get("citations", []) or []:
            if cid not in chunk_lookup:
                report["invalid_citations"].append(cid)
    if report["invalid_citations"]:
        bad = sorted(set(report["invalid_citations"]))[:5]
        report["hard_failures"].append(
            "Output cites passage id(s) that were never retrieved: " + ", ".join(bad))

    # ---- scored: is each claim actually supported by what it cites? ----
    grounded = 0.0
    for cl in claims:
        text = cl.get("claim", "")
        cites = [c for c in (cl.get("citations") or []) if c in chunk_lookup]
        evidence = "\n\n".join(chunk_lookup[c]["text"] for c in cites)
        lex = lexical_support(text, evidence) if evidence else 0.0
        ent = llm_entailment(text, evidence) if (use_llm and evidence) else None
        verdict = (ent or {}).get("verdict")
        if not evidence:
            score = 0.0
        elif verdict in _VERDICT_SCORE:
            score = _VERDICT_SCORE[verdict]
        else:
            score = min(1.0, lex / 0.5)
        grounded += score
        report["claim_checks"].append({
            "claim": text, "citations": cites, "lexical_support": round(lex, 3),
            "llm_verdict": verdict, "llm_reason": (ent or {}).get("reason"),
            "support_score": round(score, 3), "uncited": not cites,
        })
    grounding_rate = grounded / len(claims) if claims else 0.0

    # ---- scored: retrieval quality and ambiguity ----
    scores = sorted((c["best_score"] for c in retrieved), reverse=True)
    top = scores[0] if scores else 0.0
    margin = (scores[0] - scores[1]) if len(scores) > 1 else 0.0
    # retrieval cosine ~0.35 is weak, ~0.80 strong; map onto 0..1
    retrieval_strength = max(0.0, min(1.0, (top - 0.35) / 0.45))
    # Raw score margin turns out to be a weak ambiguity signal: genuinely related
    # standards cluster tightly too, so a good query and a vague one can show the
    # same gap. Topical coherence separates them — a well-posed query returns
    # candidates that agree with each other, a vague one returns a scattered set.
    discrimination = candidate_coherence(retrieved)
    relevance = query_relevance(query, recommendation, retrieved) if query else 1.0

    primary = [s.get("is_number") for s in recommendation.get("primary_standards", [])]
    meta_only = [c for c in retrieved if c["is_number"] in primary and c["metadata_only"]]
    # A metadata-only match is still reportable, but never as confident as one
    # verified against real document text.
    if primary and len(meta_only) == len(primary):
        verification_depth = 0.72
    elif primary and _has_edition_mismatch(con, primary):
        # ~80% of this corpus holds text from an earlier edition than the
        # catalogue lists. The passages are real, but they are not the cited
        # edition's text, so verification is weaker. A heavy penalty here would
        # abstain on almost everything, so it is moderate — the currency flag
        # carries the detail.
        verification_depth = 0.88
    else:
        verification_depth = 1.0

    # Recommending a withdrawn standard is a serious defect for a compliance
    # tool, so it is scored as a near-veto rather than a footnote. The standard
    # still appears in the abstention response's candidate list, so the user is
    # told it exists and that it is withdrawn.
    withdrawn = withdrawn_primaries(con, primary)
    withdrawn_factor = 0.35 if withdrawn else 1.0

    report["withdrawn_standards"] = withdrawn
    report["signals"] = {
        "grounding_rate": round(grounding_rate, 3),
        "primary_withdrawn": bool(withdrawn),
        "query_relevance": round(relevance, 3),
        "retrieval_strength": round(retrieval_strength, 3),
        "top_similarity": round(top, 3),
        "candidate_margin": round(margin, 3),
        "discrimination": round(discrimination, 3),
        "verification_depth": round(verification_depth, 3),
        "claims_checked": len(claims),
    }

    # Weighted GEOMETRIC mean, not arithmetic. These conditions are conjunctive:
    # a well-grounded claim built on weak retrieval is still unsafe, and strong
    # retrieval must never carry an ungrounded claim over the line. With an
    # additive score either factor could mask the other; multiplying means any
    # near-zero factor collapses the result, which is the behaviour we want.
    disc_factor = 0.25 + 0.75 * discrimination   # never let coherence alone zero it out
    # Relevance gets a low floor and a heavy exponent: an answer that does not
    # address the question is worthless no matter how well grounded it is, so it
    # must collapse the score rather than shave a little off it.
    rel_factor = 0.05 + 0.95 * relevance
    confidence = (_pow(grounding_rate, 0.36)
                  * _pow(retrieval_strength, 0.28)
                  * _pow(disc_factor, 0.12)
                  * _pow(rel_factor, 0.26)
                  * verification_depth
                  * withdrawn_factor)

    report["reasons"] = list(report["hard_failures"])

    if withdrawn:
        report["reasons"].append(
            "The recommended standard is marked WITHDRAWN in the BIS catalogue: "
            + ", ".join(withdrawn))

    if not recommendation.get("primary_standards"):
        # The synthesiser was told to return nothing rather than force a fit.
        # Honour that instead of scoring an empty recommendation.
        report["reasons"].append(
            "The synthesiser did not identify any candidate standard as applicable.")
        confidence = 0.0

    if report["hard_failures"]:
        confidence = 0.0

    report["confidence"] = round(min(1.0, max(0.0, confidence)), 3)
    report["threshold"] = threshold
    report["abstain"] = report["confidence"] < threshold
    if report["abstain"] and not report["hard_failures"]:
        if grounding_rate < 0.5:
            report["reasons"].append(
                "Claims are not sufficiently supported by the retrieved source text.")
        if retrieval_strength < 0.4:
            report["reasons"].append(
                "No ingested standard matches the query text closely enough.")
        if discrimination < 0.3 and len(scores) > 1:
            report["reasons"].append(
                "Several standards match about equally well — the query does not "
                "discriminate between them.")
        if relevance < 0.5:
            report["reasons"].append(
                "The best-matching standard does not clearly address what the query "
                "asked about.")
        if verification_depth < 1.0:
            report["reasons"].append(
                "Candidate standards are catalogue-metadata only; their content "
                "could not be verified against source text.")
        if not report["reasons"]:
            report["reasons"].append(
                "Combined confidence below the abstention threshold.")
    return report


def abstention_response(query: str, retrieved: list[dict[str, Any]],
                        report: dict[str, Any], max_candidates: int = 5,
                        elapsed_sec: float | None = None) -> dict[str, Any]:
    """The explicit 'not confident enough' answer, with closest candidates."""
    candidates = []
    for c in retrieved[:max_candidates]:
        active = c.get("is_active", True)
        if not active:
            why = "marked WITHDRAWN in the BIS catalogue"
        elif c["metadata_only"]:
            why = "catalogue metadata only — content unverified"
        else:
            why = "similarity below the confidence bar"
        candidates.append({
            "is_number": c["is_number"], "title": c["title"],
            "similarity": round(c["best_score"], 3),
            "department": c["department"], "aspect": c["aspect"],
            "metadata_only": c["metadata_only"],
            "is_active": active, "why_not_certain": why,
        })
    return {
        "status": "abstained",
        "query": query,
        "message": ("Not confident enough to recommend a specific Indian Standard "
                    "for this input."),
        "reasons": report.get("reasons", []),
        "confidence": report.get("confidence", 0.0),
        "threshold": report.get("threshold", ABSTAIN_THRESHOLD),
        "closest_candidates": candidates,
        "next_steps": [
            "Add detail: voltage/current rating, material, environment, or intended application.",
            "Name the product category explicitly (e.g. 'PVC insulated copper cable, 1100 V').",
            "If this is a tender clause, submit the full clause rather than a fragment.",
        ],
        "verification": report,
        "elapsed_sec": elapsed_sec,
    }
