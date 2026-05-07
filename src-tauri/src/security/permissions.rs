//! Canonical Role and Permission catalog. Single source of truth for backend RBAC.
//!
//! Every Tauri command that mutates state should gate on a [`Permission`] via
//! [`role_has`] or [`super::ensure_command_permission`]. The TypeScript mirror lives in
//! `src/lib/permissions.ts` and is asserted against [`role_permissions_snapshot`] by tests.

use std::fmt;

/// Canonical roles. Legacy strings (`admin`, `db_manager`, `user`) are accepted as
/// aliases by [`Role::from_db_str`] and migrated by `migrations::normalize_user_roles_canonical`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Role {
    Administrator,
    Manager,
    Operator,
    Viewer,
}

impl Role {
    pub const ALL: [Role; 4] = [
        Role::Administrator,
        Role::Manager,
        Role::Operator,
        Role::Viewer,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Administrator => "administrator",
            Role::Manager => "manager",
            Role::Operator => "operator",
            Role::Viewer => "viewer",
        }
    }

    /// Parses a stored role string (canonical or legacy alias). Whitespace and
    /// case are normalized; returns `None` for unknown values.
    pub fn from_db_str(s: &str) -> Option<Role> {
        let normalized: String = s
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_lowercase();
        match normalized.as_str() {
            "administrator" | "admin" => Some(Role::Administrator),
            "manager" | "db_manager" | "dbmanager" => Some(Role::Manager),
            "operator" | "user" => Some(Role::Operator),
            "viewer" | "readonly" | "read_only" => Some(Role::Viewer),
            _ => None,
        }
    }
}

impl fmt::Display for Role {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Granular permissions used by IPC gating and the Frontend `RequirePermission`
/// guard. Keep keys stable — they are exposed to the UI by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Permission {
    DataRead,
    DataWrite,
    DataDelete,
    BackupCreate,
    BackupRestore,
    BackupSchedule,
    BackupSettings,
    AuditView,
    RecycleBinView,
    RecycleBinRestore,
    RecycleBinPurge,
    AdminActivityLog,
    AdminUserActivity,
    AdminSystemHealth,
    AdminSystemTools,
    AutomationView,
    AutomationMutate,
    AutomationOpsCenter,
    AutomationSystemAgent,
    RoleRead,
    RoleWrite,
    RoleBootstrap,
    SecurityChangePassword,
    SecuritySessionRead,
    SecurityLockoutManage,
}

