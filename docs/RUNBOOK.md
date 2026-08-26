# Runbook — how to operate the system

Everything below is run from the project root: `c:\Users\Savizzz\Desktop\SIH Demo`

On Windows the virtualenv interpreter is `.\.venv\Scripts\python.exe`. The
examples use that path directly so you never need to activate the venv.

---

## 0. One-time check

```powershell
.\.venv\Scripts\python.exe -m pytest tests\ -q
```

Expect `61 passed`. If this passes, the code is sound regardless of corpus state.

Check what the corpus currently holds:

```powershell
.\.venv\Scripts\python.exe -c "import sys;sys.path.insert(0,'.');from backend.store import connect,stats;print(stats(connect()))"
```

`chunks` must be **greater than 0** and `data\store\faiss\chunks.faiss` must
exist before the app can answer queries. If `chunks` is 0, run the build (§1).

---

## 1. Building the corpus

One command runs every stage in order:

```powershell
.\.venv\Scripts\python.exe scripts\build_all.py
```

Stages, in order, and roughly how long each takes:

| Stage | What it does | Time |
|---|---|---|
| `catalogue` | Scrapes the BIS catalogue (digit seeds 0–9) | ~50 min |
| `migrate` | Adds/backfills `full_text_year` | seconds |
| `migrate2` | Adds/backfills `archive_checked` | seconds |
| `repair` | Detaches text attached to the wrong standard | seconds |
| `fulltext` | Fetches full text from archive.org | ~40–60 min |
| `kb` | Chunks and embeds into FAISS | ~60–90 min |
| `graph` | Builds the dependency graph | ~5 s |

Useful flags:

```powershell
.\.venv\Scripts\python.exe scripts\build_all.py --dry-run              # show the plan only
.\.venv\Scripts\python.exe scripts\build_all.py --skip catalogue       # resume after a failure
.\.venv\Scripts\python.exe scripts\build_all.py --only kb,graph        # rebuild just the index
.\.venv\Scripts\python.exe scripts\build_all.py --departments CED      # a different domain
```

**Every stage is resumable and safe to re-run.** The catalogue scrape upserts,
full-text fetch skips anything already searched, and `kb`/`graph` rebuild from
the store. If a run dies, re-run with `--skip` listing the stages already done.

**The `kb` stage is the long pole** and is CPU-bound (local embeddings). Don't
run it at the same time as the scrapers — they compete for cores and both slow
down.

---

## 2. Running the app

Two processes, two terminals.

