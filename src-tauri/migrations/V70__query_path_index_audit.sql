-- Query-path index audit: composites for report/dashboard/BOE/expense hot paths.
-- See dashboard_metrics (report_view duty join, monthly JSON BOE), reports.rs (report_view),
-- shipment aggregates (supplier + date), invoice_line_items joins.
--
-- EXPLAIN validation (representative predicates, SQLite 3.46+):
--   boe_calculations: SEARCH USING COVERING INDEX idx_boe_calculations_shipment_id_status
--     (shipment_id=? AND status=?)
--   invoice_line_items: SEARCH USING COVERING INDEX idx_invoice_line_items_invoice_id_item_id
--     (invoice_id=? AND item_id=?)
--   shipments: SEARCH USING INDEX idx_shipments_supplier_id_invoice_date
--     (supplier_id=? AND invoice_date>? AND invoice_date<?)

-- Invoice line composite: matches JOIN invoice_line_items ON (invoice_id, item_id)
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id_item_id
ON invoice_line_items (invoice_id, item_id);

-- BOE: correlated subqueries / anti-joins on shipment_id + status (e.g. Reconciled JSON extract)
CREATE INDEX IF NOT EXISTS idx_boe_calculations_shipment_id_status
ON boe_calculations (shipment_id, status);

-- Shipments: supplier-scoped date-range filters (dashboard KPI snapshot, paginated lists)
CREATE INDEX IF NOT EXISTS idx_shipments_supplier_id_invoice_date
ON shipments (supplier_id, invoice_date);

-- Duplicate index cleanup: same column as idx_shipments_supplier_id (V10); keep FK-style name.
DROP INDEX IF EXISTS idx_shipments_supplier;