impl Permission {
    pub const ALL: [Permission; 25] = [
        Permission::DataRead,
        Permission::DataWrite,
        Permission::DataDelete,
        Permission::BackupCreate,
        Permission::BackupRestore,
        Permission::BackupSchedule,
        Permission::BackupSettings,
        Permission::AuditView,
        Permission::RecycleBinView,
        Permission::RecycleBinRestore,
        Permission::RecycleBinPurge,
        Permission::AdminActivityLog,
        Permission::AdminUserActivity,
        Permission::AdminSystemHealth,
        Permission::AdminSystemTools,
        Permission::AutomationView,
        Permission::AutomationMutate,
        Permission::AutomationOpsCenter,
        Permission::AutomationSystemAgent,
        Permission::RoleRead,
        Permission::RoleWrite,
        Permission::RoleBootstrap,
        Permission::SecurityChangePassword,
        Permission::SecuritySessionRead,
        Permission::SecurityLockoutManage,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Permission::DataRead => "data.read",
            Permission::DataWrite => "data.write",
            Permission::DataDelete => "data.delete",
            Permission::BackupCreate => "backup.create",
            Permission::BackupRestore => "backup.restore",
            Permission::BackupSchedule => "backup.schedule",
            Permission::BackupSettings => "backup.settings",
            Permission::AuditView => "audit.view",
            Permission::RecycleBinView => "recycle_bin.view",
            Permission::RecycleBinRestore => "recycle_bin.restore",
            Permission::RecycleBinPurge => "recycle_bin.purge",
            Permission::AdminActivityLog => "admin.activity_log",
            Permission::AdminUserActivity => "admin.user_activity",
            Permission::AdminSystemHealth => "admin.system_health",
            Permission::AdminSystemTools => "admin.system_tools",
            Permission::AutomationView => "automation.view",
            Permission::AutomationMutate => "automation.mutate",
            Permission::AutomationOpsCenter => "automation.ops_center",
            Permission::AutomationSystemAgent => "automation.system_agent",
            Permission::RoleRead => "role.read",
            Permission::RoleWrite => "role.write",
            Permission::RoleBootstrap => "role.bootstrap",
            Permission::SecurityChangePassword => "security.change_password",
            Permission::SecuritySessionRead => "security.session_read",
            Permission::SecurityLockoutManage => "security.lockout_manage",
        }
    }

    /// Parses a permission key (must match [`Self::as_str`]). Legacy aliases that
    /// existed before this module are mapped here so older callers continue to work.
    pub fn from_str(s: &str) -> Option<Permission> {
        match s.trim() {
            "data.read" | "data.browse" => Some(Permission::DataRead),
            "data.write" | "data.edit" => Some(Permission::DataWrite),
            "data.delete" => Some(Permission::DataDelete),
            "backup.create" => Some(Permission::BackupCreate),
            "backup.restore" => Some(Permission::BackupRestore),
            "backup.schedule" => Some(Permission::BackupSchedule),
            "backup.settings" | "settings.manage" => Some(Permission::BackupSettings),
            "audit.view" => Some(Permission::AuditView),
            "recycle_bin.view" => Some(Permission::RecycleBinView),
            "recycle_bin.restore" => Some(Permission::RecycleBinRestore),
            "recycle_bin.purge" => Some(Permission::RecycleBinPurge),
            "admin.activity_log" => Some(Permission::AdminActivityLog),
            "admin.user_activity" => Some(Permission::AdminUserActivity),
            "admin.system_health" => Some(Permission::AdminSystemHealth),
            "admin.system_tools" => Some(Permission::AdminSystemTools),
            "automation.view" => Some(Permission::AutomationView),
            "automation.mutate" => Some(Permission::AutomationMutate),
            "automation.ops_center" => Some(Permission::AutomationOpsCenter),
            "automation.system_agent" => Some(Permission::AutomationSystemAgent),
            "role.read" | "user.manage" => Some(Permission::RoleRead),
            "role.write" => Some(Permission::RoleWrite),
            "role.bootstrap" => Some(Permission::RoleBootstrap),
            "security.change_password" => Some(Permission::SecurityChangePassword),
            "security.session_read" => Some(Permission::SecuritySessionRead),
            "security.lockout_manage" => Some(Permission::SecurityLockoutManage),
            _ => None,
        }
    }
}

