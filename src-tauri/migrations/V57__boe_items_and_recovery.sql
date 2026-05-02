CREATE TABLE IF NOT EXISTS boe_items (
    id TEXT PRIMARY KEY NOT NULL,
    boe_calculation_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    assessable_value REAL NOT NULL,
    bcd_rate REAL NOT NULL,
    sws_rate REAL NOT NULL,
    igst_rate REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (boe_calculation_id) REFERENCES boe_calculations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boe_items_calc_id
ON boe_items(boe_calculation_id);

CREATE TABLE IF NOT EXISTS boe_write_recovery (
    id TEXT PRIMARY KEY NOT NULL,
    boe_calculation_id TEXT,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_boe_write_recovery_status
ON boe_write_recovery(status);
