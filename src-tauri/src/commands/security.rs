//! Tauri commands that back the Security Center UI:
//!
//! * `change_admin_password` — rotate the active admin hash (Argon2id).
//! * `get_my_permissions` — permission keys granted to the current session.
//! * `get_security_settings` / `update_security_settings` — lockout & idle policy.
//! * `get_lockout_status` / `reset_account_lockout` — account-lockout introspection.
//! * `get_recent_auth_events` — last N `auth.*` rows from `user_activity_audit_logs`.
//! * `get_security_dashboard_metrics` — session, lockout, policy health, and escalated alerts.
//! * `get_security_trend_series` — daily aggregates for failed logins, lockouts, password changes.
//! * `get_active_desktop_sessions` — active desktop session metadata (terminate via desktop IPC).

use crate::db::DbState;
use crate::desktop_session::{DesktopSessionInfo, DesktopSessionState, DEFAULT_ADMIN_USER_ID};
use crate::ipc_error::IpcError;
use crate::security::credentials::{
    enforce_password_policy, hash_password_argon2id, new_password_reuses_history,
    persist_admin_hash, read_password_history_depth, verify_password, write_password_history_depth,
    PasswordPolicyError, PASSWORD_HISTORY_DEPTH_MAX, PASSWORD_HISTORY_DEPTH_MIN, PASSWORD_MIN_LEN,
};
use crate::security::lockout::{LockoutStatus, SecurityPolicy};
use crate::security::{Permission, Role};
use crate::services::user_activity_audit::{
    log_activity_with_severity, AuditSeverity, UserActivityAuditLog,
};
use rusqlite::{params, OptionalExtension};
use tauri::State;

const SETTINGS_POLICY_VERSION: &str = "security.policy_version";

