//! System health metrics for the admin dashboard (DB size, backups, snapshots, background thread).

use crate::db::DbState;
use crate::migrations::compute_schema_health;
use crate::services::background_health;
use chrono::{DateTime, Local, NaiveDateTime, TimeZone, Utc};
use rusqlite::OptionalExtension;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSummary {
    pub overall: String,
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemHealthMetrics {
    /// Semver from the Rust binary (`Cargo.toml`); matches packaged Tauri app version.
    pub app_version: String,
    pub database_size_bytes: i64,
    pub database_page_count: i64,
    pub database_page_size: i64,
    pub last_backup_time: Option<String>,
    pub last_snapshot_time: Option<String>,
    /// RFC3339 from `app_metadata.dashboard_snapshot_last_rebuild_at` after admin rebuild.
    pub last_dashboard_snapshot_rebuild_at: Option<String>,
    pub background_task_durations: background_health::BackgroundTaskDurations,
    pub active_workflow_count: i64,
    pub health_summary: HealthSummary,
    pub schema_health: crate::migrations::SchemaHealth,
}

fn max_snapshot_created_at(conn: &rusqlite::Connection) -> Result<Option<String>, String> {
    let kpi: Option<String> = conn
        .query_row(
            "SELECT MAX(created_at) FROM dashboard_kpi_snapshot",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    let exc: Option<String> = conn
        .query_row(
            "SELECT MAX(created_at) FROM dashboard_exception_snapshot",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    let wf: Option<String> = conn
        .query_row(
            "SELECT MAX(created_at) FROM dashboard_workflow_snapshot",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    Ok([kpi, exc, wf].into_iter().flatten().max())
}

fn build_health_summary(
    last_backup: &Option<String>,
    last_snapshot: &Option<String>,
    bg: &background_health::BackgroundTaskDurations,
) -> HealthSummary {
    let mut warnings: Vec<String> = Vec::new();

    match last_backup
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        None => {
            warnings.push("No backup completion time recorded in app metadata.".to_string());
        }
        Some(s) => {
            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                let age = Utc::now().signed_duration_since(dt.with_timezone(&Utc));
                if age.num_hours() > 24 * 7 {
                    warnings.push(format!("Last backup is older than 7 days (recorded {s})."));
                }
            }
        }
    }

    match last_snapshot {
        None => {
            warnings
                .push("No dashboard KPI/exception/workflow snapshot timestamps found.".to_string());
        }
        Some(snap) => {
            if let Ok(naive) = NaiveDateTime::parse_from_str(snap, "%Y-%m-%d %H:%M:%S") {
                if let Some(local_dt) = Local.from_local_datetime(&naive).single() {
                    let age = Local::now().signed_duration_since(local_dt);
                    if age.num_hours() > 48 {
                        warnings
                            .push("Latest dashboard snapshot is older than 48 hours.".to_string());
                    }
                }
            }
        }
    }

    if let Some(ts) = bg.last_fast_tick_unix_ms {
        let age_ms = Utc::now().timestamp_millis().saturating_sub(ts);
        if age_ms > 5 * 60 * 1000 {
            warnings.push(
                "Background fast tick has not completed in over 5 minutes (host may be stalled)."
                    .to_string(),
            );
        }
    }

    if let Some(ref e) = bg.last_boe_maintenance_error {
        if !e.is_empty() {
            warnings.push(format!("Last BOE maintenance failed: {e}"));
        }
    }
    if let Some(ref e) = bg.last_integrity_error {
        if !e.is_empty() {
            warnings.push(format!("Last integrity check failed: {e}"));
        }
    }

    let overall = if warnings.is_empty() {
        "healthy".to_string()
    } else {
        "warning".to_string()
    };
    HealthSummary { overall, warnings }
}

#[tauri::command]
pub fn get_system_health_metrics(
    db_state: tauri::State<'_, DbState>,
) -> Result<SystemHealthMetrics, String> {
    let conn = db_state.db.lock().map_err(|e| e.to_string())?;

    let database_page_count: i64 = conn
        .query_row("PRAGMA page_count;", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let database_page_size: i64 = conn
        .query_row("PRAGMA page_size;", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let database_size_bytes = database_page_count.saturating_mul(database_page_size);

    let last_backup_time: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'last_backup_time'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty());

    let last_snapshot_time = max_snapshot_created_at(&conn)?;

    let last_dashboard_snapshot_rebuild_at: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'dashboard_snapshot_last_rebuild_at'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty());

    let active_workflow_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status = 'IN_PROGRESS'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let background_task_durations = background_health::snapshot();
    let health_summary = build_health_summary(
        &last_backup_time,
        &last_snapshot_time,
        &background_task_durations,
    );

    let schema_health = compute_schema_health(&conn);

    let mut health_summary = health_summary;
    if schema_health.state != "ok" {
        health_summary.warnings.push(format!(
            "Schema health: {} (applied v{} / expected v{})",
            schema_health.state,
            schema_health.applied_version,
            schema_health.expected_version
        ));
        health_summary.overall = "warning".to_string();
    }

    Ok(SystemHealthMetrics {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        database_size_bytes,
        database_page_count,
        database_page_size,
        last_backup_time,
        last_snapshot_time,
        last_dashboard_snapshot_rebuild_at,
        background_task_durations,
        active_workflow_count,
        health_summary,
        schema_health,
    })
}
