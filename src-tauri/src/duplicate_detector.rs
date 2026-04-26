//! Shipment / invoice de-duplication before `save_ai_extracted_invoice` inserts a new row.

use rusqlite::OptionalExtension;
use rusqlite::{Connection, params};

/// Returns the existing `shipments.id` if one row already matches the supplier, invoice number, and date; otherwise `None`.
pub fn check_duplicate_invoice(
    supplier_id: &str,
    invoice_number: &str,
    invoice_date: &str,
    conn: &Connection,
) -> std::result::Result<Option<String>, String> {
    let id: Option<String> = conn
        .query_row(
            "SELECT id
             FROM shipments
             WHERE supplier_id = ?1
               AND invoice_number = ?2
               AND invoice_date = ?3
             LIMIT 1",
            params![supplier_id, invoice_number, invoice_date],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::DatabaseMigrations;
    use rusqlite::Connection;

    fn open_mem() -> Connection {
        let mut c = Connection::open_in_memory().expect("in memory");
        DatabaseMigrations::run_migrations_test(&mut c).expect("migrate");
        c
    }

    fn insert_min_supplier(conn: &Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) \
             VALUES (?1, ?2, NULL, 'N/A', 'x@y', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1)",
            [id, name],
        )
        .expect("supplier");
    }

    fn insert_min_shipment(
        conn: &Connection,
        id: &str,
        supplier_id: &str,
        invoice_number: &str,
        invoice_date: &str,
    ) {
        conn.execute(
            "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, status, is_frozen) \
             VALUES (?1, ?2, ?3, ?4, 'G', 1, 'USD', 'EXW', 'docs-rcvd', 0)",
            params![id, supplier_id, invoice_number, invoice_date],
        )
        .expect("shipment");
    }

    #[test]
    fn duplicate_detected() {
        let c = open_mem();
        insert_min_supplier(&c, "sup-1", "A");
        insert_min_shipment(&c, "sh-1", "sup-1", "INV-100", "2025-01-15");
        let d = check_duplicate_invoice("sup-1", "INV-100", "2025-01-15", &c).expect("ok");
        assert_eq!(d, Some("sh-1".to_string()));
    }

    #[test]
    fn different_invoice_number_allowed() {
        let c = open_mem();
        insert_min_supplier(&c, "sup-1", "A");
        insert_min_shipment(&c, "sh-1", "sup-1", "INV-100", "2025-01-15");
        let d = check_duplicate_invoice("sup-1", "INV-200", "2025-01-15", &c).expect("ok");
        assert!(d.is_none());
    }

    #[test]
    fn different_date_allowed() {
        let c = open_mem();
        insert_min_supplier(&c, "sup-1", "A");
        insert_min_shipment(&c, "sh-1", "sup-1", "INV-100", "2025-01-15");
        let d = check_duplicate_invoice("sup-1", "INV-100", "2025-01-20", &c).expect("ok");
        assert!(d.is_none());
    }

    #[test]
    fn different_supplier_allowed() {
        let c = open_mem();
        insert_min_supplier(&c, "sup-1", "A");
        insert_min_supplier(&c, "sup-2", "B");
        insert_min_shipment(&c, "sh-1", "sup-1", "INV-100", "2025-01-15");
        let d = check_duplicate_invoice("sup-2", "INV-100", "2025-01-15", &c).expect("ok");
        assert!(d.is_none());
    }
}
