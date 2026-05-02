-- Restore simulation / periodic restorability test results (local backups).
ALTER TABLE backups ADD COLUMN restore_simulation_status TEXT;
ALTER TABLE backups ADD COLUMN restore_simulation_checked_at TEXT;
ALTER TABLE backups ADD COLUMN restore_simulation_message TEXT;
