//! Centralized actor → role resolution for authorization.
//! Fail-closed on DB errors. **Never** bootstrap admins here — use [`super::bootstrap`].

use rusqlite::{params, Connection};

use super::ensure_user_roles::ensure_user_roles_table;

#[inline]
fn fetch_user_role(conn: &Connection, actor: &str) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT role FROM user_roles WHERE user_id = ?",
        params![actor],
        |row| row.get::<_, String>(0),
    )
}

/// Strict role lookup for runtime authorization (no inserts, no bootstrap).
pub(crate) fn resolve_role_strict(conn: &Connection, actor: &str) -> Result<String, String> {
    ensure_user_roles_table(conn).map_err(|e| format!("Permission check failed: {}", e))?;
    match fetch_user_role(conn, actor) {
        Ok(role) => Ok(role),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err("Permission denied: user role not configured.".to_string())
        }
        Err(e) => Err(format!("Permission check failed: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn strict_missing_user_denied() {
        let conn = Connection::open_in_memory().unwrap();
        let err = resolve_role_strict(&conn, "nobody").unwrap_err();
        assert!(err.contains("not configured"), "{err}");
    }

    #[test]
    fn strict_existing_role_loaded() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?1, ?2)",
            params!["v1", "viewer"],
        )
        .unwrap();
        let role = resolve_role_strict(&conn, "v1").unwrap();
        assert_eq!(role, "viewer");
    }

    #[test]
    fn malformed_user_roles_table_denies_strict() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE user_roles (oops INTEGER)", [])
            .unwrap();
        let err = resolve_role_strict(&conn, "u").unwrap_err();
        assert!(
            err.starts_with("Permission check failed:"),
            "unexpected: {err}"
        );
    }
}
