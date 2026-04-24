-- V6: IPC-aligned `tableName` on audit_logs (nullable); backfill from `table_name`.
-- Applied in Rust after all refinery migrations (`crate::db::ensure_audit_logs_table_name_column`).
SELECT 1;