impl fmt::Display for Permission {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Authoritative role -> permission matrix. Administrator implicitly bypasses
/// every check via [`role_has`].
pub fn role_has(role: Role, perm: Permission) -> bool {
    use Permission as P;
    use Role as R;
    if matches!(role, R::Administrator) {
        return true;
    }
    match role {
        R::Administrator => true,
        R::Manager => matches!(
            perm,
            P::DataRead
                | P::DataWrite
                | P::DataDelete
                | P::BackupCreate
                | P::BackupRestore
                | P::BackupSchedule
                | P::BackupSettings
                | P::AuditView
                | P::RecycleBinView
                | P::RecycleBinRestore
                | P::AutomationView
                | P::AutomationMutate
                | P::AutomationOpsCenter
                | P::AutomationSystemAgent
                | P::SecuritySessionRead
        ),
        R::Operator => matches!(
            perm,
            P::DataRead | P::DataWrite | P::RecycleBinView
        ),
        R::Viewer => matches!(
            perm,
            P::DataRead | P::AuditView | P::RecycleBinView | P::AutomationView
        ),
    }
}

/// String-based helper that accepts canonical or legacy role/permission aliases
/// and applies the canonical RBAC matrix.
#[cfg_attr(not(test), allow(dead_code))]
pub fn role_has_permission_str(role: &str, permission: &str) -> bool {
    let Some(parsed_role) = Role::from_db_str(role) else {
        return false;
    };
    let Some(parsed_perm) = Permission::from_str(permission) else {
        return false;
    };
    role_has(parsed_role, parsed_perm)
}

/// Permissions granted to `role`, in [`Permission::ALL`] order.
pub fn permissions_for(role: Role) -> Vec<Permission> {
    Permission::ALL
        .iter()
        .copied()
        .filter(|p| role_has(role, *p))
        .collect()
}

/// Stable [(role_str, [permission_str, ...])] snapshot used by the frontend
/// `permissions.parity.test.ts` to detect drift between Rust and TypeScript.
pub fn role_permissions_snapshot() -> Vec<(&'static str, Vec<&'static str>)> {
    Role::ALL
        .iter()
        .map(|role| {
            (
                role.as_str(),
                permissions_for(*role)
                    .into_iter()
                    .map(|p| p.as_str())
                    .collect::<Vec<_>>(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_has_all_permissions() {
        for p in Permission::ALL {
            assert!(role_has(Role::Administrator, p), "admin missing {p}");
        }
    }

    #[test]
    fn viewer_cannot_write() {
        assert!(role_has(Role::Viewer, Permission::DataRead));
        assert!(!role_has(Role::Viewer, Permission::DataWrite));
        assert!(!role_has(Role::Viewer, Permission::DataDelete));
    }

    #[test]
    fn manager_cannot_manage_roles() {
        assert!(!role_has(Role::Manager, Permission::RoleWrite));
        assert!(!role_has(Role::Manager, Permission::RoleBootstrap));
        assert!(!role_has(
            Role::Manager,
            Permission::SecurityChangePassword
        ));
    }

    #[test]
    fn role_aliases_resolve() {
        assert_eq!(Role::from_db_str("admin"), Some(Role::Administrator));
        assert_eq!(Role::from_db_str("ADMIN"), Some(Role::Administrator));
        assert_eq!(Role::from_db_str("Administrator"), Some(Role::Administrator));
        assert_eq!(Role::from_db_str("db_manager"), Some(Role::Manager));
        assert_eq!(Role::from_db_str("Manager"), Some(Role::Manager));
        assert_eq!(Role::from_db_str(" user "), Some(Role::Operator));
        assert_eq!(Role::from_db_str("operator"), Some(Role::Operator));
        assert_eq!(Role::from_db_str("viewer"), Some(Role::Viewer));
        assert_eq!(Role::from_db_str("nope"), None);
    }

    #[test]
    fn legacy_permission_aliases_resolve() {
        assert_eq!(
            Permission::from_str("data.browse"),
            Some(Permission::DataRead)
        );
        assert_eq!(
            Permission::from_str("data.edit"),
            Some(Permission::DataWrite)
        );
        assert_eq!(
            Permission::from_str("user.manage"),
            Some(Permission::RoleRead)
        );
    }

    #[test]
    fn role_permission_string_helper_accepts_aliases() {
        assert!(role_has_permission_str("admin", "settings.manage"));
        assert!(role_has_permission_str("administrator", "settings.manage"));
        assert!(role_has_permission_str("db_manager", "backup.settings"));
        assert!(role_has_permission_str("manager", "backup.create"));
        assert!(role_has_permission_str("user", "data.edit"));
        assert!(role_has_permission_str("operator", "data.write"));
        assert!(role_has_permission_str("viewer", "data.browse"));
        assert!(!role_has_permission_str("viewer", "data.delete"));
    }

    #[test]
    fn snapshot_is_stable_size() {
        let snap = role_permissions_snapshot();
        assert_eq!(snap.len(), Role::ALL.len());
        let admin = snap
            .iter()
            .find(|(r, _)| *r == "administrator")
            .expect("admin row");
        assert_eq!(admin.1.len(), Permission::ALL.len());
    }

    /// Exact-match parity with `src/lib/permissions.test.ts::EXPECTED_RUST_SNAPSHOT`.
    /// If you change either file update both — drift is rejected here.
    #[test]
    fn snapshot_matches_typescript_mirror() {
        let expected: Vec<(&'static str, Vec<&'static str>)> = vec![
            (
                "administrator",
                Permission::ALL.iter().map(|p| p.as_str()).collect(),
            ),
            (
                "manager",
                vec![
                    "data.read",
                    "data.write",
                    "data.delete",
                    "backup.create",
                    "backup.restore",
                    "backup.schedule",
                    "backup.settings",
                    "audit.view",
                    "recycle_bin.view",
                    "recycle_bin.restore",
                    "automation.view",
                    "automation.mutate",
                    "automation.ops_center",
                    "automation.system_agent",
                    "security.session_read",
                ],
            ),
            (
                "operator",
                vec!["data.read", "data.write", "recycle_bin.view"],
            ),
            (
                "viewer",
                vec![
                    "data.read",
                    "audit.view",
                    "recycle_bin.view",
                    "automation.view",
                ],
            ),
        ];
        assert_eq!(role_permissions_snapshot(), expected);
    }
}
