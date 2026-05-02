-- Post-backup integrity validation metadata (local encrypted snapshots).
ALTER TABLE backups ADD COLUMN validation_status TEXT;
ALTER TABLE backups ADD COLUMN validation_checked_at TEXT;
ALTER TABLE backups ADD COLUMN validation_message TEXT;