const PERM_SECURITY_CHANGE_PASSWORD: Permission = Permission::SecurityChangePassword;
const PERM_SECURITY_SESSION_READ: Permission = Permission::SecuritySessionRead;
const PERM_SECURITY_LOCKOUT_MANAGE: Permission = Permission::SecurityLockoutManage;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySettings {
    pub policy: SecurityPolicy,
    pub password_history_depth: i32,
    pub password_history_depth_min: i32,
    pub password_history_depth_max: i32,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySettingsInput {
    pub lockout_threshold: Option<u32>,
    pub lockout_window_minutes: Option<i64>,
    pub lockout_duration_minutes: Option<i64>,
    pub idle_timeout_minutes: Option<i64>,
    pub password_history_depth: Option<i32>,
}

#[tauri::command]
pub fn get_my_permissions(
    caller_user_id: String,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<Vec<String>, String> {
    session.assert_caller_user(caller_user_id.trim())?;
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    let role_str = crate::security::resolve_role_strict(&conn, caller_user_id.trim())?;
    let perms = Role::from_db_str(&role_str)
        .map(|r| {
            crate::security::permissions_for(r)
                .into_iter()
                .map(|p| p.as_str().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(perms)
}

#[tauri::command]
pub fn get_my_session(
    session: State<'_, DesktopSessionState>,
) -> Result<Option<DesktopSessionInfo>, String> {
    Ok(session.read_session())
}

#[tauri::command]
pub fn get_security_settings(
    caller_user_id: String,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<SecuritySettings, String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_SESSION_READ)?;
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    let policy = SecurityPolicy::load(&conn);
    let password_history_depth = read_password_history_depth(&conn) as i32;
    Ok(SecuritySettings {
        policy,
        password_history_depth,
        password_history_depth_min: PASSWORD_HISTORY_DEPTH_MIN as i32,
        password_history_depth_max: PASSWORD_HISTORY_DEPTH_MAX as i32,
    })
}

#[tauri::command]
pub fn update_security_settings(
    caller_user_id: String,
    input: SecuritySettingsInput,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<SecuritySettings, String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_LOCKOUT_MANAGE)?;
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    let before = SecurityPolicy::load(&conn);
    let before_depth = read_password_history_depth(&conn);
    let mut policy = before;
    let mut new_depth = before_depth;
    if let Some(v) = input.lockout_threshold {
        if !(1..=20).contains(&v) {
            return Err("lockout_threshold must be between 1 and 20".to_string());
        }
        policy.lockout_threshold = v;
    }
    if let Some(v) = input.lockout_window_minutes {
        if !(1..=1440).contains(&v) {
            return Err("lockout_window_minutes must be between 1 and 1440".to_string());
        }
        policy.lockout_window_minutes = v;
    }
    if let Some(v) = input.lockout_duration_minutes {
        if !(1..=10_080).contains(&v) {
            return Err("lockout_duration_minutes must be between 1 and 10080".to_string());
        }
        policy.lockout_duration_minutes = v;
    }
    if let Some(v) = input.idle_timeout_minutes {
        if !(1..=720).contains(&v) {
            return Err("idle_timeout_minutes must be between 1 and 720".to_string());
        }
        policy.idle_timeout_minutes = v;
    }
    if let Some(d) = input.password_history_depth {
        new_depth = (d as i64).clamp(
            PASSWORD_HISTORY_DEPTH_MIN as i64,
            PASSWORD_HISTORY_DEPTH_MAX as i64,
        ) as usize;
    }
    let policy_changed = policy != before;
    let depth_changed = new_depth != before_depth;
    if !policy_changed && !depth_changed {
        return Ok(SecuritySettings {
            policy,
            password_history_depth: new_depth as i32,
            password_history_depth_min: PASSWORD_HISTORY_DEPTH_MIN as i32,
            password_history_depth_max: PASSWORD_HISTORY_DEPTH_MAX as i32,
        });
    }
    if policy_changed {
        SecurityPolicy::save(&conn, &policy)?;
    }
    if depth_changed {
        write_password_history_depth(&conn, new_depth)?;
    }
    let version = bump_policy_version_record(&conn, caller_user_id.trim(), &policy, new_depth)?;
    let detail = serde_json::json!({
        "lockoutThreshold": policy.lockout_threshold,
        "lockoutWindowMinutes": policy.lockout_window_minutes,
        "lockoutDurationMinutes": policy.lockout_duration_minutes,
        "idleTimeoutMinutes": policy.idle_timeout_minutes,
        "passwordHistoryDepth": new_depth,
        "policyVersion": version,
    })
    .to_string();
    log_activity_with_severity(
        &conn,
        Some(caller_user_id.trim()),
        "auth.security_policy_updated",
        None,
        None,
        Some(&detail),
        "success",
        AuditSeverity::Security,
    );
    Ok(SecuritySettings {
        policy,
        password_history_depth: new_depth as i32,
        password_history_depth_min: PASSWORD_HISTORY_DEPTH_MIN as i32,
        password_history_depth_max: PASSWORD_HISTORY_DEPTH_MAX as i32,
    })
}

#[tauri::command]
pub fn get_lockout_status(
    caller_user_id: String,
    target_user_id: Option<String>,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<LockoutStatus, String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_SESSION_READ)?;
    let user = target_user_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_ADMIN_USER_ID);
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    let policy = SecurityPolicy::load(&conn);
    Ok(session.lockout().status(&conn, user, &policy))
}

#[tauri::command]
pub fn reset_account_lockout(
    caller_user_id: String,
    target_user_id: Option<String>,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_LOCKOUT_MANAGE)?;
    let user = target_user_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_ADMIN_USER_ID);
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    session.lockout().reset(&conn, user);
    let detail = serde_json::json!({ "targetUserId": user }).to_string();
    log_activity_with_severity(
        &conn,
        Some(caller_user_id.trim()),
        "auth.lockout_reset",
        None,
        None,
        Some(&detail),
        "success",
        AuditSeverity::Security,
    );
    Ok(())
}

