-- V6: Add IPC-aligned tableName column (nullable); backfill from legacy table_name.
-- Existing rows keep table_name; new code can set both for consistency.

ALTER TABLE audit_logs ADD COLUMN "tableName" TEXT;

UPDATE audit_logs
SET "tableName" = table_name
WHERE "tableName" IS NULL AND table_name IS NOT NULL;
