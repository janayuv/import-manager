-- ERP activity traceability + retention default for dashboard_activity_log

ALTER TABLE dashboard_activity_log ADD COLUMN module_name TEXT NOT NULL DEFAULT '';
ALTER TABLE dashboard_activity_log ADD COLUMN record_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE dashboard_activity_log ADD COLUMN navigation_target TEXT NOT NULL DEFAULT '';
ALTER TABLE dashboard_activity_log ADD COLUMN action_context TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('dashboard_activity_retention_days', '90');
