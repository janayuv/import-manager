use crate::db::DbState;
use log::{info, warn};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use tauri::State;
use uuid::Uuid;

static ERROR_MEMORY_DB_PATH: OnceLock<PathBuf> = OnceLock::new();
static AUTO_CLEANUP_TICK: AtomicU64 = AtomicU64::new(0);
static CLEANUP_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

const MAX_STACK: usize = 8000;
const MAX_CONTEXT: usize = 4000;
const HARD_CAP: i64 = 1200;
const AUTO_CLEANUP_INTERVAL: u64 = 25;
const AUTO_CLEANUP_DELETE_LIMIT: i64 = 120;
const MAINTENANCE_OLD_RESOLVED_DAYS: i64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEventPayload {
    pub app_version: Option<String>,
    pub build_version: Option<String>,
    pub environment: Option<String>,
    pub module_name: Option<String>,
    pub command_name: Option<String>,
    pub page_name: Option<String>,
    pub component_name: Option<String>,
    pub error_code: Option<String>,
    pub error_category: Option<String>,
    pub error_message: String,
    pub stack_trace: Option<String>,
    pub source_file: Option<String>,
    pub source_function: Option<String>,
    pub user_action: Option<String>,
    pub redacted_input_context: Option<String>,
    pub affected_entity_ids: Option<String>,
    pub severity: Option<String>,
    pub recoverable: Option<bool>,
    pub retryable: Option<bool>,
    pub app_state_snapshot: Option<String>,
    pub status: Option<String>,
    pub ai_summary: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorMemoryFilter {
    pub severity: Option<String>,
    pub module_name: Option<String>,
    pub command_name: Option<String>,
    pub status: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub fingerprint: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorMemoryRow {
    pub id: String,
    pub fingerprint: String,
    pub occurrence_count: i64,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub app_version: Option<String>,
    pub build_version: Option<String>,
    pub environment: Option<String>,
    pub module_name: Option<String>,
    pub command_name: Option<String>,
    pub page_name: Option<String>,
    pub component_name: Option<String>,
    pub error_code: Option<String>,
    pub error_category: Option<String>,
    pub error_message: String,
    pub stack_trace: Option<String>,
    pub source_file: Option<String>,
    pub source_function: Option<String>,
    pub user_action: Option<String>,
    pub redacted_input_context: Option<String>,
    pub affected_entity_ids: Option<String>,
    pub severity: String,
    pub recoverable: bool,
    pub retryable: bool,
    pub app_state_snapshot: Option<String>,
    pub status: String,
    pub ai_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorMemoryMaintenanceStats {
    pub total_count: i64,
    pub duplicate_count: i64,
    pub old_resolved_count: i64,
    pub hard_cap: i64,
    pub last_cleanup_at: Option<String>,
    pub last_cleanup_summary: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorMemoryCleanupRequest {
    pub dry_run: Option<bool>,
    pub delete_limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorMemoryCleanupResult {
    pub run_id: String,
    pub dry_run: bool,
    pub trigger_source: String,
    pub total_before: i64,
    pub total_after: i64,
    pub hard_cap: i64,
    pub candidate_count: i64,
    pub would_prune_count: i64,
    pub deleted_count: i64,
    pub protected_count: i64,
    pub pruned_ids: Vec<String>,
    pub prune_reasons: Vec<String>,
    pub executed_at: String,
}

#[derive(Debug, Clone)]
struct CleanupCandidate {
    id: String,
    fingerprint: String,
    occurrence_count: i64,
    first_seen_at: String,
    last_seen_at: String,
    severity: String,
    status: String,
    age_days: i64,
    prune_reason: String,
    priority: i64,
}

fn now_sqlite() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn trim_opt(v: Option<String>, max: usize) -> Option<String> {
    v.map(|s| redact_sensitive(&s))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| {
            if s.len() > max {
                format!("{}…", &s[..max])
            } else {
                s
            }
        })
}

fn normalize_status(v: Option<String>) -> String {
    let s = v
        .unwrap_or_else(|| "new".to_string())
        .trim()
        .to_ascii_lowercase();
    match s.as_str() {
        "new" | "triaged" | "fixed" | "ignored" | "duplicate" => s,
        _ => "new".to_string(),
    }
}

fn normalize_severity(v: Option<String>) -> String {
    let s = v
        .unwrap_or_else(|| "error".to_string())
        .trim()
        .to_ascii_lowercase();
    match s.as_str() {
        "info" | "warning" | "error" | "critical" => s,
        _ => "error".to_string(),
    }
}

fn retention_days(status: &str, severity: &str) -> i64 {
    match (status, severity) {
        ("duplicate", "info" | "warning") => 7,
        ("duplicate", "error") => 14,
        ("duplicate", "critical") => 30,
        ("fixed" | "ignored", "info" | "warning") => 21,
        ("fixed" | "ignored", "error") => 45,
        ("fixed" | "ignored", "critical") => 120,
        ("new" | "triaged", "info" | "warning") => 90,
        ("new" | "triaged", "error") => 180,
        ("new" | "triaged", "critical") => 365,
        _ => 60,
    }
}

fn is_protected(status: &str, severity: &str, age_days: i64) -> bool {
    if severity == "critical" && (status == "new" || status == "triaged") {
        return true;
    }
    if severity == "error" && (status == "new" || status == "triaged") && age_days <= 180 {
        return true;
    }
    false
}

fn cleanup_priority(status: &str, severity: &str, occurrence_count: i64, age_days: i64) -> i64 {
    let status_rank = match status {
        "duplicate" => 0,
        "ignored" => 1,
        "fixed" => 2,
        "triaged" => 3,
        "new" => 4,
        _ => 5,
    };
    let severity_rank = match severity {
        "info" => 0,
        "warning" => 1,
        "error" => 2,
        "critical" => 3,
        _ => 2,
    };
    status_rank * 1_000_000 - age_days * 100 - occurrence_count * 10 + severity_rank * 5
}

fn redact_sensitive(raw: &str) -> String {
    let mut out = raw.to_string();
    for key in [
        "token",
        "refresh_token",
        "access_token",
        "password",
        "secret",
        "authorization",
        "api_key",
    ] {
        let pattern = format!(r#"(?i)("{}\s*"\s*:\s*")[^"]+""#, key);
        if let Ok(re) = regex::Regex::new(&pattern) {
            out = re.replace_all(&out, "${1}<redacted>\"".to_string()).to_string();
        }
    }
    out
}

fn fingerprint(payload: &ErrorEventPayload) -> String {
    let mut base = String::new();
    let msg_norm = payload
        .error_message
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_digit() { '#' } else { c })
        .collect::<String>();
    base.push_str(payload.module_name.as_deref().unwrap_or(""));
    base.push('|');
    base.push_str(payload.command_name.as_deref().unwrap_or(""));
    base.push('|');
    base.push_str(payload.error_code.as_deref().unwrap_or(""));
    base.push('|');
    base.push_str(payload.source_file.as_deref().unwrap_or(""));
    base.push('|');
    base.push_str(&msg_norm);
    let mut h = Sha256::new();
    h.update(base.as_bytes());
    format!("{:x}", h.finalize())
}

fn upsert_error_event(conn: &Connection, payload: ErrorEventPayload) -> Result<String, String> {
    let fp = fingerprint(&payload);
    let now = now_sqlite();
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM error_memory WHERE fingerprint = ?1",
            params![&fp],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let error_message = redact_sensitive(&payload.error_message);
    let status = normalize_status(payload.status.clone());
    let severity = normalize_severity(payload.severity.clone());

    if let Some(id) = existing {
        conn.execute(
            "UPDATE error_memory SET
                occurrence_count = occurrence_count + 1,
                last_seen_at = ?2,
                app_version = COALESCE(?3, app_version),
                build_version = COALESCE(?4, build_version),
                environment = COALESCE(?5, environment),
                module_name = COALESCE(?6, module_name),
                command_name = COALESCE(?7, command_name),
                page_name = COALESCE(?8, page_name),
                component_name = COALESCE(?9, component_name),
                error_code = COALESCE(?10, error_code),
                error_category = COALESCE(?11, error_category),
                error_message = ?12,
                stack_trace = COALESCE(?13, stack_trace),
                source_file = COALESCE(?14, source_file),
                source_function = COALESCE(?15, source_function),
                user_action = COALESCE(?16, user_action),
                redacted_input_context = COALESCE(?17, redacted_input_context),
                affected_entity_ids = COALESCE(?18, affected_entity_ids),
                severity = ?19,
                recoverable = ?20,
                retryable = ?21,
                app_state_snapshot = COALESCE(?22, app_state_snapshot),
                status = CASE WHEN status = 'fixed' THEN status ELSE ?23 END,
                ai_summary = COALESCE(?24, ai_summary)
             WHERE id = ?1",
            params![
                &id,
                &now,
                trim_opt(payload.app_version, 100),
                trim_opt(payload.build_version, 100),
                trim_opt(payload.environment, 100),
                trim_opt(payload.module_name, 120),
                trim_opt(payload.command_name, 120),
                trim_opt(payload.page_name, 120),
                trim_opt(payload.component_name, 120),
                trim_opt(payload.error_code, 120),
                trim_opt(payload.error_category, 120),
                error_message,
                trim_opt(payload.stack_trace, MAX_STACK),
                trim_opt(payload.source_file, 200),
                trim_opt(payload.source_function, 200),
                trim_opt(payload.user_action, 250),
                trim_opt(payload.redacted_input_context, MAX_CONTEXT),
                trim_opt(payload.affected_entity_ids, 500),
                severity,
                if payload.recoverable.unwrap_or(false) { 1 } else { 0 },
                if payload.retryable.unwrap_or(false) { 1 } else { 0 },
                trim_opt(payload.app_state_snapshot, MAX_CONTEXT),
                status,
                trim_opt(payload.ai_summary, 600),
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok(id);
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO error_memory (
            id, fingerprint, occurrence_count, first_seen_at, last_seen_at,
            app_version, build_version, environment, module_name, command_name, page_name, component_name,
            error_code, error_category, error_message, stack_trace, source_file, source_function,
            user_action, redacted_input_context, affected_entity_ids, severity, recoverable, retryable,
            app_state_snapshot, status, ai_summary
        ) VALUES (
            ?1, ?2, 1, ?3, ?3,
            ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16,
            ?17, ?18, ?19, ?20, ?21, ?22,
            ?23, ?24, ?25
        )",
        params![
            &id,
            &fp,
            &now,
            trim_opt(payload.app_version, 100),
            trim_opt(payload.build_version, 100),
            trim_opt(payload.environment, 100),
            trim_opt(payload.module_name, 120),
            trim_opt(payload.command_name, 120),
            trim_opt(payload.page_name, 120),
            trim_opt(payload.component_name, 120),
            trim_opt(payload.error_code, 120),
            trim_opt(payload.error_category, 120),
            error_message,
            trim_opt(payload.stack_trace, MAX_STACK),
            trim_opt(payload.source_file, 200),
            trim_opt(payload.source_function, 200),
            trim_opt(payload.user_action, 250),
            trim_opt(payload.redacted_input_context, MAX_CONTEXT),
            trim_opt(payload.affected_entity_ids, 500),
            severity,
            if payload.recoverable.unwrap_or(false) { 1 } else { 0 },
            if payload.retryable.unwrap_or(false) { 1 } else { 0 },
            trim_opt(payload.app_state_snapshot, MAX_CONTEXT),
            status,
            trim_opt(payload.ai_summary, 600),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

fn ensure_cleanup_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS error_memory_pruned_groups (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            occurrence_count INTEGER NOT NULL DEFAULT 1,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            prune_reason TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS error_memory_cleanup_runs (
            id TEXT PRIMARY KEY,
            executed_at TEXT NOT NULL,
            trigger_source TEXT NOT NULL,
            dry_run INTEGER NOT NULL DEFAULT 0,
            total_before INTEGER NOT NULL DEFAULT 0,
            total_after INTEGER NOT NULL DEFAULT 0,
            candidate_count INTEGER NOT NULL DEFAULT 0,
            deleted_count INTEGER NOT NULL DEFAULT 0,
            protected_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT
        );",
    )
    .map_err(|e| e.to_string())
}

fn list_cleanup_candidates(conn: &Connection) -> Result<(Vec<CleanupCandidate>, i64, i64), String> {
    let total_before: i64 = conn
        .query_row("SELECT COUNT(*) FROM error_memory", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let over_cap = (total_before - HARD_CAP).max(0);
    let mut stmt = conn
        .prepare(
            "SELECT id,fingerprint,occurrence_count,first_seen_at,last_seen_at,severity,status,
                    CAST((julianday('now') - julianday(last_seen_at)) AS INTEGER) AS age_days
             FROM error_memory
             ORDER BY datetime(last_seen_at) ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut protected = 0_i64;
    let mut candidates = Vec::new();
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, i64>(7).unwrap_or(0),
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (id, fingerprint, occurrence_count, first_seen_at, last_seen_at, severity, status, age_days) =
            row.map_err(|e| e.to_string())?;
        let severity_norm = normalize_severity(Some(severity));
        let status_norm = normalize_status(Some(status));
        let retention = retention_days(&status_norm, &severity_norm);
        let protected_now = is_protected(&status_norm, &severity_norm, age_days);
        let eligible_by_age = age_days >= retention;
        if protected_now {
            protected += 1;
            continue;
        }
        let eligible_for_cap = over_cap > 0;
        if !eligible_by_age && !eligible_for_cap {
            continue;
        }
        let reason = if eligible_by_age {
            format!(
                "age>{}d status={} severity={} occurrences={}",
                retention, status_norm, severity_norm, occurrence_count
            )
        } else {
            format!(
                "over-cap status={} severity={} occurrences={}",
                status_norm, severity_norm, occurrence_count
            )
        };
        let priority = cleanup_priority(&status_norm, &severity_norm, occurrence_count, age_days);
        candidates.push(CleanupCandidate {
            id,
            fingerprint,
            occurrence_count,
            first_seen_at,
            last_seen_at,
            severity: severity_norm,
            status: status_norm,
            age_days,
            prune_reason: reason,
            priority,
        });
    }

    candidates.sort_by_key(|c| c.priority);
    Ok((candidates, total_before, protected))
}

fn execute_cleanup(
    conn: &Connection,
    dry_run: bool,
    trigger_source: &str,
    delete_limit: i64,
) -> Result<ErrorMemoryCleanupResult, String> {
    ensure_cleanup_tables(conn)?;
    let now = now_sqlite();
    let run_id = Uuid::new_v4().to_string();
    let (candidates, total_before, protected_count) = list_cleanup_candidates(conn)?;
    let prune_n = (total_before - HARD_CAP).max(0);
    let target = if prune_n > 0 {
        prune_n.max(1)
    } else {
        candidates.len() as i64
    };
    let limited_target = target.min(delete_limit.max(0));
    let selected: Vec<CleanupCandidate> = candidates
        .iter()
        .take(limited_target as usize)
        .cloned()
        .collect();
    let would_prune_count = selected.len() as i64;

    if dry_run {
        conn.execute(
            "INSERT INTO error_memory_cleanup_runs
             (id, executed_at, trigger_source, dry_run, total_before, total_after, candidate_count, deleted_count, protected_count, error_message)
             VALUES (?1, ?2, ?3, 1, ?4, ?4, ?5, 0, ?6, NULL)",
            params![&run_id, &now, trigger_source, total_before, candidates.len() as i64, protected_count],
        )
        .map_err(|e| e.to_string())?;
        return Ok(ErrorMemoryCleanupResult {
            run_id,
            dry_run: true,
            trigger_source: trigger_source.to_string(),
            total_before,
            total_after: total_before,
            hard_cap: HARD_CAP,
            candidate_count: candidates.len() as i64,
            would_prune_count,
            deleted_count: 0,
            protected_count,
            pruned_ids: selected.iter().map(|c| c.id.clone()).collect(),
            prune_reasons: selected
                .iter()
                .map(|c| format!("{} (age={}d): {}", c.id, c.age_days, c.prune_reason))
                .collect(),
            executed_at: now,
        });
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut deleted_count = 0_i64;
    for c in &selected {
        tx.execute(
            "INSERT INTO error_memory_pruned_groups
             (id, run_id, fingerprint, occurrence_count, first_seen_at, last_seen_at, severity, status, prune_reason, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                Uuid::new_v4().to_string(),
                &run_id,
                &c.fingerprint,
                c.occurrence_count,
                &c.first_seen_at,
                &c.last_seen_at,
                &c.severity,
                &c.status,
                &c.prune_reason,
                &now
            ],
        )
        .map_err(|e| e.to_string())?;
        deleted_count += tx
            .execute("DELETE FROM error_memory WHERE id = ?1", params![&c.id])
            .map_err(|e| e.to_string())? as i64;
    }
    let total_after = (total_before - deleted_count).max(0);
    tx.execute(
        "INSERT INTO error_memory_cleanup_runs
         (id, executed_at, trigger_source, dry_run, total_before, total_after, candidate_count, deleted_count, protected_count, error_message)
         VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8, NULL)",
        params![
            &run_id,
            &now,
            trigger_source,
            total_before,
            total_after,
            candidates.len() as i64,
            deleted_count,
            protected_count
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ErrorMemoryCleanupResult {
        run_id,
        dry_run: false,
        trigger_source: trigger_source.to_string(),
        total_before,
        total_after,
        hard_cap: HARD_CAP,
        candidate_count: candidates.len() as i64,
        would_prune_count,
        deleted_count,
        protected_count,
        pruned_ids: selected.iter().map(|c| c.id.clone()).collect(),
        prune_reasons: selected
            .iter()
            .map(|c| format!("{} (age={}d): {}", c.id, c.age_days, c.prune_reason))
            .collect(),
        executed_at: now,
    })
}

fn maybe_schedule_auto_cleanup() {
    let tick = AUTO_CLEANUP_TICK.fetch_add(1, Ordering::Relaxed) + 1;
    if tick % AUTO_CLEANUP_INTERVAL != 0 {
        return;
    }
    if CLEANUP_IN_PROGRESS
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }
    let Some(path) = ERROR_MEMORY_DB_PATH.get().cloned() else {
        CLEANUP_IN_PROGRESS.store(false, Ordering::Release);
        return;
    };
    std::thread::spawn(move || {
        let result = Connection::open(path)
            .map_err(|e| e.to_string())
            .and_then(|conn| execute_cleanup(&conn, false, "auto", AUTO_CLEANUP_DELETE_LIMIT));
        match result {
            Ok(r) => info!(
                "error_memory_cleanup auto run={} deleted={} candidates={} total_before={} total_after={}",
                r.run_id, r.deleted_count, r.candidate_count, r.total_before, r.total_after
            ),
            Err(e) => warn!("error_memory_cleanup auto failed: {}", redact_sensitive(&e)),
        }
        CLEANUP_IN_PROGRESS.store(false, Ordering::Release);
    });
}

pub fn init_error_memory_db_path(path: &Path) {
    let _ = ERROR_MEMORY_DB_PATH.get_or_init(|| path.to_path_buf());
}

pub fn record_ipc_error_autolog(code: &str, category: &str, message: &str) {
    let Some(path) = ERROR_MEMORY_DB_PATH.get() else {
        return;
    };
    let Ok(conn) = Connection::open(path) else {
        return;
    };
    let payload = ErrorEventPayload {
        app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
        build_version: Some(env!("IMPORT_MANAGER_BUILD_DATE").to_string()),
        environment: Some(if cfg!(debug_assertions) { "dev" } else { "local" }.to_string()),
        module_name: Some("backend.ipc".to_string()),
        command_name: None,
        page_name: None,
        component_name: None,
        error_code: Some(code.to_string()),
        error_category: Some(category.to_string()),
        error_message: message.to_string(),
        stack_trace: None,
        source_file: None,
        source_function: None,
        user_action: Some("ipc_command_error".to_string()),
        redacted_input_context: None,
        affected_entity_ids: None,
        severity: Some("error".to_string()),
        recoverable: Some(false),
        retryable: Some(false),
        app_state_snapshot: None,
        status: Some("new".to_string()),
        ai_summary: None,
    };
    let _ = upsert_error_event(&conn, payload);
    maybe_schedule_auto_cleanup();
}

#[tauri::command]
pub fn capture_error_event(
    state: State<'_, DbState>,
    payload: ErrorEventPayload,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = upsert_error_event(&conn, payload)?;
    drop(conn);
    maybe_schedule_auto_cleanup();
    Ok(id)
}

#[tauri::command]
pub fn list_error_events(
    state: State<'_, DbState>,
    filter: Option<ErrorMemoryFilter>,
) -> Result<Vec<ErrorMemoryRow>, String> {
    let f = filter.unwrap_or(ErrorMemoryFilter {
        severity: None,
        module_name: None,
        command_name: None,
        status: None,
        date_from: None,
        date_to: None,
        fingerprint: None,
        limit: Some(200),
    });
    let limit = f.limit.unwrap_or(200).clamp(1, 1000);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT id,fingerprint,occurrence_count,first_seen_at,last_seen_at,app_version,build_version,environment,module_name,command_name,page_name,component_name,error_code,error_category,error_message,stack_trace,source_file,source_function,user_action,redacted_input_context,affected_entity_ids,severity,recoverable,retryable,app_state_snapshot,status,ai_summary FROM error_memory WHERE 1=1",
    );
    let mut params_vec: Vec<String> = Vec::new();
    if let Some(v) = f.severity.filter(|s| !s.trim().is_empty()) {
        sql.push_str(" AND lower(severity)=lower(?)");
        params_vec.push(v);
    }
    if let Some(v) = f.module_name.filter(|s| !s.trim().is_empty()) {
        sql.push_str(" AND lower(module_name) LIKE lower(?)");
        params_vec.push(format!("%{}%", v));
    }
    if let Some(v) = f.command_name.filter(|s| !s.trim().is_empty()) {
        sql.push_str(" AND lower(command_name) LIKE lower(?)");
        params_vec.push(format!("%{}%", v));
    }
    if let Some(v) = f.status.filter(|s| !s.trim().is_empty()) {
        sql.push_str(" AND lower(status)=lower(?)");
        params_vec.push(v);
    }
    if let Some(v) = f.date_from.filter(|s| !s.trim().is_empty()) {
        sql.push_str(" AND datetime(last_seen_at) >= datetime(?)");
        params_vec.push(v);
    }
    if let Some(v) = f.date_to.filter(|s| !s.trim().is_empty()) {
        sql.push_str(" AND datetime(last_seen_at) <= datetime(?)");
        params_vec.push(v);
    }
    if let Some(v) = f.fingerprint.filter(|s| !s.trim().is_empty()) {
        sql.push_str(" AND fingerprint = ?");
        params_vec.push(v);
    }
    sql.push_str(" ORDER BY datetime(last_seen_at) DESC LIMIT ?");
    let mut dyn_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();
    let lim = limit;
    dyn_params.push(&lim);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(dyn_params.as_slice(), |r| {
            Ok(ErrorMemoryRow {
                id: r.get(0)?,
                fingerprint: r.get(1)?,
                occurrence_count: r.get(2)?,
                first_seen_at: r.get(3)?,
                last_seen_at: r.get(4)?,
                app_version: r.get(5)?,
                build_version: r.get(6)?,
                environment: r.get(7)?,
                module_name: r.get(8)?,
                command_name: r.get(9)?,
                page_name: r.get(10)?,
                component_name: r.get(11)?,
                error_code: r.get(12)?,
                error_category: r.get(13)?,
                error_message: r.get(14)?,
                stack_trace: r.get(15)?,
                source_file: r.get(16)?,
                source_function: r.get(17)?,
                user_action: r.get(18)?,
                redacted_input_context: r.get(19)?,
                affected_entity_ids: r.get(20)?,
                severity: r.get(21)?,
                recoverable: r.get::<_, i64>(22)? == 1,
                retryable: r.get::<_, i64>(23)? == 1,
                app_state_snapshot: r.get(24)?,
                status: r.get(25)?,
                ai_summary: r.get(26)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_error_event_status(
    state: State<'_, DbState>,
    id: String,
    status: String,
) -> Result<(), String> {
    let s = normalize_status(Some(status));
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE error_memory SET status = ?2 WHERE id = ?1",
        params![id, s],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_error_memory_maintenance_stats(
    state: State<'_, DbState>,
) -> Result<ErrorMemoryMaintenanceStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    ensure_cleanup_tables(&conn)?;
    let total_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM error_memory", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let duplicate_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM error_memory WHERE occurrence_count > 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let old_resolved_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM error_memory
             WHERE status IN ('fixed','ignored','duplicate')
               AND datetime(last_seen_at) <= datetime('now', ?1)",
            params![format!("-{} days", MAINTENANCE_OLD_RESOLVED_DAYS)],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let last_cleanup: Option<(String, i64, i64, i64)> = conn
        .query_row(
            "SELECT executed_at, deleted_count, candidate_count, total_after
             FROM error_memory_cleanup_runs
             ORDER BY datetime(executed_at) DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (last_cleanup_at, last_cleanup_summary) = match last_cleanup {
        Some((executed_at, deleted_count, candidate_count, total_after)) => (
            Some(executed_at),
            Some(format!(
                "deleted={} candidates={} totalAfter={}",
                deleted_count, candidate_count, total_after
            )),
        ),
        None => (None, None),
    };
    Ok(ErrorMemoryMaintenanceStats {
        total_count,
        duplicate_count,
        old_resolved_count,
        hard_cap: HARD_CAP,
        last_cleanup_at,
        last_cleanup_summary,
    })
}

#[tauri::command]
pub fn run_error_memory_cleanup(
    state: State<'_, DbState>,
    request: Option<ErrorMemoryCleanupRequest>,
) -> Result<ErrorMemoryCleanupResult, String> {
    let req = request.unwrap_or(ErrorMemoryCleanupRequest {
        dry_run: Some(false),
        delete_limit: Some(250),
    });
    let dry_run = req.dry_run.unwrap_or(false);
    let delete_limit = req.delete_limit.unwrap_or(250).clamp(0, 1_000);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let result = execute_cleanup(&conn, dry_run, "manual", delete_limit)?;
    if result.dry_run {
        info!(
            "error_memory_cleanup preview run={} candidates={} would_prune={} total={}",
            result.run_id, result.candidate_count, result.would_prune_count, result.total_before
        );
    } else {
        info!(
            "error_memory_cleanup run={} deleted={} candidates={} total_before={} total_after={}",
            result.run_id,
            result.deleted_count,
            result.candidate_count,
            result.total_before,
            result.total_after
        );
    }
    Ok(result)
}

#[tauri::command]
pub fn export_error_events_cursor_report(
    state: State<'_, DbState>,
    ids: Vec<String>,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut out = String::new();
    for id in ids.iter().take(50) {
        let row: Option<ErrorMemoryRow> = conn
            .query_row(
                "SELECT id,fingerprint,occurrence_count,first_seen_at,last_seen_at,app_version,build_version,environment,module_name,command_name,page_name,component_name,error_code,error_category,error_message,stack_trace,source_file,source_function,user_action,redacted_input_context,affected_entity_ids,severity,recoverable,retryable,app_state_snapshot,status,ai_summary FROM error_memory WHERE id = ?1",
                params![id],
                |r| {
                    Ok(ErrorMemoryRow {
                        id: r.get(0)?,
                        fingerprint: r.get(1)?,
                        occurrence_count: r.get(2)?,
                        first_seen_at: r.get(3)?,
                        last_seen_at: r.get(4)?,
                        app_version: r.get(5)?,
                        build_version: r.get(6)?,
                        environment: r.get(7)?,
                        module_name: r.get(8)?,
                        command_name: r.get(9)?,
                        page_name: r.get(10)?,
                        component_name: r.get(11)?,
                        error_code: r.get(12)?,
                        error_category: r.get(13)?,
                        error_message: r.get(14)?,
                        stack_trace: r.get(15)?,
                        source_file: r.get(16)?,
                        source_function: r.get(17)?,
                        user_action: r.get(18)?,
                        redacted_input_context: r.get(19)?,
                        affected_entity_ids: r.get(20)?,
                        severity: r.get(21)?,
                        recoverable: r.get::<_, i64>(22)? == 1,
                        retryable: r.get::<_, i64>(23)? == 1,
                        app_state_snapshot: r.get(24)?,
                        status: r.get(25)?,
                        ai_summary: r.get(26)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(r) = row else { continue };
        let line = format!(
            "## {title}\n- Summary: {msg}\n- Reproduction context: module={module} command={command} page={page} action={action}\n- Error details: code={code} category={category} severity={severity} recoverable={recoverable} retryable={retryable}\n- Stack trace:\n{stack}\n- Affected files/modules: source_file={source_file} source_function={source_fn}\n- Suspected root cause: {ai}\n- Suggested fix plan: investigate command path, verify validation, add regression test\n- Related past occurrences: count={count} first={first} last={last}\n- Linked logs: fingerprint={fp}\n- Safe to auto-fix: {safe}\n\n",
            title = r.error_code.clone().unwrap_or_else(|| "Runtime Error".to_string()),
            msg = r.error_message,
            module = r.module_name.unwrap_or_default(),
            command = r.command_name.unwrap_or_default(),
            page = r.page_name.unwrap_or_default(),
            action = r.user_action.unwrap_or_default(),
            code = r.error_code.unwrap_or_default(),
            category = r.error_category.unwrap_or_default(),
            severity = r.severity,
            recoverable = r.recoverable,
            retryable = r.retryable,
            stack = r.stack_trace.unwrap_or_else(|| "(not available)".to_string()),
            source_file = r.source_file.unwrap_or_default(),
            source_fn = r.source_function.unwrap_or_default(),
            ai = r.ai_summary.unwrap_or_else(|| "No AI summary".to_string()),
            count = r.occurrence_count,
            first = r.first_seen_at,
            last = r.last_seen_at,
            fp = r.fingerprint,
            safe = if r.retryable { "yes-with-review" } else { "manual-review" },
        );
        out.push_str(&line);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE error_memory (
                id TEXT PRIMARY KEY,
                fingerprint TEXT NOT NULL UNIQUE,
                occurrence_count INTEGER NOT NULL DEFAULT 1,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                app_version TEXT, build_version TEXT, environment TEXT,
                module_name TEXT, command_name TEXT, page_name TEXT, component_name TEXT,
                error_code TEXT, error_category TEXT, error_message TEXT NOT NULL, stack_trace TEXT,
                source_file TEXT, source_function TEXT, user_action TEXT, redacted_input_context TEXT,
                affected_entity_ids TEXT, severity TEXT NOT NULL DEFAULT 'error',
                recoverable INTEGER NOT NULL DEFAULT 0, retryable INTEGER NOT NULL DEFAULT 0,
                app_state_snapshot TEXT, status TEXT NOT NULL DEFAULT 'new', ai_summary TEXT
            );",
        )
        .unwrap();
        c
    }

    fn insert_row(
        c: &Connection,
        id: &str,
        fp: &str,
        status: &str,
        severity: &str,
        occurrence_count: i64,
        days_ago: i64,
    ) {
        c.execute(
            "INSERT INTO error_memory (
                id, fingerprint, occurrence_count, first_seen_at, last_seen_at, error_message, severity, status, recoverable, retryable
             ) VALUES (
                ?1, ?2, ?3, datetime('now', ?4), datetime('now', ?4), ?5, ?6, ?7, 0, 0
             )",
            params![
                id,
                fp,
                occurrence_count,
                format!("-{} days", days_ago),
                format!("message-{id}"),
                severity,
                status
            ],
        )
        .unwrap();
    }

    #[test]
    fn dedup_increments_occurrences() {
        let c = mem();
        let p = ErrorEventPayload {
            app_version: None,
            build_version: None,
            environment: None,
            module_name: Some("m".into()),
            command_name: Some("c".into()),
            page_name: None,
            component_name: None,
            error_code: Some("E1".into()),
            error_category: Some("validation".into()),
            error_message: "bad input 123".into(),
            stack_trace: None,
            source_file: None,
            source_function: None,
            user_action: None,
            redacted_input_context: None,
            affected_entity_ids: None,
            severity: Some("error".into()),
            recoverable: Some(false),
            retryable: Some(false),
            app_state_snapshot: None,
            status: Some("new".into()),
            ai_summary: None,
        };
        let id1 = upsert_error_event(&c, p.clone()).unwrap();
        let id2 = upsert_error_event(&c, p).unwrap();
        assert_eq!(id1, id2);
        let n: i64 = c
            .query_row(
                "SELECT occurrence_count FROM error_memory WHERE id = ?1",
                params![id1],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn redacts_sensitive_tokens() {
        let s = redact_sensitive(r#"{"token":"abc","password":"xyz"}"#);
        assert!(s.contains("<redacted>"));
        assert!(!s.contains("\"abc\""));
    }

    #[test]
    fn cleanup_keeps_critical_unresolved() {
        let c = mem();
        ensure_cleanup_tables(&c).unwrap();
        insert_row(&c, "a", "fp-a", "new", "critical", 3, 500);
        let result = execute_cleanup(&c, false, "test", 100).unwrap();
        assert_eq!(result.deleted_count, 0);
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM error_memory WHERE id = 'a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn cleanup_prunes_old_resolved_duplicates_first() {
        let c = mem();
        ensure_cleanup_tables(&c).unwrap();
        insert_row(&c, "dup-old", "fp-dup", "duplicate", "warning", 20, 60);
        insert_row(&c, "new-recent", "fp-new", "new", "error", 1, 1);
        let result = execute_cleanup(&c, false, "test", 10).unwrap();
        assert!(result.deleted_count >= 1);
        let dup_exists: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM error_memory WHERE id = 'dup-old'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let new_exists: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM error_memory WHERE id = 'new-recent'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dup_exists, 0);
        assert_eq!(new_exists, 1);
    }

    #[test]
    fn dry_run_returns_candidate_summary_without_deleting() {
        let c = mem();
        ensure_cleanup_tables(&c).unwrap();
        insert_row(&c, "x", "fp-x", "fixed", "warning", 2, 90);
        let result = execute_cleanup(&c, true, "test", 50).unwrap();
        assert!(result.would_prune_count >= 1);
        assert_eq!(result.deleted_count, 0);
        let count: i64 = c
            .query_row("SELECT COUNT(*) FROM error_memory", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn cleanup_does_not_remove_recent_new_errors() {
        let c = mem();
        ensure_cleanup_tables(&c).unwrap();
        insert_row(&c, "recent-new", "fp-recent", "new", "warning", 1, 2);
        let result = execute_cleanup(&c, false, "test", 50).unwrap();
        assert_eq!(result.deleted_count, 0);
        let exists: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM error_memory WHERE id = 'recent-new'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
    }

    #[test]
    fn cleanup_failure_does_not_block_capture_path() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let bad_path = std::env::temp_dir().join(format!("error-memory-test-{}.db", unique));
        fs::write(&bad_path, "not-a-sqlite-db").unwrap();
        init_error_memory_db_path(&bad_path);
        record_ipc_error_autolog("E_TEST", "ipc", "capture still works");
    }
}
