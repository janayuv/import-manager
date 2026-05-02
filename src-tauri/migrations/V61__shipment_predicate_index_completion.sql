CREATE INDEX IF NOT EXISTS idx_shipments_eta
ON shipments(eta);

CREATE INDEX IF NOT EXISTS idx_shipments_status_date
ON shipments(status, invoice_date);

CREATE INDEX IF NOT EXISTS idx_boe_calculations_shipment_id
ON boe_calculations(shipment_id);

CREATE INDEX IF NOT EXISTS idx_expenses_shipment_id
ON expenses(shipment_id);
