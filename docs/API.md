# API and response schema

Base URL `http://127.0.0.1:8000`. Interactive docs at `/docs`.

Both operation modes run the **same** pipeline; batch mode simply runs it once
per extracted requirement and aggregates.

---

## `POST /api/recommend`

```jsonc
{
  "query": "PVC insulated copper conductor cable for internal wiring, 1100 V",
  "top_k": 12,          // optional - candidate chunks to retrieve
  "hops": 2,            // optional - graph expansion depth
  "threshold": 0.55,    // optional - abstention threshold
  "use_llm": true       // optional - false uses rule-based synthesis
}
```

There are exactly **two** response shapes. Callers must branch on `status`.

### 1. `status: "recommended"`

```jsonc
{
  "status": "recommended",
  "synthesis_method": "llm",          // or "rule_based" when no LLM is configured
  "query": "...",
  "confidence": 0.956,                // 0..1, weighted geometric mean
  "threshold": 0.55,

  "primary_standards": [{
    "is_number": "IS 732:2019",
    "title": "Code of practice for electrical wiring installations",
    "role": "why this is the primary standard",
    "metadata_only": false,           // true => content never verified against text

    "currency": {
      "status": "current",            // current | superseded | withdrawn | unknown_year | unknown
      "is_base": "IS 732",
      "year": 2019,
      "amendment_count": 0,
      "withdrawn": false,
      "latest_known_edition": "IS 732:2019",
      "editions_known": [{ "is_number": "IS 732:2019", "year": 2019 }],
      "full_text_year": 2019,         // edition the ingested TEXT came from
      "text_edition_mismatch": false, // true => cited passages are another edition's
      "archive_identifier": "gov.in.is.732.2019",
      "flags": ["human-readable warnings"]
    },

    "certification": {
      "schemes": [{
        "scheme": "BIS_PRODUCT_CERT", // BIS_PRODUCT_CERT | CRS | HALLMARKING
        "mandatory": true,
        "match": "exact standard match on IS 694",
        "confidence": "high",         // high (exact) | low (title keyword)
        "authority": "Electric Cables QCO",
        "notes": "...",
        "source_url": "..."
      }],
      "note": "flags come from a curated seed table; verify before relying on them"
    }
  }],

  "supporting_standards": [{ "is_number": "IS 3043:2018", "role": "..." }],
  "summary": "2-4 sentences answering the requirement",
  "caveats": ["anything that could not be determined from the passages"],

  "claims": [{
    "claim": "a single factual statement",
    "citations": ["IS 732:2019#c014"], // resolvable in `citations` below
    "support_score": 1.0,              // 0..1
    "lexical_support": 0.82,
    "llm_verdict": "supported",        // supported | partial | unsupported | null
    "llm_reason": "one sentence",
    "uncited": false
  }],

  "citations": {
    "IS 732:2019#c014": {
      "chunk_id": "IS 732:2019#c014",
      "is_number": "IS 732:2019",
      "section": "Clause 5.3.3.2 Coordination between conductors",
      "excerpt": "verbatim passage from the ingested standard",
      "similarity": 0.807
    }
  },

  "dependency_graph": {
    "nodes": [{
      "is_number": "IS 3043:2018", "is_base": "IS 3043", "title": "...",
      "department": "ETD", "aspect": "Code of Practice", "year": 2018,
      "hop": 1, "seed": false,
      "in_corpus": true,               // false => cited but never ingested
      "metadata_only": false
    }],
    "edges": [{
      "source": "IS 732:2019",
      "target": "IS 3043:2018",
      "edge_type": "normative_reference", // normative_reference | test_method
                                          // | terminology | safety | related
      "confidence": "confirmed",          // confirmed (read from source text)
                                          // | inferred (heuristic, unverified)
      "evidence_section": "Clause 6.2 Initial Verification",
      "evidence_snippet": "verbatim sentence proving the edge",
      "hop": 1
    }]
  },

  "verification": {
    "confidence": 0.956,
    "abstain": false,
    "hard_failures": [],
    "fabricated_standards": [],   // IS numbers named but absent from the corpus
    "invalid_citations": [],      // passage ids that were never retrieved
    "withdrawn_standards": [],    // named standards the catalogue marks withdrawn
    "claim_checks": [ /* same objects as `claims` */ ],
    "signals": {
      "grounding_rate": 1.0,
      "query_relevance": 1.0,
      "retrieval_strength": 1.0,
      "top_similarity": 0.807,
      "candidate_margin": 0.073,
      "discrimination": 0.579,
      "verification_depth": 1.0,
      "primary_withdrawn": false,
      "claims_checked": 2
    }
  },
  "elapsed_sec": 12.6
}
```

