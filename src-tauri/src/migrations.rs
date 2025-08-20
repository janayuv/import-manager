use refinery::embed_migrations;
use rusqlite::{Connection, Result};
use std::path::Path;

// Embed migrations into the binary
embed_migrations!("migrations");

pub struct DatabaseMigrations;

impl DatabaseMigrations {
    /// Run all pending migrations on the database
    pub fn run_migrations(conn: &mut Connection) -> Result<()> {
        log::info!("Running database migrations...");
        
        // Create a backup before running migrations
        let backup_path = Path::new("import-manager.db.backup");
        if backup_path.exists() {
            std::fs::remove_file(backup_path).expect("Failed to remove existing backup");
        }
        
        // Run migrations
        match migrations::runner().run(conn) {
            Ok(applied_migrations) => {
                if applied_migrations.applied_migrations().is_empty() {
                    log::info!("No pending migrations to apply");
                } else {
                    log::info!("Applied {} migrations", applied_migrations.applied_migrations().len());
                    
                    // Create backup after successful migration
                    conn.execute(&format!("VACUUM INTO '{}'", backup_path.to_str().unwrap()), [])?;
                    log::info!("Database backup created at import-manager.db.backup");
                }
                Ok(())
            }
            Err(e) => {
                log::error!("Migration failed: {}", e);
                Err(rusqlite::Error::InvalidPath(e.to_string().into()))
            }
        }
    }

    /// Check if migrations are needed
    #[allow(dead_code)]
    pub fn needs_migration(conn: &Connection) -> Result<bool> {
        // Check if the migrations table exists
        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='refinery_schema_history'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0) > 0;

        if !table_exists {
            return Ok(true);
        }

        // Check if there are pending migrations
        let pending_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM refinery_schema_history WHERE applied_on IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(pending_count > 0)
    }

    /// Get migration status
    #[allow(dead_code)]
    pub fn get_migration_status(conn: &Connection) -> Result<Vec<(String, String)>> {
        let mut stmt = conn.prepare(
            "SELECT version, applied_on FROM refinery_schema_history ORDER BY version"
        )?;
        
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?
            ))
        })?;

        let mut status = Vec::new();
        for row in rows {
            status.push(row?);
        }
        
        Ok(status)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_status() {
        let mut conn = Connection::open_in_memory().unwrap();
        
        // Should need migration for new database
        assert!(DatabaseMigrations::needs_migration(&conn).unwrap());
        
        // Run migrations
        DatabaseMigrations::run_migrations(&mut conn).unwrap();
        
        // Should not need migration after running
        assert!(!DatabaseMigrations::needs_migration(&conn).unwrap());
        
        // Check status
        let status = DatabaseMigrations::get_migration_status(&conn).unwrap();
        assert!(!status.is_empty());
    }
}
