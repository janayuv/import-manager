-- Database-management performance indexes (safe, no behavior change).

-- Audit query acceleration for filtered + ordered log views.
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_action_created_at
ON audit_logs("tableName", action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at
ON audit_logs(user_id, created_at DESC);

-- Recycle-bin access path (deleted rows sorted by deleted_at).
CREATE INDEX IF NOT EXISTS idx_suppliers_deleted_at_id
ON suppliers(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_deleted_at_id
ON shipments(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_deleted_at_id
ON items(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at_id
ON invoices(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_boe_details_deleted_at_id
ON boe_details(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_boe_calculations_deleted_at_id
ON boe_calculations(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_providers_deleted_at_id
ON service_providers(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_types_deleted_at_id
ON expense_types(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_invoices_deleted_at_id
ON expense_invoices(deleted_at, id)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at_id
ON expenses(deleted_at, id)
WHERE deleted_at IS NOT NULL;
