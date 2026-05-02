//! Single controlled paths for creating the **first** administrator.
//! Permission checks must never call into this module.

use rusqlite::{params, Connection, OptionalExtension};
use rusqlite::types::Value;

use super::ensure_user_roles::ensure_user_roles_table;

/// Matches the default admin id from desktop auth (`src/lib/auth.ts`).
pub(crate) const DEFAULT_DESKTOP_ADMIN_USER_ID: &str = "admin-001";

/// Count rows whose role is admin (case-insensitive trim).
pub(crate) fn count_admin_roles(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM user_roles WHERE lower(trim(role)) = 'admin'",
        [],
        |r| r.get(0),
    )
    .map_err(|e| format!("admin role count: {}", e))
}

fn user_role_row_exists(conn: &Connection, user_id: &str) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_roles WHERE user_id = ?1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("user_roles lookup: {}", e))?;
    Ok(n > 0)
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            params![name],
            |r| r.get(0),
        )
        .map_err(|e| format!("sqlite_master: {}", e))?;
    Ok(n > 0)
}

fn pragma_columns_lowercase(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let pragma = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
    let mut stmt = conn.prepare(&pragma).map_err(|e| e.to_string())?;
    let cols = stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name.to_lowercase())
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(cols)
}

fn row_first_cell_as_string(row: &rusqlite::Row) -> rusqlite::Result<String> {
    match row.get::<_, Value>(0)? {
        Value::Null => Ok(String::new()),
        Value::Integer(i) => Ok(i.to_string()),
        Value::Real(f) => Ok(f.to_string()),
        Value::Text(s) => Ok(s),
        Value::Blob(_) => Ok(String::new()),
    }
}

/// If a `users` table exists and declares an admin row, return that row's id. Otherwise `None`.
fn resolve_bootstrap_admin_user_id_from_users_table(
    conn: &Connection,
) -> Result<Option<String>, String> {
    if !table_exists(conn, "users")? {
        return Ok(None);
    }
    let cols = pragma_columns_lowercase(conn, "users")?;
    let id_col = if cols.iter().any(|c| c == "user_id") {
        "user_id"
    } else if cols.iter().any(|c| c == "id") {
        "id"
    } else {
        return Ok(None);
    };

    if cols.iter().any(|c| c == "role") {
        let sql = format!(
            "SELECT {id_col} FROM users WHERE lower(trim(role)) = 'admin' LIMIT 1"
        );
        return conn
            .query_row(sql.as_str(), [], row_first_cell_as_string)
            .optional()
            .map_err(|e| e.to_string())
            .map(|opt| opt.filter(|s| !s.trim().is_empty()));
    }
    if cols.iter().any(|c| c == "is_admin") {
        let sql = format!(
            "SELECT {id_col} FROM users WHERE is_admin IN (1, '1', 'true', 'TRUE') LIMIT 1"
        );
        return conn
            .query_row(sql.as_str(), [], row_first_cell_as_string)
            .optional()
            .map_err(|e| e.to_string())
            .map(|opt| opt.filter(|s| !s.trim().is_empty()));
    }
    Ok(None)
}

/// After migrations: if there is **no** admin in `user_roles`, insert exactly one admin row for the
/// designated bootstrap user. Does not run when any admin row exists; does not update existing roles.
pub(crate) fn ensure_startup_admin_role_when_no_admins(conn: &Connection) -> Result<(), String> {
    ensure_user_roles_table(conn).map_err(|e| format!("startup admin role ensure: {}", e))?;
    if count_admin_roles(conn)? != 0 {
        return Ok(());
    }
    let user_id = resolve_bootstrap_admin_user_id_from_users_table(conn)?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_DESKTOP_ADMIN_USER_ID.to_string());
    let user_id = user_id.trim();
    if user_id.is_empty() {
        log::warn!(
            target: "import_manager::authz",
            "event=authz.startup_admin_bootstrap stage=skip reason=empty_user_id"
        );
        return Ok(());
    }
    if user_role_row_exists(conn, user_id)? {
        log::info!(
            target: "import_manager::authz",
            "event=authz.startup_admin_bootstrap stage=skip reason=user_has_role user_id={}",
            user_id
        );
        return Ok(());
    }
    conn.execute(
        r#"INSERT INTO user_roles (user_id, role, created_at, updated_at)
           VALUES (?1, 'admin', strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))"#,
        params![user_id],
    )
    .map_err(|e| format!("startup admin role insert: {}", e))?;
    let admins_after = count_admin_roles(conn)?;
    if admins_after < 1 {
        return Err(format!(
            "startup admin role invariant failed: expected at least one admin, found {}",
            admins_after
        ));
    }
    log::info!(
        target: "import_manager::authz",
        "event=authz.startup_admin_bootstrap stage=complete user_id={}",
        user_id
    );
    Ok(())
}

