//! Recovery-only commands (gated on [`crate::recovery_mode::RecoveryModeState`]).
//! Requires local operator access to launch the app with `--recovery` or `IMPORT_MANAGER_RECOVERY=1`.

use crate::commands::security::bump_policy_version_record;
use crate::db::DbState;
use crate::desktop_session::{DesktopSessionState, DEFAULT_ADMIN_USER_ID};
use crate::ipc_error::IpcError;
use crate::recovery_mode::RecoveryModeState;
use crate::security::credentials::{
    active_admin_hash, enforce_password_policy, ensure_default_admin_username_if_absent,
    hash_password_argon2id, persist_admin_hash, read_password_history_depth,
};
use crate::security::lockout::SecurityPolicy;
use crate::services::user_activity_audit::{log_activity_with_severity, AuditSeverity};
use rusqlite::params;
use tauri::State;

fn require_recovery_mode(recovery: &RecoveryModeState) -> Result<(), String> {
    if recovery.is_active() {
        Ok(())
    } else {
        Err(
            "Recovery actions are only available in recovery mode (start with --recovery)."
                .to_string(),
        )
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryModeStatus {
    pub active: bool,
    pub activation_hint: String,
}

#[tauri::command]
pub fn is_recovery_mode_active(recovery: State<'_, RecoveryModeState>) -> bool {
    recovery.is_active()
}

#[tauri::command]
pub fn get_recovery_mode_status(recovery: State<'_, RecoveryModeState>) -> RecoveryModeStatus {
    RecoveryModeStatus {
        active: recovery.is_active(),
        activation_hint: "Launch Import Manager with command-line flag --recovery or set environment variable IMPORT_MANAGER_RECOVERY=1. Quit and restart without them for normal operation."
            .to_string(),
    }
}

#[tauri::command]
pub fn recovery_clear_lockout(
    recovery: State<'_, RecoveryModeState>,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    require_recovery_mode(&recovery)?;
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    session.lockout().reset(&conn, DEFAULT_ADMIN_USER_ID);
    let detail = serde_json::json!({
        "targetUserId": DEFAULT_ADMIN_USER_ID,
        "source": "recovery_clear_lockout",
    })
    .to_string();
    log_activity_with_severity(
        &conn,
        None,
        "auth.recovery_lockout_cleared",
        None,
        None,
        Some(&detail),
        "success",
        AuditSeverity::Critical,
    );
    log::warn!(
        target: "import_manager::recovery",
        "event=recovery_lockout_cleared user_id={}",
        DEFAULT_ADMIN_USER_ID
    );
    Ok(())
}

#[tauri::command]
pub fn recovery_reset_security_policy(
    recovery: State<'_, RecoveryModeState>,
    db: State<'_, DbState>,
) -> Result<SecurityPolicy, String> {
    require_recovery_mode(&recovery)?;
    let conn = db.db.lock().map_err(|e| e.to_string())?;
    let policy = SecurityPolicy::default();
    SecurityPolicy::save(&conn, &policy)?;
    let depth = read_password_history_depth(&conn);
    let version = bump_policy_version_record(&conn, "recovery-mode", &policy, depth)?;
    let detail = serde_json::json!({
        "policyVersion": version,
        "source": "recovery_reset_security_policy",
    })
    .to_string();
    log_activity_with_severity(
        &conn,
        None,
        "auth.recovery_security_policy_reset",
        None,
        None,
        Some(&detail),
        "success",
        AuditSeverity::Critical,
    );
    log::warn!(target: "import_manager::recovery", "event=recovery_security_policy_reset version={}", version);
    Ok(policy)
}

#[tauri::command]
pub fn recovery_set_admin_password(
    recovery: State<'_, RecoveryModeState>,
    db: State<'_, DbState>,
    new_password: String,
) -> Result<(), IpcError> {
    require_recovery_mode(&recovery).map_err(|m| IpcError::new("recovery_denied", m))?;
    if let Err(violation) = enforce_password_policy(&new_password) {
        return Err(IpcError::new("password_policy", violation.to_string())
            .with_details("policy_violation"));
    }
    let conn = db
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()))?;
    let prev = active_admin_hash(&conn, "");
    let _ = conn.execute(
        "DELETE FROM auth_password_history WHERE lower(trim(user_id)) = lower(?1)",
        params![DEFAULT_ADMIN_USER_ID],
    );
    let new_hash =
        hash_password_argon2id(&new_password).map_err(|e| IpcError::new("auth_internal", e))?;
    persist_admin_hash(&conn, DEFAULT_ADMIN_USER_ID, &new_hash, Some(prev.as_str()))
        .map_err(|e| IpcError::new("internal", e))?;
    ensure_default_admin_username_if_absent(&conn).map_err(|e| IpcError::new("internal", e))?;
    let detail = serde_json::json!({
        "userId": DEFAULT_ADMIN_USER_ID,
        "algorithm": "argon2id",
        "source": "recovery_set_admin_password",
    })
    .to_string();
    log_activity_with_severity(
        &conn,
        None,
        "auth.recovery_password_set",
        None,
        None,
        Some(&detail),
        "success",
        AuditSeverity::Critical,
    );
    log::warn!(
        target: "import_manager::recovery",
        "event=recovery_password_set user_id={}",
        DEFAULT_ADMIN_USER_ID
    );
    Ok(())
}
