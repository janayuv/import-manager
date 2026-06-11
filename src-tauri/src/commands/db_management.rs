// Suppress naming convention warnings for Tauri interop
#![allow(non_snake_case)]

use crate::db::DbState;
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Local, Utc};
use cron::Schedule;
use fs4::available_space;
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection, OpenFlags, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::State;
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

use crate::services::user_activity_audit::{log_activity_with_severity, AuditSeverity};

/// How to interpret the cron wall clock (library field `time_zone`).
enum ScheduleCronZone {
    Utc,
    AsiaKolkata,
}

fn schedule_cron_zone_from_time_zone_field(s: &str) -> ScheduleCronZone {
    let t = s.trim();
    if t.eq_ignore_ascii_case("asia/kolkata")
        || t.eq_ignore_ascii_case("ist")
        || t.contains("Kolkata")
    {
        ScheduleCronZone::AsiaKolkata
    } else {
        ScheduleCronZone::Utc
    }
}

/// Six-field cron (sec min hour day-of-month month day-of-week). Evaluated in `time_zone`
/// (`UTC` or `Asia`/`Kolkata`/`IST`); the returned instant is stored as UTC RFC3339.
fn compute_next_run_rfc3339(cron_expr: &str, time_zone: &str) -> Result<String, String> {
    let schedule =
        Schedule::from_str(cron_expr.trim()).map_err(|e| format!("Invalid schedule: {}", e))?;
    let next_utc: DateTime<Utc> = match schedule_cron_zone_from_time_zone_field(time_zone) {
        ScheduleCronZone::AsiaKolkata => {
            use chrono_tz::Asia::Kolkata;
            let n = schedule
                .upcoming(Kolkata)
                .next()
                .ok_or_else(|| "No upcoming runs for this cron expression".to_string())?;
            n.with_timezone(&Utc)
        }
        ScheduleCronZone::Utc => schedule
            .upcoming(Utc)
            .next()
            .ok_or_else(|| "No upcoming runs for this cron expression".to_string())?,
    };
    Ok(next_utc.to_rfc3339())
}

fn sha256_hex_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Cannot read backup file: {}", e))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|e| format!("Failed to hash file: {}", e))?;
    Ok(hex::encode(hasher.finalize()))
}

/// `backup_2025.db` → `backup_2025.enc` (for encrypted artifacts).
fn enc_basename_for_staging_db(staging: &str) -> String {
    if let Some(s) = staging
        .strip_suffix(".db")
        .or_else(|| staging.strip_suffix(".DB"))
    {
        format!("{}.enc", s)
    } else {
        format!("{}.enc", staging)
    }
}

fn sidecar_sha256_path(db_file: &Path) -> PathBuf {
    PathBuf::from(format!("{}{}", db_file.to_string_lossy(), ".sha256"))
}

fn write_sha256_sidecar(db_file: &Path, hash_hex: &str) -> Result<(), String> {
    let side = sidecar_sha256_path(db_file);
    let tmp = PathBuf::from(format!("{}.tmp", side.to_string_lossy()));
    fs::write(&tmp, format!("{}\n", hash_hex.trim()))
        .map_err(|e| format!("Failed to write checksum file: {}", e))?;
    fs::rename(&tmp, &side).map_err(|e| format!("Failed to finalize checksum file: {}", e))
}

fn read_expected_sha256_from_sidecar(sidecar: &Path) -> Result<String, String> {
    let raw =
        fs::read_to_string(sidecar).map_err(|e| format!("Cannot read checksum file: {}", e))?;
    let line = raw.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        return Err("Checksum file is empty".to_string());
    }
    let token = line.split_whitespace().next().unwrap_or("").to_string();
    if token.is_empty() {
        return Err("Invalid checksum file format".to_string());
    }
    Ok(token)
}

/// Non-empty file; if `name.db.sha256` exists beside `name.db`, require SHA256 match.
fn validate_local_backup_file_for_restore(local_path: &Path) -> Result<(), String> {
    let meta =
        fs::metadata(local_path).map_err(|e| format!("Backup file not accessible: {}", e))?;
    if meta.len() == 0 {
        return Err("Backup file is empty. Restore was canceled.".to_string());
    }
    let side = sidecar_sha256_path(local_path);
    if !side.exists() {
        log::warn!(
            target: "import_manager::restore",
            "No SHA256 sidecar for {}; continuing (backup created before checksum support)",
            crate::utils::redaction::redact_path(local_path)
        );
        return Ok(());
    }
    let expected = read_expected_sha256_from_sidecar(&side)?;
    let actual = sha256_hex_file(local_path)?;
    if !expected.eq_ignore_ascii_case(&actual) {
        return Err(
            "Backup verification failed: the file does not match its saved SHA256 checksum. The file may be corrupted. Restore was canceled."
                .to_string(),
        );
    }
    Ok(())
}

const SQLITE_RETRY_ATTEMPTS: u32 = 3;
const SQLITE_RETRY_DELAY_MS: u64 = 500;
const BULK_DELETE_BATCH_RETRY_ATTEMPTS: u32 = 3;
const BULK_DELETE_BATCH_RETRY_DELAY_MS: u64 = 250;
const BULK_DELETE_OPERATION_TIMEOUT_MS: u64 = 10 * 60 * 1000;
const BULK_DELETE_OPERATION_TIMEOUT_MIN_MS: u64 = 30 * 1000;
const BULK_DELETE_OPERATION_TIMEOUT_MAX_MS: u64 = 10 * 60 * 1000;
const BULK_DELETE_UNDO_WINDOW_SECS: i64 = 5 * 60;
const BACKUP_RETENTION_MAX: usize = 30;
const APP_METADATA_BACKUP_COUNT: &str = "backup_count";
const APP_METADATA_RESTORE_COUNT: &str = "restore_count";
const APP_METADATA_LAST_BACKUP_TIME: &str = "last_backup_time";
const APP_METADATA_LAST_RESTORE_TIME: &str = "last_restore_time";
const APP_METADATA_RESTORE_STATUS: &str = "restore_status";
/// RFC3339 timestamp written immediately after the restore **transaction** commits (before admin recovery).
const APP_METADATA_RESTORE_TX_COMMITTED_AT: &str = "restore_transaction_committed_at";
const FREQUENT_BACKUP_WARN_SECS: i64 = 10;
/// 5 GiB — observability warning only (no blocking).
const LARGE_DB_WARN_BYTES: u64 = 5u64 * 1024 * 1024 * 1024;
const APP_METADATA_HARD_DELETE_PIN_HASH: &str = "hard_delete_pin_hash";
const APP_METADATA_HARD_DELETE_PIN_ENABLED: &str = "hard_delete_pin_enabled";
const APP_METADATA_HARD_DELETE_PIN_THRESHOLD: &str = "hard_delete_pin_threshold";
const APP_METADATA_HARD_DELETE_FAILED_ATTEMPTS: &str = "hard_delete_failed_attempts";
const APP_METADATA_HARD_DELETE_LOCK_UNTIL: &str = "hard_delete_lock_until";
const HARD_DELETE_PIN_DEFAULT_THRESHOLD: u32 = 10;
const HARD_DELETE_PIN_MAX_FAILED_ATTEMPTS: u32 = 3;
const HARD_DELETE_PIN_LOCK_SECS: i64 = 30;
const DB_STATS_CACHE_TTL_MS: u128 = 5_000;
const PERM_BACKUP_CREATE: &str = "backup.create";
const PERM_BACKUP_RESTORE: &str = "backup.restore";
const PERM_BACKUP_SCHEDULE: &str = "backup.schedule";
const SETTINGS_BACKUP_SECONDARY_PATH: &str = "backup.secondary_local_path";
const SETTINGS_BACKUP_SECONDARY_ENABLED: &str = "backup.secondary_enabled";
const APP_METADATA_LAST_RESTORE_SIM_TICK: &str = "last_restore_simulation_scheduled_tick_at";
const APP_METADATA_BACKUP_SIZE_ALERT: &str = "backup_size_growth_last_alert";
const PERM_DATA_EDIT: &str = "data.edit";
const PERM_DATA_DELETE: &str = "data.delete";
const PERM_USER_MANAGE: &str = "role.write";
const PERM_ROLE_READ: &str = "role.read";
const PERM_ROLE_BOOTSTRAP: &str = "role.bootstrap";
const BULK_DELETE_LOCK_STORM_LIMIT: u32 = 6;
const SCALE_WARNING_BULK_RECORDS: usize = 10_000;
const SCALE_WARNING_RESTORE_TABLES: usize = 10;
const SCALE_WARNING_AUDIT_LIMIT: i64 = 5_000;
const SCALE_ESCALATION_WARN_COUNT: usize = 3;
const SCALE_ESCALATION_CRITICAL_COUNT: usize = 6;
const LIFECYCLE_IDLE_BOUNDARY_MS: u64 = 15 * 60 * 1000;
const LIFECYCLE_SUMMARY_INTERVAL: u64 = 25;

static BULK_DELETE_ACTIVE_COUNT: AtomicUsize = AtomicUsize::new(0);
static LARGE_BULK_OPERATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static LARGE_RESTORE_OPERATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static LARGE_AUDIT_QUERY_COUNT: AtomicUsize = AtomicUsize::new(0);
static AUDIT_QUERY_RUN_COUNT: AtomicU64 = AtomicU64::new(0);
static HEAVY_WORKFLOW_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static SQLITE_RETRY_EVENT_COUNT: AtomicUsize = AtomicUsize::new(0);
static LOCK_CONFLICT_EVENT_COUNT: AtomicUsize = AtomicUsize::new(0);
static HEAVY_WORKFLOW_FAILURE_COUNT: AtomicUsize = AtomicUsize::new(0);
static PERF_OBSERVATION_COUNT: AtomicU64 = AtomicU64::new(0);
static LAST_ACTIVITY_MS: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Default)]
struct PerfBaseline {
    count: u64,
    mean_ms: f64,
    m2_ms: f64,
    ewma_ms: f64,
    last_ms: f64,
    last_resource_units: usize,
    max_resource_units: usize,
    mean_resource_units: f64,
    long_ewma_ms: f64,
}

fn db_stats_cache() -> &'static Mutex<Option<(Instant, DatabaseStats)>> {
    static CACHE: OnceLock<Mutex<Option<(Instant, DatabaseStats)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn sqlite_retry_delay_ms(base_delay_ms: u64, attempt: u32) -> u64 {
    let factor = 1u64 << attempt.saturating_sub(1).min(3);
    base_delay_ms.saturating_mul(factor).min(2_000)
}

fn log_scale_escalation(counter: &AtomicUsize, workflow: &str, size: usize) {
    let seen = counter.fetch_add(1, Ordering::SeqCst).saturating_add(1);
    if seen >= SCALE_ESCALATION_CRITICAL_COUNT {
        log::warn!(
            target: "import_manager::scale",
            "event=scale.escalation level=critical workflow={} occurrence={} size={}",
            workflow,
            seen,
            size
        );
    } else if seen >= SCALE_ESCALATION_WARN_COUNT {
        log::warn!(
            target: "import_manager::scale",
            "event=scale.escalation level=warning workflow={} occurrence={} size={}",
            workflow,
            seen,
            size
        );
    } else {
        log::info!(
            target: "import_manager::scale",
            "event=scale.escalation level=notice workflow={} occurrence={} size={}",
            workflow,
            seen,
            size
        );
    }
}

fn log_failure_pattern(counter: &AtomicUsize, pattern: &str, detail: &str) {
    let seen = counter.fetch_add(1, Ordering::SeqCst).saturating_add(1);
    let level = if seen >= SCALE_ESCALATION_CRITICAL_COUNT {
        "critical"
    } else if seen >= SCALE_ESCALATION_WARN_COUNT {
        "warning"
    } else {
        "notice"
    };
    log::warn!(
        target: "import_manager::failure_pattern",
        "event=failure.pattern level={} pattern={} occurrence={} detail={}",
        level,
        pattern,
        seen,
        detail
    );
}

fn next_run_id(counter: &AtomicU64) -> u64 {
    counter.fetch_add(1, Ordering::SeqCst).saturating_add(1)
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn maybe_emit_lifecycle_summary(total_observations: u64) {
    if total_observations == 0 || total_observations % LIFECYCLE_SUMMARY_INTERVAL != 0 {
        return;
    }
    if let Ok(guard) = perf_baseline_registry().lock() {
        let workflows = guard.len();
        let avg_mean_ms = if workflows > 0 {
            guard.values().map(|b| b.mean_ms).sum::<f64>() / workflows as f64
        } else {
            0.0
        };
        let max_resource = guard
            .values()
            .map(|b| b.max_resource_units)
            .max()
            .unwrap_or(0);
        log::info!(
            target: "import_manager::lifecycle",
            "event=lifecycle.summary observations={} workflows={} avg_mean_ms={:.2} max_resource_units={}",
            total_observations,
            workflows,
            avg_mean_ms,
            max_resource
        );
    }
}

fn log_upgrade_readiness(operation: &str) {
    log::info!(
        target: "import_manager::upgrade_readiness",
        "event=upgrade.readiness operation={} restore_active={} active_bulk={} rollback_ready=true compatibility_profile=stable_v1",
        operation,
        crate::restore_control::restore_in_progress(),
        current_bulk_delete_active_count()
    );
}

pub fn governance_tick() {
    let total_observations = PERF_OBSERVATION_COUNT.load(Ordering::SeqCst);
    let retry_events = SQLITE_RETRY_EVENT_COUNT.load(Ordering::SeqCst);
    let lock_conflicts = LOCK_CONFLICT_EVENT_COUNT.load(Ordering::SeqCst);
    let heavy_failures = HEAVY_WORKFLOW_FAILURE_COUNT.load(Ordering::SeqCst);

    log::info!(
        target: "import_manager::governance",
        "event=governance.health_verification observations={} retry_events={} lock_conflicts={} heavy_failures={} active_bulk={}",
        total_observations,
        retry_events,
        lock_conflicts,
        heavy_failures,
        current_bulk_delete_active_count()
    );

    if let Ok(guard) = perf_baseline_registry().lock() {
        let workflow_count = guard.len();
        let drifted = guard
            .iter()
            .filter(|(_, b)| b.count >= 12 && b.ewma_ms > (b.long_ewma_ms * 1.25))
            .count();
        let unstable = guard
            .iter()
            .filter(|(_, b)| {
                if b.count <= 1 {
                    return false;
                }
                let variance = b.m2_ms / (b.count as f64 - 1.0);
                let stddev = variance.max(0.0).sqrt();
                stddev > (b.mean_ms * 0.5)
            })
            .count();
        let growth_risk = guard
            .iter()
            .filter(|(_, b)| {
                b.count >= 6
                    && b.last_resource_units > 0
                    && (b.last_resource_units as f64) > (b.mean_resource_units * 1.75)
            })
            .count();
        let candidate_count = guard
            .iter()
            .filter(|(_, b)| b.count >= 5 && b.last_ms > (b.ewma_ms * 1.5))
            .count();

        log::info!(
            target: "import_manager::governance",
            "event=governance.drift_awareness workflows={} drifted={} unstable={} growth_risk={}",
            workflow_count,
            drifted,
            unstable,
            growth_risk
        );
        log::info!(
            target: "import_manager::governance",
            "event=governance.optimization_discipline candidates={} incremental_only=true measurable_only=true reversible_only=true",
            candidate_count
        );
    }

    log::info!(
        target: "import_manager::governance",
        "event=governance.upgrade_readiness restore_active={} active_bulk={} rollback_ready=true",
        crate::restore_control::restore_in_progress(),
        current_bulk_delete_active_count()
    );

    maybe_emit_lifecycle_summary(total_observations);
}

fn perf_baseline_registry() -> &'static Mutex<HashMap<String, PerfBaseline>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, PerfBaseline>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn record_performance_observation(
    workflow: &str,
    elapsed_ms: u128,
    resource_units: usize,
    retry_events: u32,
) {
    let now_ms = now_unix_ms();
    let previous = LAST_ACTIVITY_MS.swap(now_ms, Ordering::SeqCst);
    if previous > 0 {
        let idle_gap = now_ms.saturating_sub(previous);
        if idle_gap >= LIFECYCLE_IDLE_BOUNDARY_MS {
            log::info!(
                target: "import_manager::lifecycle",
                "event=lifecycle.idle_boundary idle_gap_ms={}",
                idle_gap
            );
        }
    }
    let total_observations = PERF_OBSERVATION_COUNT
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);

    let elapsed = elapsed_ms as f64;
    if let Ok(mut guard) = perf_baseline_registry().lock() {
        let baseline = guard
            .entry(workflow.to_string())
            .or_insert_with(PerfBaseline::default);
        baseline.count = baseline.count.saturating_add(1);

        // Welford online mean/variance.
        let delta = elapsed - baseline.mean_ms;
        baseline.mean_ms += delta / baseline.count as f64;
        let delta2 = elapsed - baseline.mean_ms;
        baseline.m2_ms += delta * delta2;

        // EWMA to make drift visible quickly.
        if baseline.count == 1 {
            baseline.ewma_ms = elapsed;
            baseline.long_ewma_ms = elapsed;
        } else {
            baseline.ewma_ms = (0.25 * elapsed) + (0.75 * baseline.ewma_ms);
            baseline.long_ewma_ms = (0.05 * elapsed) + (0.95 * baseline.long_ewma_ms);
        }
        baseline.last_ms = elapsed;
        baseline.last_resource_units = resource_units;
        baseline.max_resource_units = baseline.max_resource_units.max(resource_units);
        if baseline.count == 1 {
            baseline.mean_resource_units = resource_units as f64;
        } else {
            baseline.mean_resource_units =
                (0.2 * resource_units as f64) + (0.8 * baseline.mean_resource_units);
        }

        let variance = if baseline.count > 1 {
            baseline.m2_ms / (baseline.count as f64 - 1.0)
        } else {
            0.0
        };
        let stddev = variance.max(0.0).sqrt();

        log::info!(
            target: "import_manager::perf_baseline",
            "event=perf.baseline.observe workflow={} count={} elapsed_ms={} mean_ms={:.2} ewma_ms={:.2} stddev_ms={:.2} resource_units={} retry_events={}",
            workflow,
            baseline.count,
            elapsed_ms,
            baseline.mean_ms,
            baseline.ewma_ms,
            stddev,
            resource_units,
            retry_events
        );

        if baseline.count >= 5 && elapsed > (baseline.ewma_ms * 1.5) {
            log::warn!(
                target: "import_manager::perf_regression",
                "event=perf.regression_detected workflow={} elapsed_ms={} ewma_ms={:.2}",
                workflow,
                elapsed_ms,
                baseline.ewma_ms
            );
        }

        if baseline.count >= 12 && baseline.ewma_ms > (baseline.long_ewma_ms * 1.25) {
            log::warn!(
                target: "import_manager::lifecycle_drift",
                "event=lifecycle.drift_detected workflow={} ewma_ms={:.2} long_ewma_ms={:.2}",
                workflow,
                baseline.ewma_ms,
                baseline.long_ewma_ms
            );
        }

        if baseline.count >= 6 && stddev > (baseline.mean_ms * 0.5) {
            log::warn!(
                target: "import_manager::perf_stability",
                "event=perf.variance_spike workflow={} stddev_ms={:.2} mean_ms={:.2}",
                workflow,
                stddev,
                baseline.mean_ms
            );
        }

        if retry_events > 0 {
            log::warn!(
                target: "import_manager::perf_opportunity",
                "event=perf.optimization_candidate workflow={} reason=retries retry_events={}",
                workflow,
                retry_events
            );
        }

        if baseline.count >= 4 && resource_units > baseline.max_resource_units.saturating_sub(1) {
            log::info!(
                target: "import_manager::resource_health",
                "event=resource.health.new_peak workflow={} resource_units={} mean_resource_units={:.2}",
                workflow,
                resource_units,
                baseline.mean_resource_units
            );
        }

        if baseline.count >= 6
            && (resource_units as f64) > (baseline.mean_resource_units * 1.75)
            && resource_units > 0
        {
            log::warn!(
                target: "import_manager::resource_health",
                "event=resource.health.growth_trend workflow={} resource_units={} mean_resource_units={:.2}",
                workflow,
                resource_units,
                baseline.mean_resource_units
            );
        }

        let health_state = if retry_events > 0 || stddev > (baseline.mean_ms * 0.5) {
            "watch"
        } else {
            "stable"
        };
        log::info!(
            target: "import_manager::lifecycle_health",
            "event=lifecycle.health workflow={} state={} count={} mean_ms={:.2} stddev_ms={:.2} mean_resource_units={:.2}",
            workflow,
            health_state,
            baseline.count,
            baseline.mean_ms,
            stddev,
            baseline.mean_resource_units
        );

        if baseline.count % 10 == 0 {
            log::info!(
                target: "import_manager::perf_governance",
                "event=perf.baseline_checkpoint workflow={} count={} mean_ms={:.2} ewma_ms={:.2} max_resource_units={}",
                workflow,
                baseline.count,
                baseline.mean_ms,
                baseline.ewma_ms,
                baseline.max_resource_units
            );
        }
        if baseline.count % 20 == 0 {
            log::info!(
                target: "import_manager::evolution_readiness",
                "event=evolution.readiness workflow={} reversible=true compatibility_preserved=true safe_tuning_cycle=true",
                workflow
            );
        }
    }
    maybe_emit_lifecycle_summary(total_observations);
}

