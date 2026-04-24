-- V4__db_management.sql
-- Migration for database management system
-- This migration adds audit logging, backup management, and scheduling tables

-- Audit logs table for tracking all data changes
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT,
    action TEXT NOT NULL, -- 'update'|'delete'|'insert'|'restore'|'backup'
    user_id TEXT,
    before_json TEXT,
    after_json TEXT,
    metadata TEXT, -- JSON string for additional context
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Backups table for tracking backup operations
CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    destination TEXT, -- 'local'|'s3'|'gdrive'
    size_bytes INTEGER,
    sha256 TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    retention_until DATETIME,
    notes TEXT,
    status TEXT DEFAULT 'completed', -- 'completed'|'failed'|'in_progress'
    error_message TEXT
);

-- Backup schedules table for managing scheduled backups
CREATE TABLE IF NOT EXISTS backup_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cron_expr TEXT, -- cron expression or humanized recurrence
    time_zone TEXT DEFAULT 'UTC',
    destination TEXT NOT NULL DEFAULT 'local',
    retention_count INTEGER DEFAULT 5, -- number of backups to keep
    retention_days INTEGER DEFAULT 30, -- days to keep backups
    enabled INTEGER DEFAULT 1,
    last_run DATETIME,
    next_run DATETIME,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- User roles table for permission management
CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL, -- 'admin'|'db_manager'|'user'|'viewer'
    permissions TEXT, -- JSON string of specific permissions
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Soft-delete columns and idx_*_deleted_at indexes are created in Rust after all refinery
-- migrations complete (see `post_refinery_migrations` in src/migrations.rs).

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_backups_destination ON backups(destination);
CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);

CREATE INDEX IF NOT EXISTS idx_backup_schedules_enabled ON backup_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_backup_schedules_next_run ON backup_schedules(next_run);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
