-- Daily high-level counts for operational validation (no prediction logic).
CREATE TABLE IF NOT EXISTS system_integrity_snapshot (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    details_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_integrity_snapshot_updated
    ON system_integrity_snapshot (datetime(updated_at) DESC);
