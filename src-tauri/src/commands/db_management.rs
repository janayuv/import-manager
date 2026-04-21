// Suppress naming convention warnings for Tauri interop
#![allow(non_snake_case)]

use crate::db::DbState;
use chrono::Utc;
use cron::Schedule;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::str::FromStr;
use tauri::AppHandle;
use tauri::Manager;
use tauri::State;
use tauri::WebviewWindow;

/// Six-field cron (sec min hour day-of-month month day-of-week), UTC. Used by `cron` crate.
fn compute_next_run_rfc3339(cron_expr: &str) -> Result<String, String> {
    let schedule = Schedule::from_str(cron_expr.trim())
        .map_err(|e| format!("Invalid schedule: {}", e))?;
    let next = schedule
        .upcoming(Utc)
        .next()
        .ok_or_else(|| "No upcoming runs for this cron expression".to_string())?;
    Ok(next.to_rfc3339())
}

/// Runs every minute from a background thread; executes due backup schedules.
pub async fn tick_backup_schedules(app: AppHandle) {
    if let Err(e) = run_due_backup_schedules(app).await {
        log::warn!("backup schedule tick failed: {}", e);
    }
}

async fn run_due_backup_schedules(app: AppHandle) -> Result<(), String> {
    if crate::restore_control::background_jobs_paused() {
        return Ok(());
    }
    let db_state: State<'_, DbState> = app.state();
    let now = Utc::now().to_rfc3339();
    let due_ids: Vec<i64> = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare(
                "SELECT id FROM backup_schedules WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![&now], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    for schedule_id in due_ids {
        if let Err(e) =
            run_scheduled_backup(db_state.clone(), schedule_id, Some("scheduler".to_string())).await
        {
            log::warn!(
                "scheduled backup id {} failed: {}",
                schedule_id,
                e
            );
        }
    }
    Ok(())
}

