-- V0.2.3: read-heavy query paths (duplicate check, supplier/item match, analytics)
CREATE INDEX IF NOT EXISTS idx_shipments_supplier_invoice
ON shipments (
  supplier_id,
  invoice_number,
  invoice_date
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name
ON suppliers (
  supplier_name
);

CREATE INDEX IF NOT EXISTS idx_items_part_number
ON items (
  part_number
);

CREATE INDEX IF NOT EXISTS idx_ai_extraction_log_created
ON ai_extraction_log (
  created_at
);
