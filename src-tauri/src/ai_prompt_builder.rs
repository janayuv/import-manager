//! Centralized prompt text for AI invoice extraction (DeepSeek, etc.).

const SYSTEM_INVOICE_EXTRACTION: &str = "You are an invoice parser for an import management system.\n\n\
Return ONLY valid JSON.\n\n\
Do not include explanations.\n\n\
Use the exact schema below.\n\n\
--- Header and shipment (read this section FIRST) ---\n\n\
Always determine supplierName, invoiceNumber, invoiceDate, invoiceCurrency, invoiceValue, and shipmentTotal from the TOP of the document (header / summary / meta block) BEFORE you enumerate the item table. Do not delay or drop header fields because the line-item table is long; header extraction must not be skipped when large tables exist. Output both a complete header block in JSON and a complete lineItems array; never return lineItems only and omit the header.\n\n\
map shipmentTotal to the final invoice or shipment amount from a totals line labeled TOTAL, GRAND TOTAL, or Amount / AMOUNT / Amount Total, using the final amount value, not a line-level subtotal unless no grand total is shown.\n\n\
--- Line item table (strict) ---\n\n\
Extract ALL rows from the item data table. Continue in reading order (top to bottom) until a TOTAL (summary) row. Do NOT stop after only the first few data rows, two rows, or three rows — return every part line before the total.\n\n\
Follow the column-mapping rules in the user message: partNumber MUST come from the Part No / part-number column only, never from the Quantity column.\n\n\
If at least one data row exists in the item table, lineItems must NOT be empty, and it must list every part row, not a truncated sample.\n\n\
Extraction rules:\n\
- Map JSON partNumber only from the column labeled for part numbers (Part No, etc.). Never copy the quantity cell into partNumber.\n\
- If a data row has Part number (or part id), Quantity, and Unit price, it must become one lineItem — include all such rows.\n\
- Description: see user schema (itemName may be empty).\n\
- quantity and unitPrice must be numeric. Do not put currency symbols inside numeric values.\n\n\
Continuation: Tables may continue across a page, image crop, or multiple vertical areas; keep scanning downward until a TOTAL (or final summary) row.\n\n\
Table location:\n\
The item table is often in the lower half. Data rows continue in order; do not skip middle rows and do not end lineItems early when more rows are visible before TOTAL.\n\n\
Stop including line items ONLY for rows that are clearly totals, not for normal data. Headers to stop before (not as a lineItem): text such as TOTAL, GRAND TOTAL, or Amount Total (in addition to AMOUNT TOTAL) when that row is the invoice summary, not a part line.\n\n\
lineItems must include all detected part rows. Returning only the first few line items is not allowed when more part rows are present.";

const USER_HEADER_PRIORITY: &str = "=== Extraction order (required) ===\n\n\
Step 1 — Header and shipment (always do this FIRST, before the item table)\n\n\
From the top section of the invoice (header / title / meta, above the line table), extract and set in JSON:\n\n\
- supplierName\n\
- invoiceNumber\n\
- invoiceDate\n\
- invoiceCurrency\n\
- invoiceValue (if shown as invoice total; else null or match your schema)\n\
- shipmentTotal (see totals rule below)\n\n\
Read these fields while viewing the upper part of the page. Then Step 2 — scan the item table and fill lineItems. Do not output lineItems only; header fields must be filled when the document shows them, even if the table has 10+ rows and takes most of the page.\n\n\
--- Shipment / invoice total (shipmentTotal) ---\n\n\
shipmentTotal must be the final amount from a row or block clearly labeled for the whole document total, e.g. TOTAL, GRAND TOTAL, or Amount Total. Prefer the last / final total amount, not a running subtotal, unless the document has no grand total line.\n\n\
--- Invoice number (invoiceNumber) ---\n\n\
Look for labels such as: Invoice No, No. & date of invoice, Invoice number, INVOICE NO, or similar. The value is usually in the top third of the page.\n\n\
--- Invoice date (invoiceDate) ---\n\n\
Convert the visible date to exactly YYYY-MM-DD. Example: 23 March, 2026 → 2026-03-23. If the document shows only day/month/year, infer the year from context on the same page when possible.\n\n\
--- Currency (invoiceCurrency) ---\n\n\
Extract the document currency (e.g. USD, KRW, EUR) from the header, from a money column header, or from near the Unit price / price column (e.g. \"U/P (USD)\"). Use a short ISO-style code in JSON (USD, not \"$\").\n\n\
--- Enforcement ---\n\n\
Header extraction must never be skipped even when large item tables exist. The output JSON must always include the header and shipment fields you can read, then lineItems — not lineItems without headers when those fields appear on the invoice.\n\n\
---\n\n\
";

