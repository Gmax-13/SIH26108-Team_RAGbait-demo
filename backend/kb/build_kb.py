"""Phase 2a — chunk every standard, embed the chunks, build the FAISS index.

Standards with full text produce many real chunks. Metadata-only standards get
a single synthetic chunk built from catalogue fields so they remain findable —
but they stay flagged, and the pipeline must say so rather than presenting them
as verified matches.

Usage:
    python -m backend.kb.build_kb
    python -m backend.kb.build_kb --departments ETD,LITD
"""
from __future__ import annotations
import argparse, json, time

from backend.config import LOGS
from backend.kb.chunker import build_chunks, metadata_pseudo_text
from backend.kb.embedder import encode_docs
from backend.kb.vector_index import VectorIndex
from backend.store import init_db, log, new_run_id, stats


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--departments", default="")
    ap.add_argument("--batch", type=int, default=0,
                    help="0 = auto: 64 on GPU, 32 on CPU (measured optima)")
    a = ap.parse_args(argv)

    if not a.batch:
        # Measured on this corpus: GPU peaks at 64 (200 chunks/s), CPU at 32
        # where padding waste dominates (11 chunks/s).
        import torch
        a.batch = 64 if torch.cuda.is_available() else 32

    con = init_db()
    run_id = new_run_id("kb")
    t0 = time.time()

    where, params = [], []
    if a.departments:
        d = [x.strip().upper() for x in a.departments.split(",") if x.strip()]
        where.append(f"department IN ({','.join('?' * len(d))})")
        params += d
    sql = ("SELECT id,is_number,title,aspect,technical_committee,iso_equivalence,"
           "iso_equiv_degree,has_full_text,full_text,metadata_only FROM standards")
    if where:
        sql += " WHERE " + " AND ".join(where)
    rows = con.execute(sql, params).fetchall()
    print(f"run_id={run_id}  standards={len(rows)}")

    con.execute("DELETE FROM chunks")
    con.commit()

    ids: list[str] = []
    texts: list[str] = []
    n_full = n_meta = 0
    for r in rows:
        # Every standard gets a title/metadata chunk, INCLUDING full-text ones.
        # Without it, retrieval is biased toward standards that happen to have
        # full text: they contribute many body chunks, so a metadata-only standard
        # whose *title* is the exact answer gets buried.
        meta_chunk = {"id": f"{r['is_number']}#meta", "chunk_index": -1,
                      "section": "catalogue metadata",
                      "text": metadata_pseudo_text(dict(r)),
                      "char_start": 0, "char_end": 0}
        if r["has_full_text"] and r["full_text"]:
            chs = [meta_chunk] + build_chunks(r["is_number"], r["full_text"])
            n_full += 1
        else:
            chs = [meta_chunk]
            n_meta += 1
        for c in chs:
            con.execute(
                "INSERT OR REPLACE INTO chunks(id,standard_id,chunk_index,section,text,char_start,char_end)"
                " VALUES(?,?,?,?,?,?,?)",
                (c["id"], r["id"], c["chunk_index"], c["section"], c["text"],
                 c["char_start"], c["char_end"]))
            ids.append(c["id"])
            texts.append(c["text"])
    con.commit()
    print(f"chunks: {len(ids)}  (full-text standards={n_full}, metadata-only={n_meta})")

    print(f"embedding {len(texts)} chunks (batch={a.batch})...", flush=True)
    idx = VectorIndex()
    vecs = encode_docs(texts, batch_size=a.batch, show_progress=True)
    idx.add(ids, vecs)
    idx.save()

    st = stats(con)
    summary = {"run_id": run_id, "seconds": round(time.time() - t0, 1),
               "standards": len(rows), "chunks": len(ids),
               "fulltext_standards": n_full, "metadata_only_standards": n_meta,
               "index_vectors": len(idx), "db": st}
    log(con, run_id, "embed", "ok", "complete", json.dumps(summary))
    con.commit()
    (LOGS / f"{run_id}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n" + "=" * 62)
    print(f"KB BUILD COMPLETE in {summary['seconds']}s")
    print(f"  chunks indexed : {len(idx)}")
    print(f"  full-text stds : {n_full}   metadata-only: {n_meta}")
    print("=" * 62)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
