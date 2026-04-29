-- Optimize get_unfinalized_shipments() filtering and ordering path.
CREATE INDEX IF NOT EXISTS idx_shipments_frozen_date
ON shipments(is_frozen, invoice_date DESC);
