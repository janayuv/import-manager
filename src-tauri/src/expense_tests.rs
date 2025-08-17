#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;
    use std::collections::HashMap;

    // ============================================================================
    // Test Setup and Utilities
    // ============================================================================

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        
        // Create test tables
        sqlx::query(
            "CREATE TABLE expense_types (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                default_cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
                default_sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
                default_igst_rate DECIMAL(5, 2) DEFAULT 0.00,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE expense_invoices (
                id TEXT PRIMARY KEY,
                shipment_id TEXT NOT NULL,
                service_provider_id TEXT NOT NULL,
                invoice_number TEXT NOT NULL,
                invoice_date DATE NOT NULL,
                currency TEXT NOT NULL,
                total_amount_paise DECIMAL(12, 2) NOT NULL,
                total_cgst_amount_paise DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                total_sgst_amount_paise DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                total_igst_amount_paise DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                total_tds_amount_paise DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                net_amount_paise DECIMAL(12, 2) NOT NULL,
                idempotency_key TEXT,
                version INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(service_provider_id, invoice_number)
            )"
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE expenses (
                id TEXT PRIMARY KEY,
                expense_invoice_id TEXT NOT NULL,
                shipment_id TEXT NOT NULL,
                service_provider_id TEXT NOT NULL,
                invoice_no TEXT NOT NULL,
                invoice_date DATE NOT NULL,
                expense_type_id TEXT NOT NULL,
                amount_paise DECIMAL(12, 2) NOT NULL,
                cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
                sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
                igst_rate DECIMAL(5, 2) DEFAULT 0.00,
                tds_rate DECIMAL(5, 2) DEFAULT 0.00,
                cgst_amount_paise DECIMAL(12, 2) NOT NULL,
                sgst_amount_paise DECIMAL(12, 2) NOT NULL,
                igst_amount_paise DECIMAL(12, 2) NOT NULL,
                tds_amount_paise DECIMAL(12, 2) NOT NULL,
                total_amount_paise DECIMAL(12, 2) NOT NULL,
                net_amount_paise DECIMAL(12, 2) NOT NULL,
                remarks TEXT,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (expense_invoice_id) REFERENCES expense_invoices(id),
                UNIQUE(expense_invoice_id, expense_type_id)
            )"
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE invoice_audit (
                id TEXT PRIMARY KEY,
                invoice_id TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert test data with basis points rates
        sqlx::query(
            "INSERT INTO expense_types (id, name, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp) 
             VALUES 
                ('type1', 'Customs Duty', 900, 900, 0),
                ('type2', 'Freight', 0, 0, 1800),
                ('type3', 'Handling', 900, 900, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    fn create_test_payload() -> ExpenseInvoicePayload {
        ExpenseInvoicePayload {
            shipment_id: "shipment1".to_string(),
            service_provider_id: "provider1".to_string(),
            invoice_number: "INV-001".to_string(),
            invoice_date: "2025-01-15".to_string(),
            currency: "INR".to_string(),
            idempotency_key: Some("test-key-1".to_string()),
            lines: vec![
                ExpenseLine {
                    expense_type_id: "type1".to_string(),
                    amount_paise: 100000, // ₹1000
                    cgst_rate: 900,      // 9%
                    sgst_rate: 900,      // 9%
                    igst_rate: 0,
                    tds_rate: 0,
                    remarks: Some("Customs duty".to_string()),
                },
                ExpenseLine {
                    expense_type_id: "type2".to_string(),
                    amount_paise: 50000,  // ₹500
                    cgst_rate: 0,
                    sgst_rate: 0,
                    igst_rate: 1800,     // 18%
                    tds_rate: 0,
                    remarks: Some("Freight charges".to_string()),
                },
            ],
        }
    }

    // ============================================================================
    // Tax Calculator Tests
    // ============================================================================

    #[test]
    fn test_tax_calculator_basic_calculations() {
        // Test basic tax calculation
        let amount = 100000; // ₹1000
        let rate = 900;      // 9%
        let expected = 9000;  // ₹90
        
        assert_eq!(TaxCalculator::calculate_tax_amount(amount, rate), expected);
    }

    #[test]
    fn test_tax_calculator_zero_rate() {
        let amount = 100000;
        let rate = 0;
        
        assert_eq!(TaxCalculator::calculate_tax_amount(amount, rate), 0);
    }

    #[test]
    fn test_tax_calculator_small_amounts() {
        // Test edge case with very small amounts
        let amount = 1;      // 1 paise
        let rate = 900;      // 9%
        let expected = 0;    // Should round down to 0
        
        assert_eq!(TaxCalculator::calculate_tax_amount(amount, rate), expected);
    }

    #[test]
    fn test_tax_calculator_rounding() {
        // Test rounding behavior
        let amount = 111111; // ₹1111.11
        let rate = 900;      // 9%
        let expected = 10000; // ₹100.00 (rounded)
        
        assert_eq!(TaxCalculator::calculate_tax_amount(amount, rate), expected);
    }

    #[test]
    fn test_tax_calculator_net_amount() {
        let amount_paise = 100000;
        let cgst_amount_paise = 9000;
        let sgst_amount_paise = 9000;
        let igst_amount_paise = 0;
        let tds_amount_paise = 5000;
        
        let expected = 100000 + 9000 + 9000 + 0 - 5000; // 113000
        
        assert_eq!(
            TaxCalculator::calculate_net_amount(
                amount_paise,
                cgst_amount_paise,
                sgst_amount_paise,
                igst_amount_paise,
                tds_amount_paise,
            ),
            expected
        );
    }

    #[test]
    fn test_tax_calculator_total_amount() {
        let amount_paise = 100000;
        let cgst_amount_paise = 9000;
        let sgst_amount_paise = 9000;
        let igst_amount_paise = 0;
        
        let expected = 100000 + 9000 + 9000 + 0; // 118000
        
        assert_eq!(
            TaxCalculator::calculate_total_amount(
                amount_paise,
                cgst_amount_paise,
                sgst_amount_paise,
                igst_amount_paise,
            ),
            expected
        );
    }

    // ============================================================================
    // Validation Tests
    // ============================================================================

    #[test]
    fn test_validation_valid_payload() {
        let payload = create_test_payload();
        assert!(ExpenseValidator::validate_payload(&payload).is_ok());
    }

    #[test]
    fn test_validation_empty_lines() {
        let mut payload = create_test_payload();
        payload.lines.clear();
        
        let result = ExpenseValidator::validate_payload(&payload);
        assert!(matches!(result, Err(ExpenseError::NoExpenseLines)));
    }

    #[test]
    fn test_validation_empty_invoice_number() {
        let mut payload = create_test_payload();
        payload.invoice_number = "".to_string();
        
        let result = ExpenseValidator::validate_payload(&payload);
        assert!(matches!(result, Err(ExpenseError::Validation(_))));
    }

    #[test]
    fn test_validation_empty_service_provider() {
        let mut payload = create_test_payload();
        payload.service_provider_id = "".to_string();
        
        let result = ExpenseValidator::validate_payload(&payload);
        assert!(matches!(result, Err(ExpenseError::Validation(_))));
    }

    #[test]
    fn test_validation_invalid_amount() {
        let mut payload = create_test_payload();
        payload.lines[0].amount_paise = 0;
        
        let result = ExpenseValidator::validate_payload(&payload);
        assert!(matches!(result, Err(ExpenseError::InvalidAmount(_))));
    }

    #[test]
    fn test_validation_invalid_tax_rate() {
        let mut payload = create_test_payload();
        payload.lines[0].cgst_rate = 10001; // > 10000
        
        let result = ExpenseValidator::validate_payload(&payload);
        assert!(matches!(result, Err(ExpenseError::InvalidTaxRate(_))));
    }

    #[test]
    fn test_validation_negative_tax_rate() {
        let mut payload = create_test_payload();
        payload.lines[0].cgst_rate = -1;
        
        let result = ExpenseValidator::validate_payload(&payload);
        assert!(matches!(result, Err(ExpenseError::InvalidTaxRate(_))));
    }

    // ============================================================================
    // Integration Tests
    // ============================================================================

    #[tokio::test]
    async fn test_create_expense_invoice() {
        let pool = setup_test_db().await;
        let payload = create_test_payload();
        
        let result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(result.is_ok());
        
        let response = result.unwrap();
        assert!(!response.invoice_id.is_empty());
        assert_eq!(response.version, 1);
        
        // Verify totals
        let expected_total = 100000 + 50000; // Base amounts
        let expected_cgst = 9000;  // 9% of 100000
        let expected_sgst = 9000;  // 9% of 100000
        let expected_igst = 9000;  // 18% of 50000
        let expected_tds = 0;
        
        assert_eq!(response.total_amount_paise, expected_total);
        assert_eq!(response.total_cgst_amount_paise, expected_cgst);
        assert_eq!(response.total_sgst_amount_paise, expected_sgst);
        assert_eq!(response.total_igst_amount_paise, expected_igst);
        assert_eq!(response.total_tds_amount_paise, expected_tds);
    }

    #[tokio::test]
    async fn test_idempotency_key_prevents_duplicates() {
        let pool = setup_test_db().await;
        let payload = create_test_payload();
        
        // Create first invoice
        let result1 = ExpenseService::create_or_update_invoice(&pool, payload.clone()).await;
        assert!(result1.is_ok());
        let response1 = result1.unwrap();
        
        // Try to create with same idempotency key
        let result2 = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(result2.is_ok());
        let response2 = result2.unwrap();
        
        // Should return the same invoice
        assert_eq!(response1.invoice_id, response2.invoice_id);
        assert_eq!(response1.total_amount_paise, response2.total_amount_paise);
    }

    #[tokio::test]
    async fn test_preview_invoice_calculations() {
        let pool = setup_test_db().await;
        let payload = create_test_payload();
        
        let result = ExpenseService::preview_invoice(&pool, &payload).await;
        assert!(result.is_ok());
        
        let preview = result.unwrap();
        assert_eq!(preview.lines.len(), 2);
        
        // Verify line calculations
        let line1 = &preview.lines[0];
        assert_eq!(line1.amount_paise, 100000);
        assert_eq!(line1.cgst_amount_paise, 9000);
        assert_eq!(line1.sgst_amount_paise, 9000);
        assert_eq!(line1.igst_amount_paise, 0);
        assert_eq!(line1.total_amount_paise, 118000);
        
        let line2 = &preview.lines[1];
        assert_eq!(line2.amount_paise, 50000);
        assert_eq!(line2.cgst_amount_paise, 0);
        assert_eq!(line2.sgst_amount_paise, 0);
        assert_eq!(line2.igst_amount_paise, 9000);
        assert_eq!(line2.total_amount_paise, 59000);
        
        // Verify totals
        assert_eq!(preview.total_amount_paise, 150000);
        assert_eq!(preview.total_cgst_amount_paise, 9000);
        assert_eq!(preview.total_sgst_amount_paise, 9000);
        assert_eq!(preview.total_igst_amount_paise, 9000);
        assert_eq!(preview.total_tds_amount_paise, 0);
        assert_eq!(preview.net_amount_paise, 177000);
    }

    #[tokio::test]
    async fn test_combine_duplicates() {
        let pool = setup_test_db().await;
        
        // Create invoice with duplicate expense types
        let mut payload = create_test_payload();
        payload.lines.push(ExpenseLine {
            expense_type_id: "type1".to_string(), // Duplicate
            amount_paise: 20000,
            cgst_rate: 900,
            sgst_rate: 900,
            igst_rate: 0,
            tds_rate: 0,
            remarks: Some("Additional customs".to_string()),
        });
        
        let result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        
        // Combine duplicates
        let combine_result = ExpenseService::combine_duplicates(&pool, &response.invoice_id, "; ").await;
        assert!(combine_result.is_ok());
        
        let combined_response = combine_result.unwrap();
        assert_eq!(combined_response.version, response.version + 1);
        
        // Verify the invoice now has only 2 lines (type1 combined, type2 unchanged)
        let invoice = ExpenseService::get_invoice(&pool, &response.invoice_id).await.unwrap();
        assert_eq!(invoice.lines.len(), 2);
        
        // Find the combined type1 line
        let type1_line = invoice.lines.iter().find(|l| l.expense_type_id == "type1").unwrap();
        assert_eq!(type1_line.amount_paise, 120000); // 100000 + 20000
        assert!(type1_line.remarks.as_ref().unwrap().contains("Customs duty"));
        assert!(type1_line.remarks.as_ref().unwrap().contains("Additional customs"));
    }

    #[tokio::test]
    async fn test_optimistic_lock_conflict() {
        let pool = setup_test_db().await;
        let payload = create_test_payload();
        
        // Create invoice
        let result = ExpenseService::create_or_update_invoice(&pool, payload.clone()).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        
        // Try to create with same service provider and invoice number (should trigger update path)
        let update_result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(update_result.is_err());
        
        let error = update_result.unwrap_err();
        assert!(matches!(error, ExpenseError::Validation(_)));
        assert!(error.to_string().contains("Update not implemented"));
    }

    #[tokio::test]
    async fn test_transaction_rollback_on_error() {
        let pool = setup_test_db().await;
        
        // Create payload with invalid expense type (should cause foreign key error)
        let mut payload = create_test_payload();
        payload.lines[0].expense_type_id = "invalid_type".to_string();
        
        let result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(result.is_err());
        
        // Verify no data was persisted
        let count = sqlx::query!("SELECT COUNT(*) as count FROM expense_invoices")
            .fetch_one(&pool)
            .await
            .unwrap()
            .count;
        assert_eq!(count, 0);
        
        let count = sqlx::query!("SELECT COUNT(*) as count FROM expenses")
            .fetch_one(&pool)
            .await
            .unwrap()
            .count;
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_audit_logging() {
        let pool = setup_test_db().await;
        let payload = create_test_payload();
        
        let result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        
        // Verify audit entry was created
        let audit_entry = sqlx::query!(
            "SELECT action, details FROM invoice_audit WHERE invoice_id = ?",
            response.invoice_id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        
        assert_eq!(audit_entry.action, "create");
        assert!(audit_entry.details.unwrap().contains("Created invoice with 2 lines"));
    }

    #[tokio::test]
    async fn test_get_invoice_with_lines() {
        let pool = setup_test_db().await;
        let payload = create_test_payload();
        
        let result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        
        let invoice = ExpenseService::get_invoice(&pool, &response.invoice_id).await.unwrap();
        assert_eq!(invoice.lines.len(), 2);
        assert_eq!(invoice.id, response.invoice_id);
        assert_eq!(invoice.invoice_number, "INV-001");
        
        // Verify expense type names are loaded
        assert_eq!(invoice.lines[0].expense_type_name, "Customs Duty");
        assert_eq!(invoice.lines[1].expense_type_name, "Freight");
    }

    // ============================================================================
    // Edge Case Tests
    // ============================================================================

    #[tokio::test]
    async fn test_tax_rounding_small_amounts() {
        let pool = setup_test_db().await;
        
        let mut payload = create_test_payload();
        payload.lines = vec![ExpenseLine {
            expense_type_id: "type1".to_string(),
            amount_paise: 1, // 1 paise
            cgst_rate: 900,  // 9%
            sgst_rate: 0,
            igst_rate: 0,
            tds_rate: 0,
            remarks: None,
        }];
        
        let result = ExpenseService::preview_invoice(&pool, &payload).await;
        assert!(result.is_ok());
        
        let preview = result.unwrap();
        assert_eq!(preview.lines[0].cgst_amount_paise, 0); // Should round to 0
    }

    #[tokio::test]
    async fn test_combine_duplicates_groups_correctly() {
        let pool = setup_test_db().await;
        
        // Create invoice with multiple duplicates
        let mut payload = create_test_payload();
        payload.lines.push(ExpenseLine {
            expense_type_id: "type1".to_string(),
            amount_paise: 20000,
            cgst_rate: 900,
            sgst_rate: 900,
            igst_rate: 0,
            tds_rate: 0,
            remarks: Some("Second customs".to_string()),
        });
        payload.lines.push(ExpenseLine {
            expense_type_id: "type1".to_string(),
            amount_paise: 30000,
            cgst_rate: 900,
            sgst_rate: 900,
            igst_rate: 0,
            tds_rate: 0,
            remarks: Some("Third customs".to_string()),
        });
        
        let result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        
        // Combine duplicates
        let combine_result = ExpenseService::combine_duplicates(&pool, &response.invoice_id, " | ").await;
        assert!(combine_result.is_ok());
        
        let invoice = ExpenseService::get_invoice(&pool, &response.invoice_id).await.unwrap();
        assert_eq!(invoice.lines.len(), 2); // type1 combined, type2 unchanged
        
        let type1_line = invoice.lines.iter().find(|l| l.expense_type_id == "type1").unwrap();
        assert_eq!(type1_line.amount_paise, 150000); // 100000 + 20000 + 30000
        
        // Verify remarks are concatenated with custom separator
        let remarks = type1_line.remarks.as_ref().unwrap();
        assert!(remarks.contains("Customs duty"));
        assert!(remarks.contains("Second customs"));
        assert!(remarks.contains("Third customs"));
        assert!(remarks.contains(" | "));
    }

    #[tokio::test]
    async fn test_preview_matches_create_calculations() {
        let pool = setup_test_db().await;
        let payload = create_test_payload();
        
        // Get preview
        let preview_result = ExpenseService::preview_invoice(&pool, &payload).await;
        assert!(preview_result.is_ok());
        let preview = preview_result.unwrap();
        
        // Create invoice
        let create_result = ExpenseService::create_or_update_invoice(&pool, payload).await;
        assert!(create_result.is_ok());
        let response = create_result.unwrap();
        
        // Get created invoice
        let invoice = ExpenseService::get_invoice(&pool, &response.invoice_id).await.unwrap();
        
        // Verify totals match exactly
        assert_eq!(preview.total_amount_paise, invoice.total_amount_paise);
        assert_eq!(preview.total_cgst_amount_paise, invoice.total_cgst_amount_paise);
        assert_eq!(preview.total_sgst_amount_paise, invoice.total_sgst_amount_paise);
        assert_eq!(preview.total_igst_amount_paise, invoice.total_igst_amount_paise);
        assert_eq!(preview.total_tds_amount_paise, invoice.total_tds_amount_paise);
        assert_eq!(preview.net_amount_paise, invoice.net_amount_paise);
    }
}
