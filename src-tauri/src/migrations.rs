#![allow(clippy::uninlined_format_args)]
use refinery::embed_migrations;
use rusqlite::{params, Connection, Result};
use serde::Serialize;
use std::path::Path;
use std::time::Instant;

embed_migrations!("migrations");

const SOFT_DELETE_TABLES: &[&str] = &[
    "suppliers",
    "shipments",
    "items",
    "invoices",
    "boe_details",
    "boe_calculations",
    "service_providers",
    "expense_types",
    "expense_invoices",
    "expenses",
    "workflow_incidents",
];

/// Index name, table, column (for `CREATE INDEX IF NOT EXISTS … ON table(column)`).
const SOFT_DELETE_INDEXES: &[(&str, &str, &str)] = &[
    ("idx_suppliers_deleted_at", "suppliers", "deleted_at"),
    ("idx_shipments_deleted_at", "shipments", "deleted_at"),
    ("idx_items_deleted_at", "items", "deleted_at"),
    ("idx_invoices_deleted_at", "invoices", "deleted_at"),
    ("idx_boe_details_deleted_at", "boe_details", "deleted_at"),
    (
        "idx_boe_calculations_deleted_at",
        "boe_calculations",
        "deleted_at",
    ),
    (
        "idx_service_providers_deleted_at",
        "service_providers",
        "deleted_at",
    ),
    (
        "idx_expense_types_deleted_at",
        "expense_types",
        "deleted_at",
    ),
    (
        "idx_expense_invoices_deleted_at",
        "expense_invoices",
        "deleted_at",
    ),
    ("idx_expenses_deleted_at", "expenses", "deleted_at"),
    (
        "idx_workflow_incidents_deleted_at",
        "workflow_incidents",
        "deleted_at",
    ),
];

/// Partial indexes: active rows by `id` for `WHERE deleted_at IS NULL` + `ORDER BY id` ID scans.
const ACTIVE_ROW_ID_PARTIAL_INDEXES: &[(&str, &str)] = &[
    ("idx_suppliers_active_row_id", "suppliers"),
    ("idx_shipments_active_row_id", "shipments"),
    ("idx_items_active_row_id", "items"),
    ("idx_invoices_active_row_id", "invoices"),
    ("idx_boe_details_active_row_id", "boe_details"),
    ("idx_boe_calculations_active_row_id", "boe_calculations"),
    ("idx_service_providers_active_row_id", "service_providers"),
    ("idx_expense_types_active_row_id", "expense_types"),
    ("idx_expense_invoices_active_row_id", "expense_invoices"),
    ("idx_expenses_active_row_id", "expenses"),
];

/// V48 performance indexes (IF NOT EXISTS in SQL); verified in [verify_schema_integrity].
const V48_PERFORMANCE_INDEXES: &[&str] = &[
    "idx_shipments_supplier_invoice",
    "idx_suppliers_name",
    "idx_items_part_number",
];

/// V70 composite indexes for dashboard/report/BOE paths; verified in [verify_schema_integrity].
const V70_QUERY_PATH_INDEXES: &[&str] = &[
    "idx_invoice_line_items_invoice_id_item_id",
    "idx_boe_calculations_shipment_id_status",
    "idx_shipments_supplier_id_invoice_date",
];

pub struct DatabaseMigrations;

