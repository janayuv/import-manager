//! Operator diagnostics export (no secrets).

use crate::commands::db_management::ensure_command_permission;
use crate::correlation;
use crate::db::DbState;
use crate::desktop_session::DesktopSessionState;
use crate::migrations::{compute_schema_health, embedded_migration_head_version};
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
    let (schema_health, snapshot_meta, safe_meta) = {
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
        (schema_health, snapshot_meta, safe_meta)
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
