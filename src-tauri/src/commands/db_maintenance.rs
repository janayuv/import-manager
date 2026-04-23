//! Periodic SQLite maintenance (ANALYZE / VACUUM) based on `app_metadata`.

use chrono::{DateTime, Duration, Utc};
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};

const LAST_MAINTENANCE_KEY: &str = "last_database_maintenance";
const MAINTENANCE_INTERVAL: i64 = 7;

fn parse_last_maintenance_utc(s: &str) -> Option<DateTime<Utc>> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(t) {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(n) = chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%d %H:%M:%S") {
        return Some(n.and_utc());
    }
    if let Ok(n) = chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%d %H:%M:%S%.f") {
        return Some(n.and_utc());
    }
    chrono::NaiveDate::parse_from_str(t, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.and_hms_opt(0, 0, 0).map(|dt| dt.and_utc()))
}

fn should_run_maintenance(last_value: Option<String>) -> bool {
    let Some(s) = last_value else {
        return true;
    };
    let t = s.trim();
    if t.is_empty() {
        return true;
    }
    let Some(last) = parse_last_maintenance_utc(t) else {
        return true;
    };
    Utc::now().signed_duration_since(last) > Duration::days(MAINTENANCE_INTERVAL)
}

/// Runs [ANALYZE] and [VACUUM] if [LAST_MAINTENANCE_KEY] is missing, empty, invalid, or older
/// than 7 days; then records the current UTC time in [app_metadata].
pub fn run_database_maintenance(conn: &Connection) -> Result<(), String> {
    let last: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            params![LAST_MAINTENANCE_KEY],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if !should_run_maintenance(last) {
        return Ok(());
    }

    conn.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    conn.execute_batch("ANALYZE;").map_err(|e| e.to_string())?;

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![LAST_MAINTENANCE_KEY, now],
    )
    .map_err(|e| e.to_string())?;

    log::info!(
        target: "import_manager::database",
        "Database maintenance completed"
    );
    Ok(())
}

/// After permanent deletes in recycle cleanup, defragment and update query planner. Updates
/// [LAST_MAINTENANCE_KEY] so the weekly [run_database_maintenance] usually skips the same run.
pub fn run_maintenance_after_recycle_cleanup(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    conn.execute_batch("ANALYZE;").map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![LAST_MAINTENANCE_KEY, now],
    )
    .map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::database",
        "Database maintenance (VACUUM/ANALYZE) after recycle cleanup"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_run_empty_or_missing() {
        assert!(should_run_maintenance(None));
        assert!(should_run_maintenance(Some(String::new())));
        assert!(should_run_maintenance(Some("  ".to_string())));
    }

    #[test]
    fn should_not_run_within_window() {
        let recent = (Utc::now() - Duration::days(1)).to_rfc3339();
        assert!(!should_run_maintenance(Some(recent)));
    }

    #[test]
    fn should_run_stale() {
        let old = (Utc::now() - Duration::days(8)).to_rfc3339();
        assert!(should_run_maintenance(Some(old)));
    }
}
