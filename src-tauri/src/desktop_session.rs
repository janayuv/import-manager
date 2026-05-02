//! Desktop login session held in-process (validated on each `get_desktop_session`).
//! Each successful login issues a new `session_id`; role is loaded from `user_roles` and re-checked on session read.

use crate::correlation;
use crate::db::DbState;
use crate::ipc_error::IpcError;
use crate::security::resolve_role_strict;
use crate::services::user_activity_audit::log_activity;
use chrono::{Duration, Utc};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

const DEFAULT_ADMIN_USER_ID: &str = "admin-001";

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
}

struct DesktopSessionInner {
    user_id: String,
    username: String,
    name: String,
    email: String,
    role: String,
    expires_at: chrono::DateTime<Utc>,
    session_id: String,
}

pub struct DesktopSessionState {
    inner: Mutex<Option<DesktopSessionInner>>,
}

impl Default for DesktopSessionState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
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
    norm(a) == norm(b)
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
    }
}

impl DesktopSessionState {
    /// Validates TTL and that the active session user matches `caller_user_id` (spoof-resistant IPC).
    pub(crate) fn assert_caller_user(&self, caller_user_id: &str) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        let Some(inner) = guard.as_ref() else {
            return Err("Not authenticated.".to_string());
        };
        if inner.expires_at < Utc::now() {
            let sid = inner.session_id.clone();
            *guard = None;
            log::info!(
                target: "import_manager::auth",
                "event=session_expired_cleared session_id={}",
                sid
            );
            return Err("Session expired. Sign in again.".to_string());
        }
        if inner.user_id != caller_user_id.trim() {
            return Err("Session does not match this user.".to_string());
        }
        Ok(())
    }

    /// Caller must match session and have `admin` in `user_roles`.
    pub(crate) fn assert_admin_caller(&self, db: &DbState, caller_user_id: &str) -> Result<(), String> {
        self.assert_caller_user(caller_user_id)?;
        let conn = db.db.lock().map_err(|e| e.to_string())?;
        let role = resolve_role_strict(&conn, caller_user_id.trim())?;
        let n = role
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_lowercase();
        if !n.contains("admin") {
            return Err("Admin access required.".to_string());
        }
        Ok(())
    }
}

/// Verifies credentials against compile-time hash and opens a session with a new `session_id` and DB-backed role.
#[tauri::command]
pub fn authenticate_desktop(
    username: String,
    password: String,
    remember_me: bool,
    state: State<DesktopSessionState>,
    db_state: State<DbState>,
) -> Result<DesktopSessionInfo, IpcError> {
    let cid = correlation::new_id();
    log::info!(
        target: "import_manager::auth",
        "event=authenticate_desktop_attempt correlation_id={}",
        cid,
    );

    let audit_fail = |reason: &str| {
        if let Ok(conn) = db_state.db.lock() {
            let detail = serde_json::json!({
                "correlationId": cid,
                "reason": reason,
            })
            .to_string();
            log_activity(
                &conn,
                None,
                "auth.desktop_login",
                None,
                None,
                Some(&detail),
                "failure",
            );
        }
    };

    let hash = compiled_admin_password_hash();
    if hash.is_empty() {
        return Err(
            IpcError::new(
                "auth_config",
                "This release was built without IMPORT_MANAGER_ADMIN_PASSWORD_HASH; login is disabled.",
            )
            .with_correlation_id(&cid),
        );
    }

    let expected_user = compiled_admin_username();
    if username.trim() != expected_user.trim() {
        audit_fail("invalid_username");
        return Err(
            IpcError::new("auth_failed", "Invalid username or password").with_correlation_id(&cid),
        );
    }

    let ok = bcrypt::verify(password, hash).map_err(|e| {
        IpcError::new("auth_internal", format!("password verification: {e}")).with_correlation_id(&cid)
    })?;
    if !ok {
        audit_fail("invalid_password");
        return Err(
            IpcError::new("auth_failed", "Invalid username or password").with_correlation_id(&cid),
        );
    }

    let conn = db_state
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()).with_correlation_id(&cid))?;
    let role = match resolve_role_strict(&conn, DEFAULT_ADMIN_USER_ID) {
        Ok(r) => r,
        Err(e) => {
            audit_fail("role_not_provisioned");
            return Err(
                IpcError::new(
                    "auth_config",
                    format!("Account not provisioned in user_roles: {e}"),
                )
                .with_correlation_id(&cid),
            );
        }
    };

    let session_id = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + session_ttl(remember_me);
    let inner = DesktopSessionInner {
        user_id: DEFAULT_ADMIN_USER_ID.to_string(),
        username: username.trim().to_string(),
        name: "Administrator".to_string(),
        email: "admin@importmanager.com".to_string(),
        role,
        expires_at,
        session_id: session_id.clone(),
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
    let mut guard = session.inner.lock().map_err(|e| e.to_string())?;
    let Some(inner) = guard.as_mut() else {
        return Ok(None);
    };
    if inner.expires_at < Utc::now() {
        log::info!(
            target: "import_manager::auth",
            "event=session_expired session_id={}",
            inner.session_id
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
        *guard = None;
        return Ok(None);
    }

    if inner.role != db_role {
        inner.role = db_role;
    }

    Ok(Some(map_inner(inner)))
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
