"""Measure retrieval and abstention quality against a golden set.

Reports:
  recall@1 / @3 / @5  - is the expected standard the top candidate, or in the top N
  recommend rate      - how often a confident answer is produced at all
  abstention accuracy - does it abstain on queries that deserve abstention
  false confidence    - the number that matters most: confident answers that
                        are WRONG, or confident answers to vague queries

Matching is on IS base number (edition-agnostic), because the right answer is
the standard, not a particular year.

    python scripts/evaluate.py                 # retrieval only, no LLM, fast
    python scripts/evaluate.py --llm           # full pipeline incl. synthesis
    python scripts/evaluate.py --json out.json
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import time

sys.path.insert(0, ".")
from backend.config import ROOT
from backend.pipeline.recommend import recommend
from backend.pipeline.retrieve import Retriever
from backend.store import connect

EVAL = ROOT / "data" / "seed" / "eval_set.json"


def base_of(is_number: str | None) -> str | None:
    if not is_number:
        return None
    m = re.match(r"^((?:IS|SP)(?:/[A-Z]+)*\s+\d+(?:\.\d+)*)", is_number.strip(), re.I)
    return m.group(1).upper() if m else is_number.split(":")[0].strip().upper()


def rank_of(expected: list[str], candidates: list[str]) -> int | None:
    """1-based rank of the first expected base among candidate bases."""
    want = {e.upper() for e in expected}
    for i, c in enumerate(candidates, 1):
        if (base_of(c) or "") in want:
            return i
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--llm", action="store_true", help="run full pipeline with synthesis")
    ap.add_argument("--json", default="", help="write full results to this path")
    ap.add_argument("--top-k", type=int, default=12)
    a = ap.parse_args()

    spec = json.loads(EVAL.read_text(encoding="utf-8"))
    con = connect()
    r = Retriever(con)
    use_llm = a.llm

    rows: list[dict] = []
    t0 = time.time()

    print(f"{'query':<58} {'expect':<12} {'rank':>5}  {'top match':<16} {'conf':>6}  status")
    print("-" * 116)

    for case in spec["should_recommend"]:
        cands = r.candidate_standards(case["query"], k=a.top_k)
        names = [c["is_number"] for c in cands]
        rk = rank_of(case["expect"], names)
        res = recommend(con, r, case["query"], top_k=a.top_k, use_llm=use_llm)
        status = res["status"]
        conf = res.get("confidence")
        primary = (res.get("primary_standards") or [{}])[0].get("is_number") if status == "recommended" else None
        correct = primary is not None and (base_of(primary) or "") in {e.upper() for e in case["expect"]}
        rows.append({"kind": "should_recommend", "query": case["query"],
                     "expect": case["expect"], "retrieval_rank": rk,
                     "status": status, "confidence": conf,
                     "primary": primary, "correct": correct,
                     "candidates": names[:5]})
        print(f"{case['query'][:56]:<58} {case['expect'][0]:<12} {str(rk or '-'):>5}  "
              f"{str(names[0] if names else '-')[:16]:<16} "
              f"{(f'{conf:.2f}' if conf is not None else '-'):>6}  "
              f"{'OK  ' if correct else ('MISS' if status == 'recommended' else 'abst')} {status}")

    print()
    for case in spec["should_abstain"]:
        res = recommend(con, r, case["query"], top_k=a.top_k, use_llm=use_llm)
        ok = res["status"] == "abstained"
        rows.append({"kind": "should_abstain", "query": case["query"],
                     "status": res["status"], "confidence": res.get("confidence"),
                     "primary": (res.get("primary_standards") or [{}])[0].get("is_number")
                     if res["status"] == "recommended" else None,
                     "correct": ok})
        conf = res.get("confidence")
        print(f"{case['query'][:56]:<58} {'(abstain)':<12} {'-':>5}  {'-':<16} "
              f"{(f'{conf:.2f}' if conf is not None else '-'):>6}  "
              f"{'OK  ' if ok else 'FALSE-CONFIDENCE'} {res['status']}")

    rec = [x for x in rows if x["kind"] == "should_recommend"]
    abst = [x for x in rows if x["kind"] == "should_abstain"]
    n = len(rec)

    def recall(k: int) -> float:
        return sum(1 for x in rec if x["retrieval_rank"] and x["retrieval_rank"] <= k) / n

    answered = [x for x in rec if x["status"] == "recommended"]
    correct = [x for x in answered if x["correct"]]
    wrong_confident = [x for x in answered if not x["correct"]]
    false_conf_vague = [x for x in abst if not x["correct"]]

    summary = {
        "cases": n,
        "recall_at_1": round(recall(1), 3),
        "recall_at_3": round(recall(3), 3),
        "recall_at_5": round(recall(5), 3),
        "recommend_rate": round(len(answered) / n, 3),
        "precision_when_answering": round(len(correct) / len(answered), 3) if answered else None,
        "abstention_accuracy": round(sum(1 for x in abst if x["correct"]) / len(abst), 3) if abst else None,
        "false_confidence_wrong_answer": len(wrong_confident),
        "false_confidence_on_vague": len(false_conf_vague),
        "llm": use_llm,
        "seconds": round(time.time() - t0, 1),
    }

    print("\n" + "=" * 60)
    print("RETRIEVAL")
    print(f"  recall@1 {summary['recall_at_1']:.0%}   recall@3 {summary['recall_at_3']:.0%}"
          f"   recall@5 {summary['recall_at_5']:.0%}")
    print("END-TO-END")
    prec = summary["precision_when_answering"]
    prec_str = f"{prec:.0%}" if prec is not None else "n/a"
    print(f"  answered {len(answered)}/{n} ({summary['recommend_rate']:.0%})"
          f"   precision when answering {prec_str}")
    print(f"  abstained correctly on {sum(1 for x in abst if x['correct'])}/{len(abst)} vague queries")
    print("SAFETY (lower is better)")
    print(f"  confident but WRONG        : {summary['false_confidence_wrong_answer']}")
    print(f"  confident on a VAGUE query : {summary['false_confidence_on_vague']}")
    print(f"  ({summary['seconds']}s, llm={use_llm})")
    print("=" * 60)

    if a.json:
        (ROOT / a.json).write_text(
            json.dumps({"summary": summary, "results": rows}, indent=2), encoding="utf-8")
        print(f"written: {a.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