#[tauri::command]
pub fn change_admin_password(
    caller_user_id: String,
    current_password: String,
    new_password: String,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<(), IpcError> {
    session
        .require_permission(&db, caller_user_id.trim(), PERM_SECURITY_CHANGE_PASSWORD)
        .map_err(|m| IpcError::new("auth_denied", m))?;

    if let Err(violation) = enforce_password_policy(&new_password) {
        return Err(IpcError::new("password_policy", violation.to_string())
            .with_details(policy_code(&violation)));
    }

    let conn = db
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()))?;
    let active_hash = crate::security::credentials::active_admin_hash(&conn, "");
    if active_hash.is_empty() {
        return Err(IpcError::new(
            "auth_config",
            "Administrator password has not been set up yet.",
        ));
    }
    let ok = verify_password(&current_password, &active_hash)
        .map_err(|e| IpcError::new("auth_internal", e))?;
    if !ok {
        let detail = serde_json::json!({ "userId": caller_user_id.trim() }).to_string();
        log_activity_with_severity(
            &conn,
            Some(caller_user_id.trim()),
            "auth.password_change_failed",
            None,
            None,
            Some(&detail),
            "failure",
            AuditSeverity::Warning,
        );
        return Err(IpcError::new(
            "auth_failed",
            "Current password is incorrect.",
        ));
    }
    if current_password == new_password {
        return Err(IpcError::new(
            "password_policy",
            "New password must differ from the current password.",
        ));
    }
    let history_depth = read_password_history_depth(&conn);
    match new_password_reuses_history(&conn, DEFAULT_ADMIN_USER_ID, &new_password, history_depth) {
        Ok(true) => {
            let detail = serde_json::json!({
                "userId": caller_user_id.trim(),
                "historyDepth": history_depth,
            })
            .to_string();
            log_activity_with_severity(
                &conn,
                Some(caller_user_id.trim()),
                "auth.password_reuse_rejected",
                None,
                None,
                Some(&detail),
                "failure",
                AuditSeverity::Security,
            );
            return Err(IpcError::new(
                "password_reuse",
                format!(
                    "This password matches one of the last {} saved password(s). Choose a new password.",
                    history_depth
                ),
            ));
        }
        Err(e) => return Err(IpcError::new("internal", e)),
        Ok(false) => {}
    }
    let new_hash =
        hash_password_argon2id(&new_password).map_err(|e| IpcError::new("auth_internal", e))?;
    persist_admin_hash(&conn, caller_user_id.trim(), &new_hash, Some(&active_hash))
        .map_err(|e| IpcError::new("internal", e))?;
    let detail = serde_json::json!({
        "userId": caller_user_id.trim(),
        "algorithm": "argon2id",
    })
    .to_string();
    log_activity_with_severity(
        &conn,
        Some(caller_user_id.trim()),
        "auth.password_changed",
        None,
        None,
        Some(&detail),
        "success",
        AuditSeverity::Security,
    );
    Ok(())
}