fn current_bulk_delete_active_count() -> usize {
    BULK_DELETE_ACTIVE_COUNT.load(Ordering::SeqCst)
}

struct BulkDeleteAdmissionGuard;

impl BulkDeleteAdmissionGuard {
    fn try_enter() -> Result<Self, String> {
        if crate::restore_control::restore_in_progress() {
            return Err(
                "Restore is in progress. Please retry bulk delete after restore completes."
                    .to_string(),
            );
        }
        let current = BULK_DELETE_ACTIVE_COUNT.load(Ordering::SeqCst);
        if current > 0 {
            return Err("Another bulk delete operation is already running. Please retry after it completes.".to_string());
        }
        BULK_DELETE_ACTIVE_COUNT.fetch_add(1, Ordering::SeqCst);
        log::info!(
            target: "import_manager::workload",
            "event=workload.admission.accepted category=heavy operation=bulk_delete active_bulk={}",
            BULK_DELETE_ACTIVE_COUNT.load(Ordering::SeqCst)
        );
        Ok(Self)
    }
}

impl Drop for BulkDeleteAdmissionGuard {
    fn drop(&mut self) {
        BULK_DELETE_ACTIVE_COUNT.fetch_sub(1, Ordering::SeqCst);
        log::info!(
            target: "import_manager::workload",
            "event=workload.release category=heavy operation=bulk_delete active_bulk={}",
            BULK_DELETE_ACTIVE_COUNT.load(Ordering::SeqCst)
        );
    }
}

pub fn invalidate_database_stats_cache() {
    if let Ok(mut cache_guard) = db_stats_cache().lock() {
        *cache_guard = None;
    }
}

fn role_allows_permission(role: &str, permission: &str) -> bool {
    let Some(parsed_role) = crate::security::Role::from_db_str(role) else {
        return false;
    };
    let Some(parsed_perm) = crate::security::Permission::from_str(permission) else {
        return false;
    };
    crate::security::role_has(parsed_role, parsed_perm)
}

pub(crate) fn ensure_command_permission(
    db: &Connection,
    actor_user_id: Option<&str>,
    permission: &str,
) -> Result<(), String> {
    let perm = crate::security::Permission::from_str(permission)
        .ok_or_else(|| format!("Invalid permission key: {permission} (bug; not a user error)"))?;
    crate::security::ensure_command_permission(db, actor_user_id, perm)
}

fn get_app_metadata_string(
    db_state: &State<'_, DbState>,
    key: &str,
) -> Result<Option<String>, String> {
    let op = format!("get_app_metadata_{key}");
    with_sqlite_retry(&op, || {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let v: Option<String> = db
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(v.filter(|s| !s.is_empty()))
    })
}