/// First-run only: create **one** admin row for `user_id` when the system has **zero** admins
/// and `user_id` has no `user_roles` row yet. Never runs from permission checks.
pub(crate) fn bootstrap_first_admin_when_empty(conn: &Connection, user_id: &str) -> Result<(), String> {
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err("Bootstrap refused: user id is empty.".to_string());
    }
    ensure_user_roles_table(conn).map_err(|e| format!("Bootstrap failed: {}", e))?;
    let admins = count_admin_roles(conn)?;
    if admins != 0 {
        return Err("Bootstrap refused: an administrator already exists.".to_string());
    }
    if user_role_row_exists(conn, user_id)? {
        return Err("Bootstrap refused: user already has a role assignment.".to_string());
    }
    conn.execute(
        r#"INSERT INTO user_roles (user_id, role, created_at, updated_at)
           VALUES (?1, 'admin', strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))"#,
        params![user_id],
    )
    .map_err(|e| format!("Bootstrap failed: {}", e))?;
    let admins_after = count_admin_roles(conn)?;
    if admins_after != 1 {
        return Err(format!(
            "Bootstrap invariant violated: expected exactly one administrator, found {}",
            admins_after
        ));
    }
    log::info!(
        target: "import_manager::authz",
        "event=authz.bootstrap_first_admin stage=complete user_id={}",
        user_id
    );
    Ok(())
}

/// Post-restore recovery: insert the well-known recovery admin **only** when there are zero admins.
pub(crate) fn insert_recovery_admin_when_no_admins(
    conn: &Connection,
    recovery_user_id: &str,
) -> Result<(), String> {
    ensure_user_roles_table(conn).map_err(|e| format!("user_roles ensure after restore: {}", e))?;
    let admins = count_admin_roles(conn).map_err(|e| format!("user_roles ensure after restore: {}", e))?;
    if admins > 0 {
        return Ok(());
    }
    conn.execute(
        r#"INSERT INTO user_roles (user_id, role, created_at, updated_at)
           VALUES (?1, 'admin', strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
           ON CONFLICT(user_id) DO UPDATE SET
             role = excluded.role,
             updated_at = excluded.updated_at"#,
        params![recovery_user_id],
    )
    .map_err(|e| format!("Failed to insert recovery admin: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn bootstrap_refused_when_admin_exists() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES ('a', 'admin')",
            [],
        )
        .unwrap();
        let err = bootstrap_first_admin_when_empty(&conn, "b").unwrap_err();
        assert!(
            err.contains("already exists"),
            "unexpected: {err}"
        );
    }

    #[test]
    fn bootstrap_refused_when_user_row_exists() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES ('u', 'viewer')",
            [],
        )
        .unwrap();
        let err = bootstrap_first_admin_when_empty(&conn, "u").unwrap_err();
        assert!(
            err.contains("already has a role"),
            "unexpected: {err}"
        );
    }

    #[test]
    fn bootstrap_succeeds_when_zero_admins_and_no_row() {
        let conn = Connection::open_in_memory().unwrap();
        bootstrap_first_admin_when_empty(&conn, "owner").unwrap();
        assert_eq!(count_admin_roles(&conn).unwrap(), 1);
        let role: String = conn
            .query_row(
                "SELECT role FROM user_roles WHERE user_id = 'owner'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(role, "admin");
    }

    #[test]
    fn startup_bootstrap_inserts_default_admin_when_roles_empty() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        ensure_startup_admin_role_when_no_admins(&conn).unwrap();
        assert_eq!(count_admin_roles(&conn).unwrap(), 1);
        let role = crate::security::resolve_role_strict(&conn, DEFAULT_DESKTOP_ADMIN_USER_ID).unwrap();
        assert_eq!(role, "admin");
    }

    #[test]
    fn startup_bootstrap_uses_users_table_admin_id_when_present() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        conn.execute_batch(
            r#"CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT,
                role TEXT
            );
            INSERT INTO users (id, username, role) VALUES ('u-prod-admin', 'root', 'admin');"#,
        )
        .unwrap();
        ensure_startup_admin_role_when_no_admins(&conn).unwrap();
        assert_eq!(count_admin_roles(&conn).unwrap(), 1);
        let role = crate::security::resolve_role_strict(&conn, "u-prod-admin").unwrap();
        assert_eq!(role, "admin");
    }

    #[test]
    fn startup_bootstrap_noop_when_admin_already_configured() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES ('x', 'admin')",
            [],
        )
        .unwrap();
        ensure_startup_admin_role_when_no_admins(&conn).unwrap();
        assert_eq!(count_admin_roles(&conn).unwrap(), 1);
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_roles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }
}
