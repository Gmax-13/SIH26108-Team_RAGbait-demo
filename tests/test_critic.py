"""Tests for the hard guarantees: no fabricated IS numbers, no invented citations.

These encode the project's core promise. If any of these fail, the system is
returning output it cannot justify, which is worse than returning nothing.
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.pipeline.critic import (abstention_response, candidate_coherence,
                                     lexical_support,
                                     mentioned_is_numbers, verify)
from backend.store import init_db, upsert_standard


@pytest.fixture()
def con(tmp_path):
    c = init_db(tmp_path / "t.db")
    for num, base, title in [
        ("IS 694:2010", "IS 694", "PVC insulated cables for working voltages up to 1100 V"),
        ("IS 732:1989", "IS 732", "Code of practice for electrical wiring installations"),
    ]:
        upsert_standard(c, {
            "is_number": num, "is_base": base, "title": title, "year": 2010,
            "department": "ETD", "aspect": "Product Specification",
            "source": "test", "has_full_text": 1, "metadata_only": 0,
            "full_text": title, "full_text_chars": len(title),
        })
    c.commit()
    return c


def _retrieved(metadata_only=False, score=0.82, second=0.55):
    return [
        {"is_number": "IS 694:2010", "is_base": "IS 694",
         "title": "PVC insulated cables for working voltages up to 1100 V",
         "department": "ETD", "aspect": "Product Specification",
         "technical_committee": "ETD 09", "year": 2010,
         "metadata_only": metadata_only, "has_full_text": not metadata_only,
         "best_score": score,
         "chunks": [{"chunk_id": "IS 694:2010#c001", "section": "Clause 4 Conductor",
                     "score": score,
                     "text": "The conductor shall be of annealed copper and the cables "
                             "shall be suitable for working voltages up to and "
                             "including 1100 V."}]},
        {"is_number": "IS 732:1989", "is_base": "IS 732",
         "title": "Code of practice for electrical wiring installations",
         "department": "ETD", "aspect": "Code of Practice",
         "technical_committee": "ETD 20", "year": 1989,
         "metadata_only": False, "has_full_text": True, "best_score": second,
         "chunks": [{"chunk_id": "IS 732:1989#c010", "section": "Clause 5",
                     "score": second, "text": "Wiring installations shall be earthed."}]},
    ]


def test_extracts_is_numbers_from_prose():
    got = mentioned_is_numbers("Use IS 732:1989 together with IS : 3043 and IS 99999")
    assert got == {"IS 732", "IS 3043", "IS 99999"}


def test_fabricated_standard_forces_abstention(con):
    """An IS number absent from the corpus must zero the confidence."""
    rec = {
        "primary_standards": [{"is_number": "IS 99999:2020"}],
        "summary": "Use IS 99999:2020 for this cable.",
        "claims": [{"claim": "IS 99999:2020 covers PVC cables",
                    "citations": ["IS 694:2010#c001"]}],
    }
    rep = verify(con, rec, _retrieved(), use_llm=False)
    assert "IS 99999" in rep["fabricated_standards"]
    assert rep["confidence"] == 0.0
    assert rep["abstain"] is True
    assert any("absent from the ingested corpus" in r for r in rep["reasons"])


def test_invented_citation_forces_abstention(con):
    """Citing a passage that was never retrieved is a hard failure."""
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "Use IS 694:2010.",
        "claims": [{"claim": "Conductor shall be annealed copper",
                    "citations": ["IS 694:2010#c999"]}],
    }
    rep = verify(con, rec, _retrieved(), use_llm=False)
    assert "IS 694:2010#c999" in rep["invalid_citations"]
    assert rep["confidence"] == 0.0
    assert rep["abstain"] is True


def test_well_grounded_recommendation_passes(con):
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 covers PVC insulated cables up to 1100 V.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    rep = verify(con, rec, _retrieved(), use_llm=False)
    assert not rep["hard_failures"]
    assert rep["confidence"] >= 0.55
    assert rep["abstain"] is False


def test_uncited_claim_scores_zero_support(con):
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "Cables must be rated for 33 kV", "citations": []}],
    }
    rep = verify(con, rec, _retrieved(), use_llm=False)
    assert rep["claim_checks"][0]["uncited"] is True
    assert rep["claim_checks"][0]["support_score"] == 0.0
    assert rep["abstain"] is True


def test_weak_retrieval_abstains(con):
    """A poor top similarity must not yield a confident answer."""
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    rep = verify(con, rec, _retrieved(score=0.41, second=0.405), use_llm=False)
    assert rep["abstain"] is True
    assert any("closely enough" in r or "discriminate" in r for r in rep["reasons"])


def test_scattered_candidates_signal_ambiguity():
    """A vague query returns topically unrelated candidates; a good one does not."""
    def mk(titles, tcs):
        return [{"title": t, "technical_committee": c, "best_score": 0.7}
                for t, c in zip(titles, tcs)]
    coherent = mk(["PVC insulated heavy duty electric cables Part 1",
                   "PVC insulated ribbon cable pitch 1.27 mm",
                   "Current ratings for pvc insulated cables"], ["ETD 09"] * 3)
    scattered = mk(["Flexible cables for lifts",
                    "Edison screw lampholders",
                    "Containers for lead-acid storage batteries"],
                   ["ETD 04", "ETD 23", "ETD 11"])
    assert candidate_coherence(coherent) > 0.8
    assert candidate_coherence(scattered) < 0.3


def test_grounded_but_irrelevant_answer_abstains(con):
    """A claim can be perfectly supported and still not answer the question."""
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    rep = verify(con, rec, _retrieved(), query="good quality durable product for general use",
                 use_llm=False)
    assert rep["signals"]["query_relevance"] < 0.3
    assert rep["abstain"] is True
    assert any("does not clearly address" in r for r in rep["reasons"])


def test_relevant_query_scores_high_relevance(con):
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    rep = verify(con, rec, _retrieved(),
                 query="PVC insulated cable for voltages up to 1100 V", use_llm=False)
    assert rep["signals"]["query_relevance"] > 0.8
    assert rep["abstain"] is False


def test_empty_primary_standards_abstains(con):
    """If the synthesiser declines to pick a standard, honour that."""
    rec = {"primary_standards": [], "summary": "No candidate fits.", "claims": []}
    rep = verify(con, rec, _retrieved(), use_llm=False)
    assert rep["confidence"] == 0.0
    assert rep["abstain"] is True
    assert any("did not identify any" in r for r in rep["reasons"])


def test_metadata_only_match_is_penalised(con):
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    full = verify(con, rec, _retrieved(metadata_only=False), use_llm=False)
    meta = verify(con, rec, _retrieved(metadata_only=True), use_llm=False)
    assert meta["confidence"] < full["confidence"]
    assert meta["signals"]["verification_depth"] < 1.0


def test_abstention_response_shape(con):
    rep = verify(con, {"primary_standards": [], "summary": "", "claims": []},
                 _retrieved(score=0.36, second=0.355), use_llm=False)
    out = abstention_response("something vague", _retrieved(), rep)
    assert out["status"] == "abstained"
    assert out["closest_candidates"]
    assert out["reasons"]
    assert "next_steps" in out


def test_lexical_support_ignores_stopwords():
    assert lexical_support("the cable shall be of copper", "copper cable") == 1.0
    assert lexical_support("aluminium busbar", "copper cable") == 0.0


def test_edition_mismatch_reduces_confidence(con):
    """Text from an older edition is real evidence, but not this edition's text."""
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    clean = verify(con, rec, _retrieved(), use_llm=False)
    con.execute("UPDATE standards SET full_text_year=1990 WHERE is_number='IS 694:2010'")
    con.commit()
    mismatched = verify(con, rec, _retrieved(), use_llm=False)
    assert mismatched["confidence"] < clean["confidence"]
    assert mismatched["signals"]["verification_depth"] < 1.0


def test_withdrawn_standard_is_not_recommended(con):
    """Recommending a withdrawn standard is a serious defect for a compliance
    tool, so it must collapse confidence rather than merely raise a flag."""
    con.execute("UPDATE standards SET is_active=0, withdrawn_status='W' "
                "WHERE is_number='IS 694:2010'")
    con.commit()
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    rep = verify(con, rec, _retrieved(),
                 query="PVC insulated cable for voltages up to 1100 V", use_llm=False)
    assert rep["withdrawn_standards"] == ["IS 694:2010"]
    assert rep["signals"]["primary_withdrawn"] is True
    assert rep["abstain"] is True
    assert any("WITHDRAWN" in r for r in rep["reasons"])


def test_active_standard_carries_no_withdrawn_penalty(con):
    rec = {
        "primary_standards": [{"is_number": "IS 694:2010"}],
        "summary": "IS 694 applies.",
        "claims": [{"claim": "The conductor shall be of annealed copper",
                    "citations": ["IS 694:2010#c001"]}],
    }
    rep = verify(con, rec, _retrieved(),
                 query="PVC insulated cable for voltages up to 1100 V", use_llm=False)
    assert rep["withdrawn_standards"] == []
    assert rep["abstain"] is False
