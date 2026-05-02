//! Desktop login session held in-process (validated on each `get_desktop_session`).
//!
//! Each successful login issues a new `session_id`; the role is loaded from
//! `user_roles` and re-checked on every session read. Verification supports
//! Argon2id PHC strings and falls back to bcrypt for the compile-time admin
//! hash. Failed attempts feed [`crate::security::lockout`] and trigger an
//! account lock on the configured threshold. Sessions also enforce an idle
//! timeout in addition to the absolute TTL.

use crate::correlation;
use crate::db::DbState;
use crate::ipc_error::IpcError;
use crate::recovery_mode::RecoveryModeState;
use crate::security::credentials::{active_admin_hash, verify_password};
use crate::security::lockout::{LockoutState, SecurityPolicy};
use crate::security::{resolve_role_strict, Permission, Role};
use crate::services::user_activity_audit::{log_activity, log_activity_with_severity, AuditSeverity};
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

pub(crate) const DEFAULT_ADMIN_USER_ID: &str = "admin-001";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSessionInfo {
    pub user_id: String,
    pub username: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub expires_at_rfc3339: String,
    /// Opaque id rotated on every successful login; not a secret but useful for tracing.
    pub session_id: String,
    pub last_activity_rfc3339: String,
    pub idle_timeout_minutes: i64,
    /// When this session was established (successful login).
    pub session_started_rfc3339: String,
    /// Permission keys (matches `Permission::as_str`) granted by the active role.
    pub permissions: Vec<String>,
}

struct DesktopSessionInner {
    user_id: String,
    username: String,
    name: String,
    email: String,
    role: String,
    expires_at: DateTime<Utc>,
    session_id: String,
    last_activity: DateTime<Utc>,
    idle_timeout_minutes: i64,
    session_started_at: DateTime<Utc>,
}

pub struct DesktopSessionState {
    inner: Mutex<Option<DesktopSessionInner>>,
    lockout: LockoutState,
}

impl Default for DesktopSessionState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
            lockout: LockoutState::new(),
        }
    }
}

fn compiled_admin_username() -> &'static str {
    env!("IMPORT_MANAGER_ADMIN_USERNAME")
}

fn compiled_admin_password_hash() -> &'static str {
    env!("IMPORT_MANAGER_ADMIN_PASSWORD_HASH")
}

fn session_ttl(remember_me: bool) -> Duration {
    if remember_me {
        Duration::days(30)
    } else {
        Duration::hours(12)
    }
}

fn roles_equivalent(a: &str, b: &str) -> bool {
    fn norm(s: &str) -> String {
        s.chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_lowercase()
    }
    if norm(a) == norm(b) {
        return true;
    }
    Role::from_db_str(a) == Role::from_db_str(b) && Role::from_db_str(a).is_some()
}

fn permissions_for_role_str(role: &str) -> Vec<String> {
    Role::from_db_str(role)
        .map(|r| {
            crate::security::permissions_for(r)
                .into_iter()
                .map(|p| p.as_str().to_string())
                .collect()
        })
        .unwrap_or_default()
}

fn map_inner(inner: &DesktopSessionInner) -> DesktopSessionInfo {
    DesktopSessionInfo {
        user_id: inner.user_id.clone(),
        username: inner.username.clone(),
        name: inner.name.clone(),
        email: inner.email.clone(),
        role: inner.role.clone(),
        expires_at_rfc3339: inner.expires_at.to_rfc3339(),
        session_id: inner.session_id.clone(),
        last_activity_rfc3339: inner.last_activity.to_rfc3339(),
        idle_timeout_minutes: inner.idle_timeout_minutes,
        session_started_rfc3339: inner.session_started_at.to_rfc3339(),
        permissions: permissions_for_role_str(&inner.role),
    }
}

impl DesktopSessionState {
    pub fn lockout(&self) -> &LockoutState {
        &self.lockout
    }

