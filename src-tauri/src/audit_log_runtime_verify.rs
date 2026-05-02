//! Runtime (cargo test) verification for `user_activity_audit_logs`.

use crate::commands::boe::delete_boe_db;
use crate::commands::invoices::{
    bulk_finalize_invoices_db, delete_invoice_db, BulkFinalizeInvoicesInput,
};
use crate::commands::shipments::add_shipments_bulk_inner;
use crate::db::Shipment;
use crate::migrations::DatabaseMigrations;
use crate::services::user_activity_audit::log_activity;
use rusqlite::Connection;
use serde_json::Value;
use std::path::PathBuf;

fn open_migrated_temp() -> (tempfile::TempDir, PathBuf, Connection) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("audit_runtime_verify.db");
    let mut conn = Connection::open(&path).expect("open db");
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .expect("pragma fk");
    DatabaseMigrations::run_migrations_test(&mut conn).expect("migrations");
    (dir, path, conn)
}

fn seed_supplier(conn: &Connection, id: &str) {
    conn.execute(
        "INSERT INTO suppliers (id, supplier_name, country, email, is_active, deleted_at)
         VALUES (?1, 'Audit Supplier', 'IN', 'audit@test.example', 1, NULL)",
        [id],
    )
    .expect("insert supplier");
}

fn sample_shipment_row(id: &str, supplier_id: &str) -> Shipment {
    Shipment {
        id: id.to_string(),
        supplier_id: supplier_id.to_string(),
        invoice_number: "INV-AUDIT-1".to_string(),
        invoice_date: "2025-01-15".to_string(),
        goods_category: "G".to_string(),
        invoice_value: 100.0,
        invoice_currency: "USD".to_string(),
        incoterm: "EXW".to_string(),
        shipment_mode: None,
        shipment_type: None,
        bl_awb_number: None,
        bl_awb_date: None,
        vessel_name: None,
        container_number: None,
        gross_weight_kg: None,
        etd: None,
        eta: None,
        status: Some("docs-rcvd".to_string()),
        date_of_delivery: None,
        is_frozen: false,
    }
}

fn fetch_audit_page(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Vec<(String, String, Option<String>)> {
    let mut stmt = conn
        .prepare(
            "SELECT action_name, status, details_json FROM user_activity_audit_logs
             ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2",
        )
        .expect("prepare");
    stmt.query_map([limit, offset], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })
    .expect("query")
    .collect::<Result<Vec<_>, _>>()
    .expect("rows")
}

fn latest_audit(conn: &Connection) -> (String, String, Option<String>) {
    let mut rows = fetch_audit_page(conn, 1, 0);
    rows.pop().expect("one row")
}

#[test]
fn audit_runtime_01_shipment_import_success() {
    let (_d, _p, mut conn) = open_migrated_temp();
    seed_supplier(&conn, "sup-a1");
    let s = sample_shipment_row("sh-a1", "sup-a1");
    add_shipments_bulk_inner(&mut conn, vec![s], "ok.csv".into(), 1, 0, 0).expect("bulk ok");
    let (action, status, _) = latest_audit(&conn);
    assert_eq!(action, "shipment_bulk_import");
    assert_eq!(status, "SUCCESS");
}

#[test]
fn audit_runtime_02_shipment_import_failed() {
    let (_d, _p, mut conn) = open_migrated_temp();
    let s = sample_shipment_row("sh-f1", "sup-does-not-exist");
    let err = add_shipments_bulk_inner(&mut conn, vec![s], "bad.csv".into(), 1, 0, 0)
        .expect_err("should fail fk");
    assert!(!err.is_empty(), "error message");
    let (action, status, details) = latest_audit(&conn);
    assert_eq!(action, "shipment_bulk_import");
    assert_eq!(status, "FAILED");
    let d = details.expect("details_json");
    assert!(d.contains("error"), "details should include error: {d}");
}

