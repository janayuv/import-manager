-- V0.2.2: AI invoice extraction — audit log of extraction attempts (no app logic in this migration).

CREATE TABLE IF NOT EXISTS ai_extraction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    file_hash TEXT NOT NULL,
    file_name TEXT NOT NULL,
    supplier_hint TEXT,
    provider_used TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    raw_ai_response TEXT,
    extracted_json TEXT,
    confidence_score REAL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);