const USER_SCHEMA: &str = "Extract structured invoice data using this schema:\n\n\
supplier:\n\n\
supplierName\n\n\
shipment:\n\n\
invoiceNumber\n\
invoiceDate\n\
invoiceValue\n\
invoiceCurrency\n\n\
invoice:\n\n\
shipmentTotal\n\n\
lineItems (array; each object requires partNumber, itemName, quantity, unitPrice):\n\n\
partNumber — from the Part No column only; see strict mapping below. Required for every line you output.\n\
itemName — from the description column when available; if missing or unclear, use an empty string \"\". Never omit the key.\n\
quantity\n\
unitPrice\n\n\
--- Column mapping (STRICT) for line item rows ---\n\n\
The item line table may include columns in this order (header labels vary):\n\n\
Description | HS CODE | Part No | Quantity | Unit | Unit Price | Amount\n\n\
The part number in JSON (partNumber) MUST be read only from the column whose header is for the part / stock id — typically labeled:\n\
Part No, PART NO, Part Number, P/N, or similar.\n\n\
Do NOT use the Quantity column as partNumber. The Quantity column holds order quantities (often 10,000+); the Part No column holds 6-10 digit part identifiers.\n\n\
Part numbers are typically 6-10 digit numbers. Examples: 52686311, 74223571, 703724. Prefer the value under the Part No header, not a large round quantity from a neighboring cell.\n\n\
Locate the correct part column: find the table header text containing Part No, PART NO, or Part Number (case-insensitive). Use only the cells in that column for partNumber, cell-by-cell for each data row (ignore that column for quantity).\n\n\
Quantity: read only from the column labeled Quantity, Qty, or equivalent. Do not use numeric values from Part No, HS CODE, Unit, Unit Price, or Amount for the quantity field — except when filling quantity from the intended Quantity cell.\n\n\
If other columns (Description, HS CODE, Unit) are present, do not put their text into partNumber; partNumber is only the part id from the Part No column (or the agreed part column).\n\n\
Example: one data row in the order Part No, Quantity, Unit price cells shows:\n\
52686311  |  30000  |  1.032\n\n\
Correct JSON for that one row (include itemName as \"\" if no description is mapped):\n\
{\"partNumber\":\"52686311\",\"itemName\":\"\",\"quantity\":30000,\"unitPrice\":1.032}\n\n\
WRONG: {\"partNumber\":\"30000\",...} when the part cell is 52686311 — 30000 is the quantity, not the part id.\n\n\
Validation: If a line you would emit has the same numeric value in partNumber and quantity and the part column visually shows a different 6-10 digit part and a separate quantity, that line is a column swap. Discard that incorrect line, re-read the same row from the table using the Part No column for partNumber and the Quantity column for quantity only, then re-output the corrected line (retry extraction for that row once before finalizing lineItems).\n\n\
Rules:\n\n\
1. Dates must be:\n\
YYYY-MM-DD\n\n\
2. Header numbers must be numeric. Line quantities and unit prices must be numeric.\n\
No currency symbols in numeric values.\n\n\
3. If a header or shipment field is missing in the document, return null for that field (see schema in examples).\n\n\
4. Always return a valid JSON object. For every visible line in the item table, output one lineItems entry. If you see multiple Part No rows, lineItems must have the same count (do not return an empty lineItems array when rows exist).\n\n\
5. partNumber is the part id from the Part No column; a missing or ambiguous description is allowed (empty itemName).\n\n\
Full-document example (two line items; itemName may be empty when description is unknown): ";