    /// Validates TTL, idle timeout, and that the active session user matches
    /// `caller_user_id` (spoof-resistant IPC). Bumps the last-activity stamp
    /// when the call succeeds.
    pub(crate) fn assert_caller_user(&self, caller_user_id: &str) -> Result<(), String> {
        let now = Utc::now();
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        let Some(inner) = guard.as_mut() else {
            return Err("Not authenticated.".to_string());
        };
        if inner.expires_at < now {
            let sid = inner.session_id.clone();
            *guard = None;
            log::info!(
                target: "import_manager::auth",
                "event=session_expired_cleared session_id={}",
                sid
            );
            return Err("Session expired. Sign in again.".to_string());
        }
        let idle_minutes = inner.idle_timeout_minutes.max(1);
        if now - inner.last_activity > Duration::minutes(idle_minutes) {
            let sid = inner.session_id.clone();
            *guard = None;
            log::info!(
                target: "import_manager::auth",
                "event=session_idle_timeout session_id={} idle_minutes={}",
                sid,
                idle_minutes
            );
            return Err("Session idle timeout. Sign in again.".to_string());
        }
        if inner.user_id != caller_user_id.trim() {
            return Err("Session does not match this user.".to_string());
        }
        inner.last_activity = now;
        Ok(())
    }

    /// Caller must match session and resolve to the canonical [`Role::Administrator`].
    pub(crate) fn assert_admin_caller(&self, db: &DbState, caller_user_id: &str) -> Result<(), String> {
        self.assert_caller_user(caller_user_id)?;
        let conn = db.db.lock().map_err(|e| e.to_string())?;
        let role = resolve_role_strict(&conn, caller_user_id.trim())?;
        match Role::from_db_str(&role) {
            Some(Role::Administrator) => Ok(()),
            _ => Err("Admin access required.".to_string()),
        }
    }

    /// Shared permission gate: caller is authenticated, session matches, and
    /// the resolved role grants `permission`.
    pub(crate) fn require_permission(
        &self,
        db: &DbState,
        caller_user_id: &str,
        permission: Permission,
    ) -> Result<(), String> {
        self.assert_caller_user(caller_user_id)?;
        let conn = db.db.lock().map_err(|e| e.to_string())?;
        let role_str = resolve_role_strict(&conn, caller_user_id.trim())?;
        let Some(role) = Role::from_db_str(&role_str) else {
            return Err(format!(
                "Permission denied: role '{}' is not recognized.",
                role_str
            ));
        };
        if crate::security::role_has(role, permission) {
            Ok(())
        } else {
            log::warn!(
                target: "import_manager::authz",
                "event=authz.denied stage=session reason=insufficient_permission caller={} role={} permission={}",
                caller_user_id.trim(),
                role,
                permission.as_str()
            );
            Err(format!(
                "Permission denied: '{}' requires '{}'.",
                caller_user_id.trim(),
                permission.as_str()
            ))
        }
    }

    pub(crate) fn read_session(&self) -> Option<DesktopSessionInfo> {
        let guard = self.inner.lock().ok()?;
        guard.as_ref().map(map_inner)
    }
}

