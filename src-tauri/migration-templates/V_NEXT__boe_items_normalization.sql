-- TEMPLATE ONLY (not executed by refinery)
-- Future BOE item normalization plan while keeping JSON fields for backward compatibility.

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
