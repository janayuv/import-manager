-- Shipment module reliability and query optimization indexes.
ALTER TABLE shipments
ADD COLUMN created_at TEXT;

UPDATE shipments
SET created_at = COALESCE(
    created_at,
    strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
);

CREATE INDEX IF NOT EXISTS idx_shipments_created_at
ON shipments(created_at);

CREATE INDEX IF NOT EXISTS idx_shipments_status
ON shipments(status);

CREATE INDEX IF NOT EXISTS idx_shipments_supplier
ON shipments(supplier_id);
