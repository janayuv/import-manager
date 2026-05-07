CREATE TABLE IF NOT EXISTS error_memory (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    app_version TEXT,
    build_version TEXT,
    environment TEXT,
    module_name TEXT,
    command_name TEXT,
    page_name TEXT,
    component_name TEXT,
    error_code TEXT,
    error_category TEXT,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    source_file TEXT,
    source_function TEXT,
    user_action TEXT,
    redacted_input_context TEXT,
    affected_entity_ids TEXT,
    severity TEXT NOT NULL DEFAULT 'error',
    recoverable INTEGER NOT NULL DEFAULT 0,
    retryable INTEGER NOT NULL DEFAULT 0,
    app_state_snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    ai_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_memory_last_seen_desc
    ON error_memory (datetime(last_seen_at) DESC);
CREATE INDEX IF NOT EXISTS idx_error_memory_status
    ON error_memory (status);
CREATE INDEX IF NOT EXISTS idx_error_memory_severity
    ON error_memory (severity);
CREATE INDEX IF NOT EXISTS idx_error_memory_module
    ON error_memory (module_name);
CREATE INDEX IF NOT EXISTS idx_error_memory_command
    ON error_memory (command_name);
