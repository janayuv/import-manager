-- Performance index review for invoice and shipment query paths.
-- Adds only missing high-impact indexes; existing FK indexes are already covered in V10.

CREATE INDEX IF NOT EXISTS idx_invoices_status
ON invoices(status);

CREATE INDEX IF NOT EXISTS idx_invoices_status_id
ON invoices(status, id);

CREATE INDEX IF NOT EXISTS idx_shipments_status
ON shipments(status);

CREATE INDEX IF NOT EXISTS idx_shipments_status_id
ON shipments(status, id);
