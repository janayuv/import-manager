-- Last successful backup/restore instants (RFC 3339 UTC, set by the app on success)
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('last_backup_time', '');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('last_restore_time', '');
