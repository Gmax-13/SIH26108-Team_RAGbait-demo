"""API contract tests.

Builds a tiny real corpus (SQLite + FAISS) in a temp dir and exercises the
routes end-to-end, so response shapes are pinned against actual behaviour rather
than assumptions. LLM calls are disabled (`use_llm=False`) so the suite is
deterministic and needs no API key.
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("api")
    os.environ["IS_DB_PATH"] = str(tmp / "api.db")
    os.environ["IS_INDEX_DIR"] = str(tmp / "faiss")

    # config caches paths at import time, so import only after the env is set
    for mod in [m for m in list(sys.modules) if m.startswith("backend")]:
        del sys.modules[mod]

    from backend.kb.embedder import encode_docs
    from backend.kb.vector_index import VectorIndex
    from backend.pipeline.certification import load_rules
    from backend.store import add_edge, init_db, upsert_standard

    con = init_db()
    rows = [
        ("IS 694:2010", "IS 694", None, 2010,
         "Polyvinyl chloride insulated cables for rated voltages up to 1100 V",
         "ETD 09", "Product Specification", 1),
        ("IS 3043:1987", "IS 3043", None, 1987,
         "Code of practice for earthing", "ETD 20", "Code of Practice", 1),
        ("IS 3043:2018", "IS 3043", None, 2018,
         "Code of practice for earthing", "ETD 20", "Code of Practice", 0),
        ("IS 10810 (Part 1):1984", "IS 10810", "1", 1984,
         "Methods of test for cables", "ETD 09", "Methods of tests", 0),
    ]
    ids, texts = [], []
    for num, base, part, yr, title, tc, aspect, has_text in rows:
        body = f"{title}. This standard specifies requirements for {title.lower()}."
        sid = upsert_standard(con, {
            "is_number": num, "is_base": base, "part": part, "year": yr,
            "title": title, "technical_committee": tc, "department": "ETD",
            "aspect": aspect, "source": "test",
            "has_full_text": has_text, "metadata_only": 0 if has_text else 1,
            "full_text": body if has_text else None,
            "full_text_chars": len(body) if has_text else 0,
            "full_text_year": yr if has_text else None,
        })
        cid = f"{num}#meta"
        con.execute(
            "INSERT INTO chunks(id,standard_id,chunk_index,section,text,char_start,char_end)"
            " VALUES(?,?,?,?,?,?,?)", (cid, sid, 0, "catalogue metadata", body, 0, len(body)))
        ids.append(cid)
        texts.append(body)
        if num == "IS 694:2010":
            add_edge(con, sid, "IS 10810", "test_method", "confirmed",
                     "Clause 5 Tests", "Tests shall be as per IS 10810.")
    load_rules(con)
    con.commit()

    idx = VectorIndex()
    idx.add(ids, encode_docs(texts))
    idx.save()

    from fastapi.testclient import TestClient

    from backend.api.main import app
    return TestClient(app)


def test_root_orients_instead_of_404(client):
    """Opening the API host directly should say what is running and where the
    dashboard is — a bare 404 there just looks like the server is down."""
    r = client.get("/")
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "running"
    assert b["dashboard"].startswith("http")
    assert "POST /api/recommend" in b["endpoints"]
    assert b["ready_to_query"] is True


def test_health_reports_corpus(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["corpus"]["standards"] == 4


def test_stats_breaks_down_corpus(client):
    b = client.get("/api/stats").json()
    assert b["by_department"]["ETD"] == 4
    assert "Product Specification" in b["by_aspect"]
    assert b["edge_types"]["test_method"] == 1


def test_standard_detail_includes_currency_and_edges(client):
    b = client.get("/api/standards/IS 694:2010").json()
    assert b["is_number"] == "IS 694:2010"
    assert b["currency"]["status"] == "current"
    assert b["outgoing_edges"][0]["dst_is_base"] == "IS 10810"
    assert b["outgoing_edges"][0]["evidence_snippet"]


def test_standard_detail_lists_reverse_dependencies(client):
    """IS 10810 is cited by IS 694; the detail view must show who cites it."""
    b = client.get("/api/standards/IS 10810 (Part 1):1984").json()
    assert b["cited_by_count"] >= 1
    assert b["incoming_edges"][0]["src_is_number"] == "IS 694:2010"
    assert b["incoming_edges"][0]["edge_type"] == "test_method"


def test_standard_detail_flags_superseded(client):
    b = client.get("/api/standards/IS 3043:1987").json()
    assert b["currency"]["status"] == "superseded"
    assert b["currency"]["latest_known_edition"] == "IS 3043:2018"


def test_missing_standard_is_404_not_invented(client):
    assert client.get("/api/standards/IS 99999:2020").status_code == 404


def test_graph_route_returns_nodes_and_edges(client):
    b = client.get("/api/graph/IS 694:2010").json()
    assert any(n["is_number"] == "IS 694:2010" for n in b["nodes"])
    assert b["edges"][0]["edge_type"] == "test_method"
    assert b["edges"][0]["confidence"] == "confirmed"


def test_graph_of_unknown_standard_is_empty_not_error(client):
    b = client.get("/api/graph/IS 99999:2020").json()
    assert b == {"nodes": [], "edges": []}


def test_recommend_returns_a_verified_shape(client):
    r = client.post("/api/recommend",
                    json={"query": "polyvinyl chloride insulated cable 1100 V",
                          "use_llm": False})
    assert r.status_code == 200
    b = r.json()
    assert b["status"] in ("recommended", "abstained")
    if b["status"] == "recommended":
        assert b["synthesis_method"] == "rule_based"
        assert b["primary_standards"][0]["is_number"] == "IS 694:2010"
        assert b["citations"]
        assert b["verification"]["signals"]["query_relevance"] > 0.5
    assert b["elapsed_sec"] is not None


def test_recommend_abstains_on_an_unrelated_query(client):
    b = client.post("/api/recommend",
                    json={"query": "zzzz nonsense unrelated gibberish topic",
                          "use_llm": False}).json()
    assert b["status"] == "abstained"
    assert b["reasons"]
    assert "closest_candidates" in b


def test_recommend_rejects_too_short_a_query(client):
    assert client.post("/api/recommend", json={"query": "a"}).status_code == 422


def test_batch_produces_a_quantified_summary(client):
    text = ("3.1 All wiring shall use PVC insulated cables conforming to IS 694. "
            "3.2 Earthing shall be as per IS 3043 - 1987. "
            "4.1 Payment shall be made within 45 days of invoice submission.")
    b = client.post("/api/batch", json={"text": text, "use_llm": False}).json()
    s = b["summary"]
    assert s["requirements_extracted"] >= 1
    # the tender cites the 1987 edition; 2018 exists
    assert s["outdated_document_citations"] >= 1
    assert b["outdated_document_citations"][0]["latest_known_edition"] == "IS 3043:2018"


def test_logs_expose_the_audit_trail(client):
    b = client.get("/api/logs").json()
    assert "runs" in b and "events" in b
