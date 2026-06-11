use crate::ipc_error::IpcError;
use crate::security::Permission;
use rusqlite::Connection;

const INTERNAL_ACTORS: [&str; 2] = ["system", "scheduler"];

pub fn guard_user_session(user_id: Option<&str>) -> Result<&str, IpcError> {
    let actor = user_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| IpcError::new("auth_denied", "Missing authenticated user context."))?;
    if INTERNAL_ACTORS
        .iter()
        .any(|reserved| actor.eq_ignore_ascii_case(reserved))
    {
        return Err(IpcError::new(
            "auth_denied",
            "Reserved internal actor cannot be used via IPC.",
        ));
    }
    Ok(actor)
}

pub fn guard_permission(
    db: &Connection,
    user_id: Option<&str>,
    permission: Permission,
) -> Result<(), IpcError> {
    let actor = guard_user_session(user_id)?;
    crate::security::ensure_command_permission(db, Some(actor), permission)
        .map_err(|m| IpcError::new("auth_denied", m))
}

pub fn guard_non_empty_ids(ids: &[String], message: &str) -> Result<(), IpcError> {
    if ids.is_empty() {
        return Err(IpcError::new("validation", message));
    }
    Ok(())
}

pub fn guard_safe_table_name(table: &str) -> Result<(), IpcError> {
    if table.is_empty() || !table.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(IpcError::new("validation", "Invalid table name"));
    }
    Ok(())
}