struct TempFileGuard(Option<PathBuf>);

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if let Some(p) = self.0.take() {
            let _ = fs::remove_file(p);
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: Option<i64>,
    pub table_name: String,
    pub row_id: Option<String>,
    pub action: String,
    pub user_id: Option<String>,
    pub before_json: Option<String>,
    pub after_json: Option<String>,
    pub metadata: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: Option<i64>,
    pub filename: String,
    pub path: String,
    pub destination: String,
    pub size_bytes: Option<i64>,
    pub sha256: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub retention_until: Option<String>,
    pub notes: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSchedule {
    pub id: Option<i64>,
    pub name: String,
    pub cron_expr: Option<String>,
    pub time_zone: String,
    pub destination: String,
    pub retention_count: i32,
    pub retention_days: i32,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupRequest {
    pub destination: String,
    pub filename: Option<String>,
    pub include_wal: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreRequest {
    pub backupPath: String,
    pub dry_run: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestorePreview {
    pub backup_info: BackupInfo,
    pub current_db_stats: DatabaseStats,
    pub integrity_check: String,
    pub schema_compatibility: bool,
    pub estimated_changes: HashMap<String, i64>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub message: String,
    pub backup_created: Option<String>,
    pub integrity_check: String,
    pub tables_affected: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableData {
    pub tableName: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub totalCount: i64,
    pub page: i64,
    pub pageSize: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecordUpdate {
    pub tableName: String,
    pub record_id: String,
    pub updates: HashMap<String, serde_json::Value>,
    pub userId: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateResult {
    pub success: bool,
    pub message: String,
    pub changes: HashMap<String, serde_json::Value>,
    pub audit_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseStats {
    pub db_size_bytes: i64,
    pub table_counts: HashMap<String, i64>,
    pub last_backup: Option<String>,
    pub next_scheduled_backup: Option<String>,
    pub encryption_status: String,
}

// Create audit log entry
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_audit_log(
    db_state: State<'_, DbState>,
    tableName: String,
    row_id: Option<String>,
    action: String,
    userId: Option<String>,
    before_json: Option<String>,
    after_json: Option<String>,
    metadata: Option<String>,
) -> Result<i64, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare(
            r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, before_json, after_json, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .map_err(|e| e.to_string())?;

    let id = stmt
        .insert(params![
            tableName.clone(),
            tableName,
            row_id,
            action,
            userId,
            before_json,
            after_json,
            metadata
        ])
        .map_err(|e| e.to_string())?;

    Ok(id)
}

// Get audit logs with pagination and filtering
#[tauri::command]
pub async fn get_audit_logs(
    db_state: State<'_, DbState>,
    tableName: Option<String>,
    action: Option<String>,
    userId: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<AuditLog>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let mut query = "SELECT id, COALESCE(\"tableName\", table_name) AS table_name, row_id, action, user_id, before_json, after_json, metadata, created_at FROM audit_logs WHERE 1=1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(table) = &tableName {
        query.push_str(" AND COALESCE(\"tableName\", table_name) = ?");
        params.push(Box::new(table.clone()));
    }

    if let Some(act) = &action {
        query.push_str(" AND action = ?");
        params.push(Box::new(act.clone()));
    }

    if let Some(user) = &userId {
        query.push_str(" AND user_id = ?");
        params.push(Box::new(user.clone()));
    }

    query.push_str(" ORDER BY created_at DESC");

    if let Some(lim) = limit {
        query.push_str(" LIMIT ?");
        params.push(Box::new(lim));
    }

    if let Some(off) = offset {
        query.push_str(" OFFSET ?");
        params.push(Box::new(off));
    }

    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(&param_refs[..], |row| {
            Ok(AuditLog {
                id: Some(row.get(0)?),
                table_name: row.get(1)?,
                row_id: row.get(2)?,
                action: row.get(3)?,
                user_id: row.get(4)?,
                before_json: row.get(5)?,
                after_json: row.get(6)?,
                metadata: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut audit_logs = Vec::new();
    for row in rows {
        audit_logs.push(row.map_err(|e| e.to_string())?);
    }

    Ok(audit_logs)
}

// Get database statistics
#[tauri::command]
pub async fn get_database_stats(db_state: State<'_, DbState>) -> Result<DatabaseStats, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Get database file size
    let db_size_bytes = if let Some(path) = db.path() {
        fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0)
    } else {
        0
    };

    // Get table counts
    let tables = vec![
        "suppliers",
        "shipments",
        "items",
        "invoices",
        "invoice_line_items",
        "boe_details",
        "boe_calculations",
        "service_providers",
        "expense_types",
        "expense_invoices",
        "expenses",
        "notifications",
        "audit_logs",
        "backups",
    ];

    let mut table_counts = HashMap::new();
    for table in tables {
        let query = format!("SELECT COUNT(*) FROM {} WHERE deleted_at IS NULL", table);
        let count: i64 = db.query_row(&query, [], |row| row.get(0)).unwrap_or(0);
        table_counts.insert(table.to_string(), count);
    }

    // Get last backup info
    let last_backup: Option<String> = db
        .query_row(
            "SELECT created_at FROM backups WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get(0)
        )
        .ok();

    // Get next scheduled backup
    let next_scheduled_backup: Option<String> = db
        .query_row(
            "SELECT next_run FROM backup_schedules WHERE enabled = 1 ORDER BY next_run ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(DatabaseStats {
        db_size_bytes,
        table_counts,
        last_backup,
        next_scheduled_backup,
        encryption_status: "None".to_string(), // TODO: Implement encryption detection
    })
}

// Create backup
#[tauri::command]
pub async fn create_backup(
    window: WebviewWindow,
    db_state: State<'_, DbState>,
    request: BackupRequest,
    userId: Option<String>,
) -> Result<BackupInfo, String> {
    create_backup_impl(db_state, request, userId, Some(window)).await
}

async fn create_backup_impl(
    db_state: State<'_, DbState>,
    request: BackupRequest,
    userId: Option<String>,
    window: Option<WebviewWindow>,
) -> Result<BackupInfo, String> {
    let filename = request.filename.clone().unwrap_or_else(|| {
        let now = chrono::Local::now();
        format!("import-manager-backup-{}.db", now.format("%Y%m%d-%H%M%S"))
    });

    let data_dir = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map(|home| Path::new(&home).join("ImportManager").join("backups"))
        .unwrap_or_else(|_| Path::new("./backups").to_path_buf());

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }

    let staging_path = data_dir.join(&filename);

    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let source_path = db.path().ok_or("Could not get database path")?;
        fs::copy(source_path, &staging_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    let size_bytes = fs::metadata(&staging_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let sha256 = None;

    let (record_path, destination_value) = match request.destination.as_str() {
        "local" => (
            staging_path.to_string_lossy().to_string(),
            "local".to_string(),
        ),
        "google_drive" => {
            if !super::google_drive::is_configured() {
                fs::remove_file(&staging_path).ok();
                return Err(
                    "Google Drive is not configured for this build (set IMPORT_MANAGER_GOOGLE_CLIENT_ID)."
                        .to_string(),
                );
            }
            if !super::google_drive::has_refresh_token() {
                fs::remove_file(&staging_path).ok();
                return Err(
                    "Not connected to Google Drive. Connect your account first (Database Management → Backup)."
                        .to_string(),
                );
            }
            let file_id = super::google_drive::upload_backup_file(
                &staging_path,
                &filename,
                window.as_ref(),
            )
            .await
            .map_err(|e| {
                fs::remove_file(&staging_path).ok();
                super::google_drive::parse_friendly_error(&e)
            })?;
            fs::remove_file(&staging_path).ok();
            (
                format!("{}{}", super::google_drive::GDRIVE_PATH_PREFIX, file_id),
                "google_drive".to_string(),
            )
        }
        _ => {
            fs::remove_file(&staging_path).ok();
            return Err("Unsupported backup destination".to_string());
        }
    };

    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare("INSERT INTO backups (filename, path, destination, size_bytes, sha256, created_by, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .map_err(|e| e.to_string())?;

    let backup_id = stmt
        .insert(params![
            filename.clone(),
            record_path.clone(),
            destination_value,
            size_bytes,
            sha256,
            userId.clone(),
            request.notes.clone(),
            "completed"
        ])
        .map_err(|e| e.to_string())?;

    let audit_metadata = format!(
        "{{\"filename\": \"{}\", \"size_bytes\": {}}}",
        filename, size_bytes
    );
    crate::db::try_audit_log_metadata(
        &db,
        "backups",
        &backup_id.to_string(),
        "backup",
        userId.as_deref(),
        &audit_metadata,
    );

    Ok(BackupInfo {
        id: Some(backup_id),
        filename,
        path: record_path,
        destination: request.destination,
        size_bytes: Some(size_bytes),
        sha256,
        created_by: userId,
        created_at: chrono::Local::now().to_rfc3339(),
        retention_until: None,
        notes: request.notes,
        status: "completed".to_string(),
        error_message: None,
    })
}

async fn resolve_backup_to_local_path(
    backup_path: &str,
    window: Option<&WebviewWindow>,
) -> Result<(PathBuf, Option<PathBuf>), String> {
    if backup_path.starts_with(super::google_drive::GDRIVE_PATH_PREFIX) {
        let id = backup_path
            .strip_prefix(super::google_drive::GDRIVE_PATH_PREFIX)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Invalid Google Drive backup reference".to_string())?;
        let tmp = std::env::temp_dir().join(format!(
            "import-manager-gdrive-restore-{}.db",
            uuid::Uuid::new_v4()
        ));
        log::info!(
            target: "import_manager::restore",
            "event=gdrive_download_start file_id={}",
            id
        );
        super::google_drive::download_file_by_id(id, &tmp, window)
            .await
            .map_err(|e| super::google_drive::parse_friendly_error(&e))?;
        log::info!(
            target: "import_manager::restore",
            "event=gdrive_download_finish path={:?}",
            tmp
        );
        Ok((tmp.clone(), Some(tmp)))
    } else {
        if !Path::new(backup_path).exists() {
            return Err("Backup file does not exist".to_string());
        }
        Ok((PathBuf::from(backup_path), None))
    }
}

// Get backup history
#[tauri::command]
pub async fn get_backup_history(
    db_state: State<'_, DbState>,
    limit: Option<i64>,
) -> Result<Vec<BackupInfo>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let query = "SELECT id, filename, path, destination, size_bytes, sha256, created_by, created_at, retention_until, notes, status, error_message 
                 FROM backups ORDER BY created_at DESC";

    let query = if let Some(lim) = limit {
        format!("{} LIMIT {}", query, lim)
    } else {
        query.to_string()
    };

    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BackupInfo {
                id: Some(row.get(0)?),
                filename: row.get(1)?,
                path: row.get(2)?,
                destination: row.get(3)?,
                size_bytes: row.get(4)?,
                sha256: row.get(5)?,
                created_by: row.get(6)?,
                created_at: row.get(7)?,
                retention_until: row.get(8)?,
                notes: row.get(9)?,
                status: row.get(10)?,
                error_message: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut backups = Vec::new();
    for row in rows {
        backups.push(row.map_err(|e| e.to_string())?);
    }

    Ok(backups)
}

// Soft delete record
#[tauri::command]
pub async fn soft_delete_record(
    db_state: State<'_, DbState>,
    tableName: String,
    record_id: String,
    userId: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Get current record for audit log
    let before_json = format!(
        "{{\"id\": \"{}\", \"table\": \"{}\"}}",
        record_id, tableName
    );

    // Perform soft delete
    let query = format!(
        "UPDATE {} SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?",
        tableName
    );
    db.execute(&query, params![userId, record_id])
        .map_err(|e| e.to_string())?;

    // Create audit log entry
    let tn = tableName.as_str();
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, before_json, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)"#,
        params![
            tn,
            tn,
            record_id,
            "delete",
            userId,
            before_json,
            "{\"type\": \"soft_delete\"}"
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Hard delete record (admin only)
#[tauri::command]
pub async fn hard_delete_record(
    db_state: State<'_, DbState>,
    tableName: String,
    record_id: String,
    userId: Option<String>,
    confirmation: String,
) -> Result<(), String> {
    if confirmation != "DELETE" {
        return Err("Invalid confirmation. Type 'DELETE' to confirm.".to_string());
    }

    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Get current record for audit log
    let before_json = format!(
        "{{\"id\": \"{}\", \"table\": \"{}\"}}",
        record_id, tableName
    );

    // Perform hard delete
    let query = format!("DELETE FROM {} WHERE id = ?", tableName);
    db.execute(&query, params![record_id])
        .map_err(|e| e.to_string())?;

    // Create audit log entry
    let tn = tableName.as_str();
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, before_json, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)"#,
        params![
            tn,
            tn,
            record_id,
            "hard_delete",
            userId,
            before_json,
            "{\"type\": \"hard_delete\"}"
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Preview restore operation (dry-run)
#[tauri::command]
pub async fn preview_restore(
    window: WebviewWindow,
    db_state: State<'_, DbState>,
    backupPath: String,
) -> Result<RestorePreview, String> {
    let (local_path, temp_dl) =
        resolve_backup_to_local_path(&backupPath, Some(&window)).await?;
    let _temp_guard = TempFileGuard(temp_dl);

    // Get backup info from database
    let backup_info = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT id, filename, path, destination, size_bytes, sha256, created_by, created_at, retention_until, notes, status, error_message FROM backups WHERE path = ?",
            params![backupPath],
            |row| {
                Ok(BackupInfo {
                    id: Some(row.get(0)?),
                    filename: row.get(1)?,
                    path: row.get(2)?,
                    destination: row.get(3)?,
                    size_bytes: row.get(4)?,
                    sha256: row.get(5)?,
                    created_by: row.get(6)?,
                    created_at: row.get(7)?,
                    retention_until: row.get(8)?,
                    notes: row.get(9)?,
                    status: row.get(10)?,
                    error_message: row.get(11)?,
                })
            }
        ).map_err(|e| format!("Backup not found in database: {}", e))?
    };

    // Get current database stats
    let current_stats = get_database_stats(db_state.clone()).await?;

    // Check backup file integrity
    let backup_size = fs::metadata(&local_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let integrity_check = if backup_size == backup_info.size_bytes.unwrap_or(0) {
        "Backup file size matches recorded size".to_string()
    } else {
        "WARNING: Backup file size does not match recorded size".to_string()
    };

    // Check schema compatibility by opening backup database
    let local_str = local_path.to_string_lossy().to_string();
    let schema_compatibility = check_schema_compatibility(&local_str)?;

    // Estimate changes by comparing table counts
    let mut estimated_changes = HashMap::new();
    let mut warnings = Vec::new();

    // Try to get table counts from backup (simplified approach)
    if let Ok(backup_conn) = Connection::open(&local_path) {
        let tables = vec![
            "suppliers",
            "shipments",
            "items",
            "invoices",
            "invoice_line_items",
            "boe_details",
            "boe_calculations",
            "service_providers",
            "expense_types",
            "expense_invoices",
            "expenses",
            "notifications",
            "audit_logs",
            "backups",
        ];

        for table in tables {
            let backup_count: i64 = backup_conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM {} WHERE deleted_at IS NULL", table),
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let current_count = current_stats.table_counts.get(table).unwrap_or(&0);
            let change = backup_count - current_count;

            if change != 0 {
                estimated_changes.insert(table.to_string(), change);
            }
        }
    } else {
        warnings.push("Could not open backup database for detailed analysis".to_string());
    }

    // Add warnings based on analysis
    if !schema_compatibility {
        warnings.push("Schema compatibility issues detected".to_string());
    }

    if backup_info.status != "completed" {
        warnings.push(format!(
            "Backup status is '{}', not 'completed'",
            backup_info.status
        ));
    }

    Ok(RestorePreview {
        backup_info,
        current_db_stats: current_stats,
        integrity_check,
        schema_compatibility,
        estimated_changes,
        warnings,
    })
}

/// Tables copied during restore (must exist in backup for validation).
const RESTORE_TABLES: &[&str] = &[
    "suppliers",
    "shipments",
    "items",
    "invoices",
    "invoice_line_items",
    "boe_details",
    "boe_calculations",
    "service_providers",
    "expense_types",
    "expense_invoices",
    "expenses",
    "notifications",
    "audit_logs",
    "backups",
];

fn restore_log_ts() -> String {
    chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string()
}

/// Double-quote a SQLite identifier (escape internal `"` as `""`).
fn sqlite_double_quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// `PRAGMA table_info(table)` for the main / default schema.
fn pragma_table_info_main(table: &str) -> String {
    format!("PRAGMA table_info({})", sqlite_double_quote_ident(table))
}

/// `PRAGMA schema.table_info(table)` for an attached database (NOT `table_info(schema.table)`).
fn pragma_table_info_attached(schema: &str, table: &str) -> String {
    format!(
        "PRAGMA {}.table_info({})",
        schema,
        sqlite_double_quote_ident(table)
    )
}

/// `PRAGMA index_list(table)` on the main / default schema.
fn pragma_index_list_main(table: &str) -> String {
    format!("PRAGMA index_list({})", sqlite_double_quote_ident(table))
}

/// `PRAGMA schema.index_list(table)` for an attached database.
fn pragma_index_list_attached(schema: &str, table: &str) -> String {
    format!(
        "PRAGMA {}.index_list({})",
        schema,
        sqlite_double_quote_ident(table)
    )
}

/// Count rows returned by a PRAGMA statement (e.g. `index_list`, `table_info`).
fn count_pragma_rows(conn: &Connection, pragma_sql: &str) -> Result<usize, String> {
    let mut stmt = conn
        .prepare(pragma_sql)
        .map_err(|e| format!("PRAGMA prepare failed [{}]: {}", pragma_sql, e))?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut n = 0usize;
    while rows.next().map_err(|e| e.to_string())?.is_some() {
        n += 1;
    }
    Ok(n)
}

/// After data restore, compare index counts between main and attached backup (schema sanity).
fn log_index_count_comparison(
    conn: &Connection,
    backup_schema: &str,
    tables: &[&str],
) -> Result<(), String> {
    for table in tables {
        let exists: i64 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {}.sqlite_master WHERE type='table' AND name=?",
                    backup_schema
                ),
                params![*table],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            continue;
        }

        let main_sql = pragma_index_list_main(table);
        let backup_sql = pragma_index_list_attached(backup_schema, table);
        let n_main = count_pragma_rows(conn, &main_sql)?;
        let n_backup = count_pragma_rows(conn, &backup_sql)?;

        if n_main != n_backup {
            log::warn!(
                target: "import_manager::restore",
                "[{}] Index count mismatch for `{}`: main={} (via {}) backup={} (via {}) — schema versions may differ",
                restore_log_ts(),
                table,
                n_main,
                main_sql,
                n_backup,
                backup_sql
            );
        } else {
            log::info!(
                target: "import_manager::restore",
                "[{}] Index count OK for `{}`: {} index(es)",
                restore_log_ts(),
                table,
                n_main
            );
        }
    }
    Ok(())
}

fn validate_backup_tables_readonly(backup_path: &Path, tables: &[&str]) -> Result<(), String> {
    let conn = Connection::open_with_flags(backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Schema validation: cannot open backup (read-only): {}", e))?;
    for t in tables {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                params![*t],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if n == 0 {
            return Err(format!(
                "Backup schema incompatible: required table `{}` is missing",
                t
            ));
        }
    }
    Ok(())
}

fn validate_main_has_tables(conn: &Connection, tables: &[&str]) -> Result<(), String> {
    for t in tables {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                params![*t],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if n == 0 {
            return Err(format!(
                "Current database missing required table `{}`; aborting restore",
                t
            ));
        }
    }
    Ok(())
}

// Perform actual restore operation
#[tauri::command]
pub async fn restore_database(
    window: WebviewWindow,
    db_state: State<'_, DbState>,
    backupPath: String,
    userId: Option<String>,
) -> Result<RestoreResult, String> {
    log::info!(
        target: "import_manager::restore",
        "[{}] Restore: command entered backup_path={}",
        restore_log_ts(),
        backupPath
    );

    crate::restore_control::try_begin_restore()?;
    crate::restore_control::pause_background_jobs();
    let session_guard = crate::restore_control::RestoreSessionGuard::new();

    let outcome: Result<RestoreResult, String> = async {
        let (local_path, temp_dl) =
            resolve_backup_to_local_path(&backupPath, Some(&window)).await?;
        let _temp_guard = TempFileGuard(temp_dl);

        let local_str = local_path.to_string_lossy().to_string();

        let current_db_path: PathBuf = {
            let db = db_state.db.lock().map_err(|e| e.to_string())?;
            PathBuf::from(db.path().ok_or("Could not get current database path")?)
        };

        if local_path.as_path() == current_db_path.as_path() {
            return Err(
                "Cannot restore from the same database file. Please select a different backup file."
                    .to_string(),
            );
        }

        let pre_restore_backup = create_pre_restore_backup_sync(
            current_db_path.to_string_lossy().as_ref(),
            userId.clone(),
        )?;

        let temp_path = format!("{}.restore_temp", current_db_path.display());
        fs::copy(&local_path, &temp_path).map_err(|e| format!("Failed to copy backup: {}", e))?;

        let temp_size = fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);
        let backup_size = fs::metadata(&local_path).map(|m| m.len()).unwrap_or(0);
        if temp_size != backup_size {
            fs::remove_file(&temp_path).ok();
            return Err("Backup file verification failed".to_string());
        }

        let integrity_check = test_database_integrity(&temp_path)?;
        if !integrity_check.contains("ok") {
            fs::remove_file(&temp_path).ok();
            return Err(format!(
                "Database integrity check failed: {}",
                integrity_check
            ));
        }

        validate_backup_tables_readonly(&local_path, RESTORE_TABLES)?;

        log::info!(
            target: "import_manager::restore",
            "[{}] Schema compatibility pre-check passed",
            restore_log_ts()
        );

        log::info!(
            target: "import_manager::restore",
            "[{}] Acquiring exclusive DB lock; opening dedicated restore connection",
            restore_log_ts()
        );

        let restored_table_list: Vec<String> = {
            let mut main_guard = db_state.db.lock().map_err(|e| e.to_string())?;

            let mut restore_conn = Connection::open(&current_db_path)
                .map_err(|e| format!("Dedicated restore connection failed: {}", e))?;
            restore_conn
                .busy_timeout(Duration::from_secs(60))
                .map_err(|e| e.to_string())?;

            log::info!(
                target: "import_manager::restore",
                "[{}] Restore dedicated connection opened (isolated handle)",
                restore_log_ts()
            );

            let _ = restore_conn.execute("ROLLBACK", []);
            log::info!(
                target: "import_manager::restore",
                "[{}] Restore pre-check rollback executed",
                restore_log_ts()
            );

            let jm: String = restore_conn
                .query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0))
                .unwrap_or_default();
            if jm.eq_ignore_ascii_case("wal") {
                let _ = restore_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", []);
                log::info!(
                    target: "import_manager::restore",
                    "[{}] WAL checkpoint completed before restore",
                    restore_log_ts()
                );
            }

            validate_main_has_tables(&restore_conn, RESTORE_TABLES)?;

            let backup_db_name =
                format!("backup_db_{}", chrono::Local::now().timestamp_millis());
            let attach_sql = format!("ATTACH DATABASE '{}' AS {}", local_str, backup_db_name);
            let _ = restore_conn.execute(
                &format!("DETACH DATABASE IF EXISTS {}", backup_db_name),
                [],
            );

            restore_conn.execute(&attach_sql, []).map_err(|e| {
                if e.to_string().contains("database is already in use") {
                    "Backup database is already attached. Please try again in a moment, or restart the application if the issue persists.".to_string()
                } else if e.to_string().contains("no such file") {
                    format!("Backup file not found: {}. Please check the file path.", local_str)
                } else if e.to_string().contains("not a database") {
                    format!(
                        "Invalid backup file: {}. The file is not a valid SQLite database.",
                        local_str
                    )
                } else {
                    format!("Failed to attach backup database: {}", e)
                }
            })?;

            restore_conn
                .execute("PRAGMA foreign_keys = OFF", [])
                .map_err(|e| e.to_string())?;
            log::info!(
                target: "import_manager::restore",
                "[{}] Foreign keys disabled",
                restore_log_ts()
            );

            log::info!(
                target: "import_manager::restore",
                "[{}] Restore transaction started (single rusqlite transaction)",
                restore_log_ts()
            );

            let copy_result: Result<Vec<String>, String> = {
                let tx = restore_conn
                    .transaction()
                    .map_err(|e| format!("Failed to begin restore transaction: {}", e))?;

                log::info!(
                    target: "import_manager::restore",
                    "[{}] Executing restore statements ({} tables)",
                    restore_log_ts(),
                    RESTORE_TABLES.len()
                );

                let mut out = Vec::new();
                for table in RESTORE_TABLES.iter() {
                    let table_exists: i64 = tx
                        .query_row(
                            &format!(
                                "SELECT COUNT(*) FROM {}.sqlite_master WHERE type='table' AND name=?",
                                backup_db_name
                            ),
                            params![*table],
                            |row| row.get(0),
                        )
                        .unwrap_or(0);

                    if table_exists == 0 {
                        continue;
                    }

                    let pragma_main = pragma_table_info_main(table);
                    let pragma_backup = pragma_table_info_attached(&backup_db_name, table);
                    log::info!(
                        target: "import_manager::restore",
                        "[{}] Reading schema from backup table: {} | {}",
                        restore_log_ts(),
                        table,
                        pragma_backup
                    );
                    log::info!(
                        target: "import_manager::restore",
                        "[{}] Reading schema from main table: {} | {}",
                        restore_log_ts(),
                        table,
                        pragma_main
                    );

                    let current_columns: Vec<String> = tx
                        .prepare(&pragma_main)
                        .map_err(|e| e.to_string())?
                        .query_map([], |row| row.get::<_, String>(1))
                        .map_err(|e| e.to_string())?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|e| e.to_string())?;

                    let backup_columns: Vec<String> = tx
                        .prepare(&pragma_backup)
                        .map_err(|e| e.to_string())?
                        .query_map([], |row| row.get::<_, String>(1))
                        .map_err(|e| e.to_string())?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|e| e.to_string())?;

                    let common_columns: Vec<String> = current_columns
                        .iter()
                        .filter(|col| backup_columns.contains(col))
                        .cloned()
                        .collect();

                    if common_columns.is_empty() {
                        out.push(format!("{} (skipped - no common columns)", table));
                        continue;
                    }

                    let table_q = sqlite_double_quote_ident(table);
                    let _ = tx.execute(&format!("DELETE FROM {}", table_q), []);

                    let columns_str = common_columns.join(", ");
                    let copy_sql = format!(
                        "INSERT INTO {} ({}) SELECT {} FROM {}.{}",
                        table_q, columns_str, columns_str, backup_db_name, table_q
                    );

                    let rows_affected = tx
                        .execute(&copy_sql, [])
                        .map_err(|e| format!("Failed to restore table {}: {}", table, e))?;

                    let skipped_columns = current_columns.len() - common_columns.len();
                    if skipped_columns > 0 {
                        out.push(format!(
                            "{} ({} rows, {} columns skipped)",
                            table, rows_affected, skipped_columns
                        ));
                    } else {
                        out.push(format!("{} ({} rows)", table, rows_affected));
                    }
                }

                tx.commit()
                    .map_err(|e| format!("Failed to commit restore transaction: {}", e))?;
                log::info!(
                    target: "import_manager::restore",
                    "[{}] Restore committed successfully",
                    restore_log_ts()
                );
                Ok(out)
            };

            let restored_table_list = match copy_result {
                Ok(v) => v,
                Err(e) => {
                    let _ = restore_conn.execute(
                        &format!("DETACH DATABASE IF EXISTS {}", backup_db_name),
                        [],
                    );
                    let _ = restore_conn.execute("PRAGMA foreign_keys = ON", []);
                    log::info!(
                        target: "import_manager::restore",
                        "[{}] Foreign keys re-enabled",
                        restore_log_ts()
                    );
                    log::warn!(
                        target: "import_manager::restore",
                        "[{}] Restore failed — transaction rolled back",
                        restore_log_ts()
                    );
                    log::warn!(
                        target: "import_manager::restore",
                        "[{}] Restore error detail: {}",
                        restore_log_ts(),
                        e
                    );
                    return Err(e);
                }
            };

            log::info!(
                target: "import_manager::restore",
                "[{}] Validating index counts (main vs backup)",
                restore_log_ts()
            );
            if let Err(e) = log_index_count_comparison(&restore_conn, &backup_db_name, RESTORE_TABLES)
            {
                let _ = restore_conn.execute(
                    &format!("DETACH DATABASE IF EXISTS {}", backup_db_name),
                    [],
                );
                let _ = restore_conn.execute("PRAGMA foreign_keys = ON", []);
                log::info!(
                    target: "import_manager::restore",
                    "[{}] Foreign keys re-enabled",
                    restore_log_ts()
                );
                log::warn!(
                    target: "import_manager::restore",
                    "[{}] Index validation failed: {}",
                    restore_log_ts(),
                    e
                );
                return Err(e);
            }

            restore_conn
                .execute(&format!("DETACH DATABASE {}", backup_db_name), [])
                .map_err(|e| format!("Failed to detach backup database: {}", e))?;
            log::info!(
                target: "import_manager::restore",
                "[{}] Backup database detached",
                restore_log_ts()
            );

            restore_conn
                .execute("PRAGMA foreign_keys = ON", [])
                .map_err(|e| e.to_string())?;
            log::info!(
                target: "import_manager::restore",
                "[{}] Foreign keys re-enabled",
                restore_log_ts()
            );

            drop(restore_conn);

            *main_guard = Connection::open(&current_db_path)
                .map_err(|e| format!("Failed to reopen main database after restore: {}", e))?;

            log::info!(
                target: "import_manager::restore",
                "[{}] Main application connection replaced; no stale page cache",
                restore_log_ts()
            );

            restored_table_list
        };

        fs::remove_file(&temp_path).ok();

        Ok(RestoreResult {
            success: true,
            message: format!(
                "Database restored successfully. Restored tables: {}",
                restored_table_list.join(", ")
            ),
            backup_created: Some(pre_restore_backup),
            integrity_check,
            tables_affected: RESTORE_TABLES.iter().map(|s| (*s).to_string()).collect(),
        })
    }
    .await;

    std::mem::drop(session_guard);

    match outcome {
        Ok(result) => {
            let restore_meta = format!(
                "{{\"backupPath\": \"{}\", \"pre_restore_backup\": \"{}\", \"restored_tables\": {:?}}}",
                backupPath,
                result.backup_created.as_deref().unwrap_or(""),
                result.message
            );
            let db = db_state.db.lock().map_err(|e| e.to_string())?;
            crate::db::try_audit_log_no_row(
                &db,
                "database",
                "restore",
                userId.as_deref(),
                &restore_meta,
            );
            log::info!(
                target: "import_manager::restore",
                "[{}] Restore completed successfully",
                restore_log_ts()
            );
            Ok(result)
        }
        Err(e) => Err(e),
    }
}

// Bulk search with filters
#[tauri::command]
pub async fn bulk_search_records(
    db_state: State<'_, DbState>,
    tableName: String,
    filters: HashMap<String, serde_json::Value>,
    pageSize: Option<i64>,
    includeDeleted: Option<bool>,
) -> Result<TableData, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Validate table name
    let valid_tables = vec![
        "suppliers",
        "shipments",
        "items",
        "invoices",
        "invoice_line_items",
        "boe_details",
        "boe_calculations",
        "service_providers",
        "expense_types",
        "expense_invoices",
        "expenses",
        "notifications",
        "audit_logs",
        "backups",
    ];

    if !valid_tables.contains(&tableName.as_str()) {
        return Err("Invalid table name".to_string());
    }

    let pageSize = pageSize.unwrap_or(50);
    let includeDeleted = includeDeleted.unwrap_or(false);

    // Build WHERE clause from filters
    let mut where_clause = String::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // Start with a base condition to avoid syntax errors
    let mut has_condition = false;

    if !includeDeleted {
        where_clause.push_str(" WHERE deleted_at IS NULL");
        has_condition = true;
    }

    for (column, value) in &filters {
        if !value.is_null() {
            let connector = if has_condition { " AND" } else { " WHERE" };
            where_clause.push_str(&format!("{} {} LIKE ?", connector, column));
            has_condition = true;

            let search_value = match value {
                serde_json::Value::String(s) => format!("%{}%", s),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                _ => value.to_string(),
            };
            params.push(Box::new(search_value));
        }
    }

    // Get total count
    let totalCount: i64 = db
        .query_row(
            &format!("SELECT COUNT(*) FROM {}{}", tableName, where_clause),
            &params.iter().map(|p| p.as_ref()).collect::<Vec<_>>()[..],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Get columns
    let columns = get_table_columns(&db, &tableName)?;

    // Get data with pagination
    let offset = 0; // For bulk operations, we'll get all matching records
    let limit = if totalCount > 1000 { 1000 } else { totalCount }; // Limit bulk operations to 1000 records

    let query = format!(
        "SELECT * FROM {}{} ORDER BY id LIMIT ? OFFSET ?",
        tableName, where_clause
    );
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(&param_refs[..], |row| {
            let mut record = Vec::new();
            for i in 0..columns.len() {
                let value: serde_json::Value = match row.get::<_, String>(i) {
                    Ok(s) => serde_json::Value::String(s),
                    Err(_) => match row.get::<_, i64>(i) {
                        Ok(n) => serde_json::Value::Number(serde_json::Number::from(n)),
                        Err(_) => match row.get::<_, f64>(i) {
                            Ok(f) => serde_json::Value::Number(
                                serde_json::Number::from_f64(f)
                                    .unwrap_or(serde_json::Number::from(0)),
                            ),
                            Err(_) => serde_json::Value::Null,
                        },
                    },
                };
                record.push(value);
            }
            Ok(record)
        })
        .map_err(|e| e.to_string())?;

    let mut data_rows = Vec::new();
    for row in rows {
        data_rows.push(row.map_err(|e| e.to_string())?);
    }

    Ok(TableData {
        tableName: tableName.clone(),
        columns,
        rows: data_rows,
        totalCount,
        page: 1,
        pageSize,
    })
}

// Bulk delete records
#[tauri::command]
pub async fn bulk_delete_records(
    db_state: State<'_, DbState>,
    tableName: String,
    record_ids: Vec<String>,
    userId: Option<String>,
    delete_type: String, // "soft" or "hard"
) -> Result<BulkDeleteResult, String> {
    let mut db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Validate table name
    let valid_tables = vec![
        "suppliers",
        "shipments",
        "items",
        "invoices",
        "invoice_line_items",
        "boe_details",
        "boe_calculations",
        "service_providers",
        "expense_types",
        "expense_invoices",
        "expenses",
        "notifications",
        "audit_logs",
        "backups",
    ];

    if !valid_tables.contains(&tableName.as_str()) {
        return Err("Invalid table name".to_string());
    }

    if record_ids.is_empty() {
        return Err("No records selected for deletion".to_string());
    }

    // Limit bulk operations to prevent accidental mass deletion
    if record_ids.len() > 100 {
        return Err(format!("Cannot delete more than 100 records at once. You selected {} records. Please select fewer records or use multiple smaller batches.", record_ids.len()));
    }

    let mut deleted_count = 0;
    let mut failed_deletions = Vec::new();

    let _ = db.execute("ROLLBACK", []);

    let tx = db
        .transaction()
        .map_err(|e| format!("Failed to begin bulk delete transaction: {}", e))?;

    for record_id in &record_ids {
        match delete_type.as_str() {
            "soft" => {
                // Soft delete
                let query = format!("UPDATE {} SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ? AND deleted_at IS NULL", tableName);
                let changes = tx
                    .execute(&query, params![userId, record_id])
                    .map_err(|e| e.to_string())?;

                if changes > 0 {
                    deleted_count += 1;

                    // Create audit log entry
                    let tn = tableName.as_str();
                    let _ = tx.execute(
                        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
                        params![
                            tn,
                            tn,
                            record_id,
                            "bulk_soft_delete",
                            userId,
                            format!(
                                "{{\"type\": \"bulk_soft_delete\", \"batch_size\": {}}}",
                                record_ids.len()
                            )
                        ],
                    );
                } else {
                    failed_deletions
                        .push(format!("Record {} not found or already deleted", record_id));
                }
            }
            "hard" => {
                // Hard delete
                let query = format!("DELETE FROM {} WHERE id = ?", tableName);
                let changes = tx
                    .execute(&query, params![record_id])
                    .map_err(|e| e.to_string())?;

                if changes > 0 {
                    deleted_count += 1;

                    // Create audit log entry
                    let tn = tableName.as_str();
                    let _ = tx.execute(
                        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
                        params![
                            tn,
                            tn,
                            record_id,
                            "bulk_hard_delete",
                            userId,
                            format!(
                                "{{\"type\": \"bulk_hard_delete\", \"batch_size\": {}}}",
                                record_ids.len()
                            )
                        ],
                    );
                } else {
                    failed_deletions.push(format!("Record {} not found", record_id));
                }
            }
            _ => {
                failed_deletions.push(format!("Invalid delete type: {}", delete_type));
            }
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit bulk delete transaction: {}", e))?;

    Ok(BulkDeleteResult {
        success: deleted_count > 0,
        deleted_count,
        total_requested: record_ids.len(),
        failed_deletions,
        message: format!(
            "Successfully deleted {} out of {} records",
            deleted_count,
            record_ids.len()
        ),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BulkDeleteResult {
    pub success: bool,
    pub deleted_count: usize,
    pub total_requested: usize,
    pub failed_deletions: Vec<String>,
    pub message: String,
}

// Backup Schedule Management
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_backup_schedule(
    db_state: State<'_, DbState>,
    name: String,
    cron_expr: String,
    destination: String,
    retention_count: Option<i32>,
    retention_days: Option<i32>,
    enabled: Option<bool>,
    time_zone: Option<String>,
    notes: Option<String>,
    userId: Option<String>,
) -> Result<i64, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let retention_count = retention_count.unwrap_or(5);
    let retention_days = retention_days.unwrap_or(30);
    let enabled = if enabled.unwrap_or(true) { 1 } else { 0 };
    let tz = time_zone.unwrap_or_else(|| "UTC".to_string());
    let next_run = compute_next_run_rfc3339(&cron_expr)?;

    db.execute(
        "INSERT INTO backup_schedules (name, cron_expr, time_zone, destination, retention_count, retention_days, enabled, next_run, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            name,
            cron_expr,
            tz,
            destination,
            retention_count,
            retention_days,
            enabled,
            next_run,
            notes,
            userId
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = db.last_insert_rowid();

    // Create audit log entry
    let t = "backup_schedules";
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
        params![
            t,
            t,
            id.to_string(),
            "create",
            userId,
            format!(
                "{{\"type\": \"backup_schedule_created\", \"name\": \"{}\", \"cron_expr\": \"{}\"}}",
                name, cron_expr
            )
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn get_backup_schedules(
    db_state: State<'_, DbState>,
) -> Result<Vec<BackupSchedule>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare("SELECT id, name, cron_expr, time_zone, destination, retention_count, retention_days, enabled, last_run, next_run, created_by, created_at, notes FROM backup_schedules ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BackupSchedule {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                cron_expr: row.get(2)?,
                time_zone: row.get(3)?,
                destination: row.get(4)?,
                retention_count: row.get(5)?,
                retention_days: row.get(6)?,
                enabled: row.get(7)?,
                last_run: row.get(8)?,
                next_run: row.get(9)?,
                created_by: row.get(10)?,
                created_at: row.get(11)?,
                notes: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut schedules = Vec::new();
    for row in rows {
        schedules.push(row.map_err(|e| e.to_string())?);
    }

    Ok(schedules)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn update_backup_schedule(
    db_state: State<'_, DbState>,
    schedule_id: i64,
    name: Option<String>,
    cron_expr: Option<String>,
    destination: Option<String>,
    retention_count: Option<i32>,
    retention_days: Option<i32>,
    enabled: Option<bool>,
    time_zone: Option<String>,
    notes: Option<String>,
    userId: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Build dynamic UPDATE query
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let recompute_next = cron_expr.is_some();

    if let Some(name) = name {
        set_clauses.push("name = ?");
        params.push(Box::new(name));
    }
    if let Some(cron_expr) = cron_expr {
        set_clauses.push("cron_expr = ?");
        params.push(Box::new(cron_expr));
    }
    if let Some(destination) = destination {
        set_clauses.push("destination = ?");
        params.push(Box::new(destination));
    }
    if let Some(retention_count) = retention_count {
        set_clauses.push("retention_count = ?");
        params.push(Box::new(retention_count));
    }
    if let Some(retention_days) = retention_days {
        set_clauses.push("retention_days = ?");
        params.push(Box::new(retention_days));
    }
    if let Some(enabled) = enabled {
        set_clauses.push("enabled = ?");
        params.push(Box::new(enabled as i32));
    }
    if let Some(tz) = time_zone {
        set_clauses.push("time_zone = ?");
        params.push(Box::new(tz));
    }
    if let Some(notes) = notes {
        set_clauses.push("notes = ?");
        params.push(Box::new(notes));
    }

    if set_clauses.is_empty() {
        return Err("No fields to update".to_string());
    }

    params.push(Box::new(schedule_id));

    let query = format!(
        "UPDATE backup_schedules SET {} WHERE id = ?",
        set_clauses.join(", ")
    );
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let changes = db
        .execute(&query, &param_refs[..])
        .map_err(|e| e.to_string())?;

    if changes == 0 {
        return Err("Schedule not found".to_string());
    }

    if recompute_next {
        let cron_row: Option<String> = db
            .query_row(
                "SELECT cron_expr FROM backup_schedules WHERE id = ?",
                params![schedule_id],
                |row| row.get(0),
            )
            .ok();
        if let Some(expr) = cron_row {
            if let Ok(next) = compute_next_run_rfc3339(&expr) {
                let _ = db.execute(
                    "UPDATE backup_schedules SET next_run = ? WHERE id = ?",
                    params![next, schedule_id],
                );
            }
        }
    }

    // Create audit log entry
    let t = "backup_schedules";
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
        params![
            t,
            t,
            schedule_id.to_string(),
            "update",
            userId,
            format!(
                "{{\"type\": \"backup_schedule_updated\", \"fields_updated\": {:?}}}",
                set_clauses
            )
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_backup_schedule(
    db_state: State<'_, DbState>,
    schedule_id: i64,
    userId: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Get schedule info for audit log
    let schedule_name: String = db
        .query_row(
            "SELECT name FROM backup_schedules WHERE id = ?",
            params![schedule_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let changes = db
        .execute(
            "DELETE FROM backup_schedules WHERE id = ?",
            params![schedule_id],
        )
        .map_err(|e| e.to_string())?;

    if changes == 0 {
        return Err("Schedule not found".to_string());
    }

    // Create audit log entry
    let t = "backup_schedules";
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
        params![
            t,
            t,
            schedule_id.to_string(),
            "delete",
            userId,
            format!(
                "{{\"type\": \"backup_schedule_deleted\", \"name\": \"{}\"}}",
                schedule_name
            )
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn run_scheduled_backup(
    db_state: State<'_, DbState>,
    schedule_id: i64,
    userId: Option<String>,
) -> Result<BackupInfo, String> {
    // Get schedule details first
    let schedule = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT id, name, cron_expr, time_zone, destination, retention_count, retention_days, enabled, last_run, next_run, created_by, created_at, notes FROM backup_schedules WHERE id = ?",
            params![schedule_id],
            |row| {
                Ok(BackupSchedule {
                    id: Some(row.get(0)?),
                    name: row.get(1)?,
                    cron_expr: row.get(2)?,
                    time_zone: row.get(3)?,
                    destination: row.get(4)?,
                    retention_count: row.get(5)?,
                    retention_days: row.get(6)?,
                    enabled: row.get(7)?,
                    last_run: row.get(8)?,
                    next_run: row.get(9)?,
                    created_by: row.get(10)?,
                    created_at: row.get(11)?,
                    notes: row.get(12)?,
                })
            }
        ).map_err(|e| e.to_string())?
    };

    if !schedule.enabled {
        return Err("Schedule is disabled".to_string());
    }

    // Create backup using the schedule's destination
    let backup_request = BackupRequest {
        destination: schedule.destination,
        filename: None,
        include_wal: true,
        notes: Some(format!("Scheduled backup: {}", schedule.name)),
    };

    let backup_info =
        create_backup_internal(db_state.clone(), backup_request, userId.clone()).await?;

    let cron_for_next = schedule
        .cron_expr
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    // Update schedule last_run and next_run (from cron)
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        if let Some(expr) = cron_for_next {
            if let Ok(next_run) = compute_next_run_rfc3339(expr) {
                let _ = db.execute(
                    "UPDATE backup_schedules SET last_run = CURRENT_TIMESTAMP, next_run = ? WHERE id = ?",
                    params![next_run, schedule_id],
                );
            } else {
                let _ = db.execute(
                    "UPDATE backup_schedules SET last_run = CURRENT_TIMESTAMP WHERE id = ?",
                    params![schedule_id],
                );
            }
        } else {
            let _ = db.execute(
                "UPDATE backup_schedules SET last_run = CURRENT_TIMESTAMP WHERE id = ?",
                params![schedule_id],
            );
        }

        // Create audit log entry (best-effort — never fail the scheduled backup)
        let meta = format!(
            "{{\"type\": \"scheduled_backup_run\", \"backup_id\": {}, \"schedule_name\": \"{}\"}}",
            backup_info.id.unwrap_or(0),
            schedule.name
        );
        crate::db::try_audit_log_metadata(
            &db,
            "backup_schedules",
            &schedule_id.to_string(),
            "run",
            userId.as_deref(),
            &meta,
        );
    }

    Ok(backup_info)
}

// Role-Based Access Control (RBAC) System
#[tauri::command]
pub async fn create_user_role(
    db_state: State<'_, DbState>,
    userId: String,
    role: String,
    permissions: Option<String>,
    created_by: Option<String>,
) -> Result<i64, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Validate role
    let valid_roles = ["admin", "db_manager", "user", "viewer"];
    if !valid_roles.contains(&role.as_str()) {
        return Err(format!(
            "Invalid role: {}. Valid roles are: {:?}",
            role, valid_roles
        ));
    }

    let id = db
        .execute(
            "INSERT INTO user_roles (user_id, role, permissions, created_by) VALUES (?, ?, ?, ?)",
            params![userId, role, permissions, created_by],
        )
        .map_err(|e| e.to_string())?;

    // Create audit log entry
    let t = "user_roles";
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
        params![
            t,
            t,
            id.to_string(),
            "create",
            created_by,
            format!(
                "{{\"type\": \"user_role_created\", \"user_id\": \"{}\", \"role\": \"{}\"}}",
                userId, role
            )
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(id as i64)
}

#[tauri::command]
pub async fn get_user_roles(db_state: State<'_, DbState>) -> Result<Vec<UserRole>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare("SELECT id, user_id, role, permissions, created_at, updated_at FROM user_roles ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(UserRole {
                id: Some(row.get(0)?),
                user_id: row.get(1)?,
                role: row.get(2)?,
                permissions: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut roles = Vec::new();
    for row in rows {
        roles.push(row.map_err(|e| e.to_string())?);
    }

    Ok(roles)
}

#[tauri::command]
pub async fn update_user_role(
    db_state: State<'_, DbState>,
    role_id: i64,
    role: Option<String>,
    permissions: Option<String>,
    updated_by: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Build dynamic UPDATE query
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(role) = role {
        // Validate role
        let valid_roles = ["admin", "db_manager", "user", "viewer"];
        if !valid_roles.contains(&role.as_str()) {
            return Err(format!(
                "Invalid role: {}. Valid roles are: {:?}",
                role, valid_roles
            ));
        }
        set_clauses.push("role = ?");
        params.push(Box::new(role));
    }
    if let Some(permissions) = permissions {
        set_clauses.push("permissions = ?");
        params.push(Box::new(permissions));
    }

    if set_clauses.is_empty() {
        return Err("No fields to update".to_string());
    }

    set_clauses.push("updated_at = CURRENT_TIMESTAMP");
    params.push(Box::new(role_id));

    let query = format!(
        "UPDATE user_roles SET {} WHERE id = ?",
        set_clauses.join(", ")
    );
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let changes = db
        .execute(&query, &param_refs[..])
        .map_err(|e| e.to_string())?;

    if changes == 0 {
        return Err("User role not found".to_string());
    }

    // Create audit log entry
    let t = "user_roles";
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
        params![
            t,
            t,
            role_id.to_string(),
            "update",
            updated_by,
            format!(
                "{{\"type\": \"user_role_updated\", \"fields_updated\": {:?}}}",
                set_clauses
            )
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_user_role(
    db_state: State<'_, DbState>,
    role_id: i64,
    deleted_by: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Get role info for audit log
    let (user_id, role): (String, String) = db
        .query_row(
            "SELECT user_id, role FROM user_roles WHERE id = ?",
            params![role_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let changes = db
        .execute("DELETE FROM user_roles WHERE id = ?", params![role_id])
        .map_err(|e| e.to_string())?;

    if changes == 0 {
        return Err("User role not found".to_string());
    }

    // Create audit log entry
    let t = "user_roles";
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
        params![
            t,
            t,
            role_id.to_string(),
            "delete",
            deleted_by,
            format!(
                "{{\"type\": \"user_role_deleted\", \"user_id\": \"{}\", \"role\": \"{}\"}}",
                user_id, role
            )
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn check_user_permission(
    db_state: State<'_, DbState>,
    userId: String,
    permission: String,
) -> Result<bool, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Get user role
    let role: String = db
        .query_row(
            "SELECT role FROM user_roles WHERE user_id = ?",
            params![userId],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Check role-based permissions
    let has_permission = match role.as_str() {
        "admin" => true, // Admin has all permissions
        "db_manager" => matches!(
            permission.as_str(),
            "backup.create" | "backup.restore" | "backup.schedule" | "data.browse"
                | "data.edit" | "data.delete" | "audit.view"
        ),
        "user" => matches!(permission.as_str(), "data.browse" | "data.edit"),
        "viewer" => matches!(permission.as_str(), "data.browse" | "audit.view"),
        _ => false,
    };

    Ok(has_permission)
}

#[tauri::command]
pub async fn get_user_permissions(
    _db_state: State<'_, DbState>,
    userId: String,
) -> Result<Vec<String>, String> {
    let db = _db_state.db.lock().map_err(|e| e.to_string())?;

    // Get user role
    let role: String = db
        .query_row(
            "SELECT role FROM user_roles WHERE user_id = ?",
            params![userId],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Return permissions based on role
    let permissions = match role.as_str() {
        "admin" => vec![
            "backup.create".to_string(),
            "backup.restore".to_string(),
            "backup.schedule".to_string(),
            "data.browse".to_string(),
            "data.edit".to_string(),
            "data.delete".to_string(),
            "audit.view".to_string(),
            "user.manage".to_string(),
            "system.admin".to_string(),
        ],
        "db_manager" => vec![
            "backup.create".to_string(),
            "backup.restore".to_string(),
            "backup.schedule".to_string(),
            "data.browse".to_string(),
            "data.edit".to_string(),
            "data.delete".to_string(),
            "audit.view".to_string(),
        ],
        "user" => vec!["data.browse".to_string(), "data.edit".to_string()],
        "viewer" => vec!["data.browse".to_string(), "audit.view".to_string()],
        _ => vec![],
    };

    Ok(permissions)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserRole {
    pub id: Option<i64>,
    pub user_id: String,
    pub role: String,
    pub permissions: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// Helper function to create backup (internal — used by scheduled backups)
async fn create_backup_internal(
    db_state: State<'_, DbState>,
    request: BackupRequest,
    userId: Option<String>,
) -> Result<BackupInfo, String> {
    create_backup_impl(db_state, request, userId, None).await
}

// Helper function to create pre-restore backup (sync version)
fn create_pre_restore_backup_sync(
    current_db_path: &str,
    _userId: Option<String>,
) -> Result<String, String> {
    let now = chrono::Local::now();
    let backup_filename = format!("pre-restore-backup-{}.db", now.format("%Y%m%d-%H%M%S"));

    let data_dir = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map(|home| Path::new(&home).join("ImportManager").join("backups"))
        .unwrap_or_else(|_| Path::new("./backups").to_path_buf());

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }

    let backupPath = data_dir.join(&backup_filename);

    // Create backup
    fs::copy(current_db_path, &backupPath)
        .map_err(|e| format!("Failed to create pre-restore backup: {}", e))?;

    // Record backup in database (we'll do this after the restore)
    Ok(backup_filename)
}

// Helper function to check schema compatibility
fn check_schema_compatibility(backupPath: &str) -> Result<bool, String> {
    let backup_conn = Connection::open(backupPath)
        .map_err(|e| format!("Failed to open backup database: {}", e))?;

    // Check if required tables exist
    let required_tables = vec![
        "suppliers",
        "shipments",
        "items",
        "invoices",
        "audit_logs",
        "backups",
    ];

    for table in required_tables {
        let exists: i64 = backup_conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                params![table],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if exists == 0 {
            return Ok(false);
        }
    }

    Ok(true)
}

// Browse table data with pagination
#[tauri::command]
pub async fn browse_table_data(
    db_state: State<'_, DbState>,
    tableName: String,
    page: Option<i64>,
    pageSize: Option<i64>,
    includeDeleted: Option<bool>,
) -> Result<TableData, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let page = page.unwrap_or(1);
    let pageSize = pageSize.unwrap_or(50);
    let include_deleted = includeDeleted.unwrap_or(false);
    let offset = (page - 1) * pageSize;

    // Validate table name to prevent SQL injection
    let valid_tables = vec![
        "suppliers",
        "shipments",
        "items",
        "invoices",
        "invoice_line_items",
        "boe_details",
        "boe_calculations",
        "service_providers",
        "expense_types",
        "expense_invoices",
        "expenses",
        "notifications",
        "audit_logs",
        "backups",
    ];

    if !valid_tables.contains(&tableName.as_str()) {
        return Err("Invalid table name".to_string());
    }

    // Get table columns
    let columns: Vec<String> = db
        .prepare(&pragma_table_info_main(&tableName))
        .map_err(|e| e.to_string())?
        .query_map([], |row| {
            row.get::<_, String>(1) // column name
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Build WHERE clause for soft delete
    let where_clause = if include_deleted {
        "".to_string()
    } else if columns.contains(&"deleted_at".to_string()) {
        " WHERE deleted_at IS NULL".to_string()
    } else {
        "".to_string()
    };

    // Get total count
    let totalCount: i64 = db
        .query_row(
            &format!("SELECT COUNT(*) FROM {}{}", tableName, where_clause),
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Get paginated data
    let query = format!(
        "SELECT * FROM {}{} ORDER BY id LIMIT ? OFFSET ?",
        tableName, where_clause
    );

    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pageSize, offset], |row| {
            let mut values = Vec::new();
            for i in 0..columns.len() {
                let value: serde_json::Value = match row.get::<_, Option<String>>(i) {
                    Ok(Some(s)) => serde_json::Value::String(s),
                    Ok(None) => serde_json::Value::Null,
                    Err(_) => {
                        // Try other types
                        match row.get::<_, Option<i64>>(i) {
                            Ok(Some(n)) => serde_json::Value::Number(serde_json::Number::from(n)),
                            Ok(None) => serde_json::Value::Null,
                            Err(_) => match row.get::<_, Option<f64>>(i) {
                                Ok(Some(f)) => serde_json::Value::Number(
                                    serde_json::Number::from_f64(f)
                                        .unwrap_or(serde_json::Number::from(0)),
                                ),
                                Ok(None) => serde_json::Value::Null,
                                Err(_) => serde_json::Value::Null,
                            },
                        }
                    }
                };
                values.push(value);
            }
            Ok(values)
        })
        .map_err(|e| e.to_string())?;

    let data_rows: Result<Vec<_>, _> = rows.collect();
    let data_rows = data_rows.map_err(|e| e.to_string())?;

    Ok(TableData {
        tableName,
        columns,
        rows: data_rows,
        totalCount,
        page,
        pageSize,
    })
}

// Update record with field-level change tracking
#[tauri::command]
pub async fn update_record(
    db_state: State<'_, DbState>,
    request: RecordUpdate,
) -> Result<UpdateResult, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Validate table name
    let valid_tables = vec![
        "suppliers",
        "shipments",
        "items",
        "invoices",
        "invoice_line_items",
        "boe_details",
        "boe_calculations",
        "service_providers",
        "expense_types",
        "expense_invoices",
        "expenses",
        "notifications",
        "audit_logs",
        "backups",
    ];

    if !valid_tables.contains(&request.tableName.as_str()) {
        return Err("Invalid table name".to_string());
    }

    // Get current record for audit
    let current_record = get_record_data(&db, &request.tableName, &request.record_id)?;

    // Build UPDATE query
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    for (column, value) in &request.updates {
        set_clauses.push(format!("{} = ?", column));

        // Convert JSON value to appropriate SQL type
        let sql_value: Box<dyn rusqlite::ToSql> = match value {
            serde_json::Value::String(s) => Box::new(s.clone()),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Box::new(i)
                } else if let Some(f) = n.as_f64() {
                    Box::new(f)
                } else {
                    Box::new(n.to_string())
                }
            }
            serde_json::Value::Bool(b) => Box::new(*b),
            serde_json::Value::Null => Box::new(None::<String>),
            _ => Box::new(value.to_string()),
        };

        params.push(sql_value);
    }

    // Add updated_at if column exists
    let columns = get_table_columns(&db, &request.tableName)?;
    if columns.contains(&"updated_at".to_string()) {
        set_clauses.push("updated_at = CURRENT_TIMESTAMP".to_string());
    }

    params.push(Box::new(request.record_id.clone()));

    let query = format!(
        "UPDATE {} SET {} WHERE id = ?",
        request.tableName,
        set_clauses.join(", ")
    );

    // Execute update
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let changes = db
        .execute(&query, &param_refs[..])
        .map_err(|e| e.to_string())?;

    if changes == 0 {
        return Err("Record not found or no changes made".to_string());
    }

    // Get updated record for audit
    let updated_record = get_record_data(&db, &request.tableName, &request.record_id)?;

    // Create audit log entry
    let tn = request.tableName.as_str();
    let _ = db.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, before_json, after_json, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        params![
            tn,
            tn,
            request.record_id,
            "update",
            request.userId,
            serde_json::to_string(&current_record).unwrap_or_default(),
            serde_json::to_string(&updated_record).unwrap_or_default(),
            serde_json::to_string(&request.updates).unwrap_or_default()
        ],
    )
    .map_err(|e| e.to_string())?;
    let audit_id = db.last_insert_rowid();

    Ok(UpdateResult {
        success: true,
        message: "Record updated successfully".to_string(),
        changes: request.updates,
        audit_id: Some(audit_id),
    })
}

// Helper function to get record data as JSON
fn get_record_data(
    db: &Connection,
    tableName: &str,
    record_id: &str,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let columns = get_table_columns(db, tableName)?;

    let query = format!("SELECT * FROM {} WHERE id = ?", tableName);
    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;

    let mut row_data = HashMap::new();

    stmt.query_row(params![record_id], |row| {
        for (i, column) in columns.iter().enumerate() {
            let value: serde_json::Value = match row.get::<_, Option<String>>(i) {
                Ok(Some(s)) => serde_json::Value::String(s),
                Ok(None) => serde_json::Value::Null,
                Err(_) => match row.get::<_, Option<i64>>(i) {
                    Ok(Some(n)) => serde_json::Value::Number(serde_json::Number::from(n)),
                    Ok(None) => serde_json::Value::Null,
                    Err(_) => match row.get::<_, Option<f64>>(i) {
                        Ok(Some(f)) => serde_json::Value::Number(
                            serde_json::Number::from_f64(f).unwrap_or(serde_json::Number::from(0)),
                        ),
                        Ok(None) => serde_json::Value::Null,
                        Err(_) => serde_json::Value::Null,
                    },
                },
            };
            row_data.insert(column.clone(), value);
        }
        Ok(())
    })
    .map_err(|e| e.to_string())?;

    Ok(row_data)
}

// Helper function to get table columns
fn get_table_columns(db: &Connection, tableName: &str) -> Result<Vec<String>, String> {
    let columns: Vec<String> = db
        .prepare(&pragma_table_info_main(tableName))
        .map_err(|e| e.to_string())?
        .query_map([], |row| {
            row.get::<_, String>(1) // column name
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(columns)
}

// Helper function to test database integrity
fn test_database_integrity(db_path: &str) -> Result<String, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    let result: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("Integrity check failed: {}", e))?;

    Ok(result)
}

#[cfg(test)]
mod restore_validation_tests {
    use super::*;
    use std::fs;

    fn unique_test_db(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("im_restore_{}_{}.db", name, nanos))
    }

    #[test]
    fn sqlite_double_quote_ident_escapes_quotes() {
        assert_eq!(sqlite_double_quote_ident("suppliers"), "\"suppliers\"");
        assert_eq!(sqlite_double_quote_ident("a\"b"), "\"a\"\"b\"");
        assert_eq!(sqlite_double_quote_ident("order"), "\"order\"");
    }

    #[test]
    fn pragma_table_info_attached_uses_schema_dot_form() {
        let s = pragma_table_info_attached("backup_db_123", "suppliers");
        assert_eq!(s, "PRAGMA backup_db_123.table_info(\"suppliers\")");
        assert!(
            !s.contains("table_info(backup_db"),
            "must not use invalid table_info(backup.x) form: {}",
            s
        );
    }

    #[test]
    fn pragma_index_list_attached_uses_schema_dot_form() {
        let s = pragma_index_list_attached("backup_db_123", "invoice_line_items");
        assert_eq!(
            s,
            "PRAGMA backup_db_123.index_list(\"invoice_line_items\")"
        );
    }

    #[test]
    fn pragma_preserves_uppercase_and_underscore_table_names() {
        assert_eq!(
            pragma_table_info_attached("backup_db_1", "MY_TABLE"),
            "PRAGMA backup_db_1.table_info(\"MY_TABLE\")"
        );
        assert_eq!(
            pragma_table_info_attached("backup_db_1", "order"),
            "PRAGMA backup_db_1.table_info(\"order\")"
        );
    }

    #[test]
    fn index_counts_match_for_identical_schema() {
        let main_path = unique_test_db("main");
        let backup_path = unique_test_db("bak");
        {
            let conn = Connection::open(&main_path).unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE parent (id INTEGER PRIMARY KEY);
                CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id));
                CREATE INDEX idx_child_pid ON child(pid);
                INSERT INTO parent VALUES (1);
                INSERT INTO child VALUES (1, 1);
                "#,
            )
            .unwrap();
        }
        fs::copy(&main_path, &backup_path).unwrap();

        let conn = Connection::open(&main_path).unwrap();
        let alias = "bkp";
        conn.execute(
            &format!(
                "ATTACH DATABASE '{}' AS {}",
                backup_path.to_string_lossy(),
                alias
            ),
            [],
        )
        .unwrap();

        for table in ["parent", "child"] {
            let m = count_pragma_rows(&conn, &pragma_index_list_main(table)).unwrap();
            let b = count_pragma_rows(&conn, &pragma_index_list_attached(alias, table)).unwrap();
            assert_eq!(m, b, "index count for {}", table);
        }
        conn.execute(&format!("DETACH DATABASE {}", alias), []).unwrap();
        drop(conn);
        let _ = fs::remove_file(&main_path);
        let _ = fs::remove_file(&backup_path);
    }

    #[test]
    fn repeated_attach_detach_no_error() {
        let main_path = unique_test_db("loop");
        {
            let conn = Connection::open(&main_path).unwrap();
            conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)", [])
                .unwrap();
        }
        let backup_path = unique_test_db("loop_bak");
        fs::copy(&main_path, &backup_path).unwrap();

        for _ in 0..10 {
            let conn = Connection::open(&main_path).unwrap();
            let alias = "bkp";
            conn.execute(
                &format!(
                    "ATTACH DATABASE '{}' AS {}",
                    backup_path.to_string_lossy(),
                    alias
                ),
                [],
            )
            .unwrap();
            let n = count_pragma_rows(&conn, &pragma_table_info_attached(alias, "t")).unwrap();
            assert!(n >= 1);
            conn.execute(&format!("DETACH DATABASE {}", alias), []).unwrap();
            drop(conn);
        }
        let _ = fs::remove_file(&main_path);
        let _ = fs::remove_file(&backup_path);
    }

    #[test]
    fn invalid_file_fails_integrity_or_open() {
        let bad = unique_test_db("bad");
        fs::write(&bad, b"not a sqlite database file").unwrap();
        let r = test_database_integrity(bad.to_string_lossy().as_ref());
        let _ = fs::remove_file(&bad);
        assert!(r.is_err() || !r.unwrap().to_lowercase().contains("ok"));
    }

    #[test]
    fn validate_backup_missing_table_errors() {
        let p = unique_test_db("empty");
        {
            let conn = Connection::open(&p).unwrap();
            conn.execute("CREATE TABLE only_one (x INTEGER)", []).unwrap();
        }
        let err = validate_backup_tables_readonly(&p, &["only_one", "missing_table"]).unwrap_err();
        assert!(err.contains("missing_table"));
        let _ = fs::remove_file(&p);
    }
}
