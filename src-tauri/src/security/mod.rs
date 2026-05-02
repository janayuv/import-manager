//! Shared security helpers (authorization infrastructure).

pub mod actor_role;
pub mod bootstrap;
pub mod ensure_user_roles;

pub(crate) use actor_role::resolve_role_strict;
pub(crate) use bootstrap::{
    bootstrap_first_admin_when_empty, count_admin_roles, ensure_startup_admin_role_when_no_admins,
    insert_recovery_admin_when_no_admins,
};
