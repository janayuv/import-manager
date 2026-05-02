CREATE TABLE IF NOT EXISTS shipment_date_normalization_audit (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    old_invoice_date TEXT NOT NULL,
    new_invoice_date TEXT NOT NULL,
    old_eta TEXT,
    new_eta TEXT,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_shipment_date_norm_audit_batch
ON shipment_date_normalization_audit(batch_id);

CREATE INDEX IF NOT EXISTS idx_shipment_date_norm_audit_shipment
ON shipment_date_normalization_audit(shipment_id);

CREATE TABLE IF NOT EXISTS shipment_query_plan_baseline (
    id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    findings_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);