#[tauri::command]
pub fn get_recent_auth_events(
    caller_user_id: String,
    limit: Option<i64>,
    // Supports server-side pagination; callers pass offset = page_index * page_size.
    offset: Option<i64>,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<Vec<UserActivityAuditLog>, String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_SESSION_READ)?;
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    // Default matches the frontend default page size of 50; hard ceiling prevents runaway scans.
    let limit_val = limit.unwrap_or(50).clamp(1, 1000);
    // Non-negative offset so page N starts at N * limit rows from the top.
    let offset_val = offset.unwrap_or(0).max(0);
    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, action_name, entity_type, entity_id, details_json, status, timestamp, severity \
             FROM user_activity_audit_logs \
             WHERE action_name LIKE 'auth.%' \
             ORDER BY timestamp DESC \
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit_val, offset_val], |row| {
            Ok(UserActivityAuditLog {
                id: row.get(0)?,
                user_id: row.get(1)?,
                action_name: row.get(2)?,
                entity_type: row.get(3)?,
                entity_id: row.get(4)?,
                details_json: row.get(5)?,
                status: row.get(6)?,
                timestamp: row.get(7)?,
                severity: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_role_permissions_matrix() -> Vec<RolePermissionRow> {
    crate::security::role_permissions_snapshot()
        .into_iter()
        .map(|(role, perms)| RolePermissionRow {
            role: role.to_string(),
            permissions: perms.into_iter().map(|p| p.to_string()).collect(),
        })
        .collect()
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolePermissionRow {
    pub role: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityAlert {
    /// `critical` | `warning` | `info`
    pub severity: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityDashboardMetrics {
    pub active_session_count: u32,
    pub session_started_rfc3339: Option<String>,
    pub failed_login_attempts_last_24h: i64,
    pub lockouts_triggered_last_7d: i64,
    pub last_password_changed_rfc3339: Option<String>,
    pub policy_version: i64,
    pub password_history_depth: i32,
    pub warnings: Vec<String>,
    pub alerts: Vec<SecurityAlert>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityTrendDay {
    pub day: String,
    pub failed_logins: i64,
    pub lockouts: i64,
    pub password_changes: i64,
}

fn read_i64_setting(conn: &rusqlite::Connection, key: &str) -> Option<i64> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .and_then(|s| s.trim().parse::<i64>().ok())
}

pub(crate) fn bump_policy_version_record(
    conn: &rusqlite::Connection,
    caller_user_id: &str,
    policy: &SecurityPolicy,
    password_history_depth: usize,
) -> Result<i64, String> {
    let cur = read_i64_setting(conn, SETTINGS_POLICY_VERSION).unwrap_or(0);
    let next = cur.saturating_add(1).max(1);
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![SETTINGS_POLICY_VERSION, next.to_string()],
    )
    .map_err(|e| e.to_string())?;
    let policy_json = serde_json::to_string(policy).map_err(|e| e.to_string())?;
    let pw_rules = serde_json::json!({
        "minLength": PASSWORD_MIN_LEN,
        "passwordHistoryDepth": password_history_depth,
    })
    .to_string();
    conn.execute(
        "INSERT INTO security_policy_versions (version, policy_json, password_rules_json, changed_by) \
         VALUES (?1, ?2, ?3, ?4)",
        params![next, policy_json, pw_rules, caller_user_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
pub fn get_security_dashboard_metrics(
    caller_user_id: String,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<SecurityDashboardMetrics, String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_SESSION_READ)?;
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    let policy = SecurityPolicy::load(&conn);

    let (active_session_count, session_started_rfc3339) = match session.read_session() {
        Some(s) => (1u32, Some(s.session_started_rfc3339)),
        None => (0u32, None),
    };

    let failed_login_attempts_last_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM auth_failed_attempts WHERE attempted_at >= datetime('now', '-24 hours')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let lockouts_triggered_last_7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_activity_audit_logs \
             WHERE action_name = 'auth.lockout_triggered' \
             AND datetime(timestamp) >= datetime('now', '-7 days')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let last_password_changed_rfc3339: Option<String> = conn
        .query_row(
            "SELECT timestamp FROM user_activity_audit_logs \
             WHERE action_name = 'auth.password_changed' AND status = 'success' \
             ORDER BY timestamp DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();

    let policy_version = read_i64_setting(&conn, SETTINGS_POLICY_VERSION).unwrap_or(0);
    let password_history_depth = read_password_history_depth(&conn) as i32;

    let mut warnings: Vec<String> = Vec::new();
    if let Ok(problems) = crate::migrations::schema_integrity_problems(&conn) {
        for p in problems {
            warnings.push(format!("Schema integrity: {p}"));
        }
    }
    let lock_st = session
        .lockout()
        .status(&conn, DEFAULT_ADMIN_USER_ID, &policy);
    if lock_st.locked {
        warnings
            .push("Administrator account is locked due to failed sign-in attempts.".to_string());
    }
    if failed_login_attempts_last_24h >= policy.lockout_threshold as i64 * 2 {
        warnings.push(format!(
            "Elevated failed sign-in volume in the last 24 hours ({} attempts).",
            failed_login_attempts_last_24h
        ));
    }

    let mut alerts: Vec<SecurityAlert> = Vec::new();
    let thr = policy.lockout_threshold as i64;
    if lockouts_triggered_last_7d >= 3 {
        alerts.push(SecurityAlert {
            severity: "critical".to_string(),
            code: "repeated_lockouts".to_string(),
            message: format!(
                "{} lockout events in the last 7 days — investigate repeated account lockouts.",
                lockouts_triggered_last_7d
            ),
        });
    } else if lockouts_triggered_last_7d >= 2 {
        alerts.push(SecurityAlert {
            severity: "warning".to_string(),
            code: "multiple_lockouts".to_string(),
            message: format!(
                "{} lockout events in the last 7 days.",
                lockouts_triggered_last_7d
            ),
        });
    }
    if failed_login_attempts_last_24h >= thr.saturating_mul(3).max(1) {
        alerts.push(SecurityAlert {
            severity: "critical".to_string(),
            code: "failed_login_flood".to_string(),
            message: format!(
                "{} failed sign-in attempts in 24h (threshold × 3). Possible credential stuffing.",
                failed_login_attempts_last_24h
            ),
        });
    } else if failed_login_attempts_last_24h >= thr.saturating_mul(2).max(1) {
        alerts.push(SecurityAlert {
            severity: "warning".to_string(),
            code: "elevated_failed_logins".to_string(),
            message: format!(
                "{} failed sign-in attempts in the last 24 hours.",
                failed_login_attempts_last_24h
            ),
        });
    }
    if let Some(msg) = detect_policy_weakening(&conn) {
        alerts.push(SecurityAlert {
            severity: "warning".to_string(),
            code: "policy_weakened".to_string(),
            message: msg,
        });
    }
    alerts.extend(collect_privilege_escalation_alerts(&conn));

    Ok(SecurityDashboardMetrics {
        active_session_count,
        session_started_rfc3339,
        failed_login_attempts_last_24h,
        lockouts_triggered_last_7d,
        last_password_changed_rfc3339,
        policy_version,
        password_history_depth,
        warnings,
        alerts,
    })
}

#[tauri::command]
pub fn get_active_desktop_sessions(
    caller_user_id: String,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<Vec<DesktopSessionInfo>, String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_SESSION_READ)?;
    Ok(session.read_session().into_iter().collect::<Vec<_>>())
}

#[tauri::command]
pub fn get_security_trend_series(
    caller_user_id: String,
    days: Option<i64>,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<Vec<SecurityTrendDay>, String> {
    session.require_permission(&db, caller_user_id.trim(), PERM_SECURITY_SESSION_READ)?;
    let n = days.unwrap_or(14).clamp(1, 90);
    let conn = db.db.lock().map_err(|e| e.to_string())?;

    let end = chrono::Utc::now().date_naive();
    let mut days_order: Vec<String> = Vec::new();
    let mut counts: std::collections::HashMap<String, (i64, i64, i64)> =
        std::collections::HashMap::new();
    for i in (0..n).rev() {
        let d = end - chrono::Duration::days(i);
        let key = d.format("%Y-%m-%d").to_string();
        days_order.push(key.clone());
        counts.insert(key, (0, 0, 0));
    }

    let mut merge_sql = |sql: &str, slot: usize| -> Result<(), String> {
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            let (day, c) = r.map_err(|e| e.to_string())?;
            if let Some(t) = counts.get_mut(&day) {
                match slot {
                    0 => t.0 = c,
                    1 => t.1 = c,
                    2 => t.2 = c,
                    _ => {}
                }
            }
        }
        Ok(())
    };

    let sql_fail = format!(
        "SELECT date(attempted_at) as d, COUNT(*) FROM auth_failed_attempts \
         WHERE date(attempted_at) >= date('now', '-{n} days') \
         GROUP BY date(attempted_at)"
    );
    merge_sql(&sql_fail, 0)?;

    let sql_lock = format!(
        "SELECT date(timestamp) as d, COUNT(*) FROM user_activity_audit_logs \
         WHERE action_name = 'auth.lockout_triggered' \
         AND date(timestamp) >= date('now', '-{n} days') \
         GROUP BY date(timestamp)"
    );
    merge_sql(&sql_lock, 1)?;

    let sql_pw = format!(
        "SELECT date(timestamp) as d, COUNT(*) FROM user_activity_audit_logs \
         WHERE action_name = 'auth.password_changed' AND status = 'success' \
         AND date(timestamp) >= date('now', '-{n} days') \
         GROUP BY date(timestamp)"
    );
    merge_sql(&sql_pw, 2)?;

    let out: Vec<SecurityTrendDay> = days_order
        .into_iter()
        .map(|day| {
            let (failed_logins, lockouts, password_changes) =
                counts.get(&day).copied().unwrap_or((0, 0, 0));
            SecurityTrendDay {
                day,
                failed_logins,
                lockouts,
                password_changes,
            }
        })
        .collect();
    Ok(out)
}

fn role_elevation_rank(role_str: &str) -> i32 {
    match Role::from_db_str(role_str) {
        Some(Role::Viewer) => 0,
        Some(Role::Operator) => 1,
        Some(Role::Manager) => 2,
        Some(Role::Administrator) => 3,
        None => -1,
    }
}

fn policy_is_weaker(new: &SecurityPolicy, old: &SecurityPolicy) -> bool {
    new.lockout_threshold > old.lockout_threshold
        || new.lockout_window_minutes > old.lockout_window_minutes
        || new.lockout_duration_minutes < old.lockout_duration_minutes
        || new.idle_timeout_minutes > old.idle_timeout_minutes
}

fn detect_policy_weakening(conn: &rusqlite::Connection) -> Option<String> {
    let mut stmt = conn
        .prepare("SELECT policy_json FROM security_policy_versions ORDER BY version DESC LIMIT 2")
        .ok()?;
    let rows: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .ok()?
        .filter_map(|r| r.ok())
        .collect();
    if rows.len() < 2 {
        return None;
    }
    let new_p: SecurityPolicy = serde_json::from_str(&rows[0]).ok()?;
    let old_p: SecurityPolicy = serde_json::from_str(&rows[1]).ok()?;
    if policy_is_weaker(&new_p, &old_p) {
        Some(
            "The latest security policy version relaxes lockout thresholds, shortens lock duration, or lengthens idle timeout versus the prior version."
                .to_string(),
        )
    } else {
        None
    }
}

fn collect_privilege_escalation_alerts(conn: &rusqlite::Connection) -> Vec<SecurityAlert> {
    let mut out: Vec<SecurityAlert> = Vec::new();
    let Ok(mut stmt) = conn.prepare(
        "SELECT details_json, timestamp FROM user_activity_audit_logs \
         WHERE action_name = 'security.user_role_updated' \
         AND datetime(timestamp) >= datetime('now', '-48 hours') \
         ORDER BY timestamp DESC LIMIT 100",
    ) else {
        return out;
    };
    let rows = match stmt.query_map([], |row| {
        Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(r) => r,
        Err(_) => return out,
    };
    for row in rows {
        let Ok((detail_opt, ts)) = row else {
            continue;
        };
        let Some(detail) = detail_opt else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&detail) else {
            continue;
        };
        let Some(before) = v
            .get("before")
            .and_then(|b| b.get("role"))
            .and_then(|x| x.as_str())
        else {
            continue;
        };
        let Some(after) = v
            .get("after")
            .and_then(|b| b.get("role"))
            .and_then(|x| x.as_str())
        else {
            continue;
        };
        let br = role_elevation_rank(before);
        let ar = role_elevation_rank(after);
        if ar > br && br >= 0 && ar >= 0 {
            let rid = v
                .get("roleId")
                .and_then(|x| x.as_i64())
                .map(|i| i.to_string())
                .unwrap_or_else(|| "?".to_string());
            out.push(SecurityAlert {
                severity: "warning".to_string(),
                code: "permission_drift_escalation".to_string(),
                message: format!(
                    "Role elevation ({before} → {after}) on assignment id {rid} at {ts}. Confirm this was intentional."
                ),
            });
            if out.len() >= 5 {
                break;
            }
        }
    }
    out
}

fn policy_code(err: &PasswordPolicyError) -> &'static str {
    match err {
        PasswordPolicyError::TooShort => "too_short",
        PasswordPolicyError::MissingUppercase => "missing_uppercase",
        PasswordPolicyError::MissingLowercase => "missing_lowercase",
        PasswordPolicyError::MissingDigit => "missing_digit",
        PasswordPolicyError::MissingSymbol => "missing_symbol",
        PasswordPolicyError::ContainsWhitespace => "contains_whitespace",
    }
}
