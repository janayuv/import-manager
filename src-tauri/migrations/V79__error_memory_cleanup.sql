CREATE TABLE IF NOT EXISTS error_memory_pruned_groups (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    prune_reason TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_memory_pruned_groups_run
    ON error_memory_pruned_groups (run_id);
CREATE INDEX IF NOT EXISTS idx_error_memory_pruned_groups_fingerprint
    ON error_memory_pruned_groups (fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_memory_pruned_groups_created_at
    ON error_memory_pruned_groups (datetime(created_at) DESC);

CREATE TABLE IF NOT EXISTS error_memory_cleanup_runs (
    id TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL,
    trigger_source TEXT NOT NULL,
    dry_run INTEGER NOT NULL DEFAULT 0,
    total_before INTEGER NOT NULL DEFAULT 0,
    total_after INTEGER NOT NULL DEFAULT 0,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    deleted_count INTEGER NOT NULL DEFAULT 0,
    protected_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_memory_cleanup_runs_executed
    ON error_memory_cleanup_runs (datetime(executed_at) DESC);