fn set_app_metadata_string(
    db_state: &State<'_, DbState>,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let op = format!("set_app_metadata_{key}");
    with_sqlite_retry(&op, || {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// If a previous successful backup was recorded within `FREQUENT_BACKUP_WARN_SECS`, log (non-blocking).
fn warn_if_frequent_backup(db_state: &State<'_, DbState>) {
    let Ok(Some(s)) = get_app_metadata_string(db_state, APP_METADATA_LAST_BACKUP_TIME) else {
        return;
    };
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
        let last = dt.with_timezone(&Utc);
        let delta = Utc::now().signed_duration_since(last);
        if delta.num_seconds() >= 0 && delta.num_seconds() < FREQUENT_BACKUP_WARN_SECS {
            log::warn!(
                target: "import_manager::backup",
                "Frequent backups detected"
            );
        }
    }
}

fn increment_app_metadata_count(
    db_state: &State<'_, DbState>,
    key: &'static str,
) -> Result<(), String> {
    let op = format!("increment_app_metadata_{key}");
    with_sqlite_retry(&op, || {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let current: i64 = db
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let next = current.saturating_add(1);
        db.execute(
            "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, next.to_string()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

fn is_valid_hard_delete_pin(pin: &str) -> bool {
    pin.len() >= 4 && pin.chars().all(|c| c.is_ascii_digit())
}

fn get_hard_delete_pin_hash(db_state: &State<'_, DbState>) -> Result<Option<String>, String> {
    get_app_metadata_string(db_state, APP_METADATA_HARD_DELETE_PIN_HASH)
}

fn get_hard_delete_pin_enabled(db_state: &State<'_, DbState>) -> bool {
    get_app_metadata_string(db_state, APP_METADATA_HARD_DELETE_PIN_ENABLED)
        .ok()
        .flatten()
        .map(|v| matches!(v.trim(), "1" | "true" | "TRUE" | "True"))
        .unwrap_or(false)
}

fn get_hard_delete_pin_threshold(db_state: &State<'_, DbState>) -> u32 {
    get_app_metadata_string(db_state, APP_METADATA_HARD_DELETE_PIN_THRESHOLD)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(HARD_DELETE_PIN_DEFAULT_THRESHOLD)
}

fn get_hard_delete_failed_attempts(db_state: &State<'_, DbState>) -> u32 {
    get_app_metadata_string(db_state, APP_METADATA_HARD_DELETE_FAILED_ATTEMPTS)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0)
}

fn get_hard_delete_lock_until(db_state: &State<'_, DbState>) -> Option<DateTime<Utc>> {
    get_app_metadata_string(db_state, APP_METADATA_HARD_DELETE_LOCK_UNTIL)
        .ok()
        .flatten()
        .and_then(|v| DateTime::parse_from_rfc3339(&v).ok())
        .map(|dt| dt.with_timezone(&Utc))
}

fn is_hard_delete_lock_active(db_state: &State<'_, DbState>) -> (bool, Option<String>, u32) {
    if let Some(lock_until) = get_hard_delete_lock_until(db_state) {
        if lock_until > Utc::now() {
            return (
                true,
                Some(lock_until.to_rfc3339()),
                get_hard_delete_failed_attempts(db_state),
            );
        }
    }
    (false, None, get_hard_delete_failed_attempts(db_state))
}

fn set_hard_delete_failed_attempts(
    db_state: &State<'_, DbState>,
    attempts: u32,
) -> Result<(), String> {
    set_app_metadata_string(
        db_state,
        APP_METADATA_HARD_DELETE_FAILED_ATTEMPTS,
        &attempts.to_string(),
    )
}

fn clear_hard_delete_lock(db_state: &State<'_, DbState>) -> Result<(), String> {
    set_app_metadata_string(db_state, APP_METADATA_HARD_DELETE_LOCK_UNTIL, "")
}

fn hash_hard_delete_pin(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Failed to hash PIN: {e}"))
}

fn verify_hard_delete_pin_hash(stored_hash: &str, pin: &str) -> Result<bool, String> {
    let parsed =
        PasswordHash::new(stored_hash).map_err(|e| format!("Invalid stored PIN hash: {e}"))?;
    Ok(Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardDeletePinSettings {
    pub enabled: bool,
    pub threshold: u32,
    pub has_pin: bool,
    pub failed_attempts: u32,
    pub lock_until: Option<String>,
    pub lock_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardDeletePinVerifyResult {
    pub ok: bool,
    pub failed_attempts: u32,
    pub lock_until: Option<String>,
    pub message: String,
}

#[tauri::command]
pub async fn get_hard_delete_pin_settings(
    db_state: State<'_, DbState>,
) -> Result<HardDeletePinSettings, String> {
    let (lock_active, lock_until, failed_attempts) = is_hard_delete_lock_active(&db_state);
    Ok(HardDeletePinSettings {
        enabled: get_hard_delete_pin_enabled(&db_state),
        threshold: get_hard_delete_pin_threshold(&db_state),
        has_pin: get_hard_delete_pin_hash(&db_state)?.is_some(),
        failed_attempts,
        lock_until,
        lock_active,
    })
}

#[tauri::command]
pub async fn set_hard_delete_pin_enabled(
    db_state: State<'_, DbState>,
    enabled: bool,
) -> Result<(), String> {
    if enabled && get_hard_delete_pin_hash(&db_state)?.is_none() {
        return Err("Set a PIN before enabling hard delete PIN protection.".to_string());
    }
    set_app_metadata_string(
        &db_state,
        APP_METADATA_HARD_DELETE_PIN_ENABLED,
        if enabled { "1" } else { "0" },
    )
}

#[tauri::command]
pub async fn set_hard_delete_pin_threshold(
    db_state: State<'_, DbState>,
    threshold: u32,
) -> Result<(), String> {
    let value = threshold.max(1);
    set_app_metadata_string(
        &db_state,
        APP_METADATA_HARD_DELETE_PIN_THRESHOLD,
        &value.to_string(),
    )
}

#[tauri::command]
pub async fn set_hard_delete_pin(db_state: State<'_, DbState>, pin: String) -> Result<(), String> {
    if !is_valid_hard_delete_pin(&pin) {
        return Err("PIN must be numeric and at least 4 digits.".to_string());
    }
    let hash = hash_hard_delete_pin(&pin)?;
    set_app_metadata_string(&db_state, APP_METADATA_HARD_DELETE_PIN_HASH, &hash)?;
    set_app_metadata_string(&db_state, APP_METADATA_HARD_DELETE_PIN_ENABLED, "1")?;
    if get_app_metadata_string(&db_state, APP_METADATA_HARD_DELETE_PIN_THRESHOLD)?
        .and_then(|v| v.parse::<u32>().ok())
        .is_none()
    {
        set_app_metadata_string(
            &db_state,
            APP_METADATA_HARD_DELETE_PIN_THRESHOLD,
            &HARD_DELETE_PIN_DEFAULT_THRESHOLD.to_string(),
        )?;
    }
    set_hard_delete_failed_attempts(&db_state, 0)?;
    clear_hard_delete_lock(&db_state)?;
    Ok(())
}

#[tauri::command]
pub async fn change_hard_delete_pin(
    db_state: State<'_, DbState>,
    current_pin: String,
    new_pin: String,
) -> Result<(), String> {
    if !is_valid_hard_delete_pin(&new_pin) {
        return Err("New PIN must be numeric and at least 4 digits.".to_string());
    }
    let Some(stored) = get_hard_delete_pin_hash(&db_state)? else {
        return Err("No existing PIN configured.".to_string());
    };
    if !verify_hard_delete_pin_hash(&stored, &current_pin)? {
        return Err("Current PIN is incorrect.".to_string());
    }
    let hash = hash_hard_delete_pin(&new_pin)?;
    set_app_metadata_string(&db_state, APP_METADATA_HARD_DELETE_PIN_HASH, &hash)?;
    set_hard_delete_failed_attempts(&db_state, 0)?;
    clear_hard_delete_lock(&db_state)?;
    log::info!(target: "import_manager::security", "[SECURITY] PIN changed");
    Ok(())
}

#[tauri::command]
pub async fn verify_hard_delete_pin(
    db_state: State<'_, DbState>,
    pin: String,
) -> Result<HardDeletePinVerifyResult, String> {
    let (lock_active, lock_until, failed_attempts) = is_hard_delete_lock_active(&db_state);
    if lock_active {
        return Ok(HardDeletePinVerifyResult {
            ok: false,
            failed_attempts,
            lock_until,
            message: "Too many incorrect attempts. Try again later.".to_string(),
        });
    }
    let Some(stored) = get_hard_delete_pin_hash(&db_state)? else {
        return Err("No PIN configured.".to_string());
    };
    if verify_hard_delete_pin_hash(&stored, &pin)? {
        set_hard_delete_failed_attempts(&db_state, 0)?;
        clear_hard_delete_lock(&db_state)?;
        log::info!(target: "import_manager::security", "[SECURITY] Hard delete PIN verified");
        return Ok(HardDeletePinVerifyResult {
            ok: true,
            failed_attempts: 0,
            lock_until: None,
            message: "PIN verified".to_string(),
        });
    }

    let next_attempts = get_hard_delete_failed_attempts(&db_state).saturating_add(1);
    set_hard_delete_failed_attempts(&db_state, next_attempts)?;
    log::warn!(target: "import_manager::security", "[SECURITY] Failed PIN attempt");
    if next_attempts >= HARD_DELETE_PIN_MAX_FAILED_ATTEMPTS {
        let lock_until_dt = Utc::now() + chrono::Duration::seconds(HARD_DELETE_PIN_LOCK_SECS);
        set_app_metadata_string(
            &db_state,
            APP_METADATA_HARD_DELETE_LOCK_UNTIL,
            &lock_until_dt.to_rfc3339(),
        )?;
        log::warn!(target: "import_manager::security", "[SECURITY] PIN lock triggered");
        return Ok(HardDeletePinVerifyResult {
            ok: false,
            failed_attempts: next_attempts,
            lock_until: Some(lock_until_dt.to_rfc3339()),
            message: "Too many incorrect attempts. Try again later.".to_string(),
        });
    }

    Ok(HardDeletePinVerifyResult {
        ok: false,
        failed_attempts: next_attempts,
        lock_until: None,
        message: "Invalid PIN".to_string(),
    })
}

fn unique_random_suffix() -> String {
    let u = uuid::Uuid::new_v4();
    u.as_simple().to_string().chars().take(8).collect()
}

/// `backup_YYYY-MM-DD_HH-MM-SS_mmm_<random8>.db`
fn generated_unique_backup_basename() -> String {
    let now = Local::now();
    let ms = now.timestamp_subsec_millis();
    let r = unique_random_suffix();
    format!(
        "backup_{}_{:03}_{}.db",
        now.format("%Y-%m-%d_%H-%M-%S"),
        ms,
        r
    )
}

/// User-provided name, sanitized, never overwriting an existing file in `data_dir`.
fn unique_local_filename_in_dir(data_dir: &Path, user: &str) -> Result<String, String> {
    let raw = user.trim();
    let file_part = Path::new(raw)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("backup");
    let stem: String = if let Some(s) = file_part
        .strip_suffix(".db")
        .or_else(|| file_part.strip_suffix(".DB"))
    {
        s.to_string()
    } else {
        file_part.to_string()
    };
    let stem = if stem.is_empty() {
        "backup".to_string()
    } else {
        stem
    };
    for i in 0u32..64 {
        let name = if i == 0 {
            format!("{}.db", stem)
        } else {
            format!("{}_{}.db", stem, unique_random_suffix())
        };
        let enc = enc_basename_for_staging_db(&name);
        if !data_dir.join(&name).exists() && !data_dir.join(&enc).exists() {
            return Ok(name);
        }
    }
    Err("Could not allocate a unique backup filename".to_string())
}

/// Default or user filename; always a basename unique under `data_dir` when the file is materialized.
fn resolve_backup_staging_filename(
    data_dir: &Path,
    request: &BackupRequest,
) -> Result<String, String> {
    if let Some(ref f) = request.filename {
        let t = f.trim();
        if !t.is_empty() {
            return unique_local_filename_in_dir(data_dir, t);
        }
    }
    for _ in 0..32 {
        let name = generated_unique_backup_basename();
        let enc = enc_basename_for_staging_db(&name);
        if !data_dir.join(&name).exists() && !data_dir.join(&enc).exists() {
            return Ok(name);
        }
    }
    Err("Could not allocate a unique backup filename".to_string())
}

/// `pre_restore_YYYY-MM-DD_HH-MM-SS_mmm_<random8>.db`
fn unique_pre_restore_basename() -> String {
    let now = Local::now();
    let ms = now.timestamp_subsec_millis();
    let r = unique_random_suffix();
    format!(
        "pre_restore_{}_{:03}_{}.db",
        now.format("%Y-%m-%d_%H-%M-%S"),
        ms,
        r
    )
}

/// Unique path in `data_dir` that does not already exist.
fn unique_pre_restore_path_in_dir(data_dir: &Path) -> Result<PathBuf, String> {
    for _ in 0..32 {
        let p = data_dir.join(unique_pre_restore_basename());
        if !p.exists() {
            return Ok(p);
        }
    }
    Err("Could not allocate a unique pre-restore filename".to_string())
}

/// Require strictly more than `2 ×` database file size (bytes) on the volume that holds `backup_dir`.
fn ensure_free_space_for_main_db_backup(
    backup_dir: &Path,
    db_size_bytes: u64,
) -> Result<(), String> {
    let free = available_space(backup_dir)
        .map_err(|e| format!("Could not read available disk space: {}", e))?;
    if free <= db_size_bytes.saturating_mul(2) {
        log::warn!(target: "import_manager::backup", "Backup aborted due to low disk space.");
        return Err("Insufficient disk space for backup".to_string());
    }
    Ok(())
}

fn primary_local_backup_dir() -> PathBuf {
    std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map(|home| Path::new(&home).join("ImportManager").join("backups"))
        .unwrap_or_else(|_| Path::new("./backups").to_path_buf())
}

fn prepare_local_backup_directory(dir: &Path, db_size_bytes: u64) -> Result<(), String> {
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }
    ensure_free_space_for_main_db_backup(dir, db_size_bytes)
}

fn read_app_setting_trim(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn secondary_backup_enabled_and_root(conn: &Connection) -> Option<PathBuf> {
    let on = read_app_setting_trim(conn, SETTINGS_BACKUP_SECONDARY_ENABLED)
        .map(|s| {
            let t = s.to_ascii_lowercase();
            t == "1" || t == "true" || t == "yes"
        })
        .unwrap_or(false);
    if !on {
        return None;
    }
    read_app_setting_trim(conn, SETTINGS_BACKUP_SECONDARY_PATH).map(PathBuf::from)
}

fn resolve_local_backup_workspace_conn(
    conn: &Connection,
    db_size_bytes: u64,
) -> Result<PathBuf, String> {
    let primary = primary_local_backup_dir();
    match prepare_local_backup_directory(&primary, db_size_bytes) {
        Ok(()) => Ok(primary),
        Err(e1) => {
            if let Some(sec) = secondary_backup_enabled_and_root(conn) {
                match prepare_local_backup_directory(&sec, db_size_bytes) {
                    Ok(()) => {
                        log::warn!(
                            target: "import_manager::backup",
                            "Primary backup folder unusable ({}); using secondary path {:?}",
                            e1,
                            sec
                        );
                        Ok(sec)
                    }
                    Err(e2) => Err(format!(
                        "Primary backup path failed: {}. Secondary {:?} failed: {}",
                        e1, sec, e2
                    )),
                }
            } else {
                Err(e1)
            }
        }
    }
}

fn mirror_local_backup_to_secondary(enc_path: &Path, conn: &Connection) -> Result<(), String> {
    let Some(root) = secondary_backup_enabled_and_root(conn) else {
        return Ok(());
    };
    if !root.exists() {
        fs::create_dir_all(&root).map_err(|e| format!("secondary mirror mkdir: {}", e))?;
    }
    let name = enc_path
        .file_name()
        .ok_or_else(|| "backup enc path has no file name".to_string())?;
    let dest = root.join(name);
    fs::copy(enc_path, &dest).map_err(|e| format!("secondary mirror copy: {}", e))?;
    let side = sidecar_sha256_path(enc_path);
    if side.exists() {
        let side_dest = sidecar_sha256_path(&dest);
        let _ = fs::copy(&side, &side_dest);
    }
    log::info!(
        target: "import_manager::backup",
        "Mirrored encrypted backup to secondary folder {:?}",
        dest
    );
    Ok(())
}

/// Core tables that must exist for a backup to be restorable (restore simulation / preview).
const RESTORE_SIM_CORE_TABLES: &[&str] = &[
    "suppliers",
    "shipments",
    "items",
    "invoices",
    "invoice_line_items",
    "boe_details",
    "audit_logs",
    "backups",
];

fn list_missing_core_tables(backup_path: &Path) -> Vec<String> {
    let Ok(conn) = Connection::open(backup_path) else {
        return vec!["<database_open_failed>".to_string()];
    };
    let mut missing = Vec::new();
    for table in RESTORE_SIM_CORE_TABLES {
        let ok: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                params![*table],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if ok == 0 {
            missing.push((*table).to_string());
        }
    }
    missing
}

fn read_backup_max_migration_version(backup_path: &Path) -> Option<i64> {
    let conn = Connection::open(backup_path).ok()?;
    conn.query_row(
        "SELECT MAX(version) FROM refinery_schema_history",
        [],
        |r| r.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn restore_sim_scheduled_tick_due(last_val: Option<String>) -> bool {
    let Some(s) = last_val.filter(|v| !v.trim().is_empty()) else {
        return true;
    };
    let Ok(dt) = DateTime::parse_from_rfc3339(s.trim()) else {
        return true;
    };
    Utc::now().signed_duration_since(dt.with_timezone(&Utc)) > chrono::Duration::hours(72)
}

/// Full restorability test: decrypt snapshot, integrity_check, required tables.
pub(crate) fn run_restore_simulation_sync(app: &AppHandle, backup_id: i64, enc_path: &Path) {
    let checked_at = Utc::now().to_rfc3339();
    let fail = |msg: &str| {
        if let Some(db) = app.try_state::<DbState>() {
            if let Ok(conn) = db.db.lock() {
                let _ = conn.execute(
                    "UPDATE backups SET restore_simulation_status = 'failed', restore_simulation_checked_at = ?1, restore_simulation_message = ?2 WHERE id = ?3",
                    params![&checked_at, msg, backup_id],
                );
            }
        }
        log::warn!(
            target: "import_manager::backup",
            "event=restore_simulation_failed backup_id={} err={}",
            backup_id,
            msg
        );
    };

    let password = match crate::utils::backup_keyring::get_or_create_backup_encryption_password() {
        Ok(p) => p,
        Err(e) => {
            fail(&format!("backup keyring: {}", e));
            return;
        }
    };
    if let Err(e) = validate_local_backup_file_for_restore(enc_path) {
        fail(&e);
        return;
    }
    let tmp = match tempfile::Builder::new()
        .prefix("im-restore-sim-")
        .suffix(".db")
        .tempfile()
    {
        Ok(t) => t,
        Err(e) => {
            fail(&format!("temp file: {}", e));
            return;
        }
    };
    let tmp_path = tmp.path().to_path_buf();
    if let Err(e) = crate::utils::encryption::decrypt_file(enc_path, &tmp_path, &password) {
        fail(&e);
        return;
    }
    let integrity = match test_database_integrity(&tmp_path.to_string_lossy()) {
        Ok(s) => s,
        Err(e) => {
            fail(&e);
            return;
        }
    };
    if !integrity.to_lowercase().contains("ok") {
        fail(&format!("integrity_check: {}", integrity));
        return;
    }
    let missing = list_missing_core_tables(&tmp_path);
    if !missing.is_empty() {
        fail(&format!("missing tables: {}", missing.join(", ")));
        return;
    }
    let msg = "restore simulation: decrypt, integrity ok, core tables present";
    if let Some(db) = app.try_state::<DbState>() {
        if let Ok(conn) = db.db.lock() {
            let _ = conn.execute(
                "UPDATE backups SET restore_simulation_status = 'ok', restore_simulation_checked_at = ?1, restore_simulation_message = ?2 WHERE id = ?3",
                params![&checked_at, msg, backup_id],
            );
            let _ = conn.execute(
                "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params!["last_restore_simulation_ok_at", &checked_at],
            );
        }
    }
    log::info!(
        target: "import_manager::backup",
        "event=restore_simulation_ok backup_id={}",
        backup_id
    );
}

pub async fn tick_restore_simulation_if_due(app: AppHandle) {
    if crate::restore_control::background_jobs_paused() {
        return;
    }
    let Some(db_state) = app.try_state::<DbState>() else {
        return;
    };
    let job: Option<(i64, PathBuf)> = {
        let Ok(conn) = db_state.db.lock() else {
            return;
        };
        let last_tick: Option<String> = conn
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![APP_METADATA_LAST_RESTORE_SIM_TICK],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten();
        if !restore_sim_scheduled_tick_due(last_tick) {
            return;
        }
        let row: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, path FROM backups WHERE destination = 'local' AND status = 'completed' \
                 AND COALESCE(validation_status, '') = 'ok' \
                 ORDER BY datetime(created_at) DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .ok()
            .flatten();
        let now = Utc::now().to_rfc3339();
        let _ = conn.execute(
            "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![APP_METADATA_LAST_RESTORE_SIM_TICK, now],
        );
        row.map(|(id, p)| (id, PathBuf::from(p)))
    };
    let Some((backup_id, enc_pb)) = job else {
        return;
    };
    if !enc_pb.exists() {
        log::warn!(
            target: "import_manager::backup",
            "restore simulation tick: backup file missing {:?}",
            enc_pb
        );
        return;
    }
    let app_c = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = tauri::async_runtime::spawn_blocking(move || {
            run_restore_simulation_sync(&app_c, backup_id, &enc_pb)
        })
        .await;
    });
}

fn is_sqlite_lock_err(err: &str) -> bool {
    let s = err.to_lowercase();
    s.contains("database is locked")
        || s.contains("database is busy")
        || s.contains("sqlite busy")
        || s.contains("busy: database is locked")
}

/// Retry on transient SQLite `SQLITE_BUSY` / locked errors.
pub(crate) fn with_sqlite_retry<T>(
    op: &str,
    mut f: impl FnMut() -> Result<T, String>,
) -> Result<T, String> {
    for attempt in 1..=SQLITE_RETRY_ATTEMPTS {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if is_sqlite_lock_err(&e) && attempt < SQLITE_RETRY_ATTEMPTS => {
                let delay_ms = sqlite_retry_delay_ms(SQLITE_RETRY_DELAY_MS, attempt);
                log_failure_pattern(
                    &SQLITE_RETRY_EVENT_COUNT,
                    "sqlite_retry",
                    &format!("op={} attempt={}/{}", op, attempt, SQLITE_RETRY_ATTEMPTS),
                );
                log::warn!(
                    target: "import_manager::db_retry",
                    "{} attempt {}/{}: {} — retrying in {}ms",
                    op,
                    attempt,
                    SQLITE_RETRY_ATTEMPTS,
                    e,
                    delay_ms
                );
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            }
            Err(e) => {
                if is_sqlite_lock_err(&e) {
                    log_failure_pattern(
                        &LOCK_CONFLICT_EVENT_COUNT,
                        "sqlite_lock_conflict",
                        &format!("op={} attempt={}/{}", op, attempt, SQLITE_RETRY_ATTEMPTS),
                    );
                }
                return Err(e);
            }
        }
    }
    Err("with_sqlite_retry: exhausted retries".to_string())
}

/// `missing` | `valid` | `invalid` — for restore preview (sidecar next to local file).
fn checksum_status_for_local_path(local_path: &Path) -> String {
    let side = sidecar_sha256_path(local_path);
    if !side.exists() {
        return "missing".to_string();
    }
    match (
        read_expected_sha256_from_sidecar(&side),
        sha256_hex_file(local_path),
    ) {
        (Ok(exp), Ok(act)) if exp.eq_ignore_ascii_case(&act) => "valid".to_string(),
        (Ok(_), Ok(_)) => "invalid".to_string(),
        _ => "invalid".to_string(),
    }
}

fn verify_stored_sha256_against_file(
    artifact: &Path,
    expected: Option<String>,
) -> Result<(), String> {
    let exp = match expected {
        Some(s) if !s.trim().is_empty() => s,
        _ => return Ok(()),
    };
    let actual = sha256_hex_file(artifact)?;
    if !exp.eq_ignore_ascii_case(&actual) {
        return Err(
            "Backup integrity check failed: the file does not match the recorded SHA-256 checksum. Restore was canceled."
                .to_string(),
        );
    }
    Ok(())
}

/// Decrypt `.enc` backups to a temp `.db`; pass through plaintext `.db` unchanged.
/// Returns `(sqlite_path, temp_file_to_delete_if_any)`.
fn prepare_restorable_sqlite_path(artifact: &Path) -> Result<(PathBuf, Option<PathBuf>), String> {
    if !crate::utils::encryption::is_encrypted_backup_artifact_path(artifact) {
        return Ok((artifact.to_path_buf(), None));
    }
    let pw = crate::utils::backup_keyring::get_backup_encryption_password_for_decrypt()?;
    let tmp = std::env::temp_dir().join(format!(
        "import-manager-restore-{}.db",
        uuid::Uuid::new_v4()
    ));
    crate::utils::encryption::decrypt_file(artifact, &tmp, &pw)?;
    let to_delete = Some(tmp.clone());
    Ok((tmp, to_delete))
}

/// Keep at most `max_keep` backup rows; delete oldest first. The newest row is never deleted.
/// Returns Google Drive file ids removed from the DB (local files are deleted in-place; remote deletes are async).
fn prune_excess_backups(conn: &Connection, max_keep: usize) -> Result<Vec<String>, String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM backups", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if (count as usize) <= max_keep {
        return Ok(Vec::new());
    }
    let to_remove: usize = (count as usize) - max_keep;
    let protected_id: i64 = conn
        .query_row(
            "SELECT id FROM backups ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, path FROM backups WHERE id != ?1 ORDER BY datetime(created_at) ASC, id ASC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map(params![protected_id, to_remove as i64], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut gdrive_to_delete: Vec<String> = Vec::new();
    for (id, path) in rows {
        if let Some(fid) = path.strip_prefix(super::google_drive::GDRIVE_PATH_PREFIX) {
            let fid = fid.to_string();
            if !fid.is_empty() {
                gdrive_to_delete.push(fid);
            }
        } else {
            let p = Path::new(&path);
            if p.exists() {
                let _ = fs::remove_file(p);
            }
            let side = sidecar_sha256_path(p);
            if side.exists() {
                let _ = fs::remove_file(&side);
            }
        }
        conn.execute("DELETE FROM backups WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        log::info!(
            target: "import_manager::backup",
            "Pruned old backup id={} (retention, max={})",
            id,
            max_keep
        );
    }
    Ok(gdrive_to_delete)
}

/// Runs every minute from a background thread; executes due backup schedules.
pub async fn tick_backup_schedules(app: AppHandle) {
    if let Err(e) = run_due_backup_schedules(app.clone()).await {
        log::warn!("backup schedule tick failed: {}", e);
    }
    tick_restore_simulation_if_due(app).await;
}

fn ensure_default_weekly_local_backup_schedule(conn: &Connection) -> Result<(), String> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM backup_schedules", [], |r| r.get(0))
        .unwrap_or(0);
    if n > 0 {
        return Ok(());
    }
    let cron = "0 0 3 * * 0";
    let tz = "Asia/Kolkata";
    let next_run = compute_next_run_rfc3339(cron, tz)?;
    conn.execute(
        "INSERT INTO backup_schedules (name, cron_expr, time_zone, destination, retention_count, retention_days, enabled, next_run, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)",
        params![
            "Weekly local (auto-seeded)",
            cron,
            tz,
            "local",
            10i32,
            90i32,
            next_run,
            "Seeded when no schedules exist. Edit or disable under Database Management.",
        ],
    )
    .map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::backup",
        "Seeded default weekly local backup schedule (Sun 03:00 Asia/Kolkata)"
    );
    Ok(())
}

/// Decrypts a local `.enc` snapshot off-thread, runs `PRAGMA integrity_check`, and records result on `backups`.
fn run_post_backup_validation_sync(app: &AppHandle, backup_id: i64, enc_path: &Path) {
    let checked_at = Utc::now().to_rfc3339();
    let fail = |msg: &str| {
        if let Some(db) = app.try_state::<DbState>() {
            if let Ok(conn) = db.db.lock() {
                let _ = conn.execute(
                    "UPDATE backups SET validation_status = 'failed', validation_checked_at = ?1, validation_message = ?2 WHERE id = ?3",
                    params![&checked_at, msg, backup_id],
                );
            }
        }
        log::warn!(
            target: "import_manager::backup",
            "event=backup_validation_failed backup_id={} err={}",
            backup_id,
            msg
        );
    };

    let password = match crate::utils::backup_keyring::get_or_create_backup_encryption_password() {
        Ok(p) => p,
        Err(e) => {
            fail(&format!("backup keyring: {}", e));
            return;
        }
    };
    if let Err(e) = validate_local_backup_file_for_restore(enc_path) {
        fail(&e);
        return;
    }
    let tmp = match tempfile::Builder::new()
        .prefix("im-backup-val-")
        .suffix(".db")
        .tempfile()
    {
        Ok(t) => t,
        Err(e) => {
            fail(&format!("temp file: {}", e));
            return;
        }
    };
    let tmp_path = tmp.path().to_path_buf();
    if let Err(e) = crate::utils::encryption::decrypt_file(enc_path, &tmp_path, &password) {
        fail(&e);
        return;
    }
    let integrity = match test_database_integrity(&tmp_path.to_string_lossy()) {
        Ok(s) => s,
        Err(e) => {
            fail(&e);
            return;
        }
    };
    if !integrity.to_lowercase().contains("ok") {
        fail(&format!("integrity_check: {}", integrity));
        return;
    }
    let schema_ok = match Connection::open(tmp_path.as_path()) {
        Ok(c) => {
            c.query_row("SELECT COUNT(*) FROM refinery_schema_history", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap_or(0)
                > 0
        }
        Err(e) => {
            fail(&format!("open decrypted snapshot: {}", e));
            return;
        }
    };
    let status = if schema_ok { "ok" } else { "degraded" };
    let msg = if schema_ok {
        "decrypt and integrity_check ok; refinery history present"
    } else {
        "decrypt and integrity_check ok; refinery_schema_history missing or empty"
    };
    if let Some(db) = app.try_state::<DbState>() {
        if let Ok(conn) = db.db.lock() {
            let _ = conn.execute(
                "UPDATE backups SET validation_status = ?1, validation_checked_at = ?2, validation_message = ?3 WHERE id = ?4",
                params![status, &checked_at, msg, backup_id],
            );
            let _ = conn.execute(
                "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params!["last_known_good_backup_validation", &checked_at],
            );
            if status == "ok" {
                let _ = conn.execute(
                    "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    params!["last_known_good_backup_id", backup_id.to_string()],
                );
            }
        }
    }
    log::info!(
        target: "import_manager::backup",
        "event=backup_validation_done backup_id={} status={}",
        backup_id,
        status
    );
    if status == "ok" {
        let app_spawn = app.clone();
        let bid = backup_id;
        let path_spawn = enc_path.to_path_buf();
        tauri::async_runtime::spawn(async move {
            let _ = tauri::async_runtime::spawn_blocking(move || {
                run_restore_simulation_sync(&app_spawn, bid, &path_spawn)
            })
            .await;
        });
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
        ensure_default_weekly_local_backup_schedule(&db)?;
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
            run_scheduled_backup_internal(app.clone(), db_state.clone(), schedule_id).await
        {
            log::warn!("scheduled backup id {} failed: {}", schedule_id, e);
        }
    }
    Ok(())
}

async fn run_scheduled_backup_internal(
    app: AppHandle,
    db_state: State<'_, DbState>,
    schedule_id: i64,
) -> Result<(), String> {
    // Intentionally internal-only (background tick). IPC must always present a real user id.
    let schedule = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT id, name, destination, enabled FROM backup_schedules WHERE id = ?",
            params![schedule_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?
    };
    if schedule.3 == 0 {
        return Ok(());
    }
    let backup_request = BackupRequest {
        destination: schedule.2,
        filename: None,
        include_wal: true,
        notes: Some(format!("Scheduled backup: {}", schedule.1)),
    };
    let info = create_backup_internal(app, db_state.clone(), backup_request, None).await?;
    if let Ok(conn) = db_state.db.lock() {
        let details = serde_json::json!({
            "scheduleId": schedule_id,
            "backupId": info.id,
            "destination": info.destination,
        })
        .to_string();
        crate::services::user_activity_audit::log_activity_with_severity(
            &conn,
            None,
            "backup.scheduled",
            Some("backups"),
            info.id.as_ref().map(|v| v.to_string()).as_deref(),
            Some(&details),
            "success",
            AuditSeverity::Info,
        );
    }
    Ok(())
}

struct TempFileGuards(Vec<PathBuf>);

impl TempFileGuards {
    fn new() -> Self {
        Self(Vec::new())
    }
    fn push_opt(&mut self, p: Option<PathBuf>) {
        if let Some(p) = p {
            self.0.push(p);
        }
    }
    fn push(&mut self, p: PathBuf) {
        self.0.push(p);
    }
}

impl Drop for TempFileGuards {
    fn drop(&mut self) {
        for p in self.0.drain(..) {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(default)]
    pub validation_status: Option<String>,
    #[serde(default)]
    pub validation_checked_at: Option<String>,
    #[serde(default)]
    pub validation_message: Option<String>,
    #[serde(default)]
    pub restore_simulation_status: Option<String>,
    #[serde(default)]
    pub restore_simulation_checked_at: Option<String>,
    #[serde(default)]
    pub restore_simulation_message: Option<String>,
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

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreRequest {
    pub backupPath: String,
    pub dry_run: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestorePreview {
    pub backup_info: BackupInfo,
    pub current_db_stats: DatabaseStats,
    /// Byte length of the backup file on disk (at preview time).
    pub backup_file_size_bytes: i64,
    /// Informational: `(size_MB × 0.02)` seconds; does not block restore.
    pub estimated_restore_seconds: f64,
    /// `missing` | `valid` | `invalid` — SHA256 sidecar vs. file.
    pub checksum_status: String,
    /// `None` = no SHA-256 stored in the backups table; `Some(true)` = file matches; `Some(false)` = mismatch.
    pub recorded_hash_match: Option<bool>,
    pub integrity_check: String,
    pub schema_compatibility: bool,
    /// Embedded binary migration head vs backup `refinery_schema_history`.
    pub embedded_migration_head_version: i32,
    pub backup_migration_max_version: Option<i64>,
    /// Core tables required for restorability (empty if all present).
    pub missing_core_tables: Vec<String>,
    pub estimated_changes: HashMap<String, i64>,
    pub warnings: Vec<String>,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "PascalCase")]
pub enum RestoreOutcome {
    RestoreFailed,
    RestoreSucceededWithWarning,
    #[default]
    RestoreFullySucceeded,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    #[serde(default)]
    pub outcome: RestoreOutcome,
    pub message: String,
    pub backup_created: Option<String>,
    pub integrity_check: String,
    pub tables_affected: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_restore_warning: Option<String>,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
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
    let started_at = Instant::now();
    let run_id = next_run_id(&AUDIT_QUERY_RUN_COUNT);
    log::info!(
        target: "import_manager::workload",
        "event=workload.classification category=interactive operation=audit_logs run_id={}",
        run_id
    );
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let lim_for_awareness = limit.unwrap_or(100);
    let off_for_awareness = offset.unwrap_or(0);
    if lim_for_awareness >= SCALE_WARNING_AUDIT_LIMIT
        || off_for_awareness >= SCALE_WARNING_AUDIT_LIMIT
    {
        log::warn!(
            target: "import_manager::audit",
            "event=workflow.audit.scale_readiness stage=entry limit={} offset={}",
            lim_for_awareness,
            off_for_awareness
        );
        log_scale_escalation(
            &LARGE_AUDIT_QUERY_COUNT,
            "audit_query",
            lim_for_awareness.max(off_for_awareness) as usize,
        );
    }

    let mut query = "SELECT id, COALESCE(\"tableName\", table_name) AS table_name, row_id, action, user_id, before_json, after_json, metadata, created_at FROM audit_logs WHERE 1=1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(table) = &tableName {
        query.push_str(" AND \"tableName\" = ?");
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
    log::info!(
        target: "import_manager::audit",
        "event=workflow.audit.progress stage=execution run_id={} has_table_filter={} has_action_filter={} has_user_filter={}",
        run_id,
        tableName.is_some(),
        action.is_some(),
        userId.is_some()
    );

    query.push_str(" ORDER BY datetime(created_at) DESC, id DESC");

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
    log::info!(
        target: "import_manager::audit",
        "event=workflow.audit.progress stage=completion run_id={} rows={} elapsed_ms={}",
        run_id,
        audit_logs.len(),
        started_at.elapsed().as_millis()
    );
    record_performance_observation(
        "audit_listing",
        started_at.elapsed().as_millis(),
        audit_logs.len(),
        0,
    );

    Ok(audit_logs)
}

// Get database statistics
#[tauri::command]
pub async fn get_database_stats(db_state: State<'_, DbState>) -> Result<DatabaseStats, String> {
    if let Ok(cache_guard) = db_stats_cache().lock() {
        if let Some((at, cached)) = cache_guard.as_ref() {
            if at.elapsed().as_millis() <= DB_STATS_CACHE_TTL_MS {
                return Ok(cached.clone());
            }
        }
    }
    with_sqlite_retry("get_database_stats", || {
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

        let stats = DatabaseStats {
            db_size_bytes,
            table_counts,
            last_backup,
            next_scheduled_backup,
            encryption_status: "AES-256 Enabled".to_string(),
        };
        if let Ok(mut cache_guard) = db_stats_cache().lock() {
            *cache_guard = Some((Instant::now(), stats.clone()));
        }
        Ok(stats)
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRedundancySettings {
    pub enabled: bool,
    pub secondary_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBackupRedundancyInput {
    pub enabled: bool,
    pub secondary_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupHealthMetrics {
    pub last_backup_time: Option<String>,
    pub latest_local_backup_id: Option<i64>,
    pub latest_local_backup_filename: Option<String>,
    pub latest_local_backup_created_at: Option<String>,
    pub latest_local_backup_size_bytes: Option<i64>,
    pub backup_age_hours: Option<f64>,
    pub last_validation_status: Option<String>,
    pub last_validation_at: Option<String>,
    pub last_restore_simulation_status: Option<String>,
    pub last_restore_simulation_at: Option<String>,
    pub alerts: Vec<String>,
    pub secondary_redundancy_enabled: bool,
    pub secondary_redundancy_path: String,
    pub size_trend_note: Option<String>,
}

#[tauri::command]
pub async fn get_backup_redundancy_settings(
    db_state: State<'_, DbState>,
) -> Result<BackupRedundancySettings, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let enabled = read_app_setting_trim(&db, SETTINGS_BACKUP_SECONDARY_ENABLED)
        .map(|s| {
            let t = s.to_ascii_lowercase();
            t == "1" || t == "true" || t == "yes"
        })
        .unwrap_or(false);
    let secondary_path =
        read_app_setting_trim(&db, SETTINGS_BACKUP_SECONDARY_PATH).unwrap_or_default();
    Ok(BackupRedundancySettings {
        enabled,
        secondary_path,
    })
}

#[tauri::command]
pub async fn set_backup_redundancy_settings(
    db_state: State<'_, DbState>,
    input: SetBackupRedundancyInput,
    userId: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, userId.as_deref(), PERM_BACKUP_SCHEDULE)?;
    let enabled = input.enabled;
    let path = input.secondary_path.trim().to_string();
    if enabled && path.is_empty() {
        return Err("Secondary path is required when redundancy is enabled.".to_string());
    }
    if enabled {
        let p = Path::new(&path);
        fs::create_dir_all(p).map_err(|e| format!("Cannot create secondary path: {}", e))?;
    }
    db.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![
            SETTINGS_BACKUP_SECONDARY_ENABLED,
            if enabled { "true" } else { "false" }
        ],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![SETTINGS_BACKUP_SECONDARY_PATH, path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_backup_health_metrics(
    db_state: State<'_, DbState>,
) -> Result<BackupHealthMetrics, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let last_backup_time: Option<String> = db
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'last_backup_time'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty());

    let row = db
        .query_row(
            "SELECT id, filename, created_at, size_bytes, validation_status, validation_checked_at, \
             restore_simulation_status, restore_simulation_checked_at \
             FROM backups WHERE destination = 'local' AND status = 'completed' \
             ORDER BY datetime(created_at) DESC LIMIT 1",
            [],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<i64>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, Option<String>>(7)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (
        latest_local_backup_id,
        latest_local_backup_filename,
        latest_local_backup_created_at,
        latest_local_backup_size_bytes,
        last_validation_status,
        last_validation_at,
        last_restore_simulation_status,
        last_restore_simulation_at,
    ) = match row {
        Some((id, fnam, ca, sz, vs, va, rs, ra)) => {
            (Some(id), Some(fnam), Some(ca), sz, vs, va, rs, ra)
        }
        None => (None, None, None, None, None, None, None, None),
    };

    let backup_age_hours = latest_local_backup_created_at
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s.trim()).ok())
        .map(|dt| {
            Utc::now()
                .signed_duration_since(dt.with_timezone(&Utc))
                .num_seconds() as f64
                / 3600.0
        });

    let mut alerts: Vec<String> = Vec::new();
    if let Some(h) = backup_age_hours {
        if h > 192.0 {
            alerts.push(format!(
                "Latest local backup is {:.1} hours old — verify schedules.",
                h
            ));
        }
    }
    if last_backup_time.is_none() && latest_local_backup_created_at.is_none() {
        alerts.push("No completed local backups recorded.".to_string());
    }
    if last_validation_status.as_deref() == Some("failed") {
        alerts.push("Latest backup failed automated validation.".to_string());
    }
    if last_restore_simulation_status.as_deref() == Some("failed") {
        alerts.push("Latest backup failed restore simulation.".to_string());
    }
    if last_validation_status.as_deref() == Some("ok")
        && last_restore_simulation_status.is_none()
        && last_restore_simulation_at.is_none()
    {
        alerts.push(
            "Restore simulation not recorded yet for latest backup (may still be running)."
                .to_string(),
        );
    }

    let mut size_trend_note: Option<String> = None;
    if let Ok(mut stmt) = db.prepare(
        "SELECT size_bytes FROM backups WHERE destination = 'local' AND status = 'completed' \
         AND size_bytes IS NOT NULL ORDER BY datetime(created_at) DESC LIMIT 6",
    ) {
        if let Ok(sizes_r) = stmt.query_map([], |row| row.get::<_, i64>(0)) {
            let mut sizes: Vec<i64> = Vec::new();
            for v in sizes_r.flatten() {
                sizes.push(v);
            }
            if sizes.len() >= 3 {
                let latest = sizes[0];
                let rest: Vec<i64> = sizes[1..].to_vec();
                if !rest.is_empty() {
                    let mut sorted = rest;
                    sorted.sort();
                    let mid = sorted[sorted.len() / 2].max(1);
                    if latest > (mid * 7 / 4) {
                        size_trend_note = Some(format!(
                            "Latest backup size {} bytes is unusually large vs recent median {} bytes.",
                            latest, mid
                        ));
                        alerts.push(size_trend_note.as_ref().unwrap().clone());
                        let _ = db.execute(
                            "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
                             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                            params![
                                APP_METADATA_BACKUP_SIZE_ALERT,
                                size_trend_note.as_deref().unwrap_or("")
                            ],
                        );
                    }
                }
            }
        }
    }

    let secondary_redundancy_enabled =
        read_app_setting_trim(&db, SETTINGS_BACKUP_SECONDARY_ENABLED)
            .map(|s| {
                let t = s.to_ascii_lowercase();
                t == "1" || t == "true" || t == "yes"
            })
            .unwrap_or(false);
    let secondary_redundancy_path =
        read_app_setting_trim(&db, SETTINGS_BACKUP_SECONDARY_PATH).unwrap_or_default();

    Ok(BackupHealthMetrics {
        last_backup_time,
        latest_local_backup_id,
        latest_local_backup_filename,
        latest_local_backup_created_at,
        latest_local_backup_size_bytes,
        backup_age_hours,
        last_validation_status,
        last_validation_at,
        last_restore_simulation_status,
        last_restore_simulation_at,
        alerts,
        secondary_redundancy_enabled,
        secondary_redundancy_path,
        size_trend_note,
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
    log_upgrade_readiness("create_backup");
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        ensure_command_permission(&db, userId.as_deref(), PERM_BACKUP_CREATE)?;
    }
    let app = window.app_handle();
    let backup_destination = request.destination.clone();
    let started_at = Instant::now();
    log::info!(
        target: "import_manager::backup",
        "event=workflow.backup.start stage=entry destination={} user_id={}",
        backup_destination,
        userId
            .as_deref()
            .map(crate::utils::redaction::redact_secret)
            .unwrap_or_else(|| "unknown".to_string())
    );
    match create_backup_impl(
        app.clone(),
        db_state.clone(),
        request,
        userId.clone(),
        Some(window),
    )
    .await
    {
        Ok(info) => {
            log::info!(
                target: "import_manager::backup",
                "event=workflow.backup.success stage=completion destination={} elapsed_ms={}",
                backup_destination,
                started_at.elapsed().as_millis()
            );
            if let Ok(conn) = db_state.db.lock() {
                crate::services::user_activity_audit::log_activity(
                    &conn,
                    userId.as_deref(),
                    "create_backup",
                    Some("backup"),
                    None,
                    Some(&format!("{{\"destination\": \"{}\"}}", backup_destination)),
                    "SUCCESS",
                );
            }
            Ok(info)
        }
        Err(e) => {
            log::warn!(
                target: "import_manager::backup",
                "event=workflow.backup.failure stage=completion destination={} elapsed_ms={} error={}",
                backup_destination,
                started_at.elapsed().as_millis(),
                e
            );
            if let Ok(conn) = db_state.db.lock() {
                let details = serde_json::json!({
                    "destination": backup_destination,
                    "error": e,
                })
                .to_string();
                crate::services::user_activity_audit::log_activity(
                    &conn,
                    userId.as_deref(),
                    "create_backup",
                    Some("backup"),
                    None,
                    Some(&details),
                    "FAILED",
                );
            }
            Err(e)
        }
    }
}

async fn create_backup_impl(
    app: AppHandle,
    db_state: State<'_, DbState>,
    request: BackupRequest,
    userId: Option<String>,
    window: Option<WebviewWindow>,
) -> Result<BackupInfo, String> {
    let backup_start = std::time::Instant::now();
    log::info!(
        target: "import_manager::backup",
        "event=workflow.backup.progress stage=initialization destination={}",
        request.destination
    );
    warn_if_frequent_backup(&db_state);
    let (data_dir, staging_path, filename) = {
        log::info!(
            target: "import_manager::backup",
            "event=workflow.backup.progress stage=validation step=filesystem_prechecks"
        );
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let source_path = db.path().ok_or("Could not get database path")?;
        let db_size = fs::metadata(source_path)
            .map_err(|e| format!("Failed to read database file: {}", e))?
            .len();
        if db_size > LARGE_DB_WARN_BYTES {
            log::warn!(
                target: "import_manager::backup",
                "Large database detected — backup may take longer"
            );
        }
        let data_dir = resolve_local_backup_workspace_conn(&db, db_size)?;
        let filename = resolve_backup_staging_filename(&data_dir, &request)?;
        let staging_path = data_dir.join(&filename);
        fs::copy(source_path, &staging_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
        (data_dir, staging_path, filename)
    };

    let password = crate::utils::backup_keyring::get_or_create_backup_encryption_password()?;
    log::info!(
        target: "import_manager::backup",
        "event=workflow.backup.progress stage=execution step=encryption"
    );
    let enc_filename = enc_basename_for_staging_db(&filename);
    let enc_path = data_dir.join(&enc_filename);
    if let Err(e) = crate::utils::encryption::encrypt_file(&staging_path, &enc_path, &password) {
        fs::remove_file(&staging_path).ok();
        return Err(e);
    }
    if let Err(e) = fs::remove_file(&staging_path) {
        fs::remove_file(&enc_path).ok();
        return Err(format!("Failed to remove plaintext backup: {}", e));
    }

    let size_bytes = fs::metadata(&enc_path).map(|m| m.len() as i64).unwrap_or(0);

    let hash_hex = match sha256_hex_file(&enc_path) {
        Ok(h) => h,
        Err(e) => {
            fs::remove_file(&enc_path).ok();
            return Err(e);
        }
    };

    let (record_path, destination_value, sha256) = match request.destination.as_str() {
        "local" => {
            if let Err(e) = write_sha256_sidecar(&enc_path, &hash_hex) {
                fs::remove_file(&enc_path).ok();
                return Err(e);
            }
            (
                enc_path.to_string_lossy().to_string(),
                "local".to_string(),
                Some(hash_hex),
            )
        }
        "google_drive" => {
            {
                let db = db_state.db.lock().map_err(|e| e.to_string())?;
                if !super::google_drive::is_configured_with_conn(&db) {
                    fs::remove_file(&enc_path).ok();
                    fs::remove_file(sidecar_sha256_path(&enc_path)).ok();
                    return Err(
                        "Google Drive is not configured. Set your OAuth credentials in Settings > Google Drive."
                            .to_string(),
                    );
                }
            }
            {
                let db = db_state.db.lock().map_err(|e| e.to_string())?;
                if !super::google_drive::has_gdrive_session(&db) {
                    fs::remove_file(&enc_path).ok();
                    fs::remove_file(sidecar_sha256_path(&enc_path)).ok();
                    return Err(
                        "Not connected to Google Drive. Connect your account first (Database Management → Backup)."
                            .to_string(),
                    );
                }
            }
            let file_id = super::google_drive::upload_backup_file(
                &enc_path,
                &enc_filename,
                window.as_ref(),
                Some(&db_state.db),
            )
            .await
            .map_err(|e| {
                fs::remove_file(&enc_path).ok();
                fs::remove_file(sidecar_sha256_path(&enc_path)).ok();
                super::google_drive::parse_friendly_error(&e)
            })?;
            fs::remove_file(&enc_path).ok();
            fs::remove_file(sidecar_sha256_path(&enc_path)).ok();
            (
                format!("{}{}", super::google_drive::GDRIVE_PATH_PREFIX, file_id),
                "google_drive".to_string(),
                Some(hash_hex),
            )
        }
        _ => {
            fs::remove_file(&enc_path).ok();
            fs::remove_file(sidecar_sha256_path(&enc_path)).ok();
            return Err("Unsupported backup destination".to_string());
        }
    };

    let dest_for_log = request.destination.clone();

    let (backup_id, gdrive_prune_ids): (i64, Vec<String>) = with_sqlite_retry(
        "create_backup_persist",
        || {
            log::info!(
                target: "import_manager::backup",
                "event=workflow.backup.progress stage=execution step=persist_metadata"
            );
            let mut db = db_state.db.lock().map_err(|e| e.to_string())?;
            let tx = db.transaction().map_err(|e| e.to_string())?;
            let id = {
                let mut stmt = tx
                .prepare("INSERT INTO backups (filename, path, destination, size_bytes, sha256, created_by, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                .map_err(|e| e.to_string())?;
                stmt.insert(params![
                    enc_filename.clone(),
                    record_path.clone(),
                    destination_value.clone(),
                    size_bytes,
                    sha256.clone(),
                    userId.clone(),
                    request.notes.clone(),
                    "completed"
                ])
                .map_err(|e| e.to_string())?
            };
            let audit_metadata = format!(
                "{{\"filename\": \"{}\", \"size_bytes\": {}}}",
                enc_filename, size_bytes
            );
            crate::db::try_audit_log_metadata(
                &tx,
                "backups",
                &id.to_string(),
                "backup",
                userId.as_deref(),
                &audit_metadata,
            );
            let gdrive_prune_ids = prune_excess_backups(&tx, BACKUP_RETENTION_MAX)?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok((id, gdrive_prune_ids))
        },
    )?;

    for file_id in gdrive_prune_ids {
        tauri::async_runtime::spawn(async move {
            if let Err(e) = super::google_drive::delete_file_by_id(&file_id, None).await {
                log::warn!(
                    target: "import_manager::backup",
                    "Prune: could not delete remote Google Drive file {}: {}",
                    crate::utils::redaction::redact_secret(&file_id),
                    e
                );
            }
        });
    }

    log::info!(
        target: "import_manager::backup",
        "Backup completed id={} filename={} destination={} size_bytes={} sha256_recorded={}",
        backup_id,
        enc_filename,
        dest_for_log,
        size_bytes,
        sha256.is_some()
    );
    log::info!(
        target: "import_manager::backup",
        "Backup completed in {:.2} seconds",
        backup_start.elapsed().as_secs_f64()
    );
    log::info!(
        target: "import_manager::backup",
        "Backup size: {:.2} MB",
        (size_bytes as f64) / 1_000_000.0
    );
    if let Err(e) = increment_app_metadata_count(&db_state, APP_METADATA_BACKUP_COUNT) {
        log::warn!(
            target: "import_manager::backup",
            "Could not update {}: {}",
            APP_METADATA_BACKUP_COUNT,
            e
        );
    }
    if let Err(e) = set_app_metadata_string(
        &db_state,
        APP_METADATA_LAST_BACKUP_TIME,
        &Utc::now().to_rfc3339(),
    ) {
        log::warn!(
            target: "import_manager::backup",
            "Could not update {}: {}",
            APP_METADATA_LAST_BACKUP_TIME,
            e
        );
    }
    invalidate_database_stats_cache();

    if dest_for_log == "local" {
        if let Ok(db) = db_state.db.lock() {
            if let Err(e) = mirror_local_backup_to_secondary(Path::new(&record_path), &db) {
                log::warn!(
                    target: "import_manager::backup",
                    "Secondary mirror failed (primary backup still saved): {}",
                    e
                );
            }
        }
    }

    if dest_for_log == "local" {
        let enc_pb = PathBuf::from(&record_path);
        let app_spawn = app.clone();
        let bid = backup_id;
        tauri::async_runtime::spawn(async move {
            match tauri::async_runtime::spawn_blocking(move || {
                run_post_backup_validation_sync(&app_spawn, bid, &enc_pb)
            })
            .await
            {
                Ok(()) => {}
                Err(e) => log::warn!(
                    target: "import_manager::backup",
                    "backup validation join error: {}",
                    e
                ),
            }
        });
    }

    Ok(BackupInfo {
        id: Some(backup_id),
        filename: enc_filename,
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
        validation_status: None,
        validation_checked_at: None,
        validation_message: None,
        restore_simulation_status: None,
        restore_simulation_checked_at: None,
        restore_simulation_message: None,
    })
}

async fn resolve_backup_to_local_path(
    backup_path: &str,
    window: Option<&WebviewWindow>,
    gdrive_db: Option<&std::sync::Mutex<rusqlite::Connection>>,
) -> Result<(PathBuf, Option<PathBuf>), String> {
    if backup_path.starts_with(super::google_drive::GDRIVE_PATH_PREFIX) {
        let id = backup_path
            .strip_prefix(super::google_drive::GDRIVE_PATH_PREFIX)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Invalid Google Drive backup reference".to_string())?;
        let tmp = std::env::temp_dir().join(format!(
            "import-manager-gdrive-restore-{}.enc",
            uuid::Uuid::new_v4()
        ));
        log::info!(
            target: "import_manager::restore",
            "event=gdrive_download_start file_id={}",
            id
        );
        super::google_drive::download_file_by_id(id, &tmp, window, gdrive_db)
            .await
            .map_err(|e| super::google_drive::parse_friendly_error(&e))?;
        if fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0) == 0 {
            let _ = fs::remove_file(&tmp);
            return Err("Downloaded backup file is empty".to_string());
        }
        log::info!(
            target: "import_manager::restore",
            "event=gdrive_download_finish path={:?}",
            tmp
        );
        Ok((tmp.clone(), Some(tmp)))
    } else {
        let p = Path::new(backup_path);
        if !p.exists() {
            return Err("Backup file does not exist".to_string());
        }
        let meta = fs::metadata(p).map_err(|e| format!("Cannot read backup file: {}", e))?;
        if meta.len() == 0 {
            return Err("Backup file is empty".to_string());
        }
        Ok((PathBuf::from(backup_path), None))
    }
}

/// `get_backup_history` can list Drive `.enc` files that were never inserted into `backups`; preview still needs a [BackupInfo].
async fn backup_info_for_gdrive_preview_without_db_row(
    backup_path: &str,
    local_artifact: &Path,
    db: &Mutex<Connection>,
) -> Result<BackupInfo, String> {
    let file_id = backup_path
        .strip_prefix(super::google_drive::GDRIVE_PATH_PREFIX)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Invalid Google Drive backup path".to_string())?;
    let (filename, created_at) =
        match super::google_drive::fetch_drive_file_label_metadata(file_id, Some(db)).await {
            Ok(v) => v,
            Err(e) => {
                log::warn!(
                    target: "import_manager::restore",
                    "Could not read Drive file metadata for preview (using placeholders): {}",
                    e
                );
                (
                    format!("backup-{file_id}.enc"),
                    chrono::Utc::now().to_rfc3339(),
                )
            }
        };
    let size_bytes = fs::metadata(local_artifact).map(|m| m.len() as i64).ok();
    Ok(BackupInfo {
        id: None,
        filename,
        path: backup_path.to_string(),
        destination: "google_drive".to_string(),
        size_bytes,
        sha256: None,
        created_by: None,
        created_at,
        retention_until: None,
        notes: Some("Google Drive — ImportManagerBackups".to_string()),
        status: "completed".to_string(),
        error_message: None,
        validation_status: None,
        validation_checked_at: None,
        validation_message: None,
        restore_simulation_status: None,
        restore_simulation_checked_at: None,
        restore_simulation_message: None,
    })
}

fn backup_created_at_sort_key(s: &str) -> i64 {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return dt.timestamp();
    }
    if let Ok(n) = chrono::NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%d %H:%M:%S") {
        return n.and_utc().timestamp();
    }
    0
}

// Get backup history (local `backups` rows plus live `.enc` files from shared Drive folder when connected).
#[tauri::command]
pub async fn get_backup_history(
    db_state: State<'_, DbState>,
    limit: Option<i64>,
) -> Result<Vec<BackupInfo>, String> {
    use std::collections::HashSet;

    const LOCAL_CAP: i64 = 500;
    let final_limit = limit.unwrap_or(100).clamp(1, 500) as usize;

    let mut backups = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let query = format!(
            "SELECT id, filename, path, destination, size_bytes, sha256, created_by, created_at, retention_until, notes, status, error_message, \
             validation_status, validation_checked_at, validation_message, \
             restore_simulation_status, restore_simulation_checked_at, restore_simulation_message \
             FROM backups ORDER BY created_at DESC LIMIT {}",
            LOCAL_CAP
        );
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
                    validation_status: row.get(12)?,
                    validation_checked_at: row.get(13)?,
                    validation_message: row.get(14)?,
                    restore_simulation_status: row.get(15)?,
                    restore_simulation_checked_at: row.get(16)?,
                    restore_simulation_message: row.get(17)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for row in rows {
            v.push(row.map_err(|e| e.to_string())?);
        }
        v
    };

    let gdrive_connected = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        super::google_drive::has_gdrive_session(&db)
    };

    if gdrive_connected {
        match super::google_drive::fetch_gdrive_enc_backup_rows(Some(&db_state.db)).await {
            Ok(rows) => {
                let mut seen: HashSet<String> = backups
                    .iter()
                    .filter_map(|b| {
                        b.path
                            .strip_prefix(super::google_drive::GDRIVE_PATH_PREFIX)
                            .map(|s| s.to_string())
                    })
                    .collect();
                for r in rows {
                    if seen.insert(r.file_id.clone()) {
                        backups.push(BackupInfo {
                            id: None,
                            filename: r.filename,
                            path: format!(
                                "{}{}",
                                super::google_drive::GDRIVE_PATH_PREFIX,
                                r.file_id
                            ),
                            destination: "google_drive".to_string(),
                            size_bytes: r.size_bytes,
                            sha256: None,
                            created_by: None,
                            created_at: r.modified_time,
                            retention_until: None,
                            notes: Some("Google Drive — ImportManagerBackups".to_string()),
                            status: "completed".to_string(),
                            error_message: None,
                            validation_status: None,
                            validation_checked_at: None,
                            validation_message: None,
                            restore_simulation_status: None,
                            restore_simulation_checked_at: None,
                            restore_simulation_message: None,
                        });
                    }
                }
            }
            Err(e) => {
                log::warn!(
                    target: "import_manager::gdrive",
                    "fetch_gdrive_enc_backup_rows failed (showing local backup list only): {}",
                    super::google_drive::parse_friendly_error(&e)
                );
            }
        }
    }

    backups.sort_by(|a, b| {
        backup_created_at_sort_key(&b.created_at).cmp(&backup_created_at_sort_key(&a.created_at))
    });
    backups.truncate(final_limit);
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
    ensure_command_permission(&db, userId.as_deref(), PERM_DATA_DELETE)?;

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
    db.execute(
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

    invalidate_database_stats_cache();
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
    let _trace = super::reference_scan::HardDeleteFnLogGuard::new(
        "hard_delete_record",
        &tableName,
        &record_id,
        "n/a",
    );
    if confirmation != "DELETE" {
        return Err("Invalid confirmation. Type 'DELETE' to confirm.".to_string());
    }

    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        ensure_command_permission(&db, userId.as_deref(), PERM_DATA_DELETE)?;
        super::reference_scan::ensure_can_hard_delete(
            &db,
            &tableName,
            std::slice::from_ref(&record_id),
        )?;
    }

    let mut db = db_state.db.lock().map_err(|e| e.to_string())?;

    // Get current record for audit log
    let before_json = format!(
        "{{\"id\": \"{}\", \"table\": \"{}\"}}",
        record_id, tableName
    );

    log::info!(
        target: "import_manager::hard_delete",
        "[HARD_DELETE] Begin transaction"
    );
    let tx = db
        .transaction()
        .map_err(|e| format!("Failed to begin hard delete transaction: {}", e))?;
    super::reference_scan::delete_fk_dependent_children(
        &tx,
        &tableName,
        std::slice::from_ref(&record_id),
    )?;

    // Perform hard delete
    let query = format!("DELETE FROM {} WHERE id = ?", tableName);
    let exec_started = Instant::now();
    tx.execute(&query, params![record_id.as_str()])
        .map_err(super::reference_scan::map_hard_delete_error_rusqlite)?;
    let exec_ms = exec_started.elapsed().as_millis();
    if exec_ms > 500 {
        log::warn!(
            target: "import_manager::hard_delete",
            "[HARD_DELETE WARNING] Slow DELETE for ID={} took {} ms",
            record_id,
            exec_ms
        );
    }

    // Create audit log entry
    let tn = tableName.as_str();
    tx.execute(
        r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, before_json, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)"#,
        params![
            tn,
            tn,
            record_id.as_str(),
            "hard_delete",
            userId,
            before_json,
            "{\"type\": \"hard_delete\"}"
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit()
        .map_err(|e| format!("Failed to commit hard delete transaction: {}", e))?;
    log::info!(
        target: "import_manager::hard_delete",
        "[HARD_DELETE] Commit transaction"
    );

    invalidate_database_stats_cache();
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
        resolve_backup_to_local_path(&backupPath, Some(&window), Some(&db_state.db)).await?;
    let mut _temp_guards = TempFileGuards::new();
    _temp_guards.push_opt(temp_dl);

    // Prefer `backups` row; Drive-only history entries have no row (path is still `gdrive:<fileId>`).
    let backup_info = match with_sqlite_retry("preview_restore_backup_row", || {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let r = db.query_row(
            "SELECT id, filename, path, destination, size_bytes, sha256, created_by, created_at, retention_until, notes, status, error_message, \
             validation_status, validation_checked_at, validation_message, \
             restore_simulation_status, restore_simulation_checked_at, restore_simulation_message FROM backups WHERE path = ?",
            params![backupPath.as_str()],
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
                    validation_status: row.get(12)?,
                    validation_checked_at: row.get(13)?,
                    validation_message: row.get(14)?,
                    restore_simulation_status: row.get(15)?,
                    restore_simulation_checked_at: row.get(16)?,
                    restore_simulation_message: row.get(17)?,
                })
            },
        );
        match r {
            Ok(info) => Ok(Some(info)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    })? {
        Some(info) => info,
        None => {
            if backupPath.starts_with(super::google_drive::GDRIVE_PATH_PREFIX) {
                backup_info_for_gdrive_preview_without_db_row(
                    &backupPath,
                    &local_path,
                    &db_state.db,
                )
                .await?
            } else {
                return Err(
                    "Backup not found in database: no row for this path (local backups must exist in the backups table)."
                        .to_string(),
                );
            }
        }
    };

    let recorded_hash_match: Option<bool> = match &backup_info.sha256 {
        Some(s) if !s.trim().is_empty() => match sha256_hex_file(&local_path) {
            Ok(actual) => Some(s.eq_ignore_ascii_case(&actual)),
            Err(_) => Some(false),
        },
        _ => None,
    };

    if recorded_hash_match == Some(false) {
        let checksum_status = checksum_status_for_local_path(&local_path);
        let current_stats = get_database_stats(db_state.clone()).await?;
        let backup_size = fs::metadata(&local_path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);
        let mut warnings = vec!["The backup file does not match the recorded SHA-256. Restore is blocked until you use a valid file.".to_string()];
        if checksum_status == "invalid" {
            warnings.push("The SHA-256 sidecar also does not match the file.".to_string());
        }
        return Ok(RestorePreview {
            backup_info: backup_info.clone(),
            current_db_stats: current_stats,
            backup_file_size_bytes: backup_size,
            estimated_restore_seconds: (backup_size as f64 / 1_000_000.0) * 0.02,
            checksum_status,
            recorded_hash_match,
            integrity_check: "Record mismatch — cannot trust file contents".to_string(),
            schema_compatibility: false,
            embedded_migration_head_version: crate::migrations::embedded_migration_head_version(),
            backup_migration_max_version: None,
            missing_core_tables: vec![],
            estimated_changes: HashMap::new(),
            warnings,
        });
    }

    validate_local_backup_file_for_restore(&local_path)?;

    let (work_path, dec_temp) = prepare_restorable_sqlite_path(&local_path)?;
    _temp_guards.push_opt(dec_temp);

    let checksum_status = checksum_status_for_local_path(&local_path);

    // Get current database stats
    let current_stats = get_database_stats(db_state.clone()).await?;

    // Check backup file integrity (metadata is for the stored artifact, usually `.enc`)
    let backup_size = fs::metadata(&local_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let integrity_check = if backup_size == backup_info.size_bytes.unwrap_or(0) {
        "Backup file size matches recorded size".to_string()
    } else {
        "WARNING: Backup file size does not match recorded size".to_string()
    };

    let embedded_head = crate::migrations::embedded_migration_head_version();
    let missing_core = list_missing_core_tables(&work_path);
    let backup_mig = read_backup_max_migration_version(&work_path);
    let work_str = work_path.to_string_lossy().to_string();
    let legacy_schema_ok = check_schema_compatibility(&work_str)?;
    let schema_compatibility = missing_core.is_empty() && legacy_schema_ok;

    // Estimate changes by comparing table counts
    let mut estimated_changes = HashMap::new();
    let mut warnings = Vec::new();

    if let Some(bv) = backup_mig {
        if bv > embedded_head as i64 {
            warnings.push(format!(
                "Backup reports schema version {} newer than this app ({}).",
                bv, embedded_head
            ));
        }
    }

    if let Some("failed") = backup_info.validation_status.as_deref() {
        warnings.push("Automated backup validation reported failure for this file.".to_string());
    }
    if let Some("failed") = backup_info.restore_simulation_status.as_deref() {
        warnings.push(
            "Last restore simulation failed for this backup — review before restoring.".to_string(),
        );
    }

    // Try to get table counts from backup (simplified approach)
    if let Ok(backup_conn) = Connection::open(&work_path) {
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
    if !missing_core.is_empty() {
        warnings.push(format!(
            "Missing core tables in backup: {}",
            missing_core.join(", ")
        ));
    } else if !legacy_schema_ok {
        warnings.push("Legacy schema check failed (core catalog tables).".to_string());
    }

    if backup_info.status != "completed" {
        warnings.push(format!(
            "Backup status is '{}', not 'completed'",
            backup_info.status
        ));
    }

    if checksum_status == "invalid" {
        warnings.push(
            "Backup SHA256 does not match the checksum file. Restore is not allowed until resolved."
                .to_string(),
        );
    }

    let estimated_restore_seconds = (backup_size as f64 / 1_000_000.0) * 0.02;

    Ok(RestorePreview {
        backup_info,
        current_db_stats: current_stats,
        backup_file_size_bytes: backup_size,
        estimated_restore_seconds,
        checksum_status,
        recorded_hash_match,
        integrity_check,
        schema_compatibility,
        embedded_migration_head_version: embedded_head,
        backup_migration_max_version: backup_mig,
        missing_core_tables: missing_core,
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

/// `user_roles` is restored only when the backup file contains that table (older backups omit it).
const USER_ROLES_TABLE: &str = "user_roles";
/// Well-known `user_id` when post-restore safety must insert an admin (logged explicitly).
const RESTORE_RECOVERY_ADMIN_USER_ID: &str = "restore-recovery-admin";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UserRolesRestoreOutcome {
    RestoredFromBackup,
    BackupMissingTable,
    SkippedIncompatibleSchema,
}

/// If the backup has a compatible `user_roles` table, replace main from backup. Otherwise leave
/// main `user_roles` unchanged and log (older backups, or incompatible schema).
fn restore_user_roles_from_attached_backup(
    tx: &Transaction<'_>,
    backup_db_name: &str,
) -> Result<UserRolesRestoreOutcome, String> {
    let table_exists: i64 = tx
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM {}.sqlite_master WHERE type='table' AND name=?",
                backup_db_name
            ),
            params![USER_ROLES_TABLE],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if table_exists == 0 {
        log::warn!(
            target: "import_manager::restore",
            "[{}] user_roles not present in backup — existing roles retained",
            restore_log_ts()
        );
        return Ok(UserRolesRestoreOutcome::BackupMissingTable);
    }

    let pragma_main = pragma_table_info_main(USER_ROLES_TABLE);
    let pragma_backup = pragma_table_info_attached(backup_db_name, USER_ROLES_TABLE);

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
        log::warn!(
            target: "import_manager::restore",
            "[{}] user_roles in backup has no column overlap with main — existing roles retained",
            restore_log_ts()
        );
        return Ok(UserRolesRestoreOutcome::SkippedIncompatibleSchema);
    }

    let table_q = sqlite_double_quote_ident(USER_ROLES_TABLE);
    tx.execute(&format!("DELETE FROM {}", table_q), [])
        .map_err(|e| format!("Failed to clear user_roles for restore: {}", e))?;

    let columns_str = common_columns.join(", ");
    let copy_sql = format!(
        "INSERT INTO {} ({}) SELECT {} FROM {}.{}",
        table_q, columns_str, columns_str, backup_db_name, table_q
    );
    let rows = tx
        .execute(&copy_sql, [])
        .map_err(|e| format!("Failed to restore user_roles: {}", e))?;

    log::info!(
        target: "import_manager::restore",
        "[{}] user_roles restored from backup ({} rows)",
        restore_log_ts(),
        rows
    );
    Ok(UserRolesRestoreOutcome::RestoredFromBackup)
}

/// Ensures at least one admin row exists after restore. Logs explicitly when inserting recovery admin.
fn ensure_at_least_one_admin_after_restore(conn: &Connection) -> Result<(), String> {
    let admin_count = crate::security::count_admin_roles(conn)
        .map_err(|e| format!("user_roles ensure after restore: {}", e))?;
    if admin_count > 0 {
        return Ok(());
    }
    log::warn!(
        target: "import_manager::restore",
        "[{}] No admin in user_roles after restore; inserting recovery admin (user_id={})",
        restore_log_ts(),
        RESTORE_RECOVERY_ADMIN_USER_ID
    );
    crate::security::insert_recovery_admin_when_no_admins(conn, RESTORE_RECOVERY_ADMIN_USER_ID)?;
    log::info!(
        target: "import_manager::restore",
        "[{}] Recovery admin inserted (user_id={})",
        restore_log_ts(),
        RESTORE_RECOVERY_ADMIN_USER_ID
    );
    Ok(())
}

fn restore_log_ts() -> String {
    chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string()
}

/// Persists a post-commit marker before any admin-recovery step so operators can tell the restore transaction succeeded.
fn record_restore_transaction_committed_marker(conn: &Connection) -> Result<(), String> {
    let ts = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![APP_METADATA_RESTORE_TX_COMMITTED_AT, ts],
    )
    .map_err(|e| {
        format!(
            "Failed to record restore transaction committed marker: {}",
            e
        )
    })?;
    log::info!(
        target: "import_manager::restore",
        "event=restore.tx_committed_marker stage=post_commit committed_at={}",
        ts
    );
    Ok(())
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
    log_upgrade_readiness("restore_database");
    let heavy_seq = HEAVY_WORKFLOW_SEQUENCE
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        ensure_command_permission(&db, userId.as_deref(), PERM_BACKUP_RESTORE)?;
    }
    let restore_start = std::time::Instant::now();
    log::info!(
        target: "import_manager::restore",
        "event=workflow.restore.start stage=entry sequence={} backup_path={} user_id={}",
        heavy_seq,
        crate::utils::redaction::redact_path_str(&backupPath),
        userId
            .as_deref()
            .map(crate::utils::redaction::redact_secret)
            .unwrap_or_else(|| "unknown".to_string())
    );
    log::info!(
        target: "import_manager::workload",
        "event=workload.classification category=heavy operation=restore"
    );
    if current_bulk_delete_active_count() > 0 {
        return Err(
            "Bulk delete is in progress. Please retry restore when bulk operations are complete."
                .to_string(),
        );
    }
    if RESTORE_TABLES.len() >= SCALE_WARNING_RESTORE_TABLES {
        log::info!(
            target: "import_manager::restore",
            "event=workflow.restore.scale_readiness stage=entry restore_tables={}",
            RESTORE_TABLES.len()
        );
        log_scale_escalation(
            &LARGE_RESTORE_OPERATION_COUNT,
            "restore_scope",
            RESTORE_TABLES.len(),
        );
    }

    crate::restore_control::try_begin_restore()?;
    crate::restore_control::pause_background_jobs();
    let session_guard = crate::restore_control::RestoreSessionGuard::new();
    let restore_started_at = Utc::now().to_rfc3339();
    let restore_status_start = format!(
        "in_progress|started_at={}|backup_path={}",
        restore_started_at, backupPath
    );
    if let Err(e) = set_app_metadata_string(
        &db_state,
        APP_METADATA_RESTORE_STATUS,
        &restore_status_start,
    ) {
        log::warn!(
            target: "import_manager::restore",
            "Could not set {}: {}",
            APP_METADATA_RESTORE_STATUS,
            e
        );
    }

    let outcome: Result<RestoreResult, String> = async {
        log::info!(
            target: "import_manager::restore",
            "event=workflow.restore.progress stage=initialization"
        );
        let (local_path, temp_dl) = resolve_backup_to_local_path(
            &backupPath,
            Some(&window),
            Some(&db_state.db),
        )
        .await?;
        let mut _temp_guards = TempFileGuards::new();
        _temp_guards.push_opt(temp_dl);
        log::info!(
            target: "import_manager::resource",
            "event=resource.temp_files stage=restore_init tracked_temp_files={}",
            1
        );

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

        let expected_sha: Option<String> = with_sqlite_retry("restore_expected_sha", || {
            let db = db_state.db.lock().map_err(|e| e.to_string())?;
            let r: std::result::Result<Option<String>, rusqlite::Error> = db.query_row(
                "SELECT sha256 FROM backups WHERE path = ?1",
                params![&backupPath],
                |row| row.get(0),
            );
            match r {
                Ok(s) => Ok(s),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e.to_string()),
            }
        })?;

        verify_stored_sha256_against_file(&local_path, expected_sha)?;
        log::info!(
            target: "import_manager::restore",
            "event=workflow.restore.progress stage=validation step=checksum_and_format"
        );

        if let Err(e) = validate_local_backup_file_for_restore(&local_path) {
            log::error!(
                target: "import_manager::restore",
                "Backup file validation failed: {}",
                e
            );
            window
                .dialog()
                .message(&e)
                .title("Cannot restore")
                .show(|_| {});
            return Err(e);
        }

        let (work_path, dec_temp) = prepare_restorable_sqlite_path(&local_path)?;
        _temp_guards.push_opt(dec_temp);

        let local_str = work_path.to_string_lossy().to_string();

        let pre_restore_backup = create_pre_restore_backup_sync(
            current_db_path.to_string_lossy().as_ref(),
            userId.clone(),
        )?;
        log::info!(
            target: "import_manager::restore",
            "event=workflow.restore.progress stage=execution step=pre_restore_backup"
        );

        let temp_path = PathBuf::from(format!("{}.restore_temp", current_db_path.display()));
        _temp_guards.push(temp_path.clone());
        log::info!(
            target: "import_manager::resource",
            "event=resource.temp_files stage=restore_execution temp_file={} tracked_temp_files={}",
            temp_path.display(),
            2
        );
        fs::copy(&work_path, &temp_path).map_err(|e| format!("Failed to copy backup: {}", e))?;

        let temp_size = fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);
        let work_size = fs::metadata(&work_path).map(|m| m.len()).unwrap_or(0);
        if temp_size != work_size {
            return Err("Backup file verification failed".to_string());
        }

        let integrity_check = test_database_integrity(&temp_path.to_string_lossy())?;
        if !integrity_check.contains("ok") {
            return Err(format!(
                "Database integrity check failed: {}",
                integrity_check
            ));
        }

        validate_backup_tables_readonly(&work_path, RESTORE_TABLES)?;

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

        let (restored_table_list, restore_outcome, post_restore_warning) = {
            log::info!(
                target: "import_manager::restore",
                "event=workflow.restore.progress stage=execution step=table_copy"
            );
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

            with_sqlite_retry("restore_attach_backup", || {
                restore_conn.execute(&attach_sql, []).map_err(|e| {
                    let es = e.to_string();
                    if es.contains("database is already in use") {
                        "Backup database is already attached. Please try again in a moment, or restart the application if the issue persists.".to_string()
                    } else if es.contains("no such file") {
                        format!("Backup file not found: {}. Please check the file path.", local_str)
                    } else if es.contains("not a database") {
                        format!(
                            "Invalid backup file: {}. The file is not a valid SQLite database.",
                            local_str
                        )
                    } else {
                        format!("Failed to attach backup database: {}", e)
                    }
                })?;
                Ok::<(), String>(())
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

                match restore_user_roles_from_attached_backup(&tx, &backup_db_name) {
                    Ok(UserRolesRestoreOutcome::RestoredFromBackup) => {
                        out.push("user_roles (from backup)".to_string());
                    }
                    Ok(UserRolesRestoreOutcome::BackupMissingTable) => {
                        out.push("user_roles (retained — not in backup)".to_string());
                    }
                    Ok(UserRolesRestoreOutcome::SkippedIncompatibleSchema) => {
                        out.push("user_roles (retained — backup incompatible)".to_string());
                    }
                    Err(e) => return Err(e),
                }

                tx.commit()
                    .map_err(|e| format!("Failed to commit restore transaction: {}", e))?;
                record_restore_transaction_committed_marker(&restore_conn)?;
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

            // Re-apply WAL + FK PRAGMAs — the replaced connection starts with SQLite defaults.
            crate::db::configure_sqlite_runtime(&main_guard);

            let admin_recovery_result = ensure_at_least_one_admin_after_restore(&main_guard);
            let final_admin_count = crate::security::count_admin_roles(&main_guard).unwrap_or(0);
            let admin_recovery_for_log = match &admin_recovery_result {
                Ok(()) => "ok".to_string(),
                Err(e) => format!(
                    "failed: {}",
                    e.replace('\n', " ").replace('|', "/")
                ),
            };
            let (outcome, post_restore_warning) = match &admin_recovery_result {
                Ok(()) => (RestoreOutcome::RestoreFullySucceeded, None),
                Err(e) => (
                    RestoreOutcome::RestoreSucceededWithWarning,
                    Some(e.clone()),
                ),
            };
            log::info!(
                target: "import_manager::restore",
                "event=restore.final_state restore_phase_result=committed admin_recovery_result={} final_admin_count={} outcome={:?}",
                admin_recovery_for_log,
                final_admin_count,
                outcome
            );
            if let Err(ref e) = admin_recovery_result {
                log::warn!(
                    target: "import_manager::restore",
                    "[{}] Admin recovery after restore failed (restore transaction already committed): {}",
                    restore_log_ts(),
                    e
                );
            }

            log::info!(
                target: "import_manager::restore",
                "[{}] Main application connection replaced; no stale page cache",
                restore_log_ts()
            );

            (restored_table_list, outcome, post_restore_warning)
        };

        let tables_msg = restored_table_list.join(", ");
        let base_msg = format!("Database restored successfully. Restored tables: {}", tables_msg);
        let message = match &post_restore_warning {
            Some(w) => format!(
                "{} Warning: post-restore admin recovery did not complete: {}",
                base_msg, w
            ),
            None => base_msg,
        };

        Ok(RestoreResult {
            success: true,
            outcome: restore_outcome,
            message,
            backup_created: Some(pre_restore_backup),
            integrity_check,
            tables_affected: RESTORE_TABLES.iter().map(|s| (*s).to_string()).collect(),
            post_restore_warning,
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
            {
                let db = db_state.db.lock().map_err(|e| e.to_string())?;
                crate::db::try_audit_log_no_row(
                    &db,
                    "database",
                    "restore",
                    userId.as_deref(),
                    &restore_meta,
                );
            }
            if let Err(e) = increment_app_metadata_count(&db_state, APP_METADATA_RESTORE_COUNT) {
                log::warn!(
                    target: "import_manager::restore",
                    "Could not update {}: {}",
                    APP_METADATA_RESTORE_COUNT,
                    e
                );
            }
            if let Err(e) = set_app_metadata_string(
                &db_state,
                APP_METADATA_LAST_RESTORE_TIME,
                &Utc::now().to_rfc3339(),
            ) {
                log::warn!(
                    target: "import_manager::restore",
                    "Could not update {}: {}",
                    APP_METADATA_LAST_RESTORE_TIME,
                    e
                );
            }
            let restore_status_done = format!(
                "completed|started_at={}|finished_at={}",
                restore_started_at,
                Utc::now().to_rfc3339()
            );
            if let Err(e) = set_app_metadata_string(
                &db_state,
                APP_METADATA_RESTORE_STATUS,
                &restore_status_done,
            ) {
                log::warn!(
                    target: "import_manager::restore",
                    "Could not set {}: {}",
                    APP_METADATA_RESTORE_STATUS,
                    e
                );
            }
            log::info!(
                target: "import_manager::restore",
                "event=workflow.restore.success stage=completion elapsed_ms={} outcome={:?}",
                restore_start.elapsed().as_millis(),
                result.outcome
            );
            if let Ok(conn) = db_state.db.lock() {
                let details = serde_json::json!({
                    "backupPath": crate::utils::redaction::redact_path_str(&backupPath),
                    "outcome": format!("{:?}", result.outcome),
                    "preRestoreBackup": result.backup_created.as_deref().unwrap_or(""),
                })
                .to_string();
                crate::services::user_activity_audit::log_activity_with_severity(
                    &conn,
                    userId.as_deref(),
                    "restore_database",
                    Some("database"),
                    None,
                    Some(&details),
                    "SUCCESS",
                    AuditSeverity::Critical,
                );
            }
            record_performance_observation(
                "restore_operation",
                restore_start.elapsed().as_millis(),
                RESTORE_TABLES.len(),
                0,
            );
            log::info!(
                target: "import_manager::restore",
                "[{}] Restore completed successfully outcome={:?} post_restore_warning={:?}",
                restore_log_ts(),
                result.outcome,
                result.post_restore_warning.as_deref()
            );
            invalidate_database_stats_cache();
            Ok(result)
        }
        Err(e) => {
            log_failure_pattern(
                &HEAVY_WORKFLOW_FAILURE_COUNT,
                "restore_failure",
                "restore_database",
            );
            let restore_status_failed = format!(
                "failed|started_at={}|finished_at={}|error={}",
                restore_started_at,
                Utc::now().to_rfc3339(),
                e.replace('\n', " ").replace('|', "/")
            );
            if let Err(meta_err) = set_app_metadata_string(
                &db_state,
                APP_METADATA_RESTORE_STATUS,
                &restore_status_failed,
            ) {
                log::warn!(
                    target: "import_manager::restore",
                    "Could not set {}: {}",
                    APP_METADATA_RESTORE_STATUS,
                    meta_err
                );
            }
            log::warn!(
                target: "import_manager::restore",
                "event=workflow.restore.failure stage=completion elapsed_ms={} error={}",
                restore_start.elapsed().as_millis(),
                e
            );
            if let Ok(conn) = db_state.db.lock() {
                let details = serde_json::json!({
                    "backupPath": crate::utils::redaction::redact_path_str(&backupPath),
                    "error": e,
                })
                .to_string();
                crate::services::user_activity_audit::log_activity_with_severity(
                    &conn,
                    userId.as_deref(),
                    "restore_database",
                    Some("database"),
                    None,
                    Some(&details),
                    "FAILED",
                    AuditSeverity::Critical,
                );
            }
            record_performance_observation(
                "restore_operation",
                restore_start.elapsed().as_millis(),
                RESTORE_TABLES.len(),
                1,
            );
            Err(e)
        }
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

    // Build WHERE clause from validated filters.
    let (where_clause, mut params) =
        build_bulk_search_where_clause(&db, &tableName, &filters, includeDeleted);

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

fn build_bulk_search_where_clause(
    db: &Connection,
    table_name: &str,
    filters: &HashMap<String, serde_json::Value>,
    include_deleted: bool,
) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut where_clause = String::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut has_condition = false;
    let allowed_columns: HashSet<String> = get_table_columns(db, table_name)
        .unwrap_or_default()
        .into_iter()
        .collect();

    if !include_deleted {
        where_clause.push_str(" WHERE deleted_at IS NULL");
        has_condition = true;
    }

    for (column, value) in filters {
        if !allowed_columns.contains(column) {
            continue;
        }
        if !value.is_null() {
            let connector = if has_condition { " AND" } else { " WHERE" };
            let quoted_col = sqlite_double_quote_ident(column);
            if matches!(value, serde_json::Value::String(_)) {
                where_clause.push_str(&format!("{} {} LIKE ?", connector, quoted_col));
            } else {
                where_clause.push_str(&format!("{} {} = ?", connector, quoted_col));
            }
            has_condition = true;

            let search_value = match value {
                serde_json::Value::String(s) => format!("{}%", s.trim()),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                _ => value.to_string(),
            };
            params.push(Box::new(search_value));
        }
    }

    (where_clause, params)
}

fn is_excluded_bulk_table(name: &str) -> bool {
    name.eq_ignore_ascii_case("refinery_schema_history")
        || name.starts_with("sqlite_")
        || name.starts_with("temp_")
}

fn table_has_id_column_for_bulk(conn: &Connection, table_name: &str) -> Result<bool, String> {
    let q = format!("PRAGMA table_info(\"{}\")", table_name.replace('"', "\"\""));
    let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(r) = rows.next().map_err(|e| e.to_string())? {
        let col_name: String = r.get(1).map_err(|e| e.to_string())?;
        if col_name.eq_ignore_ascii_case("id") {
            return Ok(true);
        }
    }
    Ok(false)
}

fn get_bulk_valid_tables(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let name = row.map_err(|e| e.to_string())?;
        if is_excluded_bulk_table(&name) {
            continue;
        }
        if table_has_id_column_for_bulk(conn, &name)? {
            out.push(name);
        }
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkManageableTable {
    pub name: String,
    pub label: String,
}

#[tauri::command]
pub async fn get_bulk_manageable_tables(
    db_state: State<'_, DbState>,
) -> Result<Vec<BulkManageableTable>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let names = get_bulk_valid_tables(&db)?;
    Ok(names
        .into_iter()
        .map(|name| {
            let label = name
                .split('_')
                .map(|w| {
                    if w.is_empty() {
                        String::new()
                    } else if w.eq_ignore_ascii_case("boe") {
                        "BOE".to_string()
                    } else {
                        let mut chars = w.chars();
                        let first = chars.next().unwrap_or_default().to_ascii_uppercase();
                        format!("{}{}", first, chars.as_str())
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            BulkManageableTable { name, label }
        })
        .collect())
}

fn collect_matching_ids_from_filters(
    db: &Connection,
    table_name: &str,
    filters: &HashMap<String, serde_json::Value>,
    include_deleted: bool,
    excluded_record_ids: &HashSet<String>,
) -> Result<Vec<String>, String> {
    let excluded_count = excluded_record_ids.len();
    log::info!(
        target: "import_manager::bulk_delete",
        "[{}] Fetching matching record IDs...",
        table_name
    );
    let fetch_start = Instant::now();

    let (where_clause, params) =
        build_bulk_search_where_clause(db, table_name, filters, include_deleted);
    let query = format!("SELECT id FROM {}{} ORDER BY id", table_name, where_clause);
    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(&param_refs[..], |row| {
            let id_text = match row.get::<_, String>(0) {
                Ok(s) => s,
                Err(_) => row.get::<_, i64>(0)?.to_string(),
            };
            Ok(id_text)
        })
        .map_err(|e| e.to_string())?;

    let mut raw_ids = Vec::new();
    for row in rows {
        raw_ids.push(row.map_err(|e| e.to_string())?);
    }
    let fetch_ms = fetch_start.elapsed().as_millis();
    log::info!(
        target: "import_manager::bulk_delete",
        "[{}] Fetched {} matching IDs in {} ms",
        table_name,
        raw_ids.len(),
        fetch_ms
    );
    log::info!(
        target: "import_manager::bulk_delete",
        "[{}] Applying exclusion list: {} excluded IDs",
        table_name,
        excluded_count
    );

    let exclusion_start = Instant::now();
    let mut ids = Vec::with_capacity(raw_ids.len().saturating_sub(excluded_count));
    for id in raw_ids {
        if !excluded_record_ids.contains(&id) {
            ids.push(id);
        }
    }
    log::info!(
        target: "import_manager::bulk_delete",
        "[{}] Final delete count after exclusions: {} (exclusion step {} ms)",
        table_name,
        ids.len(),
        exclusion_start.elapsed().as_millis()
    );
    Ok(ids)
}

fn count_matching_records_from_filters(
    db: &Connection,
    table_name: &str,
    filters: &HashMap<String, serde_json::Value>,
    include_deleted: bool,
) -> Result<usize, String> {
    let (where_clause, params) =
        build_bulk_search_where_clause(db, table_name, filters, include_deleted);
    let query = format!("SELECT COUNT(*) FROM {}{}", table_name, where_clause);
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let count: i64 = db
        .query_row(&query, &param_refs[..], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count.max(0) as usize)
}

#[derive(Clone)]
struct BulkUndoContext {
    table_name: String,
    record_ids: Vec<String>,
    user_id: Option<String>,
    delete_type: String,
    expires_at: DateTime<Utc>,
}

fn bulk_undo_registry() -> &'static Mutex<HashMap<String, BulkUndoContext>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, BulkUndoContext>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prune_expired_bulk_undo_tokens(registry: &mut HashMap<String, BulkUndoContext>) {
    let now = Utc::now();
    registry.retain(|_, ctx| ctx.expires_at > now);
}

fn emit_bulk_delete_event(app: &AppHandle, event: &str, payload: serde_json::Value) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit(event, &payload);
    }
}

fn create_bulk_undo_token(
    table_name: &str,
    record_ids: &[String],
    user_id: &Option<String>,
    delete_type: &str,
) -> Result<(String, String), String> {
    let undo_token = uuid::Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::seconds(BULK_DELETE_UNDO_WINDOW_SECS);
    let context = BulkUndoContext {
        table_name: table_name.to_string(),
        record_ids: record_ids.to_vec(),
        user_id: user_id.clone(),
        delete_type: delete_type.to_string(),
        expires_at,
    };

    {
        let mut registry = bulk_undo_registry().lock().map_err(|e| e.to_string())?;
        prune_expired_bulk_undo_tokens(&mut registry);
        registry.insert(undo_token.clone(), context);
    }

    let token_for_cleanup = undo_token.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(BULK_DELETE_UNDO_WINDOW_SECS as u64));
        if let Ok(mut registry) = bulk_undo_registry().lock() {
            registry.remove(&token_for_cleanup);
        }
    });

    Ok((undo_token, expires_at.to_rfc3339()))
}

#[allow(clippy::too_many_arguments)]
fn execute_bulk_delete_for_ids(
    app: &AppHandle,
    db: &mut Connection,
    table_name: &str,
    record_ids: &[String],
    user_id: &Option<String>,
    delete_type: &str,
    operation_started_at: Instant,
    operation_timeout_ms: u64,
) -> Result<BulkDeleteResult, String> {
    let _hard_cmd_trace = (delete_type == "hard").then(|| {
        super::reference_scan::HardDeleteFnLogGuard::new(
            "execute_bulk_delete_for_ids",
            table_name,
            &super::reference_scan::summarize_record_ids_for_log(record_ids),
            "n/a",
        )
    });

    if record_ids.is_empty() {
        return Err("No records selected for deletion".to_string());
    }
    log::info!(
        target: "import_manager::resource",
        "event=resource.batch_processing stage=bulk_init delete_type={} total_records={} approx_id_bytes={}",
        delete_type,
        record_ids.len(),
        record_ids.iter().map(|id| id.len()).sum::<usize>()
    );

    let mut hard_delete_processed_ids: Option<HashSet<String>> =
        (delete_type == "hard").then(HashSet::new);

    let mut bulk_delete_batch_size: usize = 200;
    let total_requested = record_ids.len();
    let mut deleted_count = 0;
    let mut failed_deletions = Vec::with_capacity(total_requested.saturating_div(10).max(8));
    if delete_type == "hard" {
        bulk_delete_batch_size = bulk_delete_batch_size.min(100);
    }
    if total_requested >= 5_000 {
        bulk_delete_batch_size = bulk_delete_batch_size.min(100);
    }
    let mut processed = 0usize;
    let total_batches =
        (total_requested + bulk_delete_batch_size.saturating_sub(1)) / bulk_delete_batch_size;
    let mut lock_contention_streak: u32 = 0;

    emit_bulk_delete_event(
        app,
        "bulk_delete_started",
        serde_json::json!({
            "totalCount": total_requested,
            "totalBatches": total_batches,
        }),
    );
    log::info!(
        target: "import_manager::bulk_delete",
        "event=workflow.bulk_delete.progress stage=initialization total_batches={} total_count={}",
        total_batches,
        total_requested
    );

    for (batch_idx, chunk) in record_ids.chunks(bulk_delete_batch_size).enumerate() {
        let batch_number = batch_idx + 1;
        let batch_started_at = Instant::now();
        log::info!(
            target: "import_manager::bulk_delete",
            "event=workflow.bulk_delete.progress stage=execution batch_start={}/{}",
            batch_number,
            total_batches
        );
        let mut completed_batch = false;
        for attempt in 1..=BULK_DELETE_BATCH_RETRY_ATTEMPTS {
            if operation_started_at.elapsed().as_millis() as u64 > operation_timeout_ms {
                log::warn!(
                    target: "import_manager::bulk_delete",
                    "event=workflow.bulk_delete.failure stage=execution reason=timeout elapsed_ms={} timeout_ms={}",
                    operation_started_at.elapsed().as_millis(),
                    operation_timeout_ms
                );
                return Err("Bulk operation timed out. Please retry.".to_string());
            }

            let batch_result = (|| -> Result<(usize, Vec<String>), String> {
                if delete_type == "hard" {
                    log::info!(
                        target: "import_manager::hard_delete",
                        "[HARD_DELETE] Begin transaction"
                    );
                }
                let tx = db
                    .transaction()
                    .map_err(|e| format!("Failed to begin bulk delete transaction: {}", e))?;
                let mut batch_deleted = 0usize;
                let mut batch_failed = Vec::with_capacity(chunk.len().saturating_div(10).max(4));
                let soft_delete_query = format!(
                    "UPDATE {} SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ? AND deleted_at IS NULL",
                    table_name
                );
                let hard_delete_query = format!("DELETE FROM {} WHERE id = ?", table_name);
                let soft_delete_meta = format!(
                    "{{\"type\": \"bulk_soft_delete\", \"batch_size\": {}}}",
                    total_requested
                );
                let hard_delete_meta = format!(
                    "{{\"type\": \"bulk_hard_delete\", \"batch_size\": {}}}",
                    total_requested
                );

                for record_id in chunk {
                    if let Some(set) = hard_delete_processed_ids.as_mut() {
                        if !set.insert(record_id.clone()) {
                            log::error!(
                                target: "import_manager::hard_delete",
                                "[HARD_DELETE ERROR] Recursive delete detected id={}",
                                record_id
                            );
                            continue;
                        }
                    }
                    let _per_rec_trace = (delete_type == "hard").then(|| {
                        super::reference_scan::HardDeleteFnLogGuard::new(
                            "execute_bulk_delete_for_ids_per_record",
                            table_name,
                            record_id.as_str(),
                            &batch_number.to_string(),
                        )
                    });
                    match delete_type {
                        "soft" => {
                            let changes = tx
                                .execute(&soft_delete_query, params![user_id, record_id])
                                .map_err(|e| e.to_string())?;

                            if changes > 0 {
                                batch_deleted += 1;
                                let tn = table_name;
                                let _ = tx.execute(
                                    r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
                                    params![
                                        tn,
                                        tn,
                                        record_id,
                                        "bulk_soft_delete",
                                        user_id,
                                        &soft_delete_meta
                                    ],
                                );
                            } else {
                                batch_failed.push(format!(
                                    "Record {} not found or already deleted",
                                    record_id
                                ));
                            }
                        }
                        "hard" => {
                            super::reference_scan::delete_fk_dependent_children(
                                &tx,
                                table_name,
                                std::slice::from_ref(record_id),
                            )?;
                            let exec_started = Instant::now();
                            let changes = match tx
                                .execute(&hard_delete_query, params![record_id.as_str()])
                            {
                                Ok(changes) => changes,
                                Err(e) => {
                                    let raw = e.to_string();
                                    if is_sqlite_lock_err(&raw) {
                                        return Err(raw);
                                    }
                                    return Err(
                                        super::reference_scan::map_hard_delete_error_rusqlite(e),
                                    );
                                }
                            };
                            let exec_ms = exec_started.elapsed().as_millis();
                            if exec_ms > 500 {
                                log::warn!(
                                    target: "import_manager::hard_delete",
                                    "[HARD_DELETE WARNING] Slow DELETE for ID={} took {} ms",
                                    record_id,
                                    exec_ms
                                );
                            }

                            if changes > 0 {
                                batch_deleted += 1;
                                let tn = table_name;
                                let _ = tx.execute(
                                    r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
                                    params![
                                        tn,
                                        tn,
                                        record_id.as_str(),
                                        "bulk_hard_delete",
                                        user_id,
                                        &hard_delete_meta
                                    ],
                                );
                            } else {
                                batch_failed.push(format!("Record {} not found", record_id));
                            }
                        }
                        _ => return Err(format!("Invalid delete type: {}", delete_type)),
                    }
                }

                tx.commit()
                    .map_err(|e| format!("Failed to commit bulk delete transaction: {}", e))?;
                if delete_type == "hard" {
                    log::info!(
                        target: "import_manager::hard_delete",
                        "[HARD_DELETE] Commit transaction"
                    );
                }
                Ok((batch_deleted, batch_failed))
            })();

            match batch_result {
                Ok((batch_deleted, batch_failed)) => {
                    lock_contention_streak = 0;
                    deleted_count += batch_deleted;
                    failed_deletions.extend(batch_failed);
                    processed += chunk.len();
                    log::info!(
                        target: "import_manager::bulk_delete",
                        "Processed {} / {}",
                        processed,
                        total_requested
                    );
                    log::info!(
                        target: "import_manager::bulk_delete",
                        "event=workflow.bulk_delete.progress stage=execution batch_complete={}/{} batch_elapsed_ms={}",
                        batch_number,
                        total_batches,
                        batch_started_at.elapsed().as_millis()
                    );
                    emit_bulk_delete_event(
                        app,
                        "bulk_delete_progress",
                        serde_json::json!({
                            "processedCount": processed,
                            "totalCount": total_requested,
                            "currentBatch": batch_number,
                            "totalBatches": total_batches,
                            "elapsedMs": operation_started_at.elapsed().as_millis() as u64,
                        }),
                    );
                    completed_batch = true;
                    break;
                }
                Err(e) if is_sqlite_lock_err(&e) && attempt < BULK_DELETE_BATCH_RETRY_ATTEMPTS => {
                    lock_contention_streak = lock_contention_streak.saturating_add(1);
                    log::warn!(
                        target: "import_manager::bulk_delete",
                        "event=workflow.bulk_delete.progress stage=retry batch={} next_attempt={}",
                        batch_number,
                        attempt + 1
                    );
                    emit_bulk_delete_event(
                        app,
                        "bulk_delete_retry",
                        serde_json::json!({
                            "batchNumber": batch_number,
                            "retryAttempt": attempt + 1,
                        }),
                    );
                    let retry_delay_ms =
                        sqlite_retry_delay_ms(BULK_DELETE_BATCH_RETRY_DELAY_MS, attempt);
                    std::thread::sleep(Duration::from_millis(retry_delay_ms));
                    if lock_contention_streak >= BULK_DELETE_LOCK_STORM_LIMIT {
                        log_failure_pattern(
                            &LOCK_CONFLICT_EVENT_COUNT,
                            "bulk_lock_storm",
                            &format!("table={} streak={}", table_name, lock_contention_streak),
                        );
                        return Err(
                            "Database lock contention is too high. Please retry when other heavy operations complete."
                                .to_string(),
                        );
                    }
                }
                Err(e) if is_sqlite_lock_err(&e) => {
                    log_failure_pattern(
                        &LOCK_CONFLICT_EVENT_COUNT,
                        "bulk_lock_conflict",
                        &format!("table={} batch={}", table_name, batch_number),
                    );
                    return Err("Database is busy. Please retry operation.".to_string());
                }
                Err(e) => {
                    log_failure_pattern(
                        &HEAVY_WORKFLOW_FAILURE_COUNT,
                        "bulk_delete_failure",
                        &format!("table={} batch={}", table_name, batch_number),
                    );
                    return Err(e);
                }
            }
        }

        if !completed_batch {
            return Err("Database is busy. Please retry operation.".to_string());
        }
    }

    let mut result = BulkDeleteResult {
        success: deleted_count > 0,
        deleted_count,
        total_requested,
        failed_deletions,
        message: format!(
            "Successfully deleted {} out of {} records",
            deleted_count, total_requested
        ),
        undo_token: None,
        expiration_timestamp: None,
    };

    if delete_type == "soft" && deleted_count > 0 {
        let (undo_token, expiration_timestamp) =
            create_bulk_undo_token(table_name, record_ids, user_id, delete_type)?;
        result.undo_token = Some(undo_token);
        result.expiration_timestamp = Some(expiration_timestamp);
    }

    emit_bulk_delete_event(
        app,
        "bulk_delete_completed",
        serde_json::json!({
            "totalDeleted": deleted_count,
            "totalBatches": total_batches,
            "elapsedMs": operation_started_at.elapsed().as_millis() as u64,
        }),
    );

    Ok(result)
}

#[tauri::command]
pub async fn bulk_get_matching_record_ids(
    db_state: State<'_, DbState>,
    tableName: String,
    filters: HashMap<String, serde_json::Value>,
    includeDeleted: Option<bool>,
) -> Result<Vec<String>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;

    let valid_tables = get_bulk_valid_tables(&db)?;

    if !valid_tables.iter().any(|t| t == &tableName) {
        return Err("Invalid table name".to_string());
    }

    let include_deleted = includeDeleted.unwrap_or(false);
    let (where_clause, params) =
        build_bulk_search_where_clause(&db, &tableName, &filters, include_deleted);
    let query = format!("SELECT id FROM {}{} ORDER BY id", tableName, where_clause);
    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(&param_refs[..], |row| {
            let id_text = match row.get::<_, String>(0) {
                Ok(s) => s,
                Err(_) => row.get::<_, i64>(0)?.to_string(),
            };
            Ok(id_text)
        })
        .map_err(|e| e.to_string())?;

    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| e.to_string())?);
    }
    Ok(ids)
}

// Bulk delete records
#[tauri::command]
pub async fn bulk_delete_records(
    app: AppHandle,
    db_state: State<'_, DbState>,
    tableName: String,
    record_ids: Vec<String>,
    userId: Option<String>,
    delete_type: String, // "soft" or "hard"
) -> Result<BulkDeleteResult, String> {
    log_upgrade_readiness("bulk_delete_records");
    let heavy_seq = HEAVY_WORKFLOW_SEQUENCE
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);
    let _bulk_admission_guard = BulkDeleteAdmissionGuard::try_enter()?;
    log::info!(
        target: "import_manager::workload",
        "event=workload.classification category=heavy operation=bulk_delete mode=id_list"
    );
    let mut db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, userId.as_deref(), PERM_DATA_DELETE)?;

    let valid_tables = get_bulk_valid_tables(&db)?;

    if !valid_tables.iter().any(|t| t == &tableName) {
        return Err("Invalid table name".to_string());
    }

    let _hard_top_trace = (delete_type == "hard").then(|| {
        super::reference_scan::HardDeleteFnLogGuard::new(
            "bulk_delete_records",
            &tableName,
            &super::reference_scan::summarize_record_ids_for_log(&record_ids),
            "n/a",
        )
    });

    if delete_type == "hard" {
        super::reference_scan::ensure_can_hard_delete(&db, &tableName, &record_ids)?;
    }
    if record_ids.len() >= SCALE_WARNING_BULK_RECORDS {
        log::info!(
            target: "import_manager::bulk_delete",
            "event=workflow.bulk_delete.scale_readiness stage=entry mode=id_list record_count={}",
            record_ids.len()
        );
        log_scale_escalation(
            &LARGE_BULK_OPERATION_COUNT,
            "bulk_delete_id_list",
            record_ids.len(),
        );
    }

    let operation_started_at = Instant::now();
    log::info!(
        target: "import_manager::bulk_delete",
        "event=workflow.bulk_delete.start stage=entry sequence={} table={} delete_type={} record_count={} user_id={}",
        heavy_seq,
        tableName,
        delete_type,
        record_ids.len(),
        userId.as_deref().unwrap_or("unknown")
    );
    let result = execute_bulk_delete_for_ids(
        &app,
        &mut db,
        &tableName,
        &record_ids,
        &userId,
        &delete_type,
        operation_started_at,
        BULK_DELETE_OPERATION_TIMEOUT_MS,
    );
    let result = match result {
        Ok(v) => v,
        Err(e) => {
            log::warn!(
                target: "import_manager::bulk_delete",
                "event=workflow.bulk_delete.failure stage=completion table={} delete_type={} elapsed_ms={} error={}",
                tableName,
                delete_type,
                operation_started_at.elapsed().as_millis(),
                e
            );
            record_performance_observation(
                "bulk_delete_id_list",
                operation_started_at.elapsed().as_millis(),
                record_ids.len(),
                1,
            );
            return Err(e);
        }
    };
    log::info!(
        target: "import_manager::bulk_delete",
        "event=workflow.bulk_delete.success stage=completion table={} delete_type={} elapsed_ms={} deleted_count={}",
        tableName,
        delete_type,
        operation_started_at.elapsed().as_millis(),
        result.deleted_count
    );
    record_performance_observation(
        "bulk_delete_id_list",
        operation_started_at.elapsed().as_millis(),
        record_ids.len(),
        0,
    );
    invalidate_database_stats_cache();
    Ok(result)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn bulk_delete_records_by_filter(
    app: AppHandle,
    db_state: State<'_, DbState>,
    tableName: String,
    filters: HashMap<String, serde_json::Value>,
    includeDeleted: Option<bool>,
    excludedRecordIds: Vec<String>,
    expectedSelectedCount: usize,
    operationTimeoutMs: Option<u64>,
    userId: Option<String>,
    deleteType: String,
) -> Result<BulkDeleteResult, String> {
    log_upgrade_readiness("bulk_delete_records_by_filter");
    let heavy_seq = HEAVY_WORKFLOW_SEQUENCE
        .fetch_add(1, Ordering::SeqCst)
        .saturating_add(1);
    let _bulk_admission_guard = BulkDeleteAdmissionGuard::try_enter()?;
    log::info!(
        target: "import_manager::workload",
        "event=workload.classification category=heavy operation=bulk_delete mode=filter"
    );
    let mut db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, userId.as_deref(), PERM_DATA_DELETE)?;

    let valid_tables = get_bulk_valid_tables(&db)?;
    if !valid_tables.iter().any(|t| t == &tableName) {
        return Err("Invalid table name".to_string());
    }

    let include_deleted = includeDeleted.unwrap_or(false);
    let requested_timeout_ms = operationTimeoutMs.unwrap_or(BULK_DELETE_OPERATION_TIMEOUT_MS);
    let operation_timeout_ms = requested_timeout_ms.clamp(
        BULK_DELETE_OPERATION_TIMEOUT_MIN_MS,
        BULK_DELETE_OPERATION_TIMEOUT_MAX_MS,
    );
    if requested_timeout_ms != operation_timeout_ms {
        log::warn!(
            target: "import_manager::bulk_delete",
            "Adjusted operationTimeoutMs from {} to {} for stability bounds",
            requested_timeout_ms,
            operation_timeout_ms
        );
    }
    let filter_snapshot = serde_json::to_string(&filters).unwrap_or_else(|_| "{}".to_string());
    log::info!(
        target: "import_manager::bulk_delete",
        "[{}] Counting matching records (validation)...",
        tableName
    );
    let count_validation_start = Instant::now();
    let total_matching_before_exclusion =
        count_matching_records_from_filters(&db, &tableName, &filters, include_deleted)?;
    log::info!(
        target: "import_manager::bulk_delete",
        "[{}] Validation count: {} matching rows in {} ms",
        tableName,
        total_matching_before_exclusion,
        count_validation_start.elapsed().as_millis()
    );
    let excluded_count = excludedRecordIds.len();
    let expected_from_query = total_matching_before_exclusion.saturating_sub(excluded_count);
    if expected_from_query != expectedSelectedCount {
        return Err("Selection mismatch detected. Please reselect records.".to_string());
    }

    log::info!(
        target: "import_manager::bulk_delete",
        "event=workflow.bulk_delete.start stage=entry sequence={} table={} delete_type={} mode=filter user_id={} total_matching={} excluded_count={} expected_selected={} filter_snapshot={}",
        heavy_seq,
        tableName,
        deleteType,
        userId.clone().unwrap_or_else(|| "unknown".to_string()),
        total_matching_before_exclusion,
        excluded_count,
        expectedSelectedCount,
        filter_snapshot
    );

    let excluded_set: HashSet<String> = excludedRecordIds.into_iter().collect();
    let matching_ids = collect_matching_ids_from_filters(
        &db,
        &tableName,
        &filters,
        include_deleted,
        &excluded_set,
    )?;
    if matching_ids.len() >= SCALE_WARNING_BULK_RECORDS {
        log::info!(
            target: "import_manager::bulk_delete",
            "event=workflow.bulk_delete.scale_readiness stage=entry mode=filter record_count={}",
            matching_ids.len()
        );
        log_scale_escalation(
            &LARGE_BULK_OPERATION_COUNT,
            "bulk_delete_filter",
            matching_ids.len(),
        );
    }

    let _hard_top_trace = (deleteType == "hard").then(|| {
        super::reference_scan::HardDeleteFnLogGuard::new(
            "bulk_delete_records_by_filter",
            &tableName,
            &super::reference_scan::summarize_record_ids_for_log(&matching_ids),
            "n/a",
        )
    });

    if deleteType == "hard" {
        super::reference_scan::ensure_can_hard_delete(&db, &tableName, &matching_ids)?;
    }

    let operation_started_at = Instant::now();
    let result = execute_bulk_delete_for_ids(
        &app,
        &mut db,
        &tableName,
        &matching_ids,
        &userId,
        &deleteType,
        operation_started_at,
        operation_timeout_ms,
    );
    let result = match result {
        Ok(v) => v,
        Err(e) => {
            log::warn!(
                target: "import_manager::bulk_delete",
                "event=workflow.bulk_delete.failure stage=completion table={} delete_type={} mode=filter elapsed_ms={} error={}",
                tableName,
                deleteType,
                operation_started_at.elapsed().as_millis(),
                e
            );
            record_performance_observation(
                "bulk_delete_filter",
                operation_started_at.elapsed().as_millis(),
                matching_ids.len(),
                1,
            );
            return Err(e);
        }
    };
    log::info!(
        target: "import_manager::bulk_delete",
        "event=workflow.bulk_delete.success stage=completion table={} delete_type={} mode=filter user_id={} excluded_count={} total_deleted={} requested={} elapsed_ms={} filter_snapshot={}",
        tableName,
        deleteType,
        userId.unwrap_or_else(|| "unknown".to_string()),
        excluded_count,
        result.deleted_count,
        result.total_requested,
        operation_started_at.elapsed().as_millis(),
        filter_snapshot
    );
    record_performance_observation(
        "bulk_delete_filter",
        operation_started_at.elapsed().as_millis(),
        matching_ids.len(),
        0,
    );
    invalidate_database_stats_cache();
    Ok(result)
}

#[tauri::command]
pub async fn restore_deleted_records_using_token(
    db_state: State<'_, DbState>,
    undoToken: String,
) -> Result<BulkDeleteResult, String> {
    let context = {
        let mut registry = bulk_undo_registry().lock().map_err(|e| e.to_string())?;
        prune_expired_bulk_undo_tokens(&mut registry);
        let ctx = registry
            .get(&undoToken)
            .cloned()
            .ok_or_else(|| "Undo token is invalid or expired.".to_string())?;
        if ctx.expires_at <= Utc::now() {
            registry.remove(&undoToken);
            return Err("Undo window expired.".to_string());
        }
        if ctx.delete_type != "soft" {
            return Err("Undo is only available for soft delete.".to_string());
        }
        ctx
    };

    let mut db = db_state.db.lock().map_err(|e| e.to_string())?;
    let tx = db
        .transaction()
        .map_err(|e| format!("Failed to begin undo transaction: {}", e))?;

    let query = format!(
        "UPDATE {} SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL",
        context.table_name
    );

    let mut restored_count = 0usize;
    let mut failed = Vec::new();
    for record_id in &context.record_ids {
        match tx.execute(&query, params![record_id]) {
            Ok(changes) if changes > 0 => {
                restored_count += 1;
                let tn = context.table_name.as_str();
                let _ = tx.execute(
                    r#"INSERT INTO audit_logs (table_name, "tableName", row_id, action, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"#,
                    params![
                        tn,
                        tn,
                        record_id,
                        "bulk_restore_undo",
                        context.user_id,
                        "{\"type\": \"bulk_undo_restore\"}"
                    ],
                );
            }
            Ok(_) => failed.push(format!("Record {} not restorable", record_id)),
            Err(e) => failed.push(format!("Record {} restore failed: {}", record_id, e)),
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit undo transaction: {}", e))?;

    {
        let mut registry = bulk_undo_registry().lock().map_err(|e| e.to_string())?;
        registry.remove(&undoToken);
    }

    invalidate_database_stats_cache();
    Ok(BulkDeleteResult {
        success: restored_count > 0,
        deleted_count: restored_count,
        total_requested: context.record_ids.len(),
        failed_deletions: failed,
        message: format!(
            "Undo restored {} out of {} records",
            restored_count,
            context.record_ids.len()
        ),
        undo_token: None,
        expiration_timestamp: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BulkDeleteResult {
    pub success: bool,
    pub deleted_count: usize,
    pub total_requested: usize,
    pub failed_deletions: Vec<String>,
    pub message: String,
    pub undo_token: Option<String>,
    pub expiration_timestamp: Option<String>,
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
    ensure_command_permission(&db, userId.as_deref(), PERM_BACKUP_SCHEDULE)?;

    let retention_count = retention_count.unwrap_or(5);
    let retention_days = retention_days.unwrap_or(30);
    let enabled = if enabled.unwrap_or(true) { 1 } else { 0 };
    let tz = time_zone.unwrap_or_else(|| "Asia/Kolkata".to_string());
    let next_run = compute_next_run_rfc3339(&cron_expr, &tz)?;

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

    invalidate_database_stats_cache();
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
    ensure_command_permission(&db, userId.as_deref(), PERM_BACKUP_SCHEDULE)?;

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
        let row: Option<(String, String)> = db
            .query_row(
                "SELECT cron_expr, COALESCE(time_zone, 'Asia/Kolkata') FROM backup_schedules WHERE id = ?",
                params![schedule_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        if let Some((expr, tz)) = row {
            if let Ok(next) = compute_next_run_rfc3339(&expr, &tz) {
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

    invalidate_database_stats_cache();
    Ok(())
}

#[tauri::command]
pub async fn delete_backup_schedule(
    db_state: State<'_, DbState>,
    schedule_id: i64,
    userId: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, userId.as_deref(), PERM_BACKUP_SCHEDULE)?;

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

    invalidate_database_stats_cache();
    Ok(())
}

#[tauri::command]
pub async fn run_scheduled_backup(
    app: AppHandle,
    db_state: State<'_, DbState>,
    schedule_id: i64,
    userId: Option<String>,
) -> Result<BackupInfo, String> {
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        ensure_command_permission(&db, userId.as_deref(), PERM_BACKUP_CREATE)?;
    }
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

    let backup_info = create_backup_internal(
        app.clone(),
        db_state.clone(),
        backup_request,
        userId.clone(),
    )
    .await?;

    let cron_for_next = schedule
        .cron_expr
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    // Update schedule last_run and next_run (from cron)
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        if let Some(expr) = cron_for_next {
            let tz = schedule.time_zone.trim();
            let tz = if tz.is_empty() { "Asia/Kolkata" } else { tz };
            if let Ok(next_run) = compute_next_run_rfc3339(expr, tz) {
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
fn canonical_role_or_err(role: &str) -> Result<String, String> {
    crate::security::Role::from_db_str(role)
        .map(|r| r.as_str().to_string())
        .ok_or_else(|| {
            format!(
                "Invalid role: {}. Valid roles are: administrator, manager, operator, viewer",
                role
            )
        })
}

#[tauri::command]
pub async fn create_user_role(
    db_state: State<'_, DbState>,
    userId: String,
    role: String,
    permissions: Option<String>,
    created_by: Option<String>,
) -> Result<i64, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, created_by.as_deref(), PERM_USER_MANAGE)?;

    let canonical_role = canonical_role_or_err(&role)?;

    db.execute(
        "INSERT INTO user_roles (user_id, role, permissions, created_by) VALUES (?, ?, ?, ?)",
        params![userId, canonical_role, permissions, created_by],
    )
    .map_err(|e| e.to_string())?;
    let id = db.last_insert_rowid();

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
                userId, canonical_role
            )
        ],
    )
    .map_err(|e| e.to_string())?;

    let ua_detail = serde_json::json!({
        "userId": userId,
        "role": canonical_role,
        "rowId": id,
    })
    .to_string();
    log_activity_with_severity(
        &db,
        created_by.as_deref(),
        "security.user_role_created",
        Some("user_roles"),
        Some(&id.to_string()),
        Some(&ua_detail),
        "success",
        AuditSeverity::Security,
    );

    Ok(id)
}

#[tauri::command]
pub async fn get_user_roles(
    db_state: State<'_, DbState>,
    caller_user_id: Option<String>,
) -> Result<Vec<UserRole>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, caller_user_id.as_deref(), PERM_ROLE_READ)?;

    crate::security::ensure_user_roles::ensure_user_roles_table(&db).map_err(|e| e.to_string())?;

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
    ensure_command_permission(&db, updated_by.as_deref(), PERM_USER_MANAGE)?;

    let prior: (String, Option<String>) = db
        .query_row(
            "SELECT role, permissions FROM user_roles WHERE id = ?1",
            params![role_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Build dynamic UPDATE query
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(role) = role {
        let canonical = canonical_role_or_err(&role)?;
        set_clauses.push("role = ?");
        params.push(Box::new(canonical));
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

    let after: (String, Option<String>) = db
        .query_row(
            "SELECT role, permissions FROM user_roles WHERE id = ?1",
            params![role_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let ua_detail = serde_json::json!({
        "roleId": role_id,
        "before": { "role": prior.0, "permissions": prior.1 },
        "after": { "role": after.0, "permissions": after.1 },
    })
    .to_string();
    log_activity_with_severity(
        &db,
        updated_by.as_deref(),
        "security.user_role_updated",
        Some("user_roles"),
        Some(&role_id.to_string()),
        Some(&ua_detail),
        "success",
        AuditSeverity::Security,
    );

    Ok(())
}

#[tauri::command]
pub async fn delete_user_role(
    db_state: State<'_, DbState>,
    role_id: i64,
    deleted_by: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, deleted_by.as_deref(), PERM_USER_MANAGE)?;

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

    let ua_detail = serde_json::json!({
        "roleId": role_id,
        "userId": user_id,
        "role": role,
    })
    .to_string();
    log_activity_with_severity(
        &db,
        deleted_by.as_deref(),
        "security.user_role_deleted",
        Some("user_roles"),
        Some(&role_id.to_string()),
        Some(&ua_detail),
        "success",
        AuditSeverity::Security,
    );

    Ok(())
}

/// Registers the first administrator when **zero** admin rows exist and `userId` has no `user_roles` row.
/// Explicit bootstrap entry point only — never called from permission checks.
#[tauri::command]
pub async fn bootstrap_first_admin_if_eligible(
    db_state: State<'_, DbState>,
    userId: String,
    caller_user_id: Option<String>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let admin_count = crate::security::count_admin_roles(&db)?;
    if admin_count > 0 {
        ensure_command_permission(&db, caller_user_id.as_deref(), PERM_ROLE_BOOTSTRAP)?;
    }
    crate::security::bootstrap_first_admin_when_empty(&db, &userId)
}

#[tauri::command]
pub async fn check_user_permission(
    db_state: State<'_, DbState>,
    userId: String,
    permission: String,
) -> Result<bool, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let role = crate::security::resolve_role_strict(&db, &userId)?;
    Ok(role_allows_permission(&role, &permission))
}

#[tauri::command]
pub async fn get_user_permissions(
    _db_state: State<'_, DbState>,
    userId: String,
) -> Result<Vec<String>, String> {
    let db = _db_state.db.lock().map_err(|e| e.to_string())?;
    let role_str = crate::security::resolve_role_strict(&db, &userId)?;
    let permissions = match crate::security::Role::from_db_str(&role_str) {
        Some(role) => crate::security::permissions_for(role)
            .into_iter()
            .map(|p| p.as_str().to_string())
            .collect(),
        None => Vec::new(),
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
    app: AppHandle,
    db_state: State<'_, DbState>,
    request: BackupRequest,
    userId: Option<String>,
) -> Result<BackupInfo, String> {
    create_backup_impl(app, db_state, request, userId, None).await
}

// Helper function to create pre-restore backup (sync version)
fn create_pre_restore_backup_sync(
    current_db_path: &str,
    _userId: Option<String>,
) -> Result<String, String> {
    let data_dir = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map(|home| Path::new(&home).join("ImportManager").join("backups"))
        .unwrap_or_else(|_| Path::new("./backups").to_path_buf());

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }

    let backupPath = unique_pre_restore_path_in_dir(&data_dir)?;
    let backup_filename = backupPath
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid pre-restore path".to_string())?
        .to_string();

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
    ensure_command_permission(&db, request.userId.as_deref(), PERM_DATA_EDIT)?;

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
        assert_eq!(s, "PRAGMA backup_db_123.index_list(\"invoice_line_items\")");
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
        conn.execute(&format!("DETACH DATABASE {}", alias), [])
            .unwrap();
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
            conn.execute(&format!("DETACH DATABASE {}", alias), [])
                .unwrap();
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
            conn.execute("CREATE TABLE only_one (x INTEGER)", [])
                .unwrap();
        }
        let err = validate_backup_tables_readonly(&p, &["only_one", "missing_table"]).unwrap_err();
        assert!(err.contains("missing_table"));
        let _ = fs::remove_file(&p);
    }
}

#[cfg(test)]
mod restore_user_roles_tests {
    use super::{
        ensure_at_least_one_admin_after_restore, restore_user_roles_from_attached_backup,
        UserRolesRestoreOutcome,
    };
    use rusqlite::params;
    use rusqlite::Connection;
    use std::fs;
    use std::path::PathBuf;

    fn unique_test_db(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("im_restore_ur_{}_{}.db", name, nanos))
    }

    const USER_ROLES_DDL: &str = r#"
        CREATE TABLE user_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL,
            permissions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    "#;

    #[test]
    fn backup_with_user_roles_restores_rows_from_backup() {
        let main_path = unique_test_db("ur_main");
        let bak_path = unique_test_db("ur_bak");
        {
            let c = Connection::open(&main_path).unwrap();
            c.execute_batch(USER_ROLES_DDL).unwrap();
            c.execute(
                "INSERT INTO user_roles (user_id, role) VALUES ('live', 'viewer')",
                [],
            )
            .unwrap();
        }
        {
            let c = Connection::open(&bak_path).unwrap();
            c.execute_batch(USER_ROLES_DDL).unwrap();
            c.execute(
                "INSERT INTO user_roles (user_id, role) VALUES ('frombak', 'admin')",
                [],
            )
            .unwrap();
        }

        let mut conn = Connection::open(&main_path).unwrap();
        let alias = "bkp";
        conn.execute(
            &format!(
                "ATTACH DATABASE '{}' AS {}",
                bak_path.to_string_lossy(),
                alias
            ),
            [],
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        let outcome = restore_user_roles_from_attached_backup(&tx, alias).unwrap();
        assert_eq!(outcome, UserRolesRestoreOutcome::RestoredFromBackup);
        tx.commit().unwrap();

        let role: String = conn
            .query_row(
                "SELECT role FROM user_roles WHERE user_id = 'frombak'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(role, "admin");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_roles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);

        conn.execute(&format!("DETACH DATABASE {}", alias), [])
            .unwrap();
        drop(conn);
        let _ = fs::remove_file(&main_path);
        let _ = fs::remove_file(&bak_path);
    }

    #[test]
    fn backup_without_user_roles_retains_live_roles() {
        let main_path = unique_test_db("ur2_main");
        let bak_path = unique_test_db("ur2_bak");
        {
            let c = Connection::open(&main_path).unwrap();
            c.execute_batch(USER_ROLES_DDL).unwrap();
            c.execute(
                "INSERT INTO user_roles (user_id, role) VALUES ('keep', 'admin')",
                [],
            )
            .unwrap();
        }
        {
            let c = Connection::open(&bak_path).unwrap();
            c.execute("CREATE TABLE dummy_only (x INTEGER)", [])
                .unwrap();
        }

        let mut conn = Connection::open(&main_path).unwrap();
        let alias = "bkp2";
        conn.execute(
            &format!(
                "ATTACH DATABASE '{}' AS {}",
                bak_path.to_string_lossy(),
                alias
            ),
            [],
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        let outcome = restore_user_roles_from_attached_backup(&tx, alias).unwrap();
        assert_eq!(outcome, UserRolesRestoreOutcome::BackupMissingTable);
        tx.commit().unwrap();

        let role: String = conn
            .query_row(
                "SELECT role FROM user_roles WHERE user_id = 'keep'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(role, "admin");

        conn.execute(&format!("DETACH DATABASE {}", alias), [])
            .unwrap();
        drop(conn);
        let _ = fs::remove_file(&main_path);
        let _ = fs::remove_file(&bak_path);
    }

    #[test]
    fn post_restore_recovery_admin_when_no_admin_rows() {
        let conn = Connection::open_in_memory().unwrap();
        crate::security::ensure_user_roles::ensure_user_roles_table(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?1, ?2)",
            params!["onlyviewer", "viewer"],
        )
        .unwrap();
        ensure_at_least_one_admin_after_restore(&conn).unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_roles WHERE lower(trim(role)) = 'admin'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n >= 1);
        let rid: String = conn
            .query_row(
                "SELECT user_id FROM user_roles WHERE user_id = ?1",
                params![super::RESTORE_RECOVERY_ADMIN_USER_ID],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(rid, super::RESTORE_RECOVERY_ADMIN_USER_ID);
    }

    #[test]
    fn incompatible_backup_user_roles_retains_main_resolve_role_still_works() {
        let main_path = unique_test_db("ur4_main");
        let bak_path = unique_test_db("ur4_bak");
        {
            let c = Connection::open(&main_path).unwrap();
            c.execute_batch(USER_ROLES_DDL).unwrap();
            c.execute(
                "INSERT INTO user_roles (user_id, role) VALUES ('u1', 'viewer')",
                [],
            )
            .unwrap();
        }
        {
            let c = Connection::open(&bak_path).unwrap();
            c.execute("CREATE TABLE user_roles (oops INTEGER)", [])
                .unwrap();
            c.execute("INSERT INTO user_roles (oops) VALUES (1)", [])
                .unwrap();
        }

        let mut conn = Connection::open(&main_path).unwrap();
        let alias = "bkp4";
        conn.execute(
            &format!(
                "ATTACH DATABASE '{}' AS {}",
                bak_path.to_string_lossy(),
                alias
            ),
            [],
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        let outcome = restore_user_roles_from_attached_backup(&tx, alias).unwrap();
        assert_eq!(outcome, UserRolesRestoreOutcome::SkippedIncompatibleSchema);
        tx.commit().unwrap();

        let role = crate::security::resolve_role_strict(&conn, "u1").unwrap();
        assert_eq!(role, "viewer");

        conn.execute(&format!("DETACH DATABASE {}", alias), [])
            .unwrap();
        drop(conn);
        let _ = fs::remove_file(&main_path);
        let _ = fs::remove_file(&bak_path);
    }
}

/// Validates transaction rollback behavior matching the restore pipeline (DELETE + INSERT / user_roles)
/// without altering production restore code paths.
#[cfg(test)]
mod restore_atomicity_tests {
    use super::{ensure_at_least_one_admin_after_restore, restore_user_roles_from_attached_backup};
    use crate::security::ensure_user_roles::ensure_user_roles_table;
    use rusqlite::params;
    use rusqlite::Connection;
    use std::fs;
    use std::path::PathBuf;

    fn unique_atomic_db(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("im_atomic_{}_{}.db", name, nanos))
    }

    const USER_ROLES_DDL: &str = r#"
        CREATE TABLE user_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL,
            permissions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    "#;

    #[test]
    fn insert_failure_after_delete_rolls_back_no_partial_table_state() {
        let main_path = unique_atomic_db("ins_fail_main");
        let bak_path = unique_atomic_db("ins_fail_bak");
        {
            let c = Connection::open(&main_path).unwrap();
            c.execute_batch(
                r#"CREATE TABLE probe(id INTEGER PRIMARY KEY, v TEXT NOT NULL);
                   INSERT INTO probe VALUES (1, 'original');"#,
            )
            .unwrap();
        }
        {
            let c = Connection::open(&bak_path).unwrap();
            c.execute_batch(
                r#"CREATE TABLE probe(id INTEGER PRIMARY KEY, v TEXT NOT NULL);
                   INSERT INTO probe VALUES (2, 'from_backup');"#,
            )
            .unwrap();
        }

        let mut conn = Connection::open(&main_path).unwrap();
        conn.execute_batch(
            r#"CREATE TRIGGER tr_sim_insert_fail BEFORE INSERT ON probe BEGIN
                 SELECT RAISE(ABORT, 'simulated_insert_failure');
               END;"#,
        )
        .unwrap();
        conn.execute(
            &format!(
                "ATTACH DATABASE '{}' AS bkp_ins",
                bak_path.to_string_lossy()
            ),
            [],
        )
        .unwrap();

        {
            let tx = conn.transaction().unwrap();
            tx.execute("DELETE FROM probe", []).unwrap();
            let ins = tx.execute(
                "INSERT INTO probe (id, v) SELECT id, v FROM bkp_ins.probe",
                [],
            );
            assert!(ins.is_err(), "expected INSERT to abort");
        }

        let v: String = conn
            .query_row("SELECT v FROM probe WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "original");

        conn.execute("DETACH DATABASE bkp_ins", []).unwrap();
        drop(conn);
        let _ = fs::remove_file(&main_path);
        let _ = fs::remove_file(&bak_path);
    }

    #[test]
    fn user_roles_restore_failure_rolls_back_prior_copy_in_same_transaction() {
        let main_path = unique_atomic_db("ur_tx_main");
        let bak_path = unique_atomic_db("ur_tx_bak");
        {
            let c = Connection::open(&main_path).unwrap();
            c.execute_batch(
                r#"CREATE TABLE probe(id INTEGER PRIMARY KEY, v TEXT NOT NULL);
                   INSERT INTO probe VALUES (1, 'before');"#,
            )
            .unwrap();
            c.execute_batch(USER_ROLES_DDL).unwrap();
            c.execute(
                "INSERT INTO user_roles (user_id, role) VALUES ('u', 'viewer')",
                [],
            )
            .unwrap();
        }
        {
            let c = Connection::open(&bak_path).unwrap();
            c.execute_batch(
                r#"CREATE TABLE probe(id INTEGER PRIMARY KEY, v TEXT NOT NULL);
                   INSERT INTO probe VALUES (9, 'after_backup');"#,
            )
            .unwrap();
            c.execute_batch(USER_ROLES_DDL).unwrap();
            c.execute(
                "INSERT INTO user_roles (user_id, role) VALUES ('b', 'admin')",
                [],
            )
            .unwrap();
        }

        let mut conn = Connection::open(&main_path).unwrap();
        conn.execute_batch(
            r#"CREATE TRIGGER tr_block_ur_insert BEFORE INSERT ON user_roles BEGIN
                 SELECT RAISE(ABORT, 'simulated_user_roles_restore_failure');
               END;"#,
        )
        .unwrap();
        conn.execute(
            &format!("ATTACH DATABASE '{}' AS bkp_ur", bak_path.to_string_lossy()),
            [],
        )
        .unwrap();

        {
            let tx = conn.transaction().unwrap();
            tx.execute("DELETE FROM probe", []).unwrap();
            tx.execute(
                "INSERT INTO probe (id, v) SELECT id, v FROM bkp_ur.probe",
                [],
            )
            .unwrap();
            let ur = restore_user_roles_from_attached_backup(&tx, "bkp_ur");
            assert!(ur.is_err(), "expected user_roles restore to abort");
        }

        let v: String = conn
            .query_row("SELECT v FROM probe WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "before");

        let cnt: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_roles WHERE user_id = 'u'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(cnt, 1);

        conn.execute("DETACH DATABASE bkp_ur", []).unwrap();
        drop(conn);
        let _ = fs::remove_file(&main_path);
        let _ = fs::remove_file(&bak_path);
    }

    #[test]
    fn admin_recovery_failure_returns_error_to_caller() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?1, ?2)",
            params!["vonly", "viewer"],
        )
        .unwrap();
        conn.execute_batch(&format!(
            r#"CREATE TRIGGER tr_block_recovery BEFORE INSERT ON user_roles
               WHEN NEW.user_id = '{}'
               BEGIN SELECT RAISE(ABORT, 'recovery_blocked'); END"#,
            super::RESTORE_RECOVERY_ADMIN_USER_ID
        ))
        .unwrap();
        let err = ensure_at_least_one_admin_after_restore(&conn).unwrap_err();
        assert!(
            err.contains("recovery") || err.contains("blocked") || err.contains("Failed to insert"),
            "unexpected: {err}"
        );
    }
}

/// Post-commit marker and outcome mapping (no changes to restore transaction design).
#[cfg(test)]
mod restore_outcome_clarity_tests {
    use super::{
        ensure_at_least_one_admin_after_restore, record_restore_transaction_committed_marker,
        RestoreOutcome, APP_METADATA_RESTORE_TX_COMMITTED_AT, RESTORE_RECOVERY_ADMIN_USER_ID,
    };
    use crate::security::ensure_user_roles::ensure_user_roles_table;
    use rusqlite::params;
    use rusqlite::Connection;

    #[test]
    fn tx_commit_marker_exists_before_admin_recovery_and_survives_recovery_failure() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
        )
        .unwrap();
        ensure_user_roles_table(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES ('v1', 'viewer')",
            [],
        )
        .unwrap();

        let tx = conn.transaction().unwrap();
        tx.execute(
            "UPDATE user_roles SET updated_at = updated_at WHERE user_id = 'v1'",
            [],
        )
        .unwrap();
        tx.commit().unwrap();

        record_restore_transaction_committed_marker(&conn).unwrap();

        let marker: String = conn
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![APP_METADATA_RESTORE_TX_COMMITTED_AT],
                |r| r.get(0),
            )
            .unwrap();
        assert!(
            !marker.is_empty(),
            "commit marker should be set before admin recovery"
        );

        conn.execute_batch(&format!(
            r#"CREATE TRIGGER tr_block_recovery_ins BEFORE INSERT ON user_roles
               WHEN NEW.user_id = '{RESTORE_RECOVERY_ADMIN_USER_ID}'
               BEGIN SELECT RAISE(ABORT, 'recovery_blocked'); END"#
        ))
        .unwrap();

        let admin_result = ensure_at_least_one_admin_after_restore(&conn);
        let err = admin_result.as_ref().unwrap_err();
        assert!(
            err.contains("recovery") || err.contains("blocked") || err.contains("Failed to insert"),
            "unexpected: {err}"
        );

        let outcome = match &admin_result {
            Ok(()) => RestoreOutcome::RestoreFullySucceeded,
            Err(_) => RestoreOutcome::RestoreSucceededWithWarning,
        };
        assert_eq!(outcome, RestoreOutcome::RestoreSucceededWithWarning);

        let marker_after: String = conn
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![APP_METADATA_RESTORE_TX_COMMITTED_AT],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            marker_after, marker,
            "marker must remain after failed recovery"
        );

        let role: String = conn
            .query_row(
                "SELECT role FROM user_roles WHERE user_id = 'v1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(role, "viewer", "restored user data must remain");
    }
}

#[cfg(test)]
mod authz_ensure_command_tests {
    use super::ensure_command_permission;
    use super::PERM_BACKUP_CREATE;
    use rusqlite::Connection;

    #[test]
    fn missing_actor_is_denied() {
        let conn = Connection::open_in_memory().unwrap();
        let err = ensure_command_permission(&conn, None, PERM_BACKUP_CREATE).unwrap_err();
        assert!(err.to_lowercase().contains("missing"), "unexpected: {err}");
    }

    #[test]
    fn reserved_internal_actors_are_denied_from_ipc_authz_path() {
        let conn = Connection::open_in_memory().unwrap();
        let err = ensure_command_permission(&conn, Some("system"), PERM_BACKUP_CREATE).unwrap_err();
        assert!(err.to_lowercase().contains("reserved"), "unexpected: {err}");
        let err =
            ensure_command_permission(&conn, Some("scheduler"), PERM_BACKUP_CREATE).unwrap_err();
        assert!(err.to_lowercase().contains("reserved"), "unexpected: {err}");
    }

    #[test]
    fn any_non_empty_user_id_is_allowed_in_single_user_mode() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_command_permission(&conn, Some("owner"), PERM_BACKUP_CREATE).unwrap();
        ensure_command_permission(&conn, Some("any-non-empty"), PERM_BACKUP_CREATE).unwrap();
    }

    #[test]
    fn invalid_permission_key_is_a_bug_error() {
        let conn = Connection::open_in_memory().unwrap();
        let err = ensure_command_permission(&conn, Some("owner"), "nope.nope").unwrap_err();
        assert!(
            err.to_lowercase().contains("invalid permission"),
            "unexpected: {err}"
        );
    }
}
