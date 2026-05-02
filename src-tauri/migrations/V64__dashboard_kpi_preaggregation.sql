CREATE TABLE IF NOT EXISTS dashboard_kpi_snapshot (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    total_shipments INTEGER NOT NULL DEFAULT 0,
    pending_shipments INTEGER NOT NULL DEFAULT 0,
    delivered_shipments INTEGER NOT NULL DEFAULT 0,
    overdue_eta_count INTEGER NOT NULL DEFAULT 0,
    shipments_missing_boe INTEGER NOT NULL DEFAULT 0,
    shipments_missing_expense INTEGER NOT NULL DEFAULT 0,
    total_invoice_value REAL NOT NULL DEFAULT 0,
    total_expense_value REAL NOT NULL DEFAULT 0,
    total_duty_savings REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS dashboard_monthly_snapshot (
    snapshot_date TEXT NOT NULL,
    period TEXT NOT NULL,
    shipments INTEGER NOT NULL DEFAULT 0,
    value REAL NOT NULL DEFAULT 0,
    duty_savings REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    PRIMARY KEY (snapshot_date, period)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_monthly_snapshot_period
ON dashboard_monthly_snapshot (period);
