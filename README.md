# AI-Powered Recommendation Engine for Indian Standards

Smart India Hackathon 2026 — Problem Statement **SIH26108**
Ministry of Consumer Affairs, Food & Public Distribution (Dept. of Consumer Affairs)

Takes a free-text product description, technical specification, or full tender
document and returns the applicable Indian Standard(s) — with the dependency
graph, currency status, certification flags, and a citation trail back to the
actual source text.

**The system abstains rather than guessing.** If retrieval and grounding do not
support a confident answer, it returns "not confident enough" plus the closest
candidates. A fabricated IS number is treated as a critical bug, not a
cosmetic one.

---

## What makes this different from keyword search

| Capability | How it works |
|---|---|
| Semantic matching | Local `bge-small-en-v1.5` embeddings over 9.4k+ citable chunks in FAISS |
| Dependency graph | Edges extracted from each standard's own full text, carrying the verbatim sentence as proof |
| Currency check | Cited edition compared against every edition in the BIS catalogue |
| Certification flags | Curated BIS Product Certification / CRS / Hallmarking rule table |
| Citation trail | Every claim cites a chunk id resolvable to a verbatim passage |
| **Abstention** | Deterministic corpus-membership gate + grounding + relevance scoring |

---

## Architecture

```
                 BIS catalogue API          Internet Archive (_djvu.txt)
                        │                              │
                        └──────────► SQLite ◄──────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              FAISS index      dependency graph      audit log
                    │                  │                  │
                    └────────► recommendation ◄───────────┘
                                  pipeline
   retrieval → graph expansion → synthesis → CRITIC → currency → certification
                                                │
                                    confidence < threshold?
                                                │
                                          ABSTAIN + candidates
```

### The critic layer

Confidence is a **weighted geometric mean**, not a sum, because the conditions
are conjunctive — any near-zero factor must collapse the result:

| Signal | What it catches |
|---|---|
| `grounding_rate` | Claims not supported by the passages they cite |
| `retrieval_strength` | Nothing in the corpus matches closely |
| `discrimination` | Topically scattered candidates → the query is vague |
| `query_relevance` | A perfectly grounded answer to a *different* question |
| `verification_depth` | Match rests on catalogue metadata, or on another edition's text |
| `primary_withdrawn` | The recommended standard is withdrawn (near-veto) |

Two **deterministic hard gates** run before any scoring, so they cannot
themselves hallucinate:

1. Every IS number in the output must exist in the ingested corpus.
2. Every citation must point at a chunk that was actually retrieved.

Either failure forces confidence to `0.0` and triggers abstention.

---

## Setup

```bash
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # Linux/macOS

cp .env.example .env      # add your GROQ_API_KEY
```

> **Note on the vector store:** the brief suggested ChromaDB, but it requires
> MSVC C++ build tools on Windows (`chroma-hnswlib` has no prebuilt wheel).
> FAISS ships prebuilt Windows wheels and is used instead — the brief allows
> either.

### Build the corpus

One command runs every stage in order (resumable with `--skip`):

```bash
python scripts/build_all.py                  # full build, ETD/LITD
python scripts/build_all.py --dry-run        # show the plan
python scripts/build_all.py --skip catalogue # resume after a failure
```

Or run the stages individually:

```bash
python -m backend.ingestion.scrape_catalogue --departments ETD,LITD
python scripts/migrate_full_text_year.py
python scripts/migrate_archive_checked.py
python scripts/repair_fulltext_assignment.py
python -m backend.ingestion.fetch_fulltext --workers 8
python -m backend.kb.build_kb
python -m backend.kb.build_graph
```

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for full operating instructions,
[docs/INGESTION.md](docs/INGESTION.md) for how each source was reverse-engineered,
and [docs/API.md](docs/API.md) for the response schema.

### Run

```bash
./.venv/Scripts/python.exe -m uvicorn backend.api.main:app --reload   # :8000
cd frontend && npm install && npm run dev                             # :5173
```

Then open http://localhost:5173.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/recommend` | Single query → structured recommendation or abstention |
| `POST` | `/api/batch` | Tender text → compliance report |
| `POST` | `/api/batch/upload` | Tender PDF/TXT upload |
| `GET` | `/api/standards/{is_number}` | One standard with currency, certification, edges |
| `GET` | `/api/graph/{is_number}` | Dependency graph, N hops |
| `GET` | `/api/stats` | Corpus composition |
| `GET` | `/api/logs` | Ingestion audit trail |

## Dashboard

Four tabs, all on the same pipeline:

- **Single query** — one description in, a verified recommendation or an
  abstention out, with the citation trail and dependency graph.
- **Batch tender mode** — a whole document in, a quantified compliance report out.
- **Explore a standard** — the catalogue record, currency flags, known editions,
  certification, and every cited dependency with the verbatim sentence proving
  it. Graph nodes and cited standards are clickable, so the dependency web can
  be walked.
- **Dataset & ingestion log** — corpus composition and the full audit trail, so
  the dataset build is inspectable rather than a black box.

---

## Tests

```bash
./.venv/Scripts/python.exe -m pytest tests/ -q
```

The suite encodes the project's guarantees: fabricated IS numbers, invented
citations, uncited claims, weak retrieval, scattered candidates, grounded-
but-irrelevant answers, and withdrawn standards must all abstain. It also pins
the ingestion bugs that were found and fixed (prefix-matched archive
identifiers, parts confused with editions) so they cannot return.

## Evaluation

```bash
python scripts/evaluate.py            # retrieval only, no LLM, fast
python scripts/evaluate.py --llm      # full pipeline
```

Measures against a golden set in `data/seed/eval_set.json` — queries phrased as
a procurement engineer would write them, not as the standards' titles, so it
measures semantic matching rather than title lookup.

Reported: `recall@1/3/5`, how often a confident answer is produced, precision
when it does answer, abstention accuracy on deliberately vague queries, and the
two numbers that matter most for this project:

- **confident but wrong** — a confident answer naming the wrong standard
- **confident on a vague query** — an answer where it should have abstained

---

## Honest limitations

- **Full-text coverage is partial.** archive.org does not mirror every standard.
  Uncovered ones stay `metadata_only` and are visibly flagged — they are not
  presented as verified.
- **Certification rules are a curated seed, not a legal source.** QCO coverage
  changes by gazette notification; output is phrased as "flag to verify".
- **The corpus is the ETD/LITD (electrical & electronics) subset**, not all
  ~24k standards. Scaling is a matter of re-running the scraper without the
  department filter.
- **Most ingested full text is from an earlier edition than the catalogue lists**
  (~80% of full-text standards, gaps of 13-39 years), because the archive.org
  scanning effort predates current BIS editions. This is tracked per standard and
  surfaced as a currency flag, and it lowers confidence — but it means "verified
  against source text" often means verified against an older edition of that
  standard.
- **43% of the ETD/LITD catalogue is withdrawn.** Those entries are kept (a
  tender may cite one) but demoted in retrieval and near-vetoed as a
  recommendation, so they surface as warnings rather than answers.
- **Inferred graph edges are heuristics** from shared committee and
  complementary aspect. They are rendered dashed and labelled unverified.
- **OCR noise** exists in older scans; chunks are filtered but not perfect.
