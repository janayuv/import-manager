CREATE TABLE IF NOT EXISTS dashboard_exception_snapshot (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    missing_boe_count INTEGER NOT NULL DEFAULT 0,
    missing_expense_count INTEGER NOT NULL DEFAULT 0,
    overdue_eta_count INTEGER NOT NULL DEFAULT 0,
    open_exception_count INTEGER NOT NULL DEFAULT 0,
    sla_breach_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS dashboard_exception_sample_cache (
    snapshot_date TEXT NOT NULL,
    sample_kind TEXT NOT NULL,
    shipment_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    PRIMARY KEY (snapshot_date, sample_kind)
);