/// Minified example JSON: matches the flat shape expected by the extraction parser. Multiple line items; empty itemName allowed.
const EXAMPLE_FLAT_INVOICE_JSON: &str = r#"{"supplierName":"INZI CONTROLS CO., LTD.","invoiceNumber":"ICKK-CHEN260323","invoiceDate":"2026-03-23","invoiceValue":64318.92,"invoiceCurrency":"USD","shipmentTotal":64318.92,"lineItems":[{"partNumber":"52686311","itemName":"","quantity":30000,"unitPrice":1.032},{"partNumber":"74223571","itemName":"","quantity":30000,"unitPrice":0.197}]}"#;

const USER_TABLE_ROW_CONTINUATION: &str = "\n\n--- Read every data row (no truncation) ---\n\n\
Extract ALL rows from the item table. Read each part row in top-to-bottom order through the end of the item section, ending only at the first TOTAL (or final summary) row, not at an arbitrary line count. Do NOT stop after only the first one, two, or a few part rows; continue until the TOTAL / summary line.\n\n\
Stop line-item extraction at rows that are clearly totals, whose labels include: TOTAL, GRAND TOTAL, or Amount Total (and AMOUNT TOTAL, same idea). Do not use any other line as a stop; every row above that with valid Part / Qty / Unit price is a lineItem.\n\n\
Rows may continue across a page, fold, or multiple view regions. Continue scanning downward in the same table until you reach the TOTAL line; if the same table reappears, add each additional data row to lineItems in order.\n\n\
If a data row has Part number (or part id), Quantity, and Unit price per the column map, it must be included. lineItems must include all such detected part rows. Returning only the first few part rows is not allowed when the document shows more. If the document visually has more part rows than your lineItems, re-read and return every part row; under-counting is a failure to follow these rules.\n\n\
Example (four line items; real output also includes itemName and full header as in earlier schema):\n\n\
";

const EXAMPLE_FOUR_LINE_ITEMS: &str = r#"[
  {"partNumber":"52686311","itemName":"","quantity":30000,"unitPrice":1.032},
  {"partNumber":"74223571","itemName":"","quantity":30000,"unitPrice":0.197},
  {"partNumber":"742233","itemName":"","quantity":32000,"unitPrice":0.275},
  {"partNumber":"703724","itemName":"","quantity":30000,"unitPrice":0.015}
]

"#;

/// 12 [lineItems] for prompt + tests: proves long tables must output many elements (length > 10).
const LINE_ITEMS_12_DEMO: &str = r#"{"lineItems":[{"partNumber":"52686311","itemName":"","quantity":30000,"unitPrice":1.032},{"partNumber":"74223571","itemName":"","quantity":30000,"unitPrice":0.197},{"partNumber":"742233","itemName":"","quantity":32000,"unitPrice":0.275},{"partNumber":"703724","itemName":"","quantity":30000,"unitPrice":0.015},{"partNumber":"700001","itemName":"","quantity":1000,"unitPrice":1.0},{"partNumber":"700002","itemName":"","quantity":1000,"unitPrice":1.0},{"partNumber":"700003","itemName":"","quantity":1000,"unitPrice":1.0},{"partNumber":"700004","itemName":"","quantity":1000,"unitPrice":1.0},{"partNumber":"700005","itemName":"","quantity":1000,"unitPrice":1.0},{"partNumber":"700006","itemName":"","quantity":1000,"unitPrice":1.0},{"partNumber":"700007","itemName":"","quantity":1000,"unitPrice":1.0},{"partNumber":"700008","itemName":"","quantity":1000,"unitPrice":1.0}]}"#;

/// Standardized system + user prompts for invoice extraction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvoiceExtractionPrompts {
    pub system: String,
    pub user: String,
}

