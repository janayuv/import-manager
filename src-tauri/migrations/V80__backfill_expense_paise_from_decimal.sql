-- Backfill *_paise columns on the expenses table for legacy rows.
--
-- When the paise columns were added via ALTER TABLE ... DEFAULT 0, SQLite
-- filled every existing row with 0 (not NULL). The subsequent migration
-- backfill used WHERE amount_paise IS NULL, which matched nothing, leaving
-- legacy rows with zeroed paise columns while the decimal columns (amount,
-- cgst_amount, …) still hold the real values.
--
-- This migration corrects those rows: any row where amount_paise = 0 but
-- amount > 0 is treated as a legacy row that was never backfilled.

UPDATE expenses
SET
    amount_paise       = CAST(ROUND(amount                        * 100) AS INTEGER),
    cgst_amount_paise  = CAST(ROUND(cgst_amount                   * 100) AS INTEGER),
    sgst_amount_paise  = CAST(ROUND(sgst_amount                   * 100) AS INTEGER),
    igst_amount_paise  = CAST(ROUND(igst_amount                   * 100) AS INTEGER),
    tds_amount_paise   = CAST(ROUND(tds_amount                    * 100) AS INTEGER),
    total_amount_paise = CAST(ROUND(total_amount                  * 100) AS INTEGER),
    -- net_amount was never added as a decimal column on upgraded installs (only
    -- net_amount_paise INTEGER was added via ALTER TABLE). Derive net from the
    -- GENERATED ALWAYS columns that exist in the original V1 schema.
    net_amount_paise   = CAST(ROUND((total_amount - tds_amount)   * 100) AS INTEGER)
WHERE amount_paise = 0
  AND amount IS NOT NULL
  AND amount != 0;

-- Same correction for expense_invoices summary totals.
-- Note: total_tds_amount (decimal) was never added to expense_invoices; only
-- total_tds_amount_paise (INTEGER) exists. Legacy invoices carried no TDS so
-- total_tds_amount_paise stays 0 and net equals gross.
UPDATE expense_invoices
SET
    total_amount_paise      = CAST(ROUND(total_amount      * 100) AS INTEGER),
    total_cgst_amount_paise = CAST(ROUND(total_cgst_amount * 100) AS INTEGER),
    total_sgst_amount_paise = CAST(ROUND(total_sgst_amount * 100) AS INTEGER),
    total_igst_amount_paise = CAST(ROUND(total_igst_amount * 100) AS INTEGER),
    total_tds_amount_paise  = 0,
    net_amount_paise        = CAST(ROUND(total_amount      * 100) AS INTEGER)
WHERE total_amount_paise = 0
  AND total_amount IS NOT NULL
  AND total_amount != 0;
