-- ============================================================
-- IS Recommendation Engine — canonical store
-- Every downstream claim must trace back to a row in `standards`
-- and a passage in `chunks`. Nothing is asserted without a source.
-- ============================================================

CREATE TABLE IF NOT EXISTS standards (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    is_number           TEXT    NOT NULL UNIQUE,  -- canonical: "IS 732:1989", "IS 1554 (Part 1):1988"
    is_base             TEXT    NOT NULL,         -- "IS 732"  (for currency comparison across years)
    part                TEXT,                     -- "1" / "5" / NULL
    section             TEXT,                     -- Sec-level split, rare but exists
    year                INTEGER,                  -- publication / revision year
    title               TEXT    NOT NULL,
    technical_committee TEXT,                     -- e.g. "ETD 09", "LITD 10"
    department          TEXT,                     -- derived prefix: "ETD", "LITD", "CED", "FAD"
    aspect              TEXT,
    amendments          TEXT,                     -- raw amendment string from BIS catalogue
    amendment_count     INTEGER DEFAULT 0,
    status_note         TEXT,                     -- "(Active)" / reaffirmation remark from catalogue
    withdrawn_status    TEXT,                     -- 'W' = withdrawn (BIS renders these red)
    is_active           INTEGER NOT NULL DEFAULT 1,
    iso_equivalence     TEXT,                     -- the equivalent ISO/IEC doc, e.g. "IEC 60691:2023"
    iso_equiv_degree    TEXT,                     -- BIS field misnamed 'referirmatin_year' in their API:
                                                  -- Identical under single/dual numbering | Modified/
                                                  -- Technically Equivalent | Indigenous | Not Equivalent

    -- provenance / trust
    source              TEXT    NOT NULL,         -- 'bis_catalogue' | 'archive_org'
    archive_identifier  TEXT,                     -- gov.in.is.732.1989
    archive_checked     INTEGER NOT NULL DEFAULT 0,  -- 1 = archive.org already searched.
                                                  -- Set even when nothing was found, so a
                                                  -- later run does not re-query thousands
                                                  -- of standards that have no mirror.
    has_full_text       INTEGER NOT NULL DEFAULT 0,
    full_text_year      INTEGER,                  -- edition the ingested TEXT came from.
                                                  -- May differ from `year`: archive.org does
                                                  -- not mirror every edition. When it differs
                                                  -- the mismatch MUST be surfaced, because the
                                                  -- text is not the edition being cited.
    full_text           TEXT,
    full_text_chars     INTEGER DEFAULT 0,
    metadata_only       INTEGER NOT NULL DEFAULT 1,  -- 1 => lower-confidence source, must be surfaced
    scraped_at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_std_base  ON standards(is_base);
CREATE INDEX IF NOT EXISTS idx_std_dept  ON standards(department);
CREATE INDEX IF NOT EXISTS idx_std_ft    ON standards(has_full_text);

-- ------------------------------------------------------------
-- Dependency graph edges. `confidence` distinguishes an edge read
-- out of a real "Normative References" clause from one merely
-- inferred from committee/title overlap. Never conflate the two.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edges (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    src_standard_id   INTEGER NOT NULL REFERENCES standards(id),
    dst_is_base       TEXT    NOT NULL,   -- always resolvable by base number
    dst_standard_id   INTEGER REFERENCES standards(id),  -- NULL if not in our corpus yet
    edge_type         TEXT    NOT NULL,   -- normative_reference|test_method|terminology|safety|related
    confidence        TEXT    NOT NULL,   -- 'confirmed' (from full text) | 'inferred' (heuristic)
    evidence_section  TEXT,               -- e.g. "Clause 2 Normative References"
    evidence_snippet  TEXT,               -- verbatim source text proving the edge
    created_at        TEXT    NOT NULL,
    UNIQUE(src_standard_id, dst_is_base, edge_type)
);
CREATE INDEX IF NOT EXISTS idx_edge_src ON edges(src_standard_id);
CREATE INDEX IF NOT EXISTS idx_edge_dst ON edges(dst_standard_id);

-- ------------------------------------------------------------
-- Chunks are the citation unit. A recommendation cites chunk ids;
-- the critic re-reads these exact rows to verify grounding.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunks (
    id            TEXT PRIMARY KEY,        -- "IS 732:1989#c012"
    standard_id   INTEGER NOT NULL REFERENCES standards(id),
    chunk_index   INTEGER NOT NULL,
    section       TEXT,                    -- best-effort clause heading
    text          TEXT NOT NULL,
    char_start    INTEGER,
    char_end      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chunk_std ON chunks(standard_id);

-- ------------------------------------------------------------
-- Certification scheme rules (BIS Product Certification / CRS /
-- Hallmarking). Starts as a curated table, refined later.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certification_rules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    scheme       TEXT NOT NULL,       -- 'BIS_PRODUCT_CERT' | 'CRS' | 'HALLMARKING'
    match_type   TEXT NOT NULL,       -- 'is_base' | 'department' | 'keyword'
    match_value  TEXT NOT NULL,
    mandatory    INTEGER NOT NULL DEFAULT 1,
    authority    TEXT,                -- QCO / notification reference
    notes        TEXT,
    source_url   TEXT,
    UNIQUE(scheme, match_type, match_value)
);

-- ------------------------------------------------------------
-- Ingestion audit log — exportable, so the dataset build is
-- inspectable rather than a black box.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id     TEXT NOT NULL,
    phase      TEXT NOT NULL,      -- 'catalogue' | 'fulltext' | 'graph' | 'embed'
    target     TEXT,
    status     TEXT NOT NULL,      -- 'ok' | 'skip' | 'error'
    message    TEXT,
    ts         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_run ON scrape_log(run_id, phase);
