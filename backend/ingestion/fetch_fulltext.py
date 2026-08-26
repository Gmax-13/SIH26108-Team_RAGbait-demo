"""Phase 1b — attach Internet Archive full text to catalogued standards.

Standards with no mirrored edition stay `metadata_only=1`. That flag is load-
bearing: the recommender must tell the user when a match could not be verified
against real document text, instead of quietly presenting it as equally solid.

Usage:
    python -m backend.ingestion.fetch_fulltext --limit 200 --workers 6
"""
from __future__ import annotations
import argparse, json, re, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.config import ARCHIVE_DELAY, LOGS
from backend.ingestion.archive_client import (clean_text, fetch_text,
                                              find_identifiers, pick_identifier)
from backend.store import init_db, log, new_run_id, now, stats

_throttle = threading.Semaphore(1)
_last = [0.0]


def _polite() -> None:
    """Global rate limit across worker threads."""
    with _throttle:
        wait = ARCHIVE_DELAY - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()


def _work(row: dict) -> dict:
    out = {"id": row["id"], "is_number": row["is_number"], "status": "miss",
           "identifier": None, "chars": 0, "error": None}
    try:
        _polite()
        idents = find_identifiers(row["is_base"], row["part"], row["section"])
        ident = pick_identifier(idents, row["year"])
        if not ident:
            out["error"] = "no archive edition"
            return out
        out["identifier"] = ident
        _polite()
        raw, err = fetch_text(ident)
        if err or not raw:
            out["status"] = "error"
            out["error"] = err or "empty"
            return out
        txt = clean_text(raw)
        if len(txt) < 500:
            out["status"] = "error"
            out["error"] = f"text too short ({len(txt)})"
            return out
        out["status"] = "ok"
        out["chars"] = len(txt)
        out["text"] = txt
        # The identifier encodes which edition we actually fetched, which is not
        # always the edition the catalogue lists.
        ym = re.search(r"\.(\d{4})$", ident)
        out["text_year"] = int(ym.group(1)) if ym else None
    except Exception as e:  # noqa: BLE001
        out["status"] = "error"
        out["error"] = f"{type(e).__name__}: {e}"
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max standards to attempt")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--departments", default="", help="restrict to depts, e.g. ETD,LITD")
    ap.add_argument("--retry-missing", action="store_true",
                    help="also re-attempt standards previously found to have no edition")
    a = ap.parse_args(argv)

    con = init_db()
    run_id = new_run_id("fulltext")

    where = ["has_full_text=0"]
    params: list = []
    if a.departments:
        depts = [d.strip().upper() for d in a.departments.split(",") if d.strip()]
        where.append(f"department IN ({','.join('?' * len(depts))})")
        params += depts
    if not a.retry_missing:
        # `archive_checked` records that archive.org was already searched, even
        # when nothing was found. Without it every run re-queries the thousands
        # of standards that simply have no mirror, and the hit rate collapses.
        where.append("archive_checked = 0")
    # Order by expected yield, not by recency. Public.Resource.Org's scanning
    # effort predates the current editions, so a 2026 entry is very unlikely to
    # be mirrored while a 1990 one usually is; and an active standard is worth
    # more than a withdrawn one. This front-loads the hits so a run that has to
    # be cut short still leaves the corpus in its most useful state.
    sql = (f"SELECT id,is_number,is_base,part,section,year FROM standards "
           f"WHERE {' AND '.join(where)} "
           f"ORDER BY is_active DESC, (year IS NULL), year ASC")
    if a.limit:
        sql += f" LIMIT {a.limit}"
    rows = [dict(r) for r in con.execute(sql, params)]
    print(f"run_id={run_id}  candidates={len(rows)}  workers={a.workers}")
    log(con, run_id, "fulltext", "ok", "start", json.dumps({"candidates": len(rows)}))
    con.commit()

    ok = miss = err = 0
    t0 = time.time()
    writer = con    # all writes happen on the main thread; one connection avoids lock contention
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(_work, r): r for r in rows}
        for i, f in enumerate(as_completed(futs), 1):
            r = f.result()
            if r["status"] == "ok":
                ok += 1
                writer.execute(
                    """UPDATE standards SET full_text=?, full_text_chars=?, has_full_text=1,
                       metadata_only=0, archive_identifier=?, full_text_year=?,
                       archive_checked=1,
                       source='bis_catalogue+archive_org', scraped_at=? WHERE id=?""",
                    (r.pop("text"), r["chars"], r["identifier"], r.get("text_year"),
                     now(), r["id"]))
                log(writer, run_id, "fulltext", "ok", r["is_number"],
                    f"{r['identifier']} chars={r['chars']}")
            elif r["status"] == "miss":
                miss += 1
                writer.execute(
                    "UPDATE standards SET archive_checked=1, archive_identifier=COALESCE(?, archive_identifier) WHERE id=?",
                    (r["identifier"], r["id"]))
                log(writer, run_id, "fulltext", "skip", r["is_number"], r["error"])
            else:
                # A transport error is not evidence of absence — leave it
                # unchecked so a later run retries it.
                err += 1
                log(writer, run_id, "fulltext", "error", r["is_number"], r["error"])
            if i % 25 == 0:
                writer.commit()
                rate = i / max(time.time() - t0, 1e-6)
                print(f"  {i}/{len(rows)}  ok={ok} miss={miss} err={err}  {rate:.1f}/s", flush=True)
    writer.commit()

    dur = time.time() - t0
    st = stats(writer)
    summary = {"run_id": run_id, "seconds": round(dur, 1), "attempted": len(rows),
               "full_text_ok": ok, "no_edition": miss, "errors": err,
               "coverage_pct": round(100 * ok / max(len(rows), 1), 1), "db": st}
    log(writer, run_id, "fulltext", "ok", "complete", json.dumps(summary))
    writer.commit()
    (LOGS / f"{run_id}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n" + "=" * 62)
    print(f"FULL-TEXT INGEST COMPLETE in {dur:.1f}s")
    print(f"  attempted        : {len(rows)}")
    print(f"  full text ok     : {ok}  ({summary['coverage_pct']}% of attempted)")
    print(f"  no archive copy  : {miss}   -> remain metadata_only")
    print(f"  errors           : {err}")
    print(f"  db               : {st}")
    print("=" * 62)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