### 2. `status: "abstained"`

Returned whenever confidence falls below `threshold`, or either hard gate fails.
**No IS number is recommended.**

```jsonc
{
  "status": "abstained",
  "query": "good quality durable product for general use",
  "message": "Not confident enough to recommend a specific Indian Standard for this input.",
  "confidence": 0.38,
  "threshold": 0.55,
  "reasons": [
    "Several standards match about equally well — the query does not discriminate between them.",
    "The best-matching standard does not clearly address what the query asked about."
  ],
  "closest_candidates": [{
    "is_number": "IS 732:2019",
    "title": "Code of practice for electrical wiring installations",
    "similarity": 0.675,
    "department": "ETD",
    "aspect": "Code of Practice",
    "metadata_only": false,
    "is_active": true,
    "why_not_certain": "similarity below the confidence bar"
  }],
  "next_steps": ["actionable suggestions to get a confident answer"],
  "verification": { /* as above, with abstain: true */ },
  "elapsed_sec": 3.1
}
```

**Abstention triggers**

| Condition | Effect |
|---|---|
| An IS number is named that is not in the corpus | confidence forced to `0.0` |
| A citation points at a chunk never retrieved | confidence forced to `0.0` |
| The synthesiser returns no primary standard | confidence forced to `0.0` |
| Claims unsupported by cited passages | `grounding_rate` collapses the score |
| Nothing matches closely | `retrieval_strength` collapses the score |
| Candidates topically scattered | `discrimination` collapses the score |
| Answer does not address the question | `query_relevance` collapses the score |
| The recommended standard is **withdrawn** | near-veto factor (0.35) — effectively forces abstention |
| Text held is from another edition | `verification_depth` reduced to 0.88 |
| Match rests on catalogue metadata only | `verification_depth` reduced to 0.72 |

---

## `POST /api/batch`

```jsonc
{ "text": "<full tender text>", "max_requirements": 0, "use_llm": true }
```

`POST /api/batch/upload` accepts the same as multipart `file` (PDF or TXT).

```jsonc
{
  "status": "batch_complete",
  "extraction": { "method": "llm", "notes": ["..."] },  // or "structural"
  "summary": {
    "requirements_extracted": 19,
    "standards_identified": 11,
    "requirements_abstained": 3,
    "document_cited_standards": 11,
    "outdated_document_citations": 1,     // editions the TENDER cites that are superseded
    "outdated_recommended_editions": 0,   // editions WE recommend that are not latest
    "certification_flags": 4
  },
  "standards_identified": [{ "is_number": "...", "requirements": ["R1", "R4"], "currency": {}, "certification": {} }],
  "document_citations": [{ "cited_as": "IS 3043 - 1987", "cited_year": 1987, "status": "superseded", "latest_known_edition": "IS 3043:2018", "flags": ["..."] }],
  "outdated_document_citations": [ /* subset of the above */ ],
  "certification_flags": [{ "is_number": "...", "scheme": "CRS", "confidence": "high", "requirement_id": "R14" }],
  "results": [{ "requirement": { "id": "R1", "text": "...", "category": "installation", "cited_standards": ["IS 732"] },
                "result": { /* a full /api/recommend response */ } }],
  "elapsed_sec": 84.2
}
```

---

## Read-only routes

| Route | Returns |
|---|---|
| `GET /api/health` | `{ ok, llm_configured, corpus }` |
| `GET /api/stats` | corpus counts, `by_department`, `by_aspect`, `edge_types` |
| `GET /api/logs?phase=&status=&limit=` | `{ runs, events }` — the ingestion audit trail |
| `GET /api/standards/{is_number}` | catalogue record + `currency` + `certification` + `outgoing_edges` + `incoming_edges` + `cited_by_count` |
| `GET /api/graph/{is_number}?hops=2` | `{ nodes, edges }` as in `dependency_graph` |

`outgoing_edges` are the standards this one cites; `incoming_edges` are the
standards that cite it (reverse dependencies), which shows how load-bearing a
standard is and what a supersession would affect.

`GET /api/standards/{is_number}` returns **404** for a standard outside the
corpus — it is never synthesised. `GET /api/graph` returns empty
`{"nodes": [], "edges": []}` rather than erroring.

IS numbers contain spaces, colons and parentheses — URL-encode them
(`IS%20732%3A2019`).