/// Verifies credentials, enforces lockout policy, and opens a session with a
/// new `session_id` and DB-backed role.
#[tauri::command]
pub fn authenticate_desktop(
    username: String,
    password: String,
    remember_me: bool,
    state: State<DesktopSessionState>,
    db_state: State<DbState>,
    recovery: State<RecoveryModeState>,
) -> Result<DesktopSessionInfo, IpcError> {
    let cid = correlation::new_id();
    log::info!(
        target: "import_manager::auth",
        "event=authenticate_desktop_attempt correlation_id={}",
        cid,
    );

    let trimmed_user = username.trim().to_string();
    let lock_account_id = DEFAULT_ADMIN_USER_ID;

    let policy = {
        let conn = db_state
            .db
            .lock()
            .map_err(|e| IpcError::new("internal", e.to_string()).with_correlation_id(&cid))?;
        let policy = SecurityPolicy::load(&conn);
        if !recovery.is_active() {
            if let Err(seconds_until_unlock) =
                state.lockout.check_locked(&conn, lock_account_id, &policy)
            {
                let minutes = (seconds_until_unlock + 59) / 60;
                log::warn!(
                    target: "import_manager::auth",
                    "event=auth.locked_attempt user={} seconds_until_unlock={}",
                    lock_account_id,
                    seconds_until_unlock
                );
                return Err(IpcError::new(
                    "auth_locked",
                    format!(
                        "Account temporarily locked due to repeated failed attempts. Try again in {} minute(s).",
                        minutes.max(1)
                    ),
                )
                .with_correlation_id(&cid)
                .with_details(seconds_until_unlock.to_string()));
            }
        } else {
            log::warn!(
                target: "import_manager::recovery",
                "event=auth.lockout_bypassed_for_recovery_login user={}",
                lock_account_id
            );
        }
        policy
    };

    let audit_fail = |reason: &str, status: &str| {
        if let Ok(conn) = db_state.db.lock() {
            let detail = serde_json::json!({
                "correlationId": cid,
                "reason": reason,
            })
            .to_string();
            let severity = if status == "failure" {
                AuditSeverity::Warning
            } else {
                AuditSeverity::Info
            };
            log_activity_with_severity(
                &conn,
                None,
                "auth.desktop_login",
                None,
                None,
                Some(&detail),
                status,
                severity,
            );
        }
    };

    let record_failure_with_reason = |reason: &str| {
        if let Ok(conn) = db_state.db.lock() {
            state
                .lockout
                .record_failure(&conn, lock_account_id, reason, None, &policy);
        }
    };

    let expected_user = compiled_admin_username();
    if trimmed_user != expected_user.trim() {
        audit_fail("invalid_username", "failure");
        record_failure_with_reason("invalid_username");
        return Err(
            IpcError::new("auth_failed", "Invalid username or password").with_correlation_id(&cid),
        );
    }

    let active_hash = {
        let conn = db_state
            .db
            .lock()
            .map_err(|e| IpcError::new("internal", e.to_string()).with_correlation_id(&cid))?;
        active_admin_hash(&conn, compiled_admin_password_hash())
    };

    if active_hash.is_empty() {
        audit_fail("missing_admin_hash", "failure");
        return Err(IpcError::new(
            "auth_config",
            "This release was built without IMPORT_MANAGER_ADMIN_PASSWORD_HASH; login is disabled.",
        )
        .with_correlation_id(&cid));
    }

    let ok = verify_password(&password, &active_hash).map_err(|e| {
        IpcError::new("auth_internal", format!("password verification: {e}"))
            .with_correlation_id(&cid)
    })?;
    if !ok {
        audit_fail("invalid_password", "failure");
        record_failure_with_reason("invalid_password");
        return Err(
            IpcError::new("auth_failed", "Invalid username or password").with_correlation_id(&cid),
        );
    }

    let conn = db_state
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()).with_correlation_id(&cid))?;
    let role_str = match resolve_role_strict(&conn, DEFAULT_ADMIN_USER_ID) {
        Ok(r) => r,
        Err(e) => {
            audit_fail("role_not_provisioned", "failure");
            return Err(IpcError::new(
                "auth_config",
                format!("Account not provisioned in user_roles: {e}"),
            )
            .with_correlation_id(&cid));
        }
    };
    if Role::from_db_str(&role_str).is_none() {
        audit_fail("role_unknown", "failure");
        return Err(IpcError::new(
            "auth_config",
            format!("Account role '{}' is not recognized.", role_str),
        )
        .with_correlation_id(&cid));
    }

    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let expires_at = now + session_ttl(remember_me);
    let inner = DesktopSessionInner {
        user_id: DEFAULT_ADMIN_USER_ID.to_string(),
        username: trimmed_user.clone(),
        name: "Administrator".to_string(),
        email: "admin@importmanager.com".to_string(),
        role: role_str,
        expires_at,
        session_id: session_id.clone(),
        last_activity: now,
        idle_timeout_minutes: policy.idle_timeout_minutes,
        session_started_at: now,
    };
    let detail_ok = serde_json::json!({
        "correlationId": cid,
        "sessionId": session_id,
    })
    .to_string();
    log_activity(
        &conn,
        Some(DEFAULT_ADMIN_USER_ID),
        "auth.desktop_login",
        None,
        None,
        Some(&detail_ok),
        "success",
    );
    state.lockout.record_success(&conn, lock_account_id);
    drop(conn);

    let info = map_inner(&inner);
    let mut guard = state
        .inner
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()).with_correlation_id(&cid))?;
    *guard = Some(inner);
    log::info!(
        target: "import_manager::auth",
        "event=authenticate_desktop_ok correlation_id={} session_id={}",
        cid,
        info.session_id
    );
    Ok(info)
}

