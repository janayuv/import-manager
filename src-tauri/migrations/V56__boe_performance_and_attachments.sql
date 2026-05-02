CREATE INDEX IF NOT EXISTS idx_boe_created_at
ON boe_calculations(created_at);

CREATE INDEX IF NOT EXISTS idx_boe_status
ON boe_calculations(status);

CREATE INDEX IF NOT EXISTS idx_boe_shipment_status
ON boe_calculations(shipment_id, status);

CREATE INDEX IF NOT EXISTS idx_boe_number
ON boe_details(be_number);

CREATE TABLE IF NOT EXISTS boe_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    boe_calculation_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    FOREIGN KEY (boe_calculation_id) REFERENCES boe_calculations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boe_attachments_calc_id
ON boe_attachments(boe_calculation_id);
