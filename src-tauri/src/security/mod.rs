//! Shared security helpers (authorization infrastructure).

pub mod actor_role;
pub mod bootstrap;
pub mod credentials;
pub mod ensure_user_roles;
pub mod lockout;
pub mod permissions;
use rusqlite::Connection;

pub(crate) use actor_role::resolve_role_strict;
pub(crate) use bootstrap::{
    bootstrap_first_admin_when_empty, count_admin_roles, ensure_startup_admin_role_when_no_admins,
    insert_recovery_admin_when_no_admins,
};

pub use permissions::{permissions_for, role_has, role_permissions_snapshot, Permission, Role};

/// Centralized command-level RBAC guard for user-invoked IPC commands.
///
/// Caller identity must come from an authenticated session/user context.
/// Special internal actors (e.g. scheduler/system) are intentionally not
/// allowed through this path.
pub fn ensure_command_permission(
    db: &Connection,
    actor_user_id: Option<&str>,
    permission: Permission,
) -> Result<(), String> {
    let Some(actor) = actor_user_id.map(str::trim).filter(|s| !s.is_empty()) else {
        log::warn!(
            target: "import_manager::authz",
            "event=authz.denied stage=validation reason=missing_actor permission={}",
            permission.as_str()
        );
        return Err("Permission denied: missing user context.".to_string());
    };
    if actor.eq_ignore_ascii_case("system") || actor.eq_ignore_ascii_case("scheduler") {
        log::warn!(
            target: "import_manager::authz",
            "event=authz.denied stage=validation reason=reserved_internal_actor actor={} permission={}",
            actor,
            permission.as_str()
        );
        return Err("Permission denied: reserved internal actor.".to_string());
    }
    let _ = db;
    log::info!(
        target: "import_manager::authz",
        "event=authz.allowed stage=validation actor={} mode=single_user permission={}",
        actor,
        permission.as_str()
    );
    Ok(())
}
