-- Cumulative backup/restore counters (observability; incremented by the app on success)
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('backup_count', '0');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('restore_count', '0');
