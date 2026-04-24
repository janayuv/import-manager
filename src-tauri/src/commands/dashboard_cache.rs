//! Short-lived dashboard metrics cache + KPI snapshot retention.

use crate::db::DbState;
use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

const CACHE_TTL_SECS: i64 = 45;

/// Run at most once per calendar day (called from background tick).
pub fn tick_dashboard_maintenance(app: &AppHandle) {
    let Some(state) = app.try_state::<DbState>() else {
        return;
    };
    let Ok(conn) = state.db.lock() else {
        return;
    };
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let last: String = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'kpi_retention_last_run'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_default();
    if last == today {
        return;
    }
    match crate::commands::workflow_job_monitoring::run_daily_dashboard_tick_jobs(&conn) {
        Ok(()) => {
            let _ = conn.execute(
                "INSERT INTO app_metadata (key, value) VALUES ('kpi_retention_last_run', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![today],
            );
        }
        Err(e) => {
            log::warn!("dashboard background jobs tick: {}", e);
        }
    }
}

/// Clears all cached dashboard metric payloads (call after mutating data).
pub fn invalidate_dashboard_metrics_cache(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM dashboard_metrics_cache", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_cached_metrics_json(
    conn: &Connection,
    cache_key: &str,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT metrics_payload FROM dashboard_metrics_cache
             WHERE cache_key = ?1 AND datetime(expires_at) > datetime('now')",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(params![cache_key], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    if let Some(r) = rows.next().transpose().map_err(|e| e.to_string())? {
        Ok(Some(r))
    } else {
        Ok(None)
    }
}

pub fn write_metrics_cache(
    conn: &Connection,
    cache_key: &str,
    payload_json: &str,
    snapshot_at_rfc3339: &str,
) -> Result<(), String> {
    let expires = chrono::DateTime::parse_from_rfc3339(snapshot_at_rfc3339)
        .map(|dt| dt.with_timezone(&chrono::Utc) + chrono::Duration::seconds(CACHE_TTL_SECS))
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|_| {
            (chrono::Utc::now() + chrono::Duration::seconds(CACHE_TTL_SECS)).to_rfc3339()
        });
    conn.execute(
        "INSERT INTO dashboard_metrics_cache (cache_key, metrics_payload, snapshot_at, expires_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(cache_key) DO UPDATE SET
           metrics_payload = excluded.metrics_payload,
           snapshot_at = excluded.snapshot_at,
           expires_at = excluded.expires_at",
        params![cache_key, payload_json, snapshot_at_rfc3339, expires],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete KPI snapshots older than retention (from app_metadata `kpi_snapshot_retention_days`).
pub fn run_kpi_snapshot_retention_cleanup(conn: &Connection) -> Result<i64, String> {
    let days: i64 = conn
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM app_metadata WHERE key = 'kpi_snapshot_retention_days'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(365)
        .max(30)
        .min(3650);
    let cutoff = format!("-{days} days");
    let n = conn
        .execute(
            "DELETE FROM kpi_daily_snapshots WHERE snapshot_date < date('now', ?1)",
            params![&cutoff],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as i64)
}

/// Purge old `dashboard_activity_log` rows (default 90 days, `dashboard_activity_retention_days`).
pub fn run_dashboard_activity_retention_cleanup(conn: &Connection) -> Result<i64, String> {
    let days: i64 = conn
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM app_metadata WHERE key = 'dashboard_activity_retention_days'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(90)
        .max(7)
        .min(3650);
    let cutoff = format!("-{days} days");
    let n = conn
        .execute(
            "DELETE FROM dashboard_activity_log WHERE datetime(timestamp) < datetime('now', ?1)",
            params![&cutoff],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as i64)
}
