CREATE TABLE IF NOT EXISTS write_recovery_journal (
    id TEXT PRIMARY KEY NOT NULL,
    module TEXT NOT NULL,
    operation TEXT NOT NULL,
    entity_id TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_write_recovery_journal_status
ON write_recovery_journal(status);

CREATE TABLE IF NOT EXISTS index_recommendation_history (
    id TEXT PRIMARY KEY NOT NULL,
    recommendation_sql TEXT NOT NULL,
    source_query TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);
