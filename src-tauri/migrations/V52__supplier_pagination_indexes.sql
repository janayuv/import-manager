CREATE INDEX IF NOT EXISTS idx_suppliers_name_active
ON suppliers(supplier_name)
WHERE deleted_at IS NULL;
