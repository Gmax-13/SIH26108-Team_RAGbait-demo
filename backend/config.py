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
