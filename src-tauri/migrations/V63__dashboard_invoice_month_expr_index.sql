-- Helps dashboard monthly grouping by invoice month expression.
CREATE INDEX IF NOT EXISTS idx_shipments_invoice_month_expr
ON shipments (strftime('%Y-%m', invoice_date));
