-- Template migration only (no data backfill yet).
-- Shipment items normalization prep for future dual-write migration.

CREATE TABLE IF NOT EXISTS shipment_items (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id
ON shipment_items(shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_items_item_id
ON shipment_items(item_id);
