"""Phase 5a — HTTP API.

Both operation modes hit the same pipeline:
    POST /api/recommend   single product description  -> structured result
    POST /api/batch       full tender document        -> compliance report

Ingestion transparency endpoints (/api/stats, /api/logs) exist so the dataset
build is inspectable rather than a black box.
"""
from __future__ import annotations
import json
import re
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.config import (ABSTAIN_THRESHOLD, DEMO_STATUS, GRAPH_HOPS,
                            RETRIEVAL_TOP_K, active_departments)
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
    s = stats(con, active_departments())
    return {
        "service": "Indian Standards Recommendation Engine API",
        "scope": _scope(),
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


def _scope() -> dict[str, Any]:
    """What slice of the ingested catalogue the system is answering from.

    Reported everywhere rather than applied silently: a corpus that holds 17
    departments while answering from 2 must say so, or the dashboard's counts
    become a quiet misrepresentation.
    """
    depts = active_departments()
    return {
        "demo_status": DEMO_STATUS,
        "departments": depts,
        "scoped": depts is not None,
        "note": (f"Answering only from {', '.join(depts)} — the departments with "
                 f"full-text coverage. Set DEMO_STATUS=false to use the whole "
                 f"ingested catalogue.") if depts else
                "Answering from the entire ingested catalogue.",
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    con = connect()
    return {"ok": True, "llm_configured": llm_available(),
            "scope": _scope(),
            "corpus": stats(con, active_departments()),
            "corpus_total": stats(con, None)}


@app.get("/api/stats")
def get_stats() -> dict[str, Any]:
    con = connect()
    depts = active_departments()
    s = stats(con, depts)
    where, params = ("", [])
    if depts:
        where = f" WHERE department IN ({','.join('?' * len(depts))})"
        params = depts
    s["by_department"] = {r["department"]: r["n"] for r in con.execute(
        f"SELECT department, COUNT(*) n FROM standards{where}"
        " GROUP BY 1 ORDER BY n DESC", params)}
    s["by_aspect"] = {r["aspect"]: r["n"] for r in con.execute(
        f"SELECT aspect, COUNT(*) n FROM standards{where}"
        + (" AND" if depts else " WHERE") + " aspect IS NOT NULL"
        " GROUP BY 1 ORDER BY n DESC", params)}
    edge_where, edge_params = ("", [])
    if depts:
        edge_where = (f" WHERE src_standard_id IN (SELECT id FROM standards"
                      f" WHERE department IN ({','.join('?' * len(depts))}))")
        edge_params = depts
    s["edge_types"] = {r["edge_type"]: r["n"] for r in con.execute(
        f"SELECT edge_type, COUNT(*) n FROM edges{edge_where}"
        " GROUP BY 1 ORDER BY n DESC", edge_params)}
    s["llm_configured"] = llm_available()
    s["scope"] = _scope()
    s["corpus_total_standards"] = stats(con, None)["standards"]
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


_IS_PREFIX = re.compile(r"^(?:IS\s*)?(\d[\d.]*)", re.I)


# Declared BEFORE /api/standards/{is_number:path}: FastAPI matches routes in
# definition order, and the path converter would otherwise swallow "search".
@app.get("/api/standards/search")
def search_standards(q: str, limit: int = 12, scope: str = "demo") -> dict[str, Any]:
    """Type-ahead over the catalogue.

    Typing "IS 64" has to offer IS 645 and IS 649 as well as IS 64 itself, so a
    numeric fragment is matched as a PREFIX of the number rather than as an
    equality test. Results are ordered numerically — IS 645 before IS 6450 —
    because string ordering puts "IS 6450" before "IS 649", which is nonsense
    to a reader.

    `scope=demo` (the default) restricts results to the departments the system
    answers from, so everything offered is also present in the dependency graph.
    `scope=all` searches the whole ingested catalogue; those records are
    viewable but have no graph, and the count is reported either way so the UI
    can say what is being hidden rather than silently dropping matches.
    """
    q = " ".join((q or "").split())
    if len(q) < 2:
        return {"query": q, "results": [], "out_of_scope": 0}
    con = connect()
    depts = active_departments() if scope != "all" else None

    m = _IS_PREFIX.match(q)
    if m:
        num = m.group(1)
        match_sql = "(is_number LIKE ? OR is_base LIKE ?)"
        match_params = [f"IS {num}%", f"IS {num}%"]
    else:
        match_sql = "title LIKE ?"
        match_params = [f"%{q}%"]

    def fetch(with_depts):
        where, params = [match_sql], list(match_params)
        if with_depts:
            where.append(f"department IN ({','.join('?' * len(with_depts))})")
            params += with_depts
        return [dict(r) for r in con.execute(
            f"""SELECT is_number, is_base, title, department, aspect, year,
                       is_active, metadata_only, has_full_text
                FROM standards WHERE {' AND '.join(where)}""", params)]

    rows = fetch(depts)
    # How many matches the demo scope is hiding, so the UI can offer to widen.
    out_of_scope = 0
    if depts:
        out_of_scope = max(0, len(fetch(None)) - len(rows))

    ql = q.lower()

    def order(r: dict[str, Any]):
        if m:
            mm = _IS_PREFIX.match(r["is_base"] or "")
            head = mm.group(1) if mm else ""
            bits = tuple(int(x) for x in head.split(".") if x.isdigit())
            return (0, bits, -(r["year"] or 0))
        # Title search: a title that STARTS with the query beats one that merely
        # contains it, so "earthing" surfaces the earthing code of practice
        # rather than a socket-outlet standard that mentions earthing contacts.
        t = (r["title"] or "").lower()
        return (0 if t.startswith(ql) else 1, len(t), -(r["year"] or 0))

    rows.sort(key=order)
    return {"query": q, "results": rows[:limit], "out_of_scope": out_of_scope,
            "total_matches": len(rows), "scope": "all" if depts is None else "demo"}


@app.get("/api/graph")
def get_full_graph(min_degree: int = 1, limit: int = 5000) -> dict[str, Any]:
    """The whole dependency graph in scope, for the graph explorer's default view.

    Only edges whose target resolved to an ingested standard are returned: a
    dangling citation has no node to attach to and would render as a stub with
    no title. `min_degree` drops isolated standards, which otherwise fill the
    canvas with thousands of unconnected dots and slow the layout down for
    nothing.
    """
    con = connect()
    depts = active_departments()
    scope, params = "", []
    if depts:
        scope = (f" AND src.department IN ({','.join('?' * len(depts))})")
        params = depts
    edges = [dict(r) for r in con.execute(
        f"""SELECT src.is_number AS source, dst.is_number AS target,
                   e.edge_type, e.confidence
            FROM edges e
            JOIN standards src ON src.id = e.src_standard_id
            JOIN standards dst ON dst.id = e.dst_standard_id
            WHERE e.dst_standard_id IS NOT NULL{scope}
            LIMIT ?""", params + [limit * 4])]

    deg: dict[str, int] = {}
    for e in edges:
        deg[e["source"]] = deg.get(e["source"], 0) + 1
        deg[e["target"]] = deg.get(e["target"], 0) + 1
    keep = {k for k, v in deg.items() if v >= min_degree}
    if len(keep) > limit:
        keep = set(sorted(keep, key=lambda k: -deg[k])[:limit])
    edges = [e for e in edges if e["source"] in keep and e["target"] in keep]

    nodes = []
    if keep:
        ph = ",".join("?" * len(keep))
        nodes = [dict(r) | {"degree": deg.get(r["is_number"], 0)}
                 for r in con.execute(
                     f"""SELECT is_number, is_base, title, department, aspect,
                                year, is_active, metadata_only
                         FROM standards WHERE is_number IN ({ph})""", list(keep))]
    return {"nodes": nodes, "edges": edges,
            "truncated": len(deg) > len(keep), "total_nodes": len(deg)}


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
                            max_requirements: int = Form(0)) -> dict[str, Any]:
    """A tender document, uploaded rather than pasted.

    `max_requirements` is declared as Form, not a bare int: a bare int becomes a
    QUERY parameter, so a multipart upload that sent it in the form body had the
    cap silently ignored and processed the whole document.
    """
    raw = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        import pymupdf
        with pymupdf.open(stream=raw, filetype="pdf") as doc:
            text = "\n".join(page.get_text() for page in doc)
    else:
        text = raw.decode("utf-8", "ignore")
    if len(text.strip()) < 20:
        raise HTTPException(400, "Could not extract usable text from the upload.")
    con = connect()
    return run_batch(con, get_retriever(con), text, max_requirements=max_requirements)
