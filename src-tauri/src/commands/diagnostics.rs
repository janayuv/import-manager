//! Operator diagnostics export (no secrets).

use crate::commands::db_management::ensure_command_permission;
use crate::correlation;
use crate::db::DbState;
use crate::desktop_session::{DesktopSessionState, DEFAULT_ADMIN_USER_ID};
use crate::migrations::{compute_schema_health, embedded_migration_head_version};
use crate::recovery_mode::RecoveryModeState;
use crate::security::credentials::read_password_history_depth;
use crate::security::lockout::SecurityPolicy;
use rusqlite::{params, OptionalExtension};
use serde_json::json;
use std::io::{Read, Write};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

const LOG_TAIL_MAX_BYTES: u64 = 2 * 1024 * 1024;
const SAFE_METADATA_KEYS: &[&str] = &[
    "kpi_snapshot_retention_days",
    "kpi_retention_last_run",
    "last_backup_time",
];

fn snapshot_cache_meta(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let cache_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM dashboard_metrics_cache",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let kpi_snap: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM dashboard_kpi_snapshot",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let exc_snap: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM dashboard_exception_snapshot",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let wf_snap: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM dashboard_workflow_snapshot",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(json!({
        "dashboardMetricsCacheRows": cache_rows,
        "dashboardKpiSnapshotRows": kpi_snap,
        "dashboardExceptionSnapshotRows": exc_snap,
        "dashboardWorkflowSnapshotRows": wf_snap,
    }))
}

