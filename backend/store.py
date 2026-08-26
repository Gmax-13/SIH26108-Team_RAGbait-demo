"""SQLite persistence + the ingestion audit log.

Everything the recommender later asserts must be traceable to rows written
here, so writes are deliberately explicit and every ingestion action is logged.
"""
from __future__ import annotations
import sqlite3, json, uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from backend.config import DB_PATH, ROOT

SCHEMA = ROOT / "backend" / "schema.sql"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path | str = DB_PATH) -> sqlite3.Connection:
    con = sqlite3.connect(str(path), timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db(path: Path | str = DB_PATH) -> sqlite3.Connection:
    con = connect(path)
    con.executescript(SCHEMA.read_text(encoding="utf-8"))
    con.commit()
    return con


def new_run_id(prefix: str) -> str:
    return f"{prefix}-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"


def log(con: sqlite3.Connection, run_id: str, phase: str, status: str,
        target: str | None = None, message: str | None = None) -> None:
    con.execute(
        "INSERT INTO scrape_log(run_id,phase,target,status,message,ts) VALUES(?,?,?,?,?,?)",
        (run_id, phase, target, status, message, now()),
    )


STANDARD_COLS = [
    "is_number", "is_base", "part", "section", "year", "title",
    "technical_committee", "department", "aspect", "amendments",
    "amendment_count", "status_note", "withdrawn_status", "is_active",
    "iso_equivalence", "iso_equiv_degree", "source", "archive_identifier",
    "archive_checked",
    "has_full_text", "full_text", "full_text_chars", "full_text_year",
    "metadata_only", "scraped_at",
]


def upsert_standard(con: sqlite3.Connection, rec: dict[str, Any]) -> int:
    """Insert or update by is_number. Returns the standard's row id.

    Full-text fields are only overwritten when the incoming record actually
    carries text, so a later metadata refresh can never silently erase a
    previously ingested document body.
    """
    rec = {k: rec.get(k) for k in STANDARD_COLS}
    rec["scraped_at"] = rec["scraped_at"] or now()
    # Defaults for NOT NULL columns, so a partial record cannot break the insert.
    for col, default in (("is_active", 1), ("has_full_text", 0), ("metadata_only", 1),
                         ("full_text_chars", 0), ("amendment_count", 0),
                         ("archive_checked", 0), ("source", "unknown")):
        if rec[col] is None:
            rec[col] = default
    cols = ", ".join(STANDARD_COLS)
    ph = ", ".join("?" for _ in STANDARD_COLS)
    updates = ", ".join(
        f"{c}=excluded.{c}" for c in STANDARD_COLS
        if c not in ("is_number", "full_text", "has_full_text", "full_text_chars",
                     "full_text_year", "metadata_only", "archive_checked",
                     "archive_identifier")
    )
    sql = f"""
        INSERT INTO standards ({cols}) VALUES ({ph})
        ON CONFLICT(is_number) DO UPDATE SET {updates},
            full_text       = COALESCE(excluded.full_text, standards.full_text),
            has_full_text   = MAX(excluded.has_full_text, standards.has_full_text),
            full_text_chars = MAX(excluded.full_text_chars, standards.full_text_chars),
            full_text_year  = COALESCE(excluded.full_text_year, standards.full_text_year),
            metadata_only   = MIN(excluded.metadata_only, standards.metadata_only),
            archive_checked = MAX(excluded.archive_checked, standards.archive_checked),
            -- Provenance must survive a metadata refresh. A later catalogue
            -- scrape carries no archive identifier, and without COALESCE it
            -- overwrites the pointer to the document the text actually came
            -- from, breaking the citation trail while the text itself stays.
            archive_identifier = COALESCE(excluded.archive_identifier,
                                          standards.archive_identifier)
    """
    con.execute(sql, [rec[c] for c in STANDARD_COLS])
    row = con.execute("SELECT id FROM standards WHERE is_number=?", (rec["is_number"],)).fetchone()
    return int(row["id"])


def add_edge(con: sqlite3.Connection, src_id: int, dst_is_base: str, edge_type: str,
             confidence: str, evidence_section: str | None = None,
             evidence_snippet: str | None = None) -> None:
    con.execute(
        """INSERT OR IGNORE INTO edges
           (src_standard_id,dst_is_base,dst_standard_id,edge_type,confidence,
            evidence_section,evidence_snippet,created_at)
           VALUES(?,?,(SELECT id FROM standards WHERE is_base=? ORDER BY year DESC LIMIT 1),?,?,?,?,?)""",
        (src_id, dst_is_base, dst_is_base, edge_type, confidence,
         evidence_section, evidence_snippet, now()),
    )


def resolve_dangling_edges(con: sqlite3.Connection) -> int:
    """Late-bind edges whose target only entered the corpus after the edge did."""
    cur = con.execute("""
        UPDATE edges SET dst_standard_id = (
            SELECT id FROM standards WHERE standards.is_base = edges.dst_is_base
            ORDER BY year DESC LIMIT 1)
        WHERE dst_standard_id IS NULL""")
    return cur.rowcount


def stats(con: sqlite3.Connection) -> dict[str, Any]:
    q = lambda s: con.execute(s).fetchone()[0]
    return {
        "standards": q("SELECT COUNT(*) FROM standards"),
        "with_full_text": q("SELECT COUNT(*) FROM standards WHERE has_full_text=1"),
        "metadata_only": q("SELECT COUNT(*) FROM standards WHERE metadata_only=1"),
        "active": q("SELECT COUNT(*) FROM standards WHERE is_active=1"),
        "edges": q("SELECT COUNT(*) FROM edges"),
        "edges_confirmed": q("SELECT COUNT(*) FROM edges WHERE confidence='confirmed'"),
        "edges_inferred": q("SELECT COUNT(*) FROM edges WHERE confidence='inferred'"),
        "edges_dangling": q("SELECT COUNT(*) FROM edges WHERE dst_standard_id IS NULL"),
        "chunks": q("SELECT COUNT(*) FROM chunks"),
        "departments": q("SELECT COUNT(DISTINCT department) FROM standards"),
    }
