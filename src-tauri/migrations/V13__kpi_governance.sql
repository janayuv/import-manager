-- KPI governance: definitions registry and daily snapshot history for audit / trends.

CREATE TABLE IF NOT EXISTS kpi_metadata (
    kpi_name TEXT PRIMARY KEY NOT NULL,
    formula TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'count',
    last_updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS kpi_daily_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    kpi_name TEXT NOT NULL,
    value REAL NOT NULL,
    dimensions_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    UNIQUE (snapshot_date, kpi_name)
);

CREATE INDEX IF NOT EXISTS idx_kpi_daily_snapshots_date
    ON kpi_daily_snapshots (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_daily_snapshots_name
    ON kpi_daily_snapshots (kpi_name);

-- Seed definitions (governance / tooltips). Adjust formulas in DB as finance approves.
INSERT OR IGNORE INTO kpi_metadata (kpi_name, formula, description, unit, last_updated) VALUES
('total_shipments', 'COUNT(*) FROM shipments WHERE filters apply', 'Count of shipment rows in scope', 'count', datetime('now')),
('total_suppliers', 'COUNT(*) FROM suppliers', 'Active supplier directory size', 'count', datetime('now')),
('total_items', 'COUNT(*) FROM items', 'Item master row count', 'count', datetime('now')),
('pending_shipments', 'COUNT(*) WHERE status = ''docu-received''', 'Shipments in documentation received state', 'count', datetime('now')),
('delivered_shipments', 'COUNT(*) WHERE status = ''delivered''', 'Completed deliveries', 'count', datetime('now')),
('reconciled_boes', 'COUNT(*) FROM boe_calculations WHERE status = ''Reconciled''', 'BOE calculations marked reconciled', 'count', datetime('now')),
('total_invoice_value', 'SUM(invoice_value) FROM shipments in scope', 'Sum of shipment invoice values (mixed currency if not filtered)', 'mixed_currency', datetime('now')),
('avg_transit_days', 'AVG(julianday(delivery) - julianday(etd)) where ISO yyyy-MM-dd dates', 'Average calendar days from ETD to delivery when parseable', 'days', datetime('now')),
('expense_total', 'SUM(expenses.total_amount) for shipments in scope', 'Total expense lines including generated tax columns', 'INR', datetime('now')),
('duty_total', 'SUM(boe_details.duty_amount)', 'Sum of duty amounts on BOE detail records', 'INR', datetime('now')),
('total_duty_savings_estimate', 'Derived vs simplified duty model (see app logic)', 'Estimated savings vs reference duty rate; finance must validate', 'INR', datetime('now')),
('landed_cost_total', 'invoice_value + duty_total + expense_total (naive)', 'Naive landed cost sum for overview; not substitute for formal allocation', 'INR', datetime('now'));
