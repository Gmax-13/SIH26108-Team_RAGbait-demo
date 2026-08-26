"""End-to-end demo: single query, ambiguous query (abstention), batch tender.

    python scripts/demo.py            # all three
    python scripts/demo.py abstain    # just the abstention moment
"""
import sys, textwrap
sys.path.insert(0, ".")

from backend.pipeline.batch import run_batch
from backend.pipeline.recommend import recommend
from backend.pipeline.retrieve import Retriever
from backend.store import connect

W = 78
def rule(t=""):
    print("\n" + "=" * W)
    if t:
        print(t)
        print("=" * W)

def show(res):
    st = res["status"]
    if st == "abstained":
        print(f"  STATUS      : ABSTAINED  (confidence {res['confidence']} < {res['threshold']})")
        print("  REASONS:")
        for r in res["reasons"]:
            print(textwrap.fill(r, W - 6, initial_indent="    - ", subsequent_indent="      "))
        print("  CLOSEST CANDIDATES (offered, not recommended):")
        for c in res["closest_candidates"][:4]:
            print(f"    {c['similarity']:.3f}  {c['is_number']:<24} {c['title'][:40]}")
        return
    method = res.get("synthesis_method", "llm")
    note = "" if method == "llm" else "  [rule-based synthesis — no LLM configured]"
    print(f"  STATUS      : RECOMMENDED  (confidence {res['confidence']}){note}")
    for s in res["primary_standards"]:
        print(f"  PRIMARY     : {s['is_number']} — {(s.get('title') or '')[:46]}")
        cur = s.get("currency") or {}
        print(f"    currency  : {cur.get('status')}")
        for f in cur.get("flags", []):
            print(textwrap.fill(f, W - 8, initial_indent="      ! ", subsequent_indent="        "))
        for sch in (s.get("certification") or {}).get("schemes", []):
            print(f"    cert      : {sch['scheme']} ({sch['confidence']} confidence)")
    print("  CLAIMS:")
    for c in res["claims"][:4]:
        print(textwrap.fill(f"[{c['support_score']}] {c['claim']}", W - 6,
                            initial_indent="    ", subsequent_indent="      "))
        print(f"      cites: {', '.join(c['citations']) or 'NONE'}")
    g = res.get("dependency_graph") or {}
    print(f"  GRAPH       : {len(g.get('nodes', []))} nodes, {len(g.get('edges', []))} edges")


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    con = connect()
    r = Retriever(con)

    if which in ("all", "single"):
        for q in ["PVC insulated unsheathed copper conductor cable for internal wiring, rated 1100 V",
                  "earthing and equipotential bonding for a low voltage electrical installation"]:
            rule(f"SINGLE QUERY: {q}")
            show(recommend(con, r, q))

    if which in ("all", "abstain"):
        q = "good quality durable product for general use"
        rule(f"AMBIGUOUS QUERY (must abstain): {q}")
        show(recommend(con, r, q))

    if which in ("all", "batch"):
        rule("BATCH TENDER MODE")
        text = open("data/seed/sample_tender.txt", encoding="utf-8").read()
        rep = run_batch(con, r, text, max_requirements=12)
        s = rep["summary"]
        print(f"  {s['requirements_extracted']} requirements extracted"
              f" -> {s['standards_identified']} standards identified")
        print(f"  -> {s['outdated_document_citations']} outdated references in the tender")
        print(f"  -> {s['certification_flags']} certification flags")
        print(f"  -> {s['requirements_abstained']} abstentions")
        print(f"  extraction method: {rep['extraction']['method']}   ({rep['elapsed_sec']}s)")
        if rep["outdated_document_citations"]:
            print("\n  OUTDATED STANDARDS CITED BY THE TENDER:")
            for c in rep["outdated_document_citations"]:
                print(f"    {c['cited_as']:<22} -> {c['is_number']} is {c['status']}"
                      f"; latest is {c.get('latest_known_edition')}")
    rule()

if __name__ == "__main__":
    main()
