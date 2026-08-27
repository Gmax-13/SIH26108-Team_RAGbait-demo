"""Phase 5a — HTTP API.

Both operation modes hit the same pipeline:
    POST /api/recommend   single product description  -> structured result
    POST /api/batch       full tender document        -> compliance report

Ingestion transparency endpoints (/api/stats, /api/logs) exist so the dataset
build is inspectable rather than a black box.
"""
from __future__ import annotations
import json
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.config import ABSTAIN_THRESHOLD, GRAPH_HOPS, RETRIEVAL_TOP_K
from backend.pipeline.batch import run_batch
from backend.pipeline.certification import check_certification
from backend.pipeline.currency import check_currency
from backend.pipeline.llm import available as llm_available
from backend.pipeline.recommend import recommend, recommend_events
from backend.kb.vector_index import VectorIndex
from backend.pipeline.retrieve import Retriever
from backend.store import connect, stats
from backend.textfmt import readable

app = FastAPI(title="Indian Standards Recommendation Engine",
              version="0.1.0",
              description="Semantic IS recommendation with dependency graph, "
                          "citations, currency and certification checks, and "
                          "explicit abstention.")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"])

_index: VectorIndex | None = None


def get_index() -> VectorIndex:
    """The FAISS index is immutable once built, so it is loaded once and shared."""
    global _index
    if _index is None:
        try:
            _index = VectorIndex.load()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(
                503, f"Knowledge base not built yet ({type(e).__name__}: {e}). "
                     f"Run: python -m backend.kb.build_kb") from e
    return _index


def get_retriever(con, *, need_index: bool = True) -> Retriever:
    """A retriever per request.

    sqlite3 connections are bound to the thread that created them, and FastAPI
    runs sync handlers on a threadpool — so a module-level cached connection
    raises ProgrammingError as soon as a second worker thread serves a request.
    The connection is therefore per-request; only the index is shared.

    `need_index=False` skips loading FAISS entirely, so graph traversal keeps
    working before the embedding build has finished.
    """
    return Retriever(con, get_index() if need_index else None)


class Query(BaseModel):
    query: str = Field(..., min_length=3, description="Product description or requirement")
    top_k: int = RETRIEVAL_TOP_K
    hops: int = GRAPH_HOPS
    threshold: float = ABSTAIN_THRESHOLD
    use_llm: bool = True


class BatchText(BaseModel):
    text: str = Field(..., min_length=20)
    max_requirements: int = 0
    use_llm: bool = True


