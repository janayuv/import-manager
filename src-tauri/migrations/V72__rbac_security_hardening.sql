-- V72__rbac_security_hardening.sql
-- Role/permission and authentication hardening.
--   * Reconciles `user_roles` schema drift (`created_by`, `updated_by` columns).
--   * Adds tables for failed login attempts and admin password history.
--   * Seeds default security policy values into `app_settings`.
--   * Role-name normalization (admin -> administrator etc.) is performed in Rust
--     post-refinery (see `migrations::normalize_user_roles_canonical`).

-- Idempotent column additions for `user_roles`. SQLite has no IF NOT EXISTS for
-- ALTER TABLE; Rust `post_refinery_migrations` re-adds these defensively if the
-- column ever drifts.
ALTER TABLE user_roles ADD COLUMN created_by TEXT;
ALTER TABLE user_roles ADD COLUMN updated_by TEXT;

CREATE TABLE IF NOT EXISTS auth_failed_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    source TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_failed_attempts_user_time
    ON auth_failed_attempts (user_id, attempted_at);

CREATE TABLE IF NOT EXISTS auth_password_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    replaced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_password_history_user
    ON auth_password_history (user_id, replaced_at);

INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
    ('auth.idle_timeout_minutes',    '30', datetime('now')),
    ('auth.lockout_threshold',       '5',  datetime('now')),
    ('auth.lockout_window_minutes',  '15', datetime('now')),
    ('auth.lockout_duration_minutes','30', datetime('now'));
