"""Tests for the compliance and testing checklist built from a batch report."""
from __future__ import annotations
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.pipeline.checklist import build_checklist


def _ps(num, title="T", amendments=0, status="current", schemes=(), metadata_only=False):
    return {"is_number": num, "title": title, "metadata_only": metadata_only,
            "currency": {"status": status, "amendment_count": amendments,
                         "latest_known_edition": num},
            "certification": {"schemes": list(schemes)}}


def _allied(num, edge, cited_at=None, withdrawn=False):
    return {"is_number": num, "title": f"Methods of test, {num}", "edge_type": edge,
            "in_corpus": True, "withdrawn": withdrawn, "cited_at": cited_at}


CERT = {"scheme": "BIS_PRODUCT_CERT", "mandatory": True, "authority": "Electric Cables QCO",
        "match": "exact standard match on IS 1554", "confidence": "high"}
OPTIONAL = {"scheme": "CRS", "mandatory": False, "authority": "x", "confidence": "high"}

REPORT = {
    "outdated_document_citations": [{
        "cited_as": "IS 3043 - 1987", "is_number": "IS 3043:2018", "status": "superseded",
        "latest_known_edition": "IS 3043:2018",
        "flags": ["Document cites the 1987 edition; the catalogue's newest edition is IS 3043:2018."],
    }],
    "results": [
        {"requirement": {"id": "R1", "text": "Cable to IS 1554"},
         "result": {"status": "recommended", "confidence": 0.9,
                    "primary_standards": [_ps("IS 1554 (Part 1):1988", amendments=5, schemes=[CERT, OPTIONAL])],
                    "allied_standards": [_allied("IS 10810 (Part 64):2003", "test_method", "Clause 7"),
                                         _allied("IS 5831:1984", "related_product")]}},
        {"requirement": {"id": "R2", "text": "Another cable"},
         "result": {"status": "recommended", "confidence": 0.7,
                    "primary_standards": [_ps("IS 7098 (Part 1):1988")],
                    "allied_standards": [_allied("IS 10810 (Part 64):2003", "test_method"),
                                         _allied("IS 9000 (Part 4):2020", "safety", withdrawn=True)]}},
        {"requirement": {"id": "R3", "text": "good quality durable product"},
         "result": {"status": "abstained", "reasons": ["Candidates are scattered."],
                    "closest_candidates": [{"is_number": "IS 694:2010"}, {"is_number": "IS 732:2019"}]}},
    ],
}


def _section(cl, key):
    return next(s for s in cl["sections"] if s["key"] == key)["items"]


def test_outdated_tender_citation_becomes_a_replacement_item():
    [item] = _section(build_checklist(REPORT), "correct")
    assert item["action"] == "Replace “IS 3043 - 1987” with IS 3043:2018."
    assert "1987 edition" in item["basis"]


def test_specify_item_carries_amendments_and_requirement():
    items = _section(build_checklist(REPORT), "specify")
    first = next(i for i in items if i["standard"] == "IS 1554 (Part 1):1988")
    assert first["requirement_ids"] == ["R1"]
    assert "5 amendments" in first["basis"]


def test_only_mandatory_certification_is_listed():
    items = _section(build_checklist(REPORT), "certify")
    assert len(items) == 1
    assert "ISI mark" in items[0]["action"] and "IS 1554 (Part 1):1988" in items[0]["action"]
    assert "Verify against the current notification" in items[0]["basis"]


def test_shared_test_method_is_listed_once_for_every_requirement():
    items = _section(build_checklist(REPORT), "test")
    assert [i["standard"] for i in items] == ["IS 10810 (Part 64):2003"]
    assert items[0]["requirement_ids"] == ["R1", "R2"]
    assert "Clause 7" in items[0]["basis"]


def test_related_products_are_not_test_items():
    cl = build_checklist(REPORT)
    assert all(i["standard"] != "IS 5831:1984" for s in cl["sections"] for i in s["items"])


def test_withdrawn_safety_standard_is_flagged():
    [item] = _section(build_checklist(REPORT), "safety")
    assert "withdrawn" in item["basis"]


def test_abstained_requirement_goes_to_an_engineer_with_candidates():
    [item] = _section(build_checklist(REPORT), "resolve")
    assert item["requirement_ids"] == ["R3"] and item["standard"] is None
    assert "IS 694:2010" in item["basis"]


def test_ids_are_sequential_and_total_matches():
    cl = build_checklist(REPORT)
    ids = [i["id"] for s in cl["sections"] for i in s["items"]]
    assert ids == [f"C{n}" for n in range(1, len(ids) + 1)]
    assert cl["total"] == len(ids)


def test_glossaries_are_never_test_items():
    report = {"results": [{"requirement": {"id": "R1", "text": "x"}, "result": {
        "status": "recommended", "confidence": 0.9, "primary_standards": [_ps("IS 1554 (Part 1):1988")],
        "allied_standards": [{**_allied("IS 1885 (Part 90):2025", "test_method"),
                              "title": "Electrotechnical Vocabulary Part 89"}]}}]}
    assert not _section(build_checklist(report), "test")


def test_a_test_item_must_be_a_test_by_its_own_title():
    """A misread citation once attached "Ankle boots" as a cable test method."""
    report = {"results": [{"requirement": {"id": "R1", "text": "x"}, "result": {
        "status": "recommended", "confidence": 0.9, "primary_standards": [_ps("IS 1554 (Part 1):1988")],
        "allied_standards": [
            {**_allied("IS 583:1994", "test_method"), "title": "Ankle boots for heavy duty purposes"},
            {**_allied("IS 5831:1984", "test_method"), "title": "Specification for PVC insulation and sheath"},
            {**_allied("IS 10810 (Part 64):2003", "test_method"), "title": "Methods of test for cables"},
        ]}}]}
    assert [i["standard"] for i in _section(build_checklist(report), "test")] == ["IS 10810 (Part 64):2003"]


def test_double_encoded_titles_are_repaired():
    report = {"results": [{"requirement": {"id": "R1", "text": "x"}, "result": {
        "status": "recommended", "confidence": 0.9, "primary_standards": [_ps("IS 1554 (Part 1):1988")],
        "allied_standards": [{**_allied("IS 14297:2024", "test_method"),
                              "title": "Corrosion of Metals â€” Determination of Corrosivity"}]}}]}
    [item] = _section(build_checklist(report), "test")
    assert "Corrosion of Metals — Determination of Corrosivity" in item["action"]


def test_empty_report_gives_an_empty_checklist():
    cl = build_checklist({"results": []})
    assert cl["total"] == 0 and all(not s["items"] for s in cl["sections"])


FIXTURE = ROOT / "demo-site" / "public" / "fixtures" / "batch-cap-10.json"


@pytest.mark.skipif(not FIXTURE.exists(), reason="recorded demo report not present")
def test_checklist_never_names_a_standard_the_report_lacks():
    """The core guarantee: the checklist adds no standard of its own."""
    report = json.loads(FIXTURE.read_text(encoding="utf-8"))
    report.pop("compliance_checklist", None)
    text = json.dumps(report, ensure_ascii=False)
    cl = build_checklist(report)
    assert cl["total"] > 0
    for s in cl["sections"]:
        for i in s["items"]:
            if i["standard"]:
                assert i["standard"] in text