#[test]
fn audit_runtime_03_bulk_finalize_partial_success_counts() {
    let (_d, _p, mut conn) = open_migrated_temp();
    let input = BulkFinalizeInvoicesInput {
        invoice_ids: vec!["missing-a".into(), "missing-b".into()],
    };
    let out = bulk_finalize_invoices_db(&mut conn, input).expect("finalize");
    assert_eq!(out.failed, 2);
    assert_eq!(out.finalized, 0);
    let (action, status, details) = latest_audit(&conn);
    assert_eq!(action, "bulk_finalize_invoices");
    assert_eq!(status, "PARTIAL_SUCCESS");
    let v: Value = serde_json::from_str(&details.expect("details")).expect("json");
    assert_eq!(v["total_count"], 2);
    assert_eq!(v["failed_count"], 2);
}

#[test]
fn audit_runtime_04_delete_invoice_and_boe() {
    let (_d, _p, mut conn) = open_migrated_temp();
    seed_supplier(&conn, "sup-d1");
    let s = sample_shipment_row("sh-d1", "sup-d1");
    add_shipments_bulk_inner(&mut conn, vec![s], "d.csv".into(), 1, 0, 0).expect("bulk");
    conn.execute(
        "INSERT INTO invoices (id, shipment_id, status, line_total_decimals, invoice_total_decimals)
         VALUES ('inv-del', 'sh-d1', 'Draft', 2, 2)",
        [],
    )
    .expect("invoice");
    delete_invoice_db(&conn, "inv-del").expect("delete inv");

    conn.execute(
        "INSERT INTO boe_details (id, be_number, be_date, location, total_assessment_value, duty_amount,
         payment_date, duty_paid, challan_number, ref_id, transaction_id)
         VALUES ('boe-del', 'BE-AUD', '2025-02-01', 'LOC', 1.0, 0.5, NULL, NULL, NULL, NULL, NULL)",
        [],
    )
    .expect("boe");
    delete_boe_db(&conn, "boe-del").expect("delete boe");

    let page = fetch_audit_page(&conn, 20, 0);
    let has_del_inv = page
        .iter()
        .any(|(a, st, _)| a == "delete_invoice" && st == "SUCCESS");
    let has_del_boe = page
        .iter()
        .any(|(a, st, _)| a == "delete_boe" && st == "SUCCESS");
    assert!(has_del_inv, "delete_invoice audit missing: {page:?}");
    assert!(has_del_boe, "delete_boe audit missing: {page:?}");
}

#[test]
fn audit_runtime_05_backup_failure_simulated() {
    let (_d, _p, conn) = open_migrated_temp();
    let details = serde_json::json!({
        "destination": "local",
        "error": "simulated backup failure for audit test",
    })
    .to_string();
    log_activity(
        &conn,
        Some("audit-user"),
        "create_backup",
        Some("backup"),
        None,
        Some(&details),
        "FAILED",
    );
    let (action, status, d) = latest_audit(&conn);
    assert_eq!(action, "create_backup");
    assert_eq!(status, "FAILED");
    assert!(
        d.expect("d").contains("simulated backup failure"),
        "error text in details"
    );
}

#[test]
fn audit_runtime_06_pagination_no_duplicate_ids() {
    let (_d, _p, conn) = open_migrated_temp();
    for i in 0..25usize {
        let d = format!(r#"{{"i": {i}}}"#);
        log_activity(
            &conn,
            None,
            &format!("pagination_probe_{i}"),
            Some("test"),
            None,
            Some(&d),
            "SUCCESS",
        );
    }
    let p0 = fetch_audit_page(&conn, 10, 0);
    let p1 = fetch_audit_page(&conn, 10, 10);
    assert_eq!(p0.len(), 10);
    assert_eq!(p1.len(), 10);
    let mut stmt = conn
        .prepare(
            "SELECT id FROM user_activity_audit_logs ORDER BY timestamp DESC LIMIT 10 OFFSET 0",
        )
        .unwrap();
    let ids0: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id FROM user_activity_audit_logs ORDER BY timestamp DESC LIMIT 10 OFFSET 10",
        )
        .unwrap();
    let ids1: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let set0: std::collections::HashSet<_> = ids0.iter().collect();
    for id in &ids1 {
        assert!(!set0.contains(id), "duplicate id across pages: {id}");
    }
}