fn migration_table_exists(conn: &Connection) -> Result<bool> {
    let n: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='refinery_schema_history'",
        [],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

fn user_table_exists(conn: &Connection, table: &str) -> Result<bool> {
    let n: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        [table],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

/// Trusted table name only (from constants).
pub fn table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
    user_table_exists(conn, table).map_err(|e| e.to_string())
}

fn table_has_column(conn: &Connection, table: &str, col: &str) -> Result<bool> {
    let pragma = format!("PRAGMA table_info(\"{}\")", table.replace('"', ""));
    let mut stmt = conn.prepare(&pragma)?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name.eq_ignore_ascii_case(col) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Case-insensitive column check. `table` must be a trusted identifier (constants only).
pub fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    table_has_column(conn, table, column).map_err(|e| e.to_string())
}

/// True if a user index exists (`sqlite_master` name match). `index_name` is trusted (constants only).
fn index_exists(conn: &Connection, index_name: &str) -> Result<bool, String> {
    let n: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
            [index_name],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

fn execute_alter_ignore_duplicate(conn: &Connection, sql: &str) -> Result<(), String> {
    match conn.execute(sql, []) {
        Ok(_) => Ok(()),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("duplicate column name") {
                log::warn!(
                    target: "import_manager::migrations",
                    "Ignoring duplicate column during schema fixup: {}",
                    msg
                );
                Ok(())
            } else {
                Err(msg)
            }
        }
    }
}

/// After all embedded SQL migrations: add `deleted_at` / `deleted_by` when missing (idempotent).
fn ensure_soft_delete_columns(conn: &Connection) -> Result<(), String> {
    for table in SOFT_DELETE_TABLES {
        if !table_exists(conn, table)? {
            continue;
        }
        if !column_exists(conn, table, "deleted_at")? {
            execute_alter_ignore_duplicate(
                conn,
                &format!("ALTER TABLE \"{}\" ADD COLUMN deleted_at TEXT", table),
            )?;
        }
        if !column_exists(conn, table, "deleted_by")? {
            execute_alter_ignore_duplicate(
                conn,
                &format!("ALTER TABLE \"{}\" ADD COLUMN deleted_by TEXT", table),
            )?;
        }
    }
    Ok(())
}

fn ensure_invoice_line_item_tax_columns(conn: &Connection) -> Result<(), String> {
    const TABLE: &str = "invoice_line_items";
    if !table_exists(conn, TABLE)? {
        return Ok(());
    }
    for (col, decl) in [
        ("duty_percent", "REAL"),
        ("sws_percent", "REAL"),
        ("igst_percent", "REAL"),
    ] {
        if !column_exists(conn, TABLE, col)? {
            execute_alter_ignore_duplicate(
                conn,
                &format!("ALTER TABLE \"{}\" ADD COLUMN {} {}", TABLE, col, decl),
            )?;
        }
    }
    Ok(())
}

fn ensure_soft_delete_indexes(conn: &Connection) -> Result<(), String> {
    for (idx, table, col) in SOFT_DELETE_INDEXES {
        if !table_exists(conn, table)? {
            continue;
        }
        if !column_exists(conn, table, col)? {
            continue;
        }
        let sql = format!(
            "CREATE INDEX IF NOT EXISTS {} ON \"{}\"(\"{}\")",
            idx,
            table.replace('"', ""),
            col.replace('"', "")
        );
        conn.execute(&sql, []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `id` is indexed for active rows only — speeds bulk `SELECT id ... WHERE deleted_at IS NULL ORDER BY id`.
fn ensure_active_row_id_partial_indexes(conn: &Connection) -> Result<(), String> {
    for (idx_name, table) in ACTIVE_ROW_ID_PARTIAL_INDEXES {
        if !table_exists(conn, table)? {
            continue;
        }
        if !column_exists(conn, table, "id")? {
            continue;
        }
        if !column_exists(conn, table, "deleted_at")? {
            continue;
        }
        let sql = format!(
            "CREATE INDEX IF NOT EXISTS {} ON \"{}\"(id) WHERE deleted_at IS NULL",
            idx_name,
            table.replace('"', "")
        );
        conn.execute(&sql, []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// WAL reduces writer lock contention vs DELETE journal; safe for desktop single-file DB.
fn ensure_wal_journal_mode(conn: &Connection) -> Result<(), String> {
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if mode.to_lowercase() == "wal" {
        log::info!(
            target: "import_manager::migrations",
            "SQLite journal_mode is already WAL"
        );
        return Ok(());
    }
    let new_mode: String = conn
        .query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::migrations",
        "SQLite journal_mode set to {} (previous: {})",
        new_mode,
        mode
    );
    Ok(())
}

fn reconcile_embedded_migration_checksum(
    conn: &Connection,
    version: i32,
    embed_stem: &str,
    sql: &str,
) -> Result<()> {
    if !migration_table_exists(conn)? {
        return Ok(());
    }
    let embedded =
        refinery::Migration::unapplied(embed_stem, sql).expect("embedded migration must parse");
    let ck = embedded.checksum().to_string();
    conn.execute(
        &format!(
            "UPDATE refinery_schema_history SET checksum = ?1 WHERE version = {}",
            version
        ),
        [&ck],
    )?;
    Ok(())
}

fn reconcile_checksums_before_refinery(conn: &Connection) -> Result<()> {
    if !migration_table_exists(conn)? {
        return Ok(());
    }

    // Reconcile checksums for all embedded migrations that are already marked as applied.
    // This allows local/dev databases to proceed when historical migration SQL files were edited.
    let max_applied_version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM refinery_schema_history",
        [],
        |r| r.get(0),
    )?;

    if max_applied_version <= 0 {
        return Ok(());
    }

    let runner = migrations::runner();
    for mig in runner
        .get_migrations()
        .iter()
        .filter(|m| (m.version() as i32) <= max_applied_version)
    {
        let version = mig.version() as i32;
        let stem = mig.to_string();
        if let Some(sql) = mig.sql() {
            reconcile_embedded_migration_checksum(conn, version, &stem, sql)?;
        }
    }
    Ok(())
}

/// Max applied refinery version, or 0 if history missing / empty.
fn max_applied_migration_version_for_drift(conn: &Connection) -> Result<i32, String> {
    if !migration_table_exists(conn).map_err(|e| e.to_string())? {
        return Ok(0);
    }
    let n: i32 = conn
        .query_row("SELECT COUNT(*) FROM refinery_schema_history", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Ok(0);
    }
    conn.query_row(
        "SELECT MAX(version) FROM refinery_schema_history",
        [],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

/// When refinery fails because pending migration DDL does not match the current schema (e.g.
/// duplicate `ALTER ADD COLUMN`, or `CREATE INDEX` on a column removed by a later redesign),
/// record the **next** pending migration as applied so refinery can continue.
fn skip_next_migration_after_duplicate_column(conn: &Connection) -> Result<(), String> {
    let max_v = max_applied_migration_version_for_drift(conn)?;
    let next_v = max_v + 1;
    let runner = migrations::runner();
    let mig = runner
        .get_migrations()
        .iter()
        .find(|m| m.version() as i32 == next_v)
        .ok_or_else(|| {
            format!(
                "duplicate column error but no embedded migration for version {} (schema head {})",
                next_v, max_v
            )
        })?;
    let stem = mig.to_string();
    let sql = mig
        .sql()
        .ok_or_else(|| format!("embedded migration {stem} has no SQL"))?;
    let parsed = refinery::Migration::unapplied(&stem, sql).map_err(|e| e.to_string())?;
    let ck = parsed.checksum().to_string();
    let applied_on = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let name = mig.name().to_string();
    conn.execute(
        "INSERT OR REPLACE INTO refinery_schema_history (version, name, applied_on, checksum) VALUES (?1, ?2, ?3, ?4)",
        params![next_v, name, applied_on, ck],
    )
    .map_err(|e| e.to_string())?;
    log::warn!(
        target: "import_manager::migrations",
        "Recorded migration version {} as applied after duplicate-column drift (stem {})",
        next_v,
        stem
    );
    Ok(())
}

fn run_refinery_migrations_with_duplicate_drift(conn: &mut Connection) -> Result<usize, String> {
    const MAX_ADVANCES: u32 = 64;
    let mut total_applied = 0usize;
    for attempt in 0..MAX_ADVANCES {
        reconcile_checksums_before_refinery(conn).map_err(|e| e.to_string())?;
        match migrations::runner()
            .set_target(refinery::Target::Latest)
            .run(conn)
        {
            Ok(report) => {
                total_applied += report.applied_migrations().len();
                return Ok(total_applied);
            }
            Err(e) => {
                let msg = e.to_string();
                let drift_duplicate = msg.contains("duplicate column name");
                let drift_missing_col = msg.contains("no such column");
                let drift_object_exists = msg.contains("already exists");
                if !drift_duplicate && !drift_missing_col && !drift_object_exists {
                    return Err(msg);
                }
                log::warn!(
                    target: "import_manager::migrations",
                    "Refinery schema drift on pending migration (advance {}/{}): {}",
                    attempt + 1,
                    MAX_ADVANCES,
                    msg
                );
                skip_next_migration_after_duplicate_column(conn)?;
            }
        }
    }
    Err(format!(
        "Refinery duplicate-column drift not resolved after {MAX_ADVANCES} advances; repair database manually"
    ))
}

fn post_refinery_migrations(conn: &Connection) -> Result<(), String> {
    log::info!(
        target: "import_manager::migrations",
        "Ensuring SQLite WAL journal mode"
    );
    ensure_wal_journal_mode(conn)?;
    log::info!(
        target: "import_manager::migrations",
        "Ensuring soft-delete columns"
    );
    ensure_soft_delete_columns(conn)?;
    log::info!(
        target: "import_manager::migrations",
        "Ensuring line-item tax columns"
    );
    ensure_invoice_line_item_tax_columns(conn)?;
    log::info!(
        target: "import_manager::migrations",
        "Ensuring soft-delete indexes"
    );
    ensure_soft_delete_indexes(conn)?;
    log::info!(
        target: "import_manager::migrations",
        "Ensuring active-row id partial indexes (bulk ID fetch)"
    );
    ensure_active_row_id_partial_indexes(conn)?;
    log::info!(
        target: "import_manager::migrations",
        "Ensuring audit_logs.tableName column"
    );
    crate::db::ensure_audit_logs_table_name_column(conn).map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::migrations",
        "Soft-delete columns verified"
    );
    Ok(())
}

fn require_migration_head(conn: &Connection) -> Result<i32, String> {
    if !migration_table_exists(conn).map_err(|e| e.to_string())? {
        return Err("Migration history missing — database inconsistent".into());
    }
    let n: i32 = conn
        .query_row("SELECT COUNT(*) FROM refinery_schema_history", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Migration history missing — database inconsistent".into());
    }
    let v: i32 = conn
        .query_row(
            "SELECT MAX(version) FROM refinery_schema_history",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(v)
}

/// Escape a host path for use inside SQLite `VACUUM INTO '…'` (single-quoted literal).
fn path_for_vacuum_into(dest: &Path) -> String {
    let normalized = dest.to_string_lossy().replace('\\', "/");
    normalized.replace('\'', "''")
}

/// Snapshot the open database to `dest` before running migrations (restore by replacing the main DB file).
pub fn backup_database(conn: &Connection, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("backup create_dir_all: {e}"))?;
        }
    }
    if dest.exists() {
        std::fs::remove_file(dest).map_err(|e| format!("backup remove existing: {e}"))?;
    }
    let quoted = path_for_vacuum_into(dest);
    let sql = format!("VACUUM INTO '{quoted}'");
    conn.execute(&sql, [])
        .map_err(|e| format!("VACUUM INTO backup failed: {e}"))?;
    log::info!(
        target: "import_manager::migrations",
        "Pre-migration database backup written to {}",
        dest.display()
    );
    Ok(())
}

/// Collects schema integrity problems without logging (for health UI / diagnostics).
pub fn schema_integrity_problems(conn: &Connection) -> Result<Vec<String>, String> {
    let mut problems: Vec<String> = Vec::new();

    for table in [
        "workflow_incidents",
        "workflow_incident_history",
        "workflow_failure_forecast",
        "user_activity_audit_logs",
    ] {
        if !table_exists(conn, table).map_err(|e| e.to_string())? {
            problems.push(table.to_string());
        }
    }

    if !column_exists(conn, "workflow_incidents", "deleted_at").map_err(|e| e.to_string())? {
        problems.push("workflow_incidents.deleted_at".to_string());
    }
    if !column_exists(conn, "workflow_incidents", "deleted_by").map_err(|e| e.to_string())? {
        problems.push("workflow_incidents.deleted_by".to_string());
    }

    if !migration_table_exists(conn).map_err(|e| e.to_string())? {
        problems.push("refinery_schema_history (table missing)".to_string());
    } else {
        let n: i32 = conn
            .query_row("SELECT COUNT(*) FROM refinery_schema_history", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        if n == 0 {
            problems.push("refinery_schema_history (empty)".to_string());
        }
    }

    for idx in V48_PERFORMANCE_INDEXES {
        if !index_exists(conn, idx).map_err(|e| e.to_string())? {
            problems.push(format!("index missing: {idx}"));
        }
    }

    for idx in V70_QUERY_PATH_INDEXES {
        if !index_exists(conn, idx).map_err(|e| e.to_string())? {
            problems.push(format!("index missing: {idx}"));
        }
    }

    Ok(problems)
}

/// Validates critical workflow tables, soft-delete columns, and refinery history after migrations.
/// Returns a readable error (no panic) if anything is missing.
pub fn verify_schema_integrity(conn: &Connection) -> Result<(), String> {
    let problems = schema_integrity_problems(conn)?;
    if problems.is_empty() {
        log::info!(
            target: "import_manager::migrations",
            "Schema integrity verification passed"
        );
        return Ok(());
    }

    let detail = problems.join(", ");
    let msg = format!("Schema integrity verification failed: missing or invalid: {detail}");
    log::error!(target: "import_manager::migrations", "{msg}");
    Err(msg)
}

/// Highest migration version embedded in this binary (same set Refinery applies).
pub fn embedded_migration_head_version() -> i32 {
    migrations::runner()
        .get_migrations()
        .iter()
        .map(|m| m.version() as i32)
        .max()
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaHealth {
    /// `ok` | `migration_pending` | `version_mismatch` | `migration_failed`
    pub state: String,
    pub expected_version: i32,
    pub applied_version: i32,
    pub pending_migration_rows: i32,
    pub integrity_error: Option<String>,
}

/// Live schema health for admin UI (no hardcoded version; `expected` comes from embedded migrations).
pub fn compute_schema_health(conn: &Connection) -> SchemaHealth {
    let expected_version = embedded_migration_head_version();
    let mut applied_version: i32 = 0;
    let mut pending_migration_rows: i32 = 0;

    if migration_table_exists(conn).unwrap_or(false) {
        if let Ok(v) = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM refinery_schema_history",
            [],
            |r| r.get::<_, i32>(0),
        ) {
            applied_version = v;
        }
        if let Ok(p) = conn.query_row(
            "SELECT COUNT(*) FROM refinery_schema_history WHERE applied_on IS NULL OR trim(COALESCE(applied_on, '')) = ''",
            [],
            |r| r.get::<_, i32>(0),
        ) {
            pending_migration_rows = p;
        }
    }

    let integrity_error = match schema_integrity_problems(conn) {
        Ok(p) if p.is_empty() => None,
        Ok(p) => Some(p.join(", ")),
        Err(e) => Some(e),
    };

    let state = if expected_version == 0 || integrity_error.is_some() {
        "migration_failed".to_string()
    } else if applied_version > expected_version {
        "version_mismatch".to_string()
    } else if applied_version < expected_version || pending_migration_rows > 0 {
        "migration_pending".to_string()
    } else {
        "ok".to_string()
    };

    SchemaHealth {
        state,
        expected_version,
        applied_version,
        pending_migration_rows,
        integrity_error,
    }
}

impl DatabaseMigrations {
    #[cfg(test)]
    pub fn run_migrations_test(conn: &mut Connection) -> Result<(), String> {
        Self::run_migrations_once(conn).map(|_| ())
    }

    /// 1) Full refinery run. 2) Post-migration DDL (soft delete + indexes + tax columns). 3) Validate history.
    fn run_migrations_once(conn: &mut Connection) -> std::result::Result<usize, String> {
        let start = Instant::now();
        log::info!(
            target: "import_manager::migrations",
            "Running database migrations"
        );
        log::info!(
            target: "import_manager::migrations",
            "Applying refinery migrations"
        );
        let applied = run_refinery_migrations_with_duplicate_drift(conn)?;

        post_refinery_migrations(conn)?;

        let head = require_migration_head(conn)?;
        log::info!(
            target: "import_manager::migrations",
            "Refinery schema head: version {}",
            head
        );
        if applied == 0 {
            log::info!(
                target: "import_manager::migrations",
                "No pending migrations to apply"
            );
        } else {
            log::info!(
                target: "import_manager::migrations",
                "Applied {} migration(s) in this run",
                applied
            );
        }
        log::info!(
            target: "import_manager::migrations",
            "Migrations completed in {} ms",
            start.elapsed().as_millis()
        );

        verify_schema_integrity(conn)?;

        log::info!(
            target: "import_manager::migrations",
            "Migrations pipeline complete"
        );
        Ok(applied)
    }

    /// Runs pre-migration backup, refinery + post steps, schema integrity checks, and timing logs.
    pub fn run_migrations(
        conn: &mut Connection,
        pre_migration_backup: &Path,
    ) -> Result<(), String> {
        log::info!(
            target: "import_manager::migrations",
            "Creating pre-migration backup at {}",
            pre_migration_backup.display()
        );
        let backup_start = Instant::now();
        backup_database(conn, pre_migration_backup)?;
        log::info!(
            target: "import_manager::migrations",
            "Pre-migration backup finished in {} ms",
            backup_start.elapsed().as_millis()
        );

        match Self::run_migrations_once(conn) {
            Ok(_) => Ok(()),
            Err(e) => {
                log::error!("Migration failed: {}", e);
                if e.contains("different than filesystem") {
                    log::error!(
                        "Migration checksum mismatch with refinery_schema_history. \
                         Restore the database file from the pre-migration backup at {} if needed.",
                        pre_migration_backup.display()
                    );
                } else {
                    log::error!(
                        target: "import_manager::migrations",
                        "If the database is unusable, restore from {}",
                        pre_migration_backup.display()
                    );
                }
                Err(e)
            }
        }
    }

    #[allow(dead_code)]
    pub fn needs_migration(conn: &Connection) -> Result<bool> {
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

        let pending_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM refinery_schema_history WHERE applied_on IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(pending_count > 0)
    }

    #[allow(dead_code)]
    pub fn get_migration_status(conn: &Connection) -> Result<Vec<(String, String)>> {
        let mut stmt = conn
            .prepare("SELECT version, applied_on FROM refinery_schema_history ORDER BY version")?;

        let rows = stmt.query_map([], |row| {
            let version: i32 = row.get(0)?;
            let applied_on: String = row.get(1)?;
            Ok((version.to_string(), applied_on))
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
    fn test_migration_status() -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = Connection::open_in_memory()
            .map_err(|e| format!("Failed to create in-memory database: {}", e))?;

        assert!(DatabaseMigrations::needs_migration(&conn)
            .map_err(|e| format!("needs_migration: {}", e))?);

        DatabaseMigrations::run_migrations_test(&mut conn)
            .map_err(|e| format!("run_migrations_test: {}", e))?;

        assert!(!DatabaseMigrations::needs_migration(&conn)
            .map_err(|e| format!("needs_migration after: {}", e))?);

        let status = DatabaseMigrations::get_migration_status(&conn)
            .map_err(|e| format!("get_migration_status: {}", e))?;
        assert!(!status.is_empty());

        assert!(
            column_exists(&conn, "invoice_line_items", "duty_percent")
                .map_err(|e| format!("column_exists: {}", e))?,
            "line-item tax columns must exist after migrations"
        );
        assert!(
            column_exists(&conn, "suppliers", "deleted_at")
                .map_err(|e| format!("column_exists: {}", e))?,
            "soft-delete columns must exist after migrations"
        );

        let max_v: i32 = conn.query_row(
            "SELECT MAX(version) FROM refinery_schema_history",
            [],
            |r| r.get(0),
        )?;
        assert!(
            max_v >= 49,
            "expected migration head at least V49 (AI removal), got {max_v}"
        );

        assert!(
            user_table_exists(&conn, "app_settings").map_err(|e| format!("app_settings: {e}"))?,
            "app_settings must exist after migrations"
        );

        Ok(())
    }

    #[test]
    fn test_migrations_idempotent_rerun() -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = Connection::open_in_memory()?;

        DatabaseMigrations::run_migrations_test(&mut conn)
            .map_err(|e| format!("first run_migrations_test: {e}"))?;
        verify_schema_integrity(&conn).map_err(|e| format!("verify after first: {e}"))?;

        DatabaseMigrations::run_migrations_test(&mut conn)
            .map_err(|e| format!("second run_migrations_test (idempotent): {e}"))?;
        verify_schema_integrity(&conn).map_err(|e| format!("verify after second: {e}"))?;

        Ok(())
    }

    fn assert_v48_indexes(conn: &Connection) -> Result<(), String> {
        for idx in V48_PERFORMANCE_INDEXES {
            if !index_exists(conn, idx)? {
                return Err(format!("index must exist: {idx}"));
            }
        }
        Ok(())
    }

    #[test]
    fn v48_performance_indexes_present_after_migrations() -> Result<(), String> {
        let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        DatabaseMigrations::run_migrations_test(&mut conn)?;
        assert_v48_indexes(&conn)
    }

    /// Second migration run is a no-op for `CREATE INDEX IF NOT EXISTS` (V48); schema verify still passes.
    #[test]
    fn v48_migrations_idempotent() -> Result<(), String> {
        let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        DatabaseMigrations::run_migrations_test(&mut conn)?;
        assert_v48_indexes(&conn)?;
        DatabaseMigrations::run_migrations_test(&mut conn)?;
        assert_v48_indexes(&conn)?;
        verify_schema_integrity(&conn)
    }
}
