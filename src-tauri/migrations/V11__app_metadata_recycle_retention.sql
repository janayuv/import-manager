-- Default retention for auto-purge of soft-deleted records (permanent delete after N days)
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('recycle_retention_days', '30');
