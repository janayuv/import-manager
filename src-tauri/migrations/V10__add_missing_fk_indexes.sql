-- Covering indexes for foreign key columns (improves FK checks, scans, and deletes)
CREATE INDEX IF NOT EXISTS idx_boe_calculations_shipment_id
  ON boe_calculations(shipment_id);

CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id
  ON expense_attachments(expense_id);

CREATE INDEX IF NOT EXISTS idx_expense_invoices_shipment_id
  ON expense_invoices(shipment_id);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_type_id
  ON expenses(expense_type_id);

CREATE INDEX IF NOT EXISTS idx_expenses_service_provider_id
  ON expenses(service_provider_id);

CREATE INDEX IF NOT EXISTS idx_expenses_shipment_id
  ON expenses(shipment_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_item_id
  ON invoice_line_items(item_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
  ON invoice_line_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoices_shipment_id
  ON invoices(shipment_id);

CREATE INDEX IF NOT EXISTS idx_items_supplier_id
  ON items(supplier_id);

CREATE INDEX IF NOT EXISTS idx_shipments_supplier_id
  ON shipments(supplier_id);