/// Build prompts for DeepSeek (or compatible) vision extraction.
///
/// `file_name` is included as context for the model when set (e.g. extension hints for PDF vs image).
pub fn build_invoice_extraction_prompt(
    supplier_hint: Option<&str>,
    file_name: Option<&str>,
) -> InvoiceExtractionPrompts {
    let system = SYSTEM_INVOICE_EXTRACTION.to_string();
    let mut user = String::new();
    user.push_str(USER_HEADER_PRIORITY);
    user.push_str(USER_SCHEMA);
    user.push_str(EXAMPLE_FLAT_INVOICE_JSON);
    user.push_str(USER_TABLE_ROW_CONTINUATION);
    user.push_str(EXAMPLE_FOUR_LINE_ITEMS);
    user.push_str("Long-invoice reference (12+ part rows; lineItems must list every part row, not a prefix):\n\n");
    user.push_str(LINE_ITEMS_12_DEMO);
    if let Some(name) = file_name {
        let n = name.trim();
        if !n.is_empty() {
            user.push_str("\n\nThe uploaded file is named: ");
            user.push_str(n);
        }
    }
    if let Some(hint) = supplier_hint {
        let h = hint.trim();
        if !h.is_empty() {
            user.push_str(&format!("\n\nExpected supplier name: {h}"));
        }
    }
    InvoiceExtractionPrompts { system, user }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_prompt_is_standard_text() {
        let p = build_invoice_extraction_prompt(None, None);
        assert_eq!(p.system, SYSTEM_INVOICE_EXTRACTION);
    }

    #[test]
    fn user_prompt_includes_schema_fields() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.user.contains("supplierName"));
        assert!(p.user.contains("invoiceNumber"));
        assert!(p.user.contains("shipmentTotal"));
        assert!(p.user.contains("lineItems"));
        assert!(p.user.contains("partNumber"));
        assert!(p.user.contains("itemName"));
        assert!(p.user.contains("unitPrice"));
        assert!(p.user.to_ascii_lowercase().contains("return null"));
    }

    #[test]
    fn system_prompt_requires_all_table_rows_and_nonempty_lineitems_when_rows_exist() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.system.contains("Extract ALL rows from the item data table"));
        assert!(p.system.contains("lineItems must NOT be empty"));
        assert!(p.system.contains("Part No / part-number column only"));
    }

    #[test]
    fn system_prompt_rejects_stopping_after_first_few_rows() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.system.contains("Do NOT stop after only the first few data rows"));
        assert!(p.system.to_ascii_lowercase().contains("amount total"));
    }

    #[test]
    fn user_prompt_instructs_part_no_column_not_quantity_for_partnumber() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.user.contains("Do NOT use the Quantity column as partNumber"));
        assert!(p.user.to_ascii_lowercase().contains("part no"));
        assert!(p.user.contains("Use only the cells in that column for partNumber"));
    }

    #[test]
    fn user_prompt_example_row_maps_part_52686311_to_qty_30000_not_swapped() {
        let p = build_invoice_extraction_prompt(None, None);
        // Illustrates correct column mapping: 52686311 in part, 30000 in quantity
        assert!(p.user.contains("52686311  |  30000  |  1.032"));
        assert!(p.user.contains(r#""partNumber":"52686311""#) && p.user.contains(r#""quantity":30000"#));
    }

    #[test]
    fn system_prompt_includes_total_termination_and_table_location() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.system.contains("lower half"));
        assert!(p.system.contains("GRAND TOTAL"));
        assert!(p.system.contains("AMOUNT TOTAL"));
    }

    #[test]
    fn user_prompt_includes_supplier_hint_when_present() {
        let p = build_invoice_extraction_prompt(Some("  Global Spares Co  "), None);
        assert!(p.user.contains("Expected supplier name: Global Spares Co"));
    }

    #[test]
    fn user_prompt_omits_hint_line_when_empty_or_whitespace() {
        let a = build_invoice_extraction_prompt(Some("   "), None);
        let b = build_invoice_extraction_prompt(None, None);
        assert!(!a.user.contains("Expected supplier name:"));
        assert!(!b.user.contains("Expected supplier name:"));
    }

    #[test]
    fn user_prompt_includes_file_name_when_present() {
        let p = build_invoice_extraction_prompt(
            None,
            Some(" invoice_ABC-99.pdf "),
        );
        assert!(p.user.contains("The uploaded file is named: invoice_ABC-99.pdf"));
    }

    #[test]
    fn user_prompt_omits_file_name_when_empty() {
        let a = build_invoice_extraction_prompt(None, Some("  "));
        let b = build_invoice_extraction_prompt(None, None);
        assert!(!a.user.contains("The uploaded file is named:"));
        assert!(!b.user.contains("The uploaded file is named:"));
    }

    #[test]
    fn user_prompt_includes_multi_line_item_example_with_part_numbers() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.user.contains("\"lineItems\":"));
        assert!(p.user.contains("\"partNumber\":\"52686311\""));
        assert!(p.user.contains("\"partNumber\":\"74223571\""));
    }

    /// The embedded minified example must be valid JSON and contain more than one line item (prompt contract).
    #[test]
    fn example_line_items_len_gt_zero_and_multiple() {
        use serde_json::Value;
        let v: Value = serde_json::from_str(EXAMPLE_FLAT_INVOICE_JSON).expect("example JSON");
        let items = v
            .get("lineItems")
            .and_then(|x| x.as_array())
            .expect("lineItems array");
        assert!(!items.is_empty());
        assert_eq!(items.len(), 2);
    }

    /// Built user prompt embeds the example; with optional file name (or hint) the JSON is still a prefix match of the constant.
    #[test]
    fn built_user_prompt_includes_parsable_multi_item_example() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.user.contains(EXAMPLE_FLAT_INVOICE_JSON));
        use serde_json::Value;
        let v: Value = serde_json::from_str(EXAMPLE_FLAT_INVOICE_JSON).expect("user embed");
        let n = v
            .get("lineItems")
            .and_then(|x| x.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        assert!(n > 0, "lineItems array length must be > 0 in the prompt example");
        assert_eq!(n, 2);
    }

    #[test]
    fn long_table_enforcement_appears_in_user_prompt() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.user
            .to_ascii_lowercase()
            .contains("returning only the first few part rows is not allowed"));
    }

    /// The built user message embeds the [12+]-row [lineItems] reference; parsed [lineItems] length is [>] 10.
    #[test]
    fn long_table_user_prompt_includes_12_item_demo_length_gt_10() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(
            p.user.contains(LINE_ITEMS_12_DEMO),
            "user prompt must include the long-table lineItems example"
        );
        use serde_json::Value;
        let v: Value = serde_json::from_str(LINE_ITEMS_12_DEMO).expect("12-row demo");
        let n = v
            .get("lineItems")
            .and_then(|x| x.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        assert!(n > 10, "table-with-many-rows reference must have > 10 line items");
        assert_eq!(n, 12);
    }

    #[test]
    fn user_prompt_includes_header_first_extraction_order() {
        let p = build_invoice_extraction_prompt(None, None);
        let u = p.user.to_ascii_lowercase();
        assert!(u.contains("step 1") && u.contains("before the item table"));
        assert!(p.user.to_ascii_lowercase().contains("yyyy-mm-dd") && p.user.contains("KRW"));
    }

    #[test]
    fn system_prompt_mentions_read_header_before_line_table() {
        let p = build_invoice_extraction_prompt(None, None);
        assert!(p.system.to_ascii_lowercase().contains("before you enumerate the item table"));
    }

    /// A full invoice with many [lineItems] must still have non-empty header field strings and a numeric [shipmentTotal] (regression: headers must not be lost when the table is long).
    #[test]
    fn long_table_contract_invoice_with_headers_parses() {
        use serde_json::json;
        use serde_json::Value;
        let lines: Value = serde_json::from_str(LINE_ITEMS_12_DEMO).expect("12 lines");
        let full = json!({
            "supplierName": "INZI CONTROLS CO., LTD.",
            "invoiceNumber": "ICKK-CHEN260323",
            "invoiceDate": "2026-03-23",
            "invoiceValue": 64318.92,
            "invoiceCurrency": "USD",
            "shipmentTotal": 64318.92,
            "lineItems": lines.get("lineItems").expect("lineItems key")
        });
        let inv = full.get("invoiceNumber").and_then(|v| v.as_str());
        let date = full.get("invoiceDate").and_then(|v| v.as_str());
        let st = full.get("shipmentTotal").and_then(|v| v.as_f64());
        assert!(!inv.unwrap_or("").is_empty(), "invoiceNumber not empty when present in template");
        assert!(!date.unwrap_or("").is_empty(), "invoiceDate not empty");
        assert!(!date.unwrap().contains("March"), "date normalized to YYYY-MM-DD in contract");
        assert!(st.is_some() && st.unwrap() > 0.0, "shipmentTotal numeric and positive");
        let cur = full.get("invoiceCurrency").and_then(|v| v.as_str());
        assert_eq!(cur, Some("USD"), "currency extracted as code in contract example");
        let n = full
            .get("lineItems")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        assert!(n > 10, "header + 12+ line items shape");
    }
}
