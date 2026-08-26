"""Tests for ingestion parsing, reference extraction, currency and certification."""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ingestion.normalize import normalize_row, parse_is_no
from backend.kb.chunker import chunk_text
from backend.kb.references import classify_edge, extract_references
from backend.pipeline.certification import check_certification, load_rules
from backend.pipeline.currency import check_currency
from backend.store import init_db, upsert_standard


# ---------------------------------------------------------------- normalize
@pytest.mark.parametrize("raw,expected", [
    ("IS 732:1989<br> (Active)", "IS 732:1989"),
    ("IS 1554 (Part 1):1988<br>IEC 60502<br> (Active)", "IS 1554 (Part 1):1988"),
    ("IS 732 (Part 1/Sec 2):1975<br><br>Reaffirmed", "IS 732 (Part 1/Sec 2):1975"),
    ("SP 1:1967<br> (Active)", "SP 1:1967"),
    ("10558 10558:2013<br> (Active)", "IS 10558:2013"),
])
def test_parse_is_no_variants(raw, expected):
    assert parse_is_no(raw)["is_number"] == expected


def test_parse_extracts_iso_equivalent():
    p = parse_is_no("IS 1554 (Part 1):1988<br>IEC 60502<br> (Active)")
    assert p["iso_equivalence"] == "IEC 60502"
    assert p["part"] == "1"
    assert p["year"] == 1988


def test_unparseable_row_is_rejected_not_guessed():
    """BIS emits corrupt rows with no number. We must reject, never invent one."""
    assert normalize_row({"is_no": "IS/IEC -1-310:2005<br> (Active)",
                          "is_title": "x", "technical_committee": "LITD 06"}) is None


def test_normalize_maps_misnamed_bis_field():
    rec = normalize_row({
        "is_no": "IS 694:2010<br> (Active)", "is_title": "PVC cables",
        "technical_committee": "ETD  09", "amendments": "2",
        "referirmatin_year": "Identical under single numbering"})
    assert rec["iso_equiv_degree"] == "Identical under single numbering"
    assert rec["department"] == "ETD"
    assert rec["amendment_count"] == 2


# ---------------------------------------------------------------- references
def test_extract_references_finds_inline_citations():
    text = ("Bonding conductors complying with IS : 3043-1987 shall connect parts. "
            "Conduits shall conform to IS 9537 (Part 3). "
            "Testing per IS : 8623 ( Part 1 ) is required.")
    refs = extract_references(text, self_base="IS 732")
    bases = {r["dst_is_base"] for r in refs}
    assert {"IS 3043", "IS 9537", "IS 8623"} <= bases
    by = {r["dst_is_base"]: r for r in refs}
    assert by["IS 9537"]["part"] == "3"
    assert by["IS 3043"]["evidence_snippet"]           # evidence is always captured


def test_extract_references_excludes_self():
    refs = extract_references("This IS 732 refers to IS 3043.", self_base="IS 732")
    assert all(r["dst_is_base"] != "IS 732" for r in refs)


def test_edge_type_from_catalogue_aspect_wins():
    assert classify_edge("safety", "Methods of tests") == "test_method"
    assert classify_edge(None, "Terminology") == "terminology"
    assert classify_edge("test_method", None) == "test_method"
    assert classify_edge(None, None) == "normative_reference"


# ---------------------------------------------------------------- chunker
def test_chunks_cover_the_whole_document():
    text = ("Clause one text. " * 200) + "\n\n" + ("Clause two text. " * 200)
    chunks = list(chunk_text(text, size=800, overlap=100))
    assert chunks
    assert chunks[-1][1] == len(text.strip())
    assert all(len(c[2]) >= 80 for c in chunks)


# ---------------------------------------------------------------- currency
@pytest.fixture()
def con(tmp_path):
    c = init_db(tmp_path / "t.db")
    rows = [
        # two editions of the same base: 1987 is superseded by 2018
        ("IS 3043:1987", "IS 3043", 1987, 0, 1, 0),
        ("IS 3043:2018", "IS 3043", 2018, 0, 1, 0),
        ("IS 694:2010", "IS 694", 2010, 3, 1, 0),
        ("IS 9537 (Part 3):1983", "IS 9537", 1983, 0, 1, 1),
    ]
    for num, base, yr, amd, active, meta in rows:
        upsert_standard(c, {
            "is_number": num, "is_base": base, "year": yr, "title": f"{base} title",
            "amendment_count": amd, "is_active": active, "metadata_only": meta,
            "has_full_text": 0 if meta else 1, "department": "ETD", "source": "test"})
    c.commit()
    return c


def test_currency_flags_superseded_edition(con):
    r = check_currency(con, "IS 3043:1987")
    assert r["status"] == "superseded"
    assert r["latest_known_edition"] == "IS 3043:2018"
    assert any("newer edition" in f for f in r["flags"])


def test_currency_marks_latest_as_current(con):
    assert check_currency(con, "IS 3043:2018")["status"] == "current"


def test_currency_flags_amendments(con):
    r = check_currency(con, "IS 694:2010")
    assert r["status"] == "current"
    assert any("amendment" in f for f in r["flags"])


def test_currency_flags_metadata_only(con):
    r = check_currency(con, "IS 9537 (Part 3):1983")
    assert any("metadata only" in f.lower() for f in r["flags"])


