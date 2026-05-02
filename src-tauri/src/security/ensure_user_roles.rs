use rusqlite::{Connection, Result};

/// Ensures the `user_roles` table exists with the same shape as migration `V4__db_management.sql`.
/// Safe to call on every permission check; uses `IF NOT EXISTS`.
pub fn ensure_user_roles_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS user_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL,
            permissions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
        "#,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn creates_table_and_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_user_roles_table(&conn).unwrap();
        ensure_user_roles_table(&conn).unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_roles'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
        conn.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?1, ?2)",
            params!["u", "viewer"],
        )
        .unwrap();
    }
}
