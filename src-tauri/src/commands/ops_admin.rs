//! Admin operational controls (dashboard cache rebuild, etc.).

use crate::commands::dashboard_metrics::{
    generate_dashboard_exception_snapshot, generate_dashboard_kpi_snapshot,
    generate_dashboard_workflow_snapshot,
};
use crate::correlation;
use crate::db::DbState;
use crate::desktop_session::DesktopSessionState;
use rusqlite::params;
use serde::Serialize;
use std::sync::{Mutex, TryLockError};
use tauri::State;

lazy_static::lazy_static! {
    static ref DASHBOARD_REBUILD_LOCK: Mutex<()> = Mutex::new(());
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildDashboardResult {
    pub cleared_cache_rows: u64,
    pub kpi_ok: bool,
    pub exception_ok: bool,
    pub workflow_ok: bool,
    pub warnings: Vec<String>,
    pub correlation_id: String,
}

/// Clears dashboard metrics cache and regenerates KPI / exception / workflow snapshots for today.
/// Idempotent aside from overwriting same-day snapshot rows. Admin-only; excludes concurrent runs.
#[tauri::command]
pub fn rebuild_dashboard_snapshots(
    caller_user_id: String,
    state: State<DbState>,
    session: State<DesktopSessionState>,
) -> Result<RebuildDashboardResult, String> {
    let cid = correlation::new_id();
    session
        .assert_admin_caller(&state, caller_user_id.trim())
        .map_err(|e| correlation::annotate_err(&cid, e))?;

    let _guard = DASHBOARD_REBUILD_LOCK.try_lock().map_err(|e| match e {
        TryLockError::Poisoned(_) => {
            correlation::annotate_err(&cid, "Dashboard rebuild lock poisoned.".to_string())
        }
        TryLockError::WouldBlock => correlation::annotate_err(
            &cid,
            "A dashboard rebuild is already in progress.".to_string(),
        ),
    })?;

    log::info!(
        target: "import_manager::dashboard",
        "event=rebuild_dashboard_snapshots_start correlation_id={}",
        cid,
    );

    let conn = state
        .db
        .lock()
        .map_err(|e| correlation::annotate_err(&cid, e.to_string()))?;

    let cleared_cache_rows = conn
        .execute("DELETE FROM dashboard_metrics_cache", [])
        .map_err(|e| correlation::annotate_err(&cid, e.to_string()))? as u64;

    let mut warnings: Vec<String> = Vec::new();
    let kpi_ok = match generate_dashboard_kpi_snapshot(&conn) {
        Ok(()) => true,
        Err(e) => {
            warnings.push(format!("kpi_snapshot: {e}"));
            false
        }
    };
    let exception_ok = match generate_dashboard_exception_snapshot(&conn) {
        Ok(()) => true,
        Err(e) => {
            warnings.push(format!("exception_snapshot: {e}"));
            false
        }
    };
    let workflow_ok = match generate_dashboard_workflow_snapshot(&conn) {
        Ok(()) => true,
        Err(e) => {
            warnings.push(format!("workflow_snapshot: {e}"));
            false
        }
    };

    let status = if kpi_ok && exception_ok && workflow_ok && warnings.is_empty() {
        "success"
    } else if kpi_ok || exception_ok || workflow_ok {
        "partial"
    } else {
        "failure"
    };
    crate::services::user_activity_audit::log_activity(
        &conn,
        Some(caller_user_id.trim()),
        "operations.snapshot_rebuild",
        None,
        None,
        Some(
            &serde_json::json!({
                "correlationId": cid,
                "kpiOk": kpi_ok,
                "exceptionOk": exception_ok,
                "workflowOk": workflow_ok,
                "warningCount": warnings.len(),
            })
            .to_string(),
        ),
        status,
    );

    let finished_at = chrono::Utc::now().to_rfc3339();
    if let Err(e) = conn.execute(
        "INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)",
        params![
            "dashboard_snapshot_last_rebuild_at",
            finished_at.as_str()
        ],
    ) {
        log::warn!(
            target: "import_manager::dashboard",
            "event=rebuild_dashboard_snapshots_metadata_skip correlation_id={} err={}",
            cid,
            e
        );
    }

    log::info!(
        target: "import_manager::dashboard",
        "event=rebuild_dashboard_snapshots_done correlation_id={} kpi_ok={} exception_ok={} workflow_ok={} warning_count={}",
        cid,
        kpi_ok,
        exception_ok,
        workflow_ok,
        warnings.len(),
    );

    Ok(RebuildDashboardResult {
        cleared_cache_rows,
        kpi_ok,
        exception_ok,
        workflow_ok,
        warnings,
        correlation_id: cid,
    })
}