**Terminal 1 — API (port 8000):**

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --reload --port 8000
```

Verify: http://127.0.0.1:8000/api/health — should return `"ok": true` with the
corpus counts. Interactive API docs: http://127.0.0.1:8000/docs

**Terminal 2 — dashboard (port 5173):**

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to port 8000, so both must
be running.

---

## 3. Using the dashboard

### Single query
Type a product description or a tender clause and press **Recommend standard**.

You get one of two outcomes, and the difference is the point of the project:

- **Recommended** — a green bar with a confidence score, the primary standard,
  its currency status, certification flags, each claim with its verdict, the
  citation trail (verbatim passages), and the dependency graph.
- **Abstained** — a purple bar. No IS number is given. You get the reasons, the
  closest candidates with why each was not certain, and how to rephrase.

The example chips under the box run canned queries. The one marked
**"⃠ Ambiguous — should abstain"** triggers the abstention path deliberately —
use it in a demo, it is the differentiator.

### Batch tender mode
Paste a tender, click **load sample tender**, or upload a PDF/TXT. Returns a
compliance summary: requirements extracted → standards identified → outdated
references in the tender → certification flags → abstentions. Click **detail**
on any row to see that requirement's full result. Export as JSON or CSV.

### Explore a standard
Enter an exact IS number (e.g. `IS 732:2019`). Shows the catalogue record,
currency flags, known editions, certification, every dependency it cites *with
the verbatim sentence proving it*, which standards cite it back, and the graph.
Graph nodes and cited numbers are clickable — you can walk the dependency web.

### Dataset & ingestion log
Corpus composition and the full audit trail of how the dataset was built.
Exportable as CSV/JSON. This is what to show if anyone asks whether the data is
real.

---

## 4. Command-line usage

**Scripted demo** (single query, abstention, batch tender):

```powershell
.\.venv\Scripts\python.exe scripts\demo.py            # all three
.\.venv\Scripts\python.exe scripts\demo.py abstain    # just the abstention moment
.\.venv\Scripts\python.exe scripts\demo.py batch      # just the tender report
```

**Evaluation** — measurable quality rather than anecdotes:

```powershell
.\.venv\Scripts\python.exe scripts\evaluate.py                 # retrieval only, fast
.\.venv\Scripts\python.exe scripts\evaluate.py --llm           # full pipeline
.\.venv\Scripts\python.exe scripts\evaluate.py --json eval.json
```

Watch the two safety numbers: **confident but wrong** and **confident on a vague
query**. Both should be 0.

**Direct API calls:**

```powershell
curl -X POST http://127.0.0.1:8000/api/recommend -H "Content-Type: application/json" -d "{\"query\":\"PVC insulated copper cable 1100 V\"}"
curl http://127.0.0.1:8000/api/stats
curl "http://127.0.0.1:8000/api/standards/IS%20732:2019"
```

---

## 5. Configuration

`.env` in the project root:

```
GROQ_API_KEY=<your key>
GROQ_MODEL=openai/gpt-oss-120b
EMBED_MODEL=BAAI/bge-small-en-v1.5
```

Tunables live in `backend\config.py`:

| Setting | Default | Effect |
|---|---|---|
| `ABSTAIN_THRESHOLD` | `0.55` | Raise to abstain more often, lower to answer more often |
| `RETRIEVAL_TOP_K` | `12` | Candidate chunks retrieved per query |
| `GRAPH_HOPS` | `2` | Dependency graph traversal depth |
| `CHUNK_CHARS` | `1800` | Chunk size — changing it requires rebuilding the KB |
| `SUBSET_DEPARTMENTS` | `ETD, LITD` | Which BIS departments to ingest |

`ABSTAIN_THRESHOLD` can also be overridden per request in the API body, which is
the safest way to experiment — no rebuild needed.

The system works **without** a Groq key: it falls back to rule-based synthesis
and still runs the full verification and abstention path, labelled
`rule_based` in the response and in the UI. Semantic search and embeddings are
entirely local and need no key or internet.

---

## 6. Demo script (5 minutes)

1. **Dataset tab** — "5,054 standards, N with full text, every ingestion step
   logged." Establishes the data is real, not curated by hand.
2. **Single query** — run the PVC cable example. Point at the citation trail:
   every claim resolves to a verbatim passage from the actual standard.
3. **Dependency graph** — click a node, land on that standard, show the
   confirmed edges with their proving sentences. Solid = read from source text,
   dashed = inferred and labelled unverified.
4. **The abstention chip** — run the ambiguous query. It refuses to answer and
   explains why. *This is the moment that matters:* say plainly that a
   hallucinated IS number in a procurement document is a real-world failure, and
   this system is built to return nothing rather than guess.
5. **Batch tender mode** — load the sample tender, generate the report, point at
   the outdated `IS 3043 - 1987` reference it caught and the certification flags.

---

## 7. Troubleshooting

**`503 Knowledge base not built yet`**
The FAISS index is missing. Run `build_all.py --only kb`.

**Dashboard shows "API unreachable"**
The uvicorn process isn't running, or isn't on port 8000.

**`no such column: full_text_year` / `archive_checked`**
An older database. Run the migrations:
```powershell
.\.venv\Scripts\python.exe scripts\migrate_full_text_year.py
.\.venv\Scripts\python.exe scripts\migrate_archive_checked.py
```

**`database is locked`**
Two writers at once. Only one ingestion stage may write at a time; `build_all.py`
sequences them for you.

**Everything abstains**
Usually the index is stale relative to the database. Rebuild:
`build_all.py --only kb,graph`. If it persists, lower `ABSTAIN_THRESHOLD` in the
request body to see the scores, then read the `verification.signals` block to
find which signal is collapsing.

**LLM returns empty content**
`gpt-oss-120b` is a reasoning model and spends tokens on hidden reasoning first.
The client already raises `max_tokens` and sets `reasoning_effort` for it; if you
switch to another reasoning model, check `_is_reasoning_model` in
`backend\pipeline\llm.py` recognises it.

**Rebuilding from scratch**
Delete `data\store\standards.db*` and `data\store\faiss\`, then run
`build_all.py`. Nothing else is generated.

---

## 8. What to be careful claiming

- Certification flags come from a **curated seed table**, not a legal source.
  They are prompts to verify against current BIS/MeitY notifications.
- Roughly **80% of full-text standards hold text from an earlier edition** than
  the catalogue lists. The system flags this per standard, but "verified against
  source text" often means verified against an older edition.
- **43% of the ETD/LITD catalogue is withdrawn.** Those are kept deliberately so
  a tender citing one can be warned, not because they are recommendable.
- The corpus is the **ETD/LITD electrical & electronics subset**, not all ~24k
  Indian Standards.
