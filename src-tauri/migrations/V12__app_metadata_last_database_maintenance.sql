-- Last time ANALYZE/VACUUM maintenance ran (ISO-8601); empty until first run
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('last_database_maintenance', '');
