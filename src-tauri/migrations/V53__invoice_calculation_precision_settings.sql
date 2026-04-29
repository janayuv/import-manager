INSERT INTO app_settings (key, value, updated_at)
VALUES ('line_total_decimals', '2', datetime('now'))
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('invoice_total_decimals', '2', datetime('now'))
ON CONFLICT(key) DO NOTHING;
