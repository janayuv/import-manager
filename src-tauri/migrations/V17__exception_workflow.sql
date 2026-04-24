-- Entity-level exception cases, resolution audit, lifecycle, notes, retention.

CREATE TABLE IF NOT EXISTS exception_cases (
    id TEXT PRIMARY KEY NOT NULL,
    exception_type TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'shipment',
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    assigned_to TEXT,
    assigned_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    resolved_by TEXT,
    resolved_at TEXT,
    sla_deadline TEXT,
    sla_status TEXT NOT NULL DEFAULT 'ON_TIME',
    last_viewed_at TEXT,
    FOREIGN KEY (entity_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exception_cases_entity
    ON exception_cases (exception_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_exception_cases_status_type
    ON exception_cases (status, exception_type);
CREATE INDEX IF NOT EXISTS idx_exception_cases_resolved_at
    ON exception_cases (resolved_at);

CREATE TABLE IF NOT EXISTS exception_resolution_log (
    resolution_id TEXT PRIMARY KEY NOT NULL,
    exception_case_id TEXT NOT NULL,
    exception_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL,
    resolved_by TEXT,
    resolved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (exception_case_id) REFERENCES exception_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exception_resolution_case
    ON exception_resolution_log (exception_case_id);

CREATE TABLE IF NOT EXISTS exception_lifecycle_events (
    id TEXT PRIMARY KEY NOT NULL,
    exception_case_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    user_id TEXT,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    FOREIGN KEY (exception_case_id) REFERENCES exception_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exception_lifecycle_case
    ON exception_lifecycle_events (exception_case_id, created_at);

CREATE TABLE IF NOT EXISTS exception_notes (
    note_id TEXT PRIMARY KEY NOT NULL,
    exception_case_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    note_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    FOREIGN KEY (exception_case_id) REFERENCES exception_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exception_notes_case
    ON exception_notes (exception_case_id, created_at);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('exception_retention_days', '365');
