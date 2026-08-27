"""Central paths and tunables. Import this rather than hardcoding paths."""
from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATA      = ROOT / "data"
RAW       = DATA / "raw"
LOGS      = DATA / "logs"
STORE     = DATA / "store"
DB_PATH   = Path(os.getenv("IS_DB_PATH", STORE / "standards.db"))
INDEX_DIR = Path(os.getenv("IS_INDEX_DIR", STORE / "faiss"))
for _d in (RAW, LOGS, STORE, INDEX_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# --- BIS catalogue API (reverse-engineered; see docs/INGESTION.md) ---
BIS_BASE  = "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/knowyourstandards/Indian_standards/"
BIS_UA    = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
BIS_PAGE_SIZE   = 1000
BIS_DELAY_SEC   = 1.5     # politeness delay between catalogue pages
ARCHIVE_DELAY   = 0.30    # politeness delay between archive.org fetches (~3 req/s)

# Departments for the initial vertical slice (electrical / electronics).
SUBSET_DEPARTMENTS = ["ETD", "LITD"]


def _flag(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


# --- demo scoping -----------------------------------------------------------
# The store can hold every BIS department while the running system answers from
# only a slice of it. This is a QUERY-TIME filter, not a delete: the rest of the
# corpus stays ingested and is restored by flipping one flag.
#
# Why it exists: full-text coverage is what the verification layer depends on.
# Ingesting all 17 departments at metadata level dropped coverage from 58% to
# 8.8%, so retrieval became title-matching across 33k titles and confident-but-
# wrong answers appeared. Scoping to the departments that actually have text
# restores the behaviour without throwing the wider catalogue away.
DEMO_STATUS = _flag("DEMO_STATUS", True)
DEMO_DEPARTMENTS = [d.strip().upper() for d in
                    os.getenv("DEMO_DEPARTMENTS", ",".join(SUBSET_DEPARTMENTS)).split(",")
                    if d.strip()]


def active_departments() -> list[str] | None:
    """Departments the running system may answer from; None means all of them."""
    return DEMO_DEPARTMENTS if (DEMO_STATUS and DEMO_DEPARTMENTS) else None

# --- knowledge base ---
EMBED_MODEL   = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
EMBED_DIM     = 384
CHUNK_CHARS   = 1800   # ~450 tokens: fills bge-small's 512-token window without truncation
CHUNK_OVERLAP = 250

# --- LLM ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# --- pipeline thresholds ---
RETRIEVAL_TOP_K      = 12
GRAPH_HOPS           = 2
ABSTAIN_THRESHOLD    = 0.55   # below this the pipeline MUST abstain, never guess