#[tauri::command]
pub fn get_desktop_session(
    session: State<DesktopSessionState>,
    db: State<DbState>,
) -> Result<Option<DesktopSessionInfo>, String> {
    let now = Utc::now();
    let mut guard = session.inner.lock().map_err(|e| e.to_string())?;
    let Some(inner) = guard.as_mut() else {
        return Ok(None);
    };
    if inner.expires_at < now {
        log::info!(
            target: "import_manager::auth",
            "event=session_expired session_id={}",
            inner.session_id
        );
        *guard = None;
        return Ok(None);
    }
    let idle_minutes = inner.idle_timeout_minutes.max(1);
    if now - inner.last_activity > Duration::minutes(idle_minutes) {
        log::info!(
            target: "import_manager::auth",
            "event=session_idle_timeout session_id={} idle_minutes={}",
            inner.session_id,
            idle_minutes
        );
        *guard = None;
        return Ok(None);
    }

    let conn = db.db.lock().map_err(|e| e.to_string())?;
    let db_role = match resolve_role_strict(&conn, &inner.user_id) {
        Ok(r) => r,
        Err(e) => {
            log::warn!(
                target: "import_manager::auth",
                "event=session_role_missing session_id={} err={}",
                inner.session_id,
                e
            );
            *guard = None;
            return Ok(None);
        }
    };

    if !roles_equivalent(&db_role, &inner.role) {
        log::warn!(
            target: "import_manager::auth",
            "event=session_role_mismatch session_id={} session_role={} db_role={}",
            inner.session_id,
            inner.role,
            db_role
        );
        let detail = serde_json::json!({
            "sessionId": inner.session_id,
            "sessionRole": inner.role,
            "dbRole": db_role,
        })
        .to_string();
        log_activity_with_severity(
            &conn,
            Some(&inner.user_id),
            "auth.session_role_mismatch",
            None,
            None,
            Some(&detail),
            "failure",
            AuditSeverity::Security,
        );
        *guard = None;
        return Ok(None);
    }

    if inner.role != db_role {
        inner.role = db_role;
    }
    inner.last_activity = now;

    Ok(Some(map_inner(inner)))
}

/// Ends the active desktop session from the Security Center (admin-initiated).
/// `target_session_id` must match the current session when provided.
#[tauri::command]
pub fn terminate_desktop_session_for_admin(
    caller_user_id: String,
    target_session_id: Option<String>,
    session: State<DesktopSessionState>,
    db_state: State<DbState>,
) -> Result<(), String> {
    session.require_permission(
        &db_state,
        caller_user_id.trim(),
        Permission::SecurityLockoutManage,
    )?;
    let audit = {
        let mut guard = session.inner.lock().map_err(|e| e.to_string())?;
        let Some(inner) = guard.as_ref() else {
            return Err("No active desktop session to terminate.".to_string());
        };
        if let Some(ref sid) = target_session_id {
            let t = sid.trim();
            if !t.is_empty() && t != inner.session_id {
                return Err(
                    "Session id does not match the active desktop session.".to_string(),
                );
            }
        }
        let out = (
            inner.user_id.clone(),
            inner.session_id.clone(),
            inner.username.clone(),
        );
        *guard = None;
        Some(out)
    };

    if let Some((user_for_audit, session_id, username)) = audit {
        if let Ok(conn) = db_state.db.lock() {
            let detail = serde_json::json!({
                "sessionId": session_id,
                "initiatorUserId": caller_user_id.trim(),
                "terminatedUsername": username,
                "reason": "admin_terminate",
            })
            .to_string();
            log_activity_with_severity(
                &conn,
                Some(&user_for_audit),
                "auth.session_terminated",
                None,
                None,
                Some(&detail),
                "success",
                AuditSeverity::Security,
            );
        }
    }
    log::info!(
        target: "import_manager::auth",
        "event=desktop_session_admin_terminate initiator={}",
        caller_user_id.trim()
    );
    Ok(())
}

#[tauri::command]
pub fn clear_desktop_session(
    session: State<DesktopSessionState>,
    db_state: State<DbState>,
) -> Result<(), String> {
    let audit = {
        let mut guard = session.inner.lock().map_err(|e| e.to_string())?;
        let out = guard
            .as_ref()
            .map(|i| (i.user_id.clone(), i.session_id.clone()));
        *guard = None;
        out
    };

    if let Some((user_for_audit, session_id)) = audit {
        if let Ok(conn) = db_state.db.lock() {
            let detail = serde_json::json!({ "sessionId": session_id }).to_string();
            log_activity(
                &conn,
                Some(&user_for_audit),
                "auth.desktop_logout",
                None,
                None,
                Some(&detail),
                "success",
            );
        }
    }
    log::info!(target: "import_manager::auth", "event=desktop_logout");
    Ok(())
}