@app.get("/")
def root() -> dict[str, Any]:
    """Orientation for anyone who opens the API host directly.

    This is the backend, not the dashboard — a bare 404 here just looks like the
    server is down, so say what is running and where the UI actually lives.
    """
    con = connect()
    s = stats(con)
    return {
        "service": "Indian Standards Recommendation Engine API",
        "status": "running",
        "dashboard": "http://localhost:5173",
        "interactive_docs": "/docs",
        "corpus": {
            "standards": s["standards"],
            "with_full_text": s["with_full_text"],
            "citable_chunks": s["chunks"],
            "confirmed_dependencies": s["edges_confirmed"],
        },
        "ready_to_query": s["chunks"] > 0,
        "llm_configured": llm_available(),
        "endpoints": {
            "POST /api/recommend": "one product description or requirement",
            "POST /api/batch": "a whole tender document",
            "GET /api/standards/{is_number}": "one standard in full",
            "GET /api/graph/{is_number}": "its dependency graph",
            "GET /api/stats": "corpus composition",
            "GET /api/logs": "ingestion audit trail",
        },
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    con = connect()
    return {"ok": True, "llm_configured": llm_available(), "corpus": stats(con)}


@app.get("/api/stats")
def get_stats() -> dict[str, Any]:
    con = connect()
    s = stats(con)
    s["by_department"] = {r["department"]: r["n"] for r in con.execute(
        "SELECT department, COUNT(*) n FROM standards GROUP BY 1 ORDER BY n DESC")}
    s["by_aspect"] = {r["aspect"]: r["n"] for r in con.execute(
        "SELECT aspect, COUNT(*) n FROM standards WHERE aspect IS NOT NULL "
        "GROUP BY 1 ORDER BY n DESC")}
    s["edge_types"] = {r["edge_type"]: r["n"] for r in con.execute(
        "SELECT edge_type, COUNT(*) n FROM edges GROUP BY 1 ORDER BY n DESC")}
    s["llm_configured"] = llm_available()
    return s


@app.get("/api/logs")
def get_logs(phase: str | None = None, status: str | None = None,
             limit: int = 200) -> dict[str, Any]:
    """Ingestion audit trail — how the dataset was actually built."""
    con = connect()
    q = "SELECT run_id,phase,target,status,message,ts FROM scrape_log"
    w, p = [], []
    if phase:
        w.append("phase=?"); p.append(phase)
    if status:
        w.append("status=?"); p.append(status)
    if w:
        q += " WHERE " + " AND ".join(w)
    q += " ORDER BY id DESC LIMIT ?"
    p.append(min(limit, 2000))
    rows = [dict(r) for r in con.execute(q, p)]
    runs = [dict(r) for r in con.execute(
        "SELECT run_id,phase,MIN(ts) started,MAX(ts) ended,COUNT(*) events "
        "FROM scrape_log GROUP BY run_id,phase ORDER BY started DESC LIMIT 40")]
    return {"runs": runs, "events": rows}


@app.get("/api/standards/{is_number:path}")
def get_standard(is_number: str) -> dict[str, Any]:
    con = connect()
    row = con.execute(
        "SELECT id,is_number,is_base,part,year,title,technical_committee,department,"
        "aspect,amendment_count,status_note,withdrawn_status,is_active,iso_equivalence,"
        "iso_equiv_degree,source,archive_identifier,has_full_text,full_text_chars,"
        "metadata_only,scraped_at FROM standards WHERE is_number=?", (is_number,)).fetchone()
    if row is None:
        raise HTTPException(404, f"{is_number} is not in the ingested corpus")
    out = dict(row)
    out["currency"] = check_currency(con, is_number)
    out["certification"] = check_certification(con, is_number)
    # Join through to the cited standard so the UI can name it, not just number
    # it. The join is LEFT because a standard may cite something outside the
    # ingested departments, and that gap should stay visible.
    def _tidy(rows):
        out_rows = []
        for r in rows:
            d = dict(r)
            d["evidence_snippet"] = readable(d.get("evidence_snippet"), 600)
            out_rows.append(d)
        return out_rows

    out["outgoing_edges"] = _tidy(con.execute(
        """SELECT e.dst_is_base, e.edge_type, e.confidence,
                  e.evidence_section, e.evidence_snippet,
                  dst.is_number AS dst_is_number, dst.title AS dst_title
           FROM edges e
           LEFT JOIN standards dst ON dst.id = e.dst_standard_id
           WHERE e.src_standard_id = ?
           ORDER BY (e.confidence='confirmed') DESC LIMIT 60""",
        (row["id"],)))
    # Reverse dependencies: which standards cite THIS one. Useful for judging how
    # load-bearing a standard is, and for impact analysis when it is superseded.
    out["incoming_edges"] = _tidy(con.execute(
        """SELECT src.is_number AS src_is_number, src.title AS src_title,
                  e.edge_type, e.confidence, e.evidence_section, e.evidence_snippet
           FROM edges e JOIN standards src ON src.id = e.src_standard_id
           WHERE e.dst_is_base = ?
           ORDER BY (e.confidence='confirmed') DESC LIMIT 60""",
        (row["is_base"],)))
    out["cited_by_count"] = con.execute(
        "SELECT COUNT(*) FROM edges WHERE dst_is_base=?", (row["is_base"],)).fetchone()[0]
    return out


@app.get("/api/graph/{is_number:path}")
def get_graph(is_number: str, hops: int = GRAPH_HOPS) -> dict[str, Any]:
    con = connect()
    return get_retriever(con, need_index=False).expand([is_number], hops=hops)


@app.post("/api/recommend")
def post_recommend(q: Query) -> dict[str, Any]:
    con = connect()
    return recommend(con, get_retriever(con), q.query, top_k=q.top_k, hops=q.hops,
                     threshold=q.threshold, use_llm=q.use_llm)


@app.post("/api/recommend/stream")
def post_recommend_stream(q: Query) -> StreamingResponse:
    """Same pipeline, streamed as server-sent events.

    A recommendation takes several seconds and the expensive parts (embedding,
    synthesis, grounding) are invisible from outside. Streaming the real stage
    transitions tells the caller what is actually happening instead of showing a
    spinner that implies progress it cannot know.
    """
    SEP = "\n\n"

    def gen():
        con = connect()          # this generator runs on its own thread
        try:
            for ev in recommend_events(con, get_retriever(con), q.query,
                                       top_k=q.top_k, hops=q.hops,
                                       threshold=q.threshold, use_llm=q.use_llm):
                yield "data: " + json.dumps(ev) + SEP
        except HTTPException as e:
            yield "data: " + json.dumps({"event": "error", "detail": e.detail}) + SEP
        except Exception as e:   # noqa: BLE001 - the client must not be left hanging
            yield "data: " + json.dumps(
                {"event": "error", "detail": f"{type(e).__name__}: {e}"}) + SEP

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


@app.post("/api/batch")
def post_batch(b: BatchText) -> dict[str, Any]:
    con = connect()
    return run_batch(con, get_retriever(con), b.text, use_llm=b.use_llm,
                     max_requirements=b.max_requirements)


@app.post("/api/batch/upload")
async def post_batch_upload(file: UploadFile = File(...),
                            max_requirements: int = 0) -> dict[str, Any]:
    raw = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        import fitz
        with fitz.open(stream=raw, filetype="pdf") as doc:
            text = "\n".join(page.get_text() for page in doc)
    else:
        text = raw.decode("utf-8", "ignore")
    if len(text.strip()) < 20:
        raise HTTPException(400, "Could not extract usable text from the upload.")
    con = connect()
    return run_batch(con, get_retriever(con), text, max_requirements=max_requirements)
