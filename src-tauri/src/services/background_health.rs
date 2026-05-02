//! In-process stats for the background maintenance thread (last run durations, timestamps).

use chrono::Utc;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTaskDurations {
    pub last_fast_tick_unix_ms: Option<i64>,
    pub fast_tick_total_ms: Option<u64>,
    pub backup_schedules_ms: Option<u64>,
    pub dashboard_maintenance_ms: Option<u64>,
    pub governance_ms: Option<u64>,
    pub last_heavy_tick_unix_ms: Option<i64>,
    pub heavy_tick_total_ms: Option<u64>,
    pub boe_maintenance_ms: Option<u64>,
    pub integrity_check_ms: Option<u64>,
    pub last_boe_maintenance_error: Option<String>,
    pub last_integrity_error: Option<String>,
}

fn cell() -> &'static Mutex<BackgroundTaskDurations> {
    static CELL: OnceLock<Mutex<BackgroundTaskDurations>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(BackgroundTaskDurations::default()))
}

pub fn record_fast_tick(total_ms: u64, backup_ms: u64, dashboard_ms: u64, governance_ms: u64) {
    let Ok(mut g) = cell().lock() else {
        return;
    };
    let now = Utc::now().timestamp_millis();
    g.last_fast_tick_unix_ms = Some(now);
    g.fast_tick_total_ms = Some(total_ms);
    g.backup_schedules_ms = Some(backup_ms);
    g.dashboard_maintenance_ms = Some(dashboard_ms);
    g.governance_ms = Some(governance_ms);
}

pub fn record_heavy_tick(
    total_ms: u64,
    boe_ms: u64,
    integrity_ms: u64,
    boe_err: Option<String>,
    integrity_err: Option<String>,
) {
    let Ok(mut g) = cell().lock() else {
        return;
    };
    let now = Utc::now().timestamp_millis();
    g.last_heavy_tick_unix_ms = Some(now);
    g.heavy_tick_total_ms = Some(total_ms);
    g.boe_maintenance_ms = Some(boe_ms);
    g.integrity_check_ms = Some(integrity_ms);
    g.last_boe_maintenance_error = boe_err;
    g.last_integrity_error = integrity_err;
}

pub fn snapshot() -> BackgroundTaskDurations {
    cell().lock().map(|g| g.clone()).unwrap_or_default()
}