/// Security-focused metadata for operators (no password hashes or other secrets).
fn security_metadata_for_export(
    app: &tauri::AppHandle,
    conn: &rusqlite::Connection,
    correlation_id: &str,
) -> Result<serde_json::Value, String> {
    let active_policy = SecurityPolicy::load(conn);
    let policy_version: i64 = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'security.policy_version'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);

    let latest_policy_version: Option<serde_json::Value> = conn
        .query_row(
            "SELECT version, changed_at, changed_by FROM security_policy_versions ORDER BY version DESC LIMIT 1",
            [],
            |row| {
                Ok(json!({
                    "version": row.get::<_, i64>(0)?,
                    "changedAt": row.get::<_, String>(1)?,
                    "changedBy": row.get::<_, Option<String>>(2)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let lockout_state: Option<serde_json::Value> = conn
        .query_row(
            "SELECT failure_count, window_started_at, locked_until, updated_at \
             FROM auth_lockout_state WHERE lower(user_id) = lower(?1)",
            params![DEFAULT_ADMIN_USER_ID],
            |row| {
                Ok(json!({
                    "failureCount": row.get::<_, i64>(0)?,
                    "windowStartedAt": row.get::<_, String>(1)?,
                    "lockedUntil": row.get::<_, Option<String>>(2)?,
                    "updatedAt": row.get::<_, String>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let desktop_session_summary = app
        .try_state::<DesktopSessionState>()
        .and_then(|st| {
            st.read_session().map(|info| {
                json!({
                    "active": true,
                    "userId": info.user_id,
                    "username": info.username,
                    "role": info.role,
                    "sessionId": info.session_id,
                    "sessionStartedRfc3339": info.session_started_rfc3339,
                    "expiresAtRfc3339": info.expires_at_rfc3339,
                })
            })
        })
        .unwrap_or(json!({ "active": false }));

    let mut stmt = conn
        .prepare(
            "SELECT action_name, timestamp, severity, status FROM user_activity_audit_logs \
             WHERE severity IN ('CRITICAL','SECURITY') \
             OR action_name LIKE 'security.%' \
             OR action_name LIKE 'auth.lock%' \
             OR action_name IN ('auth.session_terminated', 'auth.security_policy_updated') \
             ORDER BY timestamp DESC LIMIT 120",
        )
        .map_err(|e| e.to_string())?;
    let recent_security_audit: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            let sev = row
                .get::<_, Option<String>>(2)?
                .unwrap_or_else(|| "INFO".to_string());
            Ok(json!({
                "actionName": row.get::<_, String>(0)?,
                "timestamp": row.get::<_, String>(1)?,
                "severity": sev,
                "status": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(json!({
        "correlationId": correlation_id,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "activeSecurityPolicy": active_policy,
        "policyVersion": policy_version,
        "latestPolicyVersionRow": latest_policy_version,
        "passwordHistoryDepth": read_password_history_depth(conn),
        "lockoutState": lockout_state,
        "desktopSessionSummary": desktop_session_summary,
        "recentSecurityAuditTail": recent_security_audit,
    }))
}

fn backup_recovery_summary(
    app: &tauri::AppHandle,
    conn: &rusqlite::Connection,
) -> Result<serde_json::Value, String> {
    let recovery_mode_active = app
        .try_state::<RecoveryModeState>()
        .map(|s| s.is_active())
        .unwrap_or(false);
    let last_known_good_backup_id: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'last_known_good_backup_id'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty());
    let last_known_good_validation_at: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'last_known_good_backup_validation'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty());
    let last_backup_time: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'last_backup_time'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty());
    let last_restore_simulation_ok_at: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'last_restore_simulation_ok_at'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty());

    let mut stmt = conn
        .prepare(
            "SELECT id, filename, path, destination, created_at, validation_status, validation_checked_at, \
             CASE WHEN validation_message IS NULL THEN NULL ELSE substr(validation_message, 1, 400) END AS validation_message_excerpt, \
             restore_simulation_status, restore_simulation_checked_at, \
             CASE WHEN restore_simulation_message IS NULL THEN NULL ELSE substr(restore_simulation_message, 1, 400) END AS restore_sim_message_excerpt \
             FROM backups ORDER BY datetime(created_at) DESC LIMIT 40",
        )
        .map_err(|e| e.to_string())?;
    let recent: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "filename": row.get::<_, String>(1)?,
                "path": row.get::<_, String>(2)?,
                "destination": row.get::<_, String>(3)?,
                "createdAt": row.get::<_, String>(4)?,
                "validationStatus": row.get::<_, Option<String>>(5)?,
                "validationCheckedAt": row.get::<_, Option<String>>(6)?,
                "validationMessageExcerpt": row.get::<_, Option<String>>(7)?,
                "restoreSimulationStatus": row.get::<_, Option<String>>(8)?,
                "restoreSimulationCheckedAt": row.get::<_, Option<String>>(9)?,
                "restoreSimulationMessageExcerpt": row.get::<_, Option<String>>(10)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(json!({
        "recoveryModeActive": recovery_mode_active,
        "recoveryActivationHint": "Use --recovery or IMPORT_MANAGER_RECOVERY=1 only for local emergency access; restart normally afterward.",
        "lastKnownGoodBackupId": last_known_good_backup_id,
        "lastKnownGoodValidationAt": last_known_good_validation_at,
        "lastBackupTimeMetadata": last_backup_time,
        "lastRestoreSimulationOkAt": last_restore_simulation_ok_at,
        "recentBackups": recent,
    }))
}

fn safe_app_metadata(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut out = serde_json::Map::new();
    for key in SAFE_METADATA_KEYS {
        let v: Option<String> = conn
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(s) = v.filter(|s| !s.trim().is_empty()) {
            out.insert((*key).to_string(), json!(s));
        }
    }
    Ok(json!(out))
}

fn tail_file_bytes(path: &std::path::Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let len = f.metadata().map_err(|e| e.to_string())?.len();
    if len <= max_bytes {
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        return Ok(buf);
    }
    let skip = len.saturating_sub(max_bytes);
    use std::io::Seek;
    f.seek(std::io::SeekFrom::Start(skip))
        .map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

fn export_diagnostics_bundle_sync(
    app: &tauri::AppHandle,
    caller_user_id: &str,
    output_path: &str,
    correlation_id: &str,
    client_reported_app_version: Option<&str>,
) -> Result<(), String> {
    let native_ver = env!("CARGO_PKG_VERSION");
    let client_trim = client_reported_app_version
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let version_manifest = match client_trim {
        Some(c) => json!({
            "nativeAppVersion": native_ver,
            "clientReportedAppVersion": c,
            "clientMatchesNative": c == native_ver,
        }),
        None => json!({
            "nativeAppVersion": native_ver,
            "clientReportedAppVersion": serde_json::Value::Null,
            "clientMatchesNative": serde_json::Value::Null,
        }),
    };

    let db_state = app
        .try_state::<DbState>()
        .ok_or_else(|| correlation::annotate_err(correlation_id, "Application database not ready"))?;
    let (schema_health, snapshot_meta, safe_meta, security_meta, backup_recovery) = {
        let conn = db_state
            .db
            .lock()
            .map_err(|e| correlation::annotate_err(correlation_id, e.to_string()))?;
        ensure_command_permission(&conn, Some(caller_user_id), "audit.view")
            .map_err(|e| correlation::annotate_err(correlation_id, e))?;
        let schema_health = compute_schema_health(&conn);
        let snapshot_meta = snapshot_cache_meta(&conn)
            .map_err(|e| correlation::annotate_err(correlation_id, e))?;
        let safe_meta = safe_app_metadata(&conn)
            .map_err(|e| correlation::annotate_err(correlation_id, e))?;
        let security_meta = security_metadata_for_export(app, &conn, correlation_id)
            .map_err(|e| correlation::annotate_err(correlation_id, e))?;
        let backup_recovery = backup_recovery_summary(app, &conn)
            .map_err(|e| correlation::annotate_err(correlation_id, e))?;
        (
            schema_health,
            snapshot_meta,
            safe_meta,
            security_meta,
            backup_recovery,
        )
    };

    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| correlation::annotate_err(correlation_id, e.to_string()))?;
    let log_path = log_dir.join("app.log");
    let log_tail = tail_file_bytes(&log_path, LOG_TAIL_MAX_BYTES)
        .map_err(|e| correlation::annotate_err(correlation_id, e))?;

    let env_summary = json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
    });

    let recovery_mode_active = app
        .try_state::<RecoveryModeState>()
        .map(|s| s.is_active())
        .unwrap_or(false);

    let manifest = json!({
        "correlationId": correlation_id,
        "appVersion": native_ver,
        "versionDetail": version_manifest,
        "buildGitHash": env!("IMPORT_MANAGER_GIT_HASH"),
        "buildDate": env!("IMPORT_MANAGER_BUILD_DATE"),
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "embeddedMigrationHeadVersion": embedded_migration_head_version(),
        "schemaHealth": schema_health,
        "environment": env_summary,
        "safeAppMetadata": safe_meta,
        "snapshotAndCache": snapshot_meta,
        "securityMetadata": "security/security_metadata.json",
        "recoveryModeActive": recovery_mode_active,
        "backupRecoverySummary": "recovery/backup_recovery_summary.json",
        "logNote": "app.log is tail-only when file exceeds 2 MiB",
    });

    let file = std::fs::File::create(output_path)
        .map_err(|e| correlation::annotate_err(correlation_id, e.to_string()))?;
    let mut zip = ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file("manifest.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&manifest)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.start_file("logs/app.log.tail.txt", opts)
        .map_err(|e| e.to_string())?;
    if log_tail.is_empty() {
        zip.write_all(b"(no log file or empty)\n")
            .map_err(|e| e.to_string())?;
    } else {
        zip.write_all(&log_tail).map_err(|e| e.to_string())?;
    }

    zip.start_file("security/security_metadata.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&security_meta)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.start_file("recovery/backup_recovery_summary.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&backup_recovery)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.finish()
        .map_err(|e| correlation::annotate_err(correlation_id, e.to_string()))?;

    if let Some(db_state) = app.try_state::<DbState>() {
        if let Ok(conn) = db_state.db.lock() {
            let basename = std::path::Path::new(output_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let detail = serde_json::json!({
                "correlationId": correlation_id,
                "outputBasename": basename,
            })
            .to_string();
            crate::services::user_activity_audit::log_activity(
                &conn,
                Some(caller_user_id),
                "operations.diagnostics_export",
                None,
                None,
                Some(&detail),
                "success",
            );
        }
    }

    log::info!(
        target: "import_manager::diagnostics",
        "event=export_diagnostics_bundle_written correlation_id={} path={}",
        correlation_id,
        output_path
    );
    Ok(())
}

/// Writes a zip diagnostics bundle to `output_path` (blocking; call from `spawn_blocking`).
#[tauri::command]
pub async fn export_diagnostics_bundle(
    caller_user_id: String,
    output_path: String,
    client_reported_app_version: Option<String>,
    session: tauri::State<'_, DesktopSessionState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let cid = correlation::new_id();
    session
        .assert_caller_user(caller_user_id.trim())
        .map_err(|e| correlation::annotate_err(&cid, e))?;
    log::info!(
        target: "import_manager::diagnostics",
        "event=export_diagnostics_bundle_start correlation_id={}",
        cid
    );
    let app_c = app.clone();
    let path = output_path.clone();
    let uid = caller_user_id.clone();
    let client_v = client_reported_app_version.clone();
    let cid_inner = cid.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        export_diagnostics_bundle_sync(
            &app_c,
            uid.trim(),
            &path,
            &cid_inner,
            client_v.as_deref(),
        )
    })
    .await
    .map_err(|e| correlation::annotate_err(&cid, format!("diagnostics task: {e}")))?;
    result?;
    log::info!(
        target: "import_manager::diagnostics",
        "event=export_diagnostics_bundle_done correlation_id={}",
        cid
    );
    Ok(())
}