def test_currency_flags_text_edition_mismatch(con):
    """Text from a different edition must never be cited as this edition's."""
    con.execute("UPDATE standards SET has_full_text=1, full_text_year=1987, "
                "archive_identifier='gov.in.is.3043.1987' WHERE is_number='IS 3043:2018'")
    con.commit()
    r = check_currency(con, "IS 3043:2018")
    assert r["text_edition_mismatch"] is True
    assert any("1987 edition" in f for f in r["flags"])


def test_currency_unknown_for_missing_standard(con):
    assert check_currency(con, "IS 99999:2020")["status"] == "unknown"


# ---------------------------------------------------------------- certification
def test_certification_exact_match_is_high_confidence(con):
    load_rules(con)
    r = check_certification(con, "IS 694:2010")
    schemes = {s["scheme"] for s in r["schemes"]}
    assert "BIS_PRODUCT_CERT" in schemes
    assert all(s["confidence"] == "high" for s in r["schemes"]
               if s["scheme"] == "BIS_PRODUCT_CERT")
    assert "verify" in r["note"]


def test_certification_returns_nothing_for_unmatched(con):
    load_rules(con)
    con.execute("UPDATE standards SET title='Nondescript widget' WHERE is_number='IS 3043:2018'")
    con.commit()
    assert check_certification(con, "IS 3043:2018")["schemes"] == []


# ---------------------------------------------------------------- batch citation
def test_document_citation_of_old_edition_is_flagged(con):
    """A tender citing a superseded year must be flagged even when that exact
    edition was never ingested — the year alone is enough to judge currency."""
    from backend.pipeline.batch import _resolve_cited
    # corpus holds IS 3043:1987 and :2018; a tender citing 1987 is outdated
    r = _resolve_cited(con, "IS 3043 - 1987")
    assert r["status"] == "superseded"
    assert r["latest_known_edition"] == "IS 3043:2018"


def test_document_citation_of_uningested_old_edition_is_still_flagged(con):
    from backend.pipeline.batch import _resolve_cited
    con.execute("DELETE FROM standards WHERE is_number='IS 3043:1987'")
    con.commit()
    r = _resolve_cited(con, "IS 3043 - 1987")
    assert r["status"] == "superseded"
    assert any("not in the ingested corpus" in f for f in r["flags"])


def test_document_citation_of_current_edition_is_not_flagged(con):
    from backend.pipeline.batch import _resolve_cited
    assert _resolve_cited(con, "IS 3043:2018")["status"] == "current"


def test_unrecognised_citation_is_reported_not_guessed(con):
    from backend.pipeline.batch import _resolve_cited
    assert _resolve_cited(con, "some vendor spec")["status"] == "unrecognised"
    assert _resolve_cited(con, "IS 99999:2020")["status"] == "not_in_corpus"


# ---------------------------------------------------------------- archive identifiers
@pytest.mark.parametrize("base,part,section,candidate,should_match", [
    # Section 21's document must never be accepted for Section 28
    ("IS 302", "2", "28", "gov.in.is.302.2.21.2018", False),
    ("IS 302", "2", "21", "gov.in.is.302.2.21.2018", True),
    # a part-level document must not be accepted for a section-level standard
    ("IS 10052", "1", "5", "gov.in.is.10052.1.1999", False),
    ("IS 10052", "1", None, "gov.in.is.10052.1.1999", True),
    # a part document must not be accepted for the parent standard
    ("IS 732", None, None, "gov.in.is.732.1.1989", False),
    ("IS 732", None, None, "gov.in.is.732.1989", True),
])
def test_archive_identifier_must_match_exactly(base, part, section, candidate, should_match):
    """Prefix matching once attached the wrong document to the right IS number."""
    from scripts.repair_fulltext_assignment import expected_pattern
    import re
    pat = expected_pattern(base, part, section)
    assert bool(re.fullmatch(pat, candidate)) is should_match


# ---------------------------------------------------------------- parts vs editions
def test_a_different_part_is_not_a_newer_edition(tmp_path):
    """IS 9537 (Part 8):2003 is a different document from (Part 3):1983, not a
    newer edition of it. Confusing the two tells tenders to swap in the wrong
    standard."""
    c = init_db(tmp_path / "p.db")
    for num, part, yr in [("IS 9537 (Part 3):1983", "3", 1983),
                          ("IS 9537 (Part 8):2003", "8", 2003)]:
        upsert_standard(c, {"is_number": num, "is_base": "IS 9537", "part": part,
                            "year": yr, "title": "Conduits", "department": "ETD",
                            "source": "test", "has_full_text": 1, "metadata_only": 0})
    c.commit()
    r = check_currency(c, "IS 9537 (Part 3):1983")
    assert r["status"] == "current"
    assert r["latest_known_edition"] == "IS 9537 (Part 3):1983"

    from backend.pipeline.batch import _resolve_cited
    assert _resolve_cited(c, "IS 9537 (Part 3)")["status"] == "current"


def test_a_real_newer_edition_of_the_same_part_is_flagged(tmp_path):
    c = init_db(tmp_path / "p2.db")
    for num, yr in [("IS 9537 (Part 3):1983", 1983), ("IS 9537 (Part 3):2010", 2010)]:
        upsert_standard(c, {"is_number": num, "is_base": "IS 9537", "part": "3",
                            "year": yr, "title": "Conduits", "department": "ETD",
                            "source": "test", "has_full_text": 1, "metadata_only": 0})
    c.commit()
    r = check_currency(c, "IS 9537 (Part 3):1983")
    assert r["status"] == "superseded"
    assert r["latest_known_edition"] == "IS 9537 (Part 3):2010"
