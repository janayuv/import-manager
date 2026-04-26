//! AI invoice extraction: mock (demo) or DeepSeek Vision (see `deepseek_client`).

use crate::ai_provider::AiProvider;
use crate::confidence_engine::calculate_final_confidence;
use crate::commands::dashboard_cache;
use crate::duplicate_detector::check_duplicate_invoice;
use crate::commands::invoices::execute_add_invoice;
use crate::commands::utils::generate_id;
use crate::db::{
    DbState, NewInvoiceLineItemPayload, NewInvoicePayload, Shipment,
};
use crate::deepseek_client::{
    call_deepseek_ocr_text, call_deepseek_parsed_text, load_deepseek_config, DeepSeekConfig,
    ParsedInvoiceExtraction,
};
use crate::excel_parser::parse_excel_invoice;
use crate::ollama_client::{
    call_ollama_ocr_text, call_ollama_parsed_text, call_ollama_vision, load_ollama_config,
    OllamaConfig,
};
use crate::retry_engine::is_retriable_network_timeout_or_5xx;
use crate::supplier_matcher::find_best_supplier_match;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

const PROVIDER_MOCK: &str = "mock";
const PROMPT_VERSION_MOCK: &str = "v0.2.2-mock";
const PROMPT_VERSION_DEEPSEEK: &str = "v0.2.2-deepseek";
const PROMPT_VERSION_OLLAMA: &str = "v0.2.2-ollama";
const STATUS_MOCK: &str = "mock";
const STATUS_PENDING: &str = "pending";
const STATUS_SUCCESS: &str = "success";
/// Logged when extraction used Tesseract OCR + text model after failed vision or low model confidence.
const STATUS_OCR_FALLBACK: &str = "ocr-fallback";
const STATUS_FAILED: &str = "failed";
/// Logged `provider_used` when DeepSeek fails with a retriable transport error and Ollama completes.
const PROVIDER_LOCAL_FALLBACK: &str = "local-fallback";
const MOCK_CONFIDENCE: f32 = 0.85;

fn default_provider_mock() -> String {
    PROVIDER_MOCK.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInvoiceRequest {
    pub file_bytes: Vec<u8>,
    pub file_name: String,
    pub supplier_hint: Option<String>,
    /// `"mock"` (default), `"deepseek"`, or `"local"` (Ollama). Mock: demo; deepseek: cloud API; local: Ollama.
    #[serde(default = "default_provider_mock")]
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInvoiceSupplier {
    pub supplier_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInvoiceShipment {
    pub invoice_number: Option<String>,
    pub invoice_date: Option<String>,
    pub invoice_value: Option<f64>,
    pub invoice_currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInvoiceLineItem {
    pub part_number: String,
    pub item_name: String,
    pub quantity: f64,
    pub unit_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInvoiceInvoice {
    pub shipment_total: Option<f64>,
    pub line_items: Vec<ExtractInvoiceLineItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInvoiceResponse {
    pub supplier: ExtractInvoiceSupplier,
    pub shipment: ExtractInvoiceShipment,
    pub invoice: ExtractInvoiceInvoice,
    pub confidence_score: f32,
    pub log_id: i64,
}

fn file_sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

fn build_mock_response(log_id: i64) -> ExtractInvoiceResponse {
    ExtractInvoiceResponse {
        supplier: ExtractInvoiceSupplier {
            supplier_name: "Demo Supplier Pvt Ltd".to_string(),
        },
        shipment: ExtractInvoiceShipment {
            invoice_number: Some("INV-DEMO-001".to_string()),
            invoice_date: Some("2025-01-01".to_string()),
            invoice_value: Some(1250.00),
            invoice_currency: Some("USD".to_string()),
        },
        invoice: ExtractInvoiceInvoice {
            shipment_total: Some(1250.00),
            line_items: vec![ExtractInvoiceLineItem {
                part_number: "P-1001".to_string(),
                item_name: "Demo Bolt".to_string(),
                quantity: 100.0,
                unit_price: 12.50,
            }],
        },
        confidence_score: MOCK_CONFIDENCE,
        log_id,
    }
}

fn parsed_extraction_to_response(
    p: &ParsedInvoiceExtraction,
    log_id: i64,
) -> ExtractInvoiceResponse {
    let missing = p.invoice_number.is_none()
        || p.invoice_date.is_none()
        || p.invoice_currency.is_none()
        || p.invoice_value.is_none()
        || p.shipment_total.is_none();
    if missing {
        log::warn!("Missing critical invoice fields from AI extraction");
    }
    let confidence = p.confidence_score.unwrap_or(0.0);
    ExtractInvoiceResponse {
        supplier: ExtractInvoiceSupplier {
            supplier_name: p.supplier_name.clone(),
        },
        shipment: ExtractInvoiceShipment {
            invoice_number: p.invoice_number.clone(),
            invoice_date: p.invoice_date.clone(),
            invoice_value: p.invoice_value,
            invoice_currency: p.invoice_currency.clone(),
        },
        invoice: ExtractInvoiceInvoice {
            shipment_total: p.shipment_total,
            line_items: p
                .line_items
                .iter()
                .map(|li| ExtractInvoiceLineItem {
                    part_number: li.part_number.clone(),
                    item_name: li.item_name.clone(),
                    quantity: li.quantity,
                    unit_price: li.unit_price,
                })
                .collect(),
        },
        confidence_score: confidence,
        log_id,
    }
}

fn update_log_success(
    conn: &Connection,
    log_id: i64,
    raw_ai_response: &str,
    extracted_json: &str,
    confidence: Option<f64>,
    provider_used: &str,
    status: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE ai_extraction_log SET
            raw_ai_response = ?1,
            extracted_json = ?2,
            confidence_score = ?3,
            status = ?4,
            provider_used = ?5
         WHERE id = ?6",
        params![raw_ai_response, extracted_json, confidence, status, provider_used, log_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn update_log_failed(conn: &Connection, log_id: i64, raw: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE ai_extraction_log SET
            raw_ai_response = ?1,
            status = ?2
         WHERE id = ?3",
        params![raw, STATUS_FAILED, log_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// XLSX / image pipeline with DeepSeek (no DB I/O). Returns parsed extraction and whether the OCR+text path was used.
fn run_deepseek_extraction(
    config: &DeepSeekConfig,
    request: &ExtractInvoiceRequest,
) -> Result<(ParsedInvoiceExtraction, bool), String> {
    let hint_ref = request
        .supplier_hint
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let is_xlsx = request
        .file_name
        .trim()
        .to_ascii_lowercase()
        .ends_with(".xlsx");
    if is_xlsx {
        let structured = parse_excel_invoice(&request.file_bytes)?;
        let r = call_deepseek_parsed_text(
            config,
            &structured,
            &request.file_name,
            hint_ref,
        );
        return r.map(|p| (p, false));
    }
    let vision = crate::deepseek_client::call_deepseek_vision(
        config,
        &request.file_bytes,
        &request.file_name,
        hint_ref,
    );
    let use_ocr = crate::ocr_engine::should_run_ocr_fallback(&vision);
    if !use_ocr {
        return vision.map(|p| (p, false));
    }
    let ocr = crate::ocr_engine::run_ocr_on_image(&request.file_bytes).map_err(|e| e)?;
    let r = call_deepseek_ocr_text(
        config,
        &ocr,
        &request.file_name,
        hint_ref,
    );
    r.map(|p| (p, true))
}

/// Same as [`run_deepseek_extraction`] for Ollama.
fn run_ollama_extraction(
    ollama_config: &OllamaConfig,
    request: &ExtractInvoiceRequest,
) -> Result<(ParsedInvoiceExtraction, bool), String> {
    let hint_ref = request
        .supplier_hint
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let is_xlsx = request
        .file_name
        .trim()
        .to_ascii_lowercase()
        .ends_with(".xlsx");
    if is_xlsx {
        let structured = parse_excel_invoice(&request.file_bytes)?;
        let r = call_ollama_parsed_text(
            ollama_config,
            &structured,
            &request.file_name,
            hint_ref,
        );
        return r.map(|p| (p, false));
    }
    let vision = call_ollama_vision(
        ollama_config,
        &request.file_bytes,
        &request.file_name,
        hint_ref,
    );
    let use_ocr = crate::ocr_engine::should_run_ocr_fallback(&vision);
    if !use_ocr {
        return vision.map(|p| (p, false));
    }
    let ocr = crate::ocr_engine::run_ocr_on_image(&request.file_bytes).map_err(|e| e)?;
    let r = call_ollama_ocr_text(
        ollama_config,
        &ocr,
        &request.file_name,
        hint_ref,
    );
    r.map(|p| (p, true))
}

/// Validates request, logs to `ai_extraction_log`, returns mock or DeepSeek extraction.
pub(crate) fn extract_invoice_with_ai_inner(
    conn: &Connection,
    request: ExtractInvoiceRequest,
) -> Result<ExtractInvoiceResponse, String> {
    if request.file_bytes.is_empty() {
        return Err("file_bytes must not be empty".to_string());
    }
    if request.file_name.trim().is_empty() {
        return Err("file_name must not be empty".to_string());
    }

    let provider = AiProvider::from_config_str(&request.provider)?;
    let file_hash = file_sha256_hex(&request.file_bytes);
    let supplier_hint = request
        .supplier_hint
        .as_ref()
        .map(|s| s.as_str().trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let supplier_hint_sql = supplier_hint.clone();

    match provider {
        AiProvider::Mock => {
            conn.execute(
                "INSERT INTO ai_extraction_log (
            file_hash, file_name, supplier_hint, provider_used, prompt_version, status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    file_hash,
                    &request.file_name,
                    supplier_hint,
                    PROVIDER_MOCK,
                    PROMPT_VERSION_MOCK,
                    STATUS_MOCK
                ],
            )
            .map_err(|e| e.to_string())?;
            let log_id = conn.last_insert_rowid();
            Ok(build_mock_response(log_id))
        }
        AiProvider::DeepSeek => {
            let config = load_deepseek_config(conn)?;
            conn.execute(
                "INSERT INTO ai_extraction_log (
            file_hash, file_name, supplier_hint, provider_used, prompt_version, status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &file_hash,
                    &request.file_name,
                    supplier_hint_sql,
                    crate::deepseek_client::deepseek_provider_label(),
                    PROMPT_VERSION_DEEPSEEK,
                    STATUS_PENDING
                ],
            )
            .map_err(|e| e.to_string())?;
            let log_id = conn.last_insert_rowid();

            match run_deepseek_extraction(&config, &request) {
                Ok((p, used_ocr)) => {
                    let response = parsed_extraction_to_response(&p, log_id);
                    let extracted = serde_json::to_string(
                        &serde_json::json!({
                            "supplier": response.supplier,
                            "shipment": response.shipment,
                            "invoice": response.invoice
                        }),
                    )
                    .map_err(|e| e.to_string())?;
                    let conf_db = p.confidence_score.map(|c| c as f64);
                    let log_status = if used_ocr {
                        STATUS_OCR_FALLBACK
                    } else {
                        STATUS_SUCCESS
                    };
                    update_log_success(
                        conn,
                        log_id,
                        &p.raw_api_response,
                        &extracted,
                        conf_db,
                        crate::deepseek_client::deepseek_provider_label(),
                        log_status,
                    )?;
                    Ok(response)
                }
                Err(e) if is_retriable_network_timeout_or_5xx(&e) => {
                    log::warn!(target: "import_manager", "DeepSeek failed, falling back to Local provider");
                    log::debug!(target: "import_manager", "DeepSeek retriable error: {e}");
                    let ollama_config = match load_ollama_config(conn) {
                        Ok(c) => c,
                        Err(oe) => {
                            let _ = update_log_failed(conn, log_id, &e);
                            return Err(format!(
                                "AI extraction (DeepSeek) did not complete: {e} (Local fallback unavailable: {oe})"
                            ));
                        }
                    };
                    match run_ollama_extraction(&ollama_config, &request) {
                        Ok((p, used_ocr)) => {
                            let response = parsed_extraction_to_response(&p, log_id);
                            let extracted = serde_json::to_string(
                                &serde_json::json!({
                                    "supplier": response.supplier,
                                    "shipment": response.shipment,
                                    "invoice": response.invoice
                                }),
                            )
                            .map_err(|json_err| {
                                let _ = update_log_failed(conn, log_id, &e);
                                json_err.to_string()
                            })?;
                            let conf_db = p.confidence_score.map(|c| c as f64);
                            let log_status = if used_ocr {
                                STATUS_OCR_FALLBACK
                            } else {
                                STATUS_SUCCESS
                            };
                            update_log_success(
                                conn,
                                log_id,
                                &p.raw_api_response,
                                &extracted,
                                conf_db,
                                PROVIDER_LOCAL_FALLBACK,
                                log_status,
                            )?;
                            Ok(response)
                        }
                        Err(_e2) => {
                            let _ = update_log_failed(conn, log_id, &e);
                            Err(format!("AI extraction (DeepSeek) did not complete: {e}"))
                        }
                    }
                }
                Err(e) => {
                    let _ = update_log_failed(conn, log_id, &e);
                    Err(format!("AI extraction (DeepSeek) did not complete: {e}"))
                }
            }
        }
        AiProvider::LocalOllama => {
            let config = load_ollama_config(conn)?;
            conn.execute(
                "INSERT INTO ai_extraction_log (
            file_hash, file_name, supplier_hint, provider_used, prompt_version, status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &file_hash,
                    &request.file_name,
                    supplier_hint_sql,
                    crate::ollama_client::ollama_provider_label(),
                    PROMPT_VERSION_OLLAMA,
                    STATUS_PENDING
                ],
            )
            .map_err(|e| e.to_string())?;
            let log_id = conn.last_insert_rowid();

            match run_ollama_extraction(&config, &request) {
                Ok((p, used_ocr)) => {
                    let response = parsed_extraction_to_response(&p, log_id);
                    let extracted = serde_json::to_string(
                        &serde_json::json!({
                            "supplier": response.supplier,
                            "shipment": response.shipment,
                            "invoice": response.invoice
                        }),
                    )
                    .map_err(|e| e.to_string())?;
                    let conf_db = p.confidence_score.map(|c| c as f64);
                    let log_status = if used_ocr {
                        STATUS_OCR_FALLBACK
                    } else {
                        STATUS_SUCCESS
                    };
                    update_log_success(
                        conn,
                        log_id,
                        &p.raw_api_response,
                        &extracted,
                        conf_db,
                        crate::ollama_client::ollama_provider_label(),
                        log_status,
                    )?;
                    Ok(response)
                }
                Err(e) => {
                    let _ = update_log_failed(conn, log_id, &e);
                    Err(e)
                }
            }
        }
    }
}

#[tauri::command]
pub fn extract_invoice_with_ai(
    request: ExtractInvoiceRequest,
    state: State<'_, DbState>,
) -> Result<ExtractInvoiceResponse, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    extract_invoice_with_ai_inner(&conn, request)
}

// --- Save AI extraction → supplier + shipment + invoice (mock path; item master by part number only) ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiExtractedPayload {
    pub supplier: SavePayloadSupplier,
    pub shipment: SavePayloadShipment,
    pub invoice: SavePayloadInvoice,
    pub line_items: Vec<SavePayloadLineItem>,
    /// If set, composite confidence is written to `ai_extraction_log.confidence_score` (see `calculate_final_confidence`).
    #[serde(default)]
    pub log_id: Option<i64>,
    /// Original `confidenceScore` from `extract_invoice_with_ai` (optional; composite starts from `unwrap_or(0.5)`).
    #[serde(default)]
    pub ai_confidence: Option<f32>,
    /// Whether the extraction run used the OCR + text path (Tesseract).
    #[serde(default)]
    pub used_ocr: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePayloadSupplier {
    pub supplier_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePayloadShipment {
    pub invoice_number: String,
    pub invoice_date: String,
    pub invoice_value: f64,
    pub invoice_currency: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePayloadInvoice {
    pub shipment_total: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePayloadLineItem {
    pub part_number: String,
    pub item_name: String,
    pub quantity: f64,
    pub unit_price: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiExtractedResult {
    pub shipment_id: String,
    pub invoice_id: String,
    pub warnings: Vec<String>,
}

const PLACEHOLDER_COUNTRY: &str = "N/A";
const PLACEHOLDER_SUPPLIER_EMAIL: &str = "ai-extraction@placeholder.local";
const DEFAULT_GOODS_CATEGORY: &str = "AI Import";
const DEFAULT_INCOTERM: &str = "EXW";

/// Resolve supplier by fuzzy name match (min score 0.8), or insert a new one. Second value is `true` if an existing supplier was matched.
fn resolve_or_insert_supplier(
    tx: &rusqlite::Transaction<'_>,
    name: &str,
) -> Result<(String, bool), String> {
    let t = name.trim();
    if t.is_empty() {
        return Err("Supplier name is required".to_string());
    }
    if let Some(m) = find_best_supplier_match(t, &*tx).map_err(|e| e.to_string())? {
        log::debug!(
            target: "import_manager::ai_extraction",
            "Supplier match score: {:.4} (input={:?} → id={} name={:?})",
            m.score, t, m.id, m.name
        );
        return Ok((m.id, true));
    }
    let id = generate_id(Some("Sup".to_string()));
    tx.execute(
        "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) \
         VALUES (?1, ?2, NULL, ?3, ?4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1)",
        params![&id, t, PLACEHOLDER_COUNTRY, PLACEHOLDER_SUPPLIER_EMAIL],
    )
    .map_err(|e| e.to_string())?;
    Ok((id, false))
}

fn find_item_id_by_part_number(
    tx: &rusqlite::Transaction<'_>,
    part: &str,
) -> std::result::Result<Option<String>, String> {
    let p = part.trim();
    if p.is_empty() {
        return Ok(None);
    }
    let r: std::result::Result<String, rusqlite::Error> = tx.query_row(
        "SELECT id FROM items WHERE LOWER(TRIM(part_number)) = LOWER(TRIM(?1)) AND is_active = 1 LIMIT 1",
        [p],
        |row| row.get(0),
    );
    match r {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn validate_save_payload(p: &SaveAiExtractedPayload) -> std::result::Result<(), String> {
    if p.supplier.supplier_name.trim().is_empty() {
        return Err("Supplier name is required".to_string());
    }
    for (i, li) in p.line_items.iter().enumerate() {
        if li.quantity <= 0.0 {
            return Err(format!("Line {}: quantity must be greater than 0", i + 1));
        }
        if li.unit_price <= 0.0 {
            return Err(format!("Line {}: unit price must be greater than 0", i + 1));
        }
    }
    Ok(())
}

/// Persists supplier, shipment, invoice, and resolvable line items. Unmatched part numbers are skipped with warnings.
pub fn save_ai_extracted_invoice_in_conn(
    conn: &mut Connection,
    payload: SaveAiExtractedPayload,
) -> std::result::Result<SaveAiExtractedResult, String> {
    validate_save_payload(&payload)?;

    let log_id = payload.log_id;
    let ai_confidence = payload.ai_confidence;
    let used_ocr = payload.used_ocr;
    let total_line_items = payload.line_items.len();

    let mut warnings: Vec<String> = Vec::new();
    if payload.shipment.invoice_number.trim().is_empty() {
        warnings.push("Invoice number missing".to_string());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (supplier_id, supplier_matched) = resolve_or_insert_supplier(&tx, &payload.supplier.supplier_name)?;
    let duplicate = check_duplicate_invoice(
        &supplier_id,
        &payload.shipment.invoice_number,
        &payload.shipment.invoice_date,
        &*tx,
    )?;
    if let Some(existing_id) = duplicate {
        log::warn!(
            target: "import_manager::ai_extraction",
            "Duplicate invoice detected. existing_shipment_id={}",
            existing_id
        );
        return Err("Duplicate invoice detected.".to_string());
    }
    let shipment_id = generate_id(Some("SHP".to_string()));
    // Prefer the edited shipment total; fall back to the shipment sub-object value from extraction.
    let header_invoice_value = {
        let t = payload.invoice.shipment_total;
        if t > 0.0 {
            t
        } else {
            payload.shipment.invoice_value
        }
    };

    let sh = Shipment {
        id: shipment_id.clone(),
        supplier_id,
        invoice_number: payload.shipment.invoice_number.clone(),
        invoice_date: payload.shipment.invoice_date.clone(),
        goods_category: DEFAULT_GOODS_CATEGORY.to_string(),
        invoice_value: header_invoice_value,
        invoice_currency: payload.shipment.invoice_currency.clone(),
        incoterm: DEFAULT_INCOTERM.to_string(),
        shipment_mode: None,
        shipment_type: None,
        bl_awb_number: None,
        bl_awb_date: None,
        vessel_name: None,
        container_number: None,
        gross_weight_kg: None,
        etd: None,
        eta: None,
        status: None,
        date_of_delivery: None,
        is_frozen: false,
    };
    // Match add_shipment: default status "docs-rcvd" when None
    let status_val = "docs-rcvd";
    tx.execute(
        "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery, is_frozen) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        params![
            sh.id,
            sh.supplier_id,
            sh.invoice_number,
            sh.invoice_date,
            sh.goods_category,
            sh.invoice_value,
            sh.invoice_currency,
            sh.incoterm,
            sh.shipment_mode,
            sh.shipment_type,
            sh.bl_awb_number,
            sh.bl_awb_date,
            sh.vessel_name,
            sh.container_number,
            sh.gross_weight_kg,
            sh.etd,
            sh.eta,
            status_val,
            sh.date_of_delivery,
            sh.is_frozen,
        ],
    )
    .map_err(|e| e.to_string())?;

    let mut resolved_lines: Vec<NewInvoiceLineItemPayload> = Vec::new();
    let mut matched_line_items: usize = 0;
    for li in &payload.line_items {
        match find_item_id_by_part_number(&tx, &li.part_number) {
            Ok(Some(item_id)) => {
                matched_line_items = matched_line_items.saturating_add(1);
                resolved_lines.push(NewInvoiceLineItemPayload {
                    item_id,
                    quantity: li.quantity,
                    unit_price: li.unit_price,
                    duty_percent: None,
                    sws_percent: None,
                    igst_percent: None,
                });
            }
            Ok(None) => {
                warnings.push(format!(
                    "No item master match for part number \"{}\" ({}) — line not imported.",
                    li.part_number.trim(),
                    li.item_name.trim()
                ));
            }
            Err(e) => {
                return Err(e);
            }
        }
    }

    let final_confidence = calculate_final_confidence(
        ai_confidence,
        supplier_matched,
        matched_line_items,
        total_line_items,
        used_ocr,
    );
    log::debug!(
        target: "import_manager::ai_extraction",
        "Final confidence score: {:.4} (log_id={:?} supplier_matched={} matched_lines={}/{} used_ocr={} ai={:?})",
        final_confidence,
        log_id,
        supplier_matched,
        matched_line_items,
        total_line_items,
        used_ocr,
        ai_confidence,
    );
    if let Some(lid) = log_id {
        tx.execute(
            "UPDATE ai_extraction_log SET confidence_score = ?1 WHERE id = ?2",
            params![(final_confidence as f64), lid],
        )
        .map_err(|e| e.to_string())?;
    }

    let new_invoice = NewInvoicePayload {
        shipment_id: shipment_id.clone(),
        status: "Draft".to_string(),
        line_items: resolved_lines,
    };
    let invoice_id = execute_add_invoice(&tx, &new_invoice).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&*conn);

    Ok(SaveAiExtractedResult {
        shipment_id,
        invoice_id,
        warnings,
    })
}

#[tauri::command]
pub fn save_ai_extracted_invoice(
    payload: SaveAiExtractedPayload,
    state: State<'_, DbState>,
) -> std::result::Result<SaveAiExtractedResult, String> {
    let mut db = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    save_ai_extracted_invoice_in_conn(&mut *db, payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::utils::generate_id;
    use crate::deepseek_client::parse_extraction_from_assistant_text;
    use crate::migrations::DatabaseMigrations;
    use crate::retry_engine::is_retriable_network_timeout_or_5xx;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn conn_with_migrations() -> Result<Connection, String> {
        let mut c = Connection::open_in_memory().map_err(|e| e.to_string())?;
        DatabaseMigrations::run_migrations_test(&mut c).map_err(|e| e.to_string())?;
        Ok(c)
    }

    #[test]
    fn sha256_hex_is_stable_for_known_input() {
        let h = file_sha256_hex(b"test");
        assert_eq!(
            h,
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        );
    }

    #[test]
    fn mock_response_matches_spec() {
        let r = build_mock_response(42);
        assert_eq!(r.log_id, 42);
        assert!((r.confidence_score - 0.85).abs() < f32::EPSILON);
        assert_eq!(r.invoice.line_items.len(), 1);
        let li = &r.invoice.line_items[0];
        assert!((li.quantity - 100.0).abs() < 1e-9);
        assert!((li.unit_price - 12.50).abs() < 1e-9);
    }

    #[test]
    fn null_invoice_json_maps_to_none_in_extract_response() {
        use crate::deepseek_client::parse_extraction_from_assistant_text;
        const J: &str = r#"{
        "supplierName": "INZI CONTROLS CO., LTD.",
        "invoiceNumber": null,
        "invoiceDate": null,
        "invoiceValue": null,
        "invoiceCurrency": null,
        "shipmentTotal": null,
        "lineItems": []
    }"#;
        let p = parse_extraction_from_assistant_text(J).expect("parse");
        let r = super::parsed_extraction_to_response(&p, 1);
        assert!(r.shipment.invoice_number.is_none());
        assert!(r.shipment.invoice_date.is_none());
        assert!(r.shipment.invoice_value.is_none());
        assert!(r.shipment.invoice_currency.is_none());
        assert!(r.invoice.shipment_total.is_none());
    }

    #[test]
    fn full_invoice_values_still_in_extract_response() {
        use crate::deepseek_client::parse_extraction_from_assistant_text;
        const MOCK: &str = r#"{
        "supplierName": "ACME Co",
        "invoiceNumber": "INV-9",
        "invoiceDate": "2025-06-01",
        "invoiceValue": 500.0,
        "invoiceCurrency": "USD",
        "shipmentTotal": 500.0,
        "lineItems": [
            { "partNumber": "A", "itemName": "B", "quantity": 1, "unitPrice": 1.0 }
        ],
        "confidenceScore": 0.9
    }"#;
        let p = parse_extraction_from_assistant_text(MOCK).expect("parse");
        let r = super::parsed_extraction_to_response(&p, 1);
        assert_eq!(r.shipment.invoice_number.as_deref(), Some("INV-9"));
        assert!((r.shipment.invoice_value.unwrap() - 500.0).abs() < 1e-6);
        assert!((r.invoice.shipment_total.unwrap() - 500.0).abs() < 1e-6);
    }

    #[test]
    fn empty_file_bytes_fails() {
        let c = conn_with_migrations().expect("db");
        let err = extract_invoice_with_ai_inner(
            &c,
            ExtractInvoiceRequest {
                file_bytes: vec![],
                file_name: "a.pdf".to_string(),
                supplier_hint: None,
                provider: "mock".to_string(),
            },
        )
        .expect_err("empty bytes");
        assert!(err.contains("file_bytes"));
    }

    #[test]
    fn empty_file_name_fails() {
        let c = conn_with_migrations().expect("db");
        let err = extract_invoice_with_ai_inner(
            &c,
            ExtractInvoiceRequest {
                file_bytes: vec![1, 2, 3],
                file_name: "   ".to_string(),
                supplier_hint: None,
                provider: "mock".to_string(),
            },
        )
        .expect_err("empty name");
        assert!(err.contains("file_name"));
    }

    #[test]
    fn deepseek_success_updates_log_from_mock_json() {
        use crate::deepseek_client::parse_extraction_from_assistant_text;
        const MOCK: &str = r#"{
        "supplierName": "ACME Co",
        "invoiceNumber": "INV-9",
        "invoiceDate": "2025-06-01",
        "invoiceValue": 500.0,
        "invoiceCurrency": "USD",
        "shipmentTotal": 500.0,
        "lineItems": [
            {
                "partNumber": "X-1",
                "itemName": "Widget",
                "quantity": 10,
                "unitPrice": 50.0
            }
        ],
        "confidenceScore": 0.91
    }"#;
        let c = conn_with_migrations().expect("db");
        c.execute(
            "INSERT INTO ai_extraction_log (file_hash, file_name, supplier_hint, provider_used, prompt_version, status)
             VALUES ('h1', 'f1', NULL, 'deepseek', 'v0.2.2-deepseek', 'pending')",
            [],
        )
        .expect("ins");
        let log_id = c.last_insert_rowid();
        let parsed = parse_extraction_from_assistant_text(MOCK).expect("parse");
        let response = super::parsed_extraction_to_response(&parsed, log_id);
        let extracted = serde_json::to_string(
            &serde_json::json!({
                "supplier": response.supplier,
                "shipment": response.shipment,
                "invoice": response.invoice
            }),
        )
        .expect("json");
        let raw = r#"{"mockApiResponse": true}"#;
        super::update_log_success(
            &c,
            log_id,
            raw,
            &extracted,
            Some(0.91f64),
            crate::deepseek_client::deepseek_provider_label(),
            super::STATUS_SUCCESS,
        )
        .expect("update");

        let (st, prov, ext, conf, raw_s): (String, String, String, Option<f64>, String) = c
            .query_row(
                "SELECT status, provider_used, extracted_json, confidence_score, raw_ai_response
                 FROM ai_extraction_log WHERE id = ?1",
                [log_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("row");
        assert_eq!(st, super::STATUS_SUCCESS);
        assert_eq!(prov, crate::deepseek_client::deepseek_provider_label());
        assert!(!ext.is_empty());
        assert!((conf.unwrap() - 0.91f64).abs() < 1e-4);
        assert_eq!(raw_s, raw);
    }

    #[test]
    fn deepseek_ocr_fallback_updates_log_status() {
        const MOCK: &str = r#"{
        "supplierName": "ACME Co",
        "invoiceNumber": "INV-9",
        "invoiceDate": "2025-06-01",
        "invoiceValue": 500.0,
        "invoiceCurrency": "USD",
        "shipmentTotal": 500.0,
        "lineItems": [
            { "partNumber": "X-1", "itemName": "Widget", "quantity": 10, "unitPrice": 50.0 }
        ],
        "confidenceScore": 0.4
    }"#;
        use crate::deepseek_client::parse_extraction_from_assistant_text;
        let c = conn_with_migrations().expect("db");
        c.execute(
            "INSERT INTO ai_extraction_log (file_hash, file_name, supplier_hint, provider_used, prompt_version, status)
             VALUES ('h2', 'f2', NULL, 'deepseek', 'v0.2.2-deepseek', 'pending')",
            [],
        )
        .expect("ins");
        let log_id = c.last_insert_rowid();
        let parsed = parse_extraction_from_assistant_text(MOCK).expect("parse");
        let response = super::parsed_extraction_to_response(&parsed, log_id);
        let extracted = serde_json::to_string(
            &serde_json::json!({
                "supplier": response.supplier,
                "shipment": response.shipment,
                "invoice": response.invoice
            }),
        )
        .expect("json");
        let raw = r#"{"source":"ocr-text"}"#;
        super::update_log_success(
            &c,
            log_id,
            raw,
            &extracted,
            Some(0.4f64),
            crate::deepseek_client::deepseek_provider_label(),
            super::STATUS_OCR_FALLBACK,
        )
        .expect("update");
        let st: String = c
            .query_row(
                "SELECT status FROM ai_extraction_log WHERE id = ?1",
                [log_id],
                |row| row.get(0),
            )
            .expect("row");
        assert_eq!(st, super::STATUS_OCR_FALLBACK);
    }

    #[test]
    fn inserts_log_and_returns_mock() {
        let c = conn_with_migrations().expect("db");
        let file_bytes: Vec<u8> = b"sample-bytes".to_vec();
        let file_hash = file_sha256_hex(&file_bytes);
        let res = extract_invoice_with_ai_inner(
            &c,
            ExtractInvoiceRequest {
                file_bytes,
                file_name: "doc.pdf".to_string(),
                supplier_hint: Some("  ACME  ".to_string()),
                provider: "mock".to_string(),
            },
        )
        .expect("ok");

        assert_eq!(res.supplier.supplier_name, "Demo Supplier Pvt Ltd");
        assert_eq!(res.shipment.invoice_number.as_deref(), Some("INV-DEMO-001"));
        assert!((res.confidence_score - 0.85f32).abs() < 1e-4);
        assert!(res.log_id > 0);

        let (stored_hash, name, prov, st, sh): (String, String, String, String, Option<String>) = c
            .query_row(
                "SELECT file_hash, file_name, provider_used, status, supplier_hint
                 FROM ai_extraction_log WHERE id = ?1",
                [res.log_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("row");
        assert_eq!(stored_hash, file_hash);
        assert_eq!(name, "doc.pdf");
        assert_eq!(prov, PROVIDER_MOCK);
        assert_eq!(st, STATUS_MOCK);
        assert_eq!(sh.as_deref(), Some("ACME"));
    }

    #[test]
    fn save_ai_extracted_creates_with_matched_item() {
        let mut c = conn_with_migrations().expect("db");
        let itm = generate_id(Some("ITM".to_string()));
        c.execute(
            "INSERT INTO items (id, part_number, item_description, unit, currency, unit_price, hsn_code, supplier_id, is_active) \
             VALUES (?1, 'P-1001', 'Test bolt', 'PC', 'USD', 12.5, '0000', NULL, 1)",
            [&itm],
        )
        .expect("item");

        let r = save_ai_extracted_invoice_in_conn(
            &mut c,
            SaveAiExtractedPayload {
                supplier: SavePayloadSupplier {
                    supplier_name: "  Acme  ".to_string(),
                },
                shipment: SavePayloadShipment {
                    invoice_number: "INV-1".to_string(),
                    invoice_date: "2025-01-15".to_string(),
                    invoice_value: 100.0,
                    invoice_currency: "USD".to_string(),
                },
                invoice: SavePayloadInvoice {
                    shipment_total: 100.0,
                },
                line_items: vec![SavePayloadLineItem {
                    part_number: "P-1001".to_string(),
                    item_name: "Demo Bolt".to_string(),
                    quantity: 2.0,
                    unit_price: 50.0,
                }],
                log_id: None,
                ai_confidence: None,
                used_ocr: false,
            },
        )
        .expect("save");
        assert!(!r.shipment_id.is_empty() && !r.invoice_id.is_empty());
        assert!(r.warnings.is_empty());
    }

    #[test]
    fn save_warns_when_invoice_number_missing() {
        let mut c = conn_with_migrations().expect("db");
        let itm = generate_id(Some("ITM".to_string()));
        c.execute(
            "INSERT INTO items (id, part_number, item_description, unit, currency, unit_price, hsn_code, supplier_id, is_active) \
             VALUES (?1, 'P-1001', 'Test bolt', 'PC', 'USD', 12.5, '0000', NULL, 1)",
            [&itm],
        )
        .expect("item");
        let r = save_ai_extracted_invoice_in_conn(
            &mut c,
            SaveAiExtractedPayload {
                supplier: SavePayloadSupplier {
                    supplier_name: "Acme".to_string(),
                },
                shipment: SavePayloadShipment {
                    invoice_number: String::new(),
                    invoice_date: "2025-01-15".to_string(),
                    invoice_value: 10.0,
                    invoice_currency: "USD".to_string(),
                },
                invoice: SavePayloadInvoice { shipment_total: 10.0 },
                line_items: vec![SavePayloadLineItem {
                    part_number: "P-1001".to_string(),
                    item_name: "Demo Bolt".to_string(),
                    quantity: 1.0,
                    unit_price: 10.0,
                }],
                log_id: None,
                ai_confidence: None,
                used_ocr: false,
            },
        )
        .expect("save");
        assert!(r.warnings.iter().any(|w| w == "Invoice number missing"));
    }

    #[test]
    fn save_rejects_duplicate_invoice() {
        let mut c = conn_with_migrations().expect("db");
        let itm = generate_id(Some("ITM".to_string()));
        c.execute(
            "INSERT INTO items (id, part_number, item_description, unit, currency, unit_price, hsn_code, supplier_id, is_active) \
             VALUES (?1, 'P-DUP-1', 'Part', 'PC', 'USD', 1, '0000', NULL, 1)",
            [&itm],
        )
        .expect("item");
        let p = |inv: &str, date: &str| SaveAiExtractedPayload {
            supplier: SavePayloadSupplier {
                supplier_name: "Dup Test Supplier".to_string(),
            },
            shipment: SavePayloadShipment {
                invoice_number: inv.to_string(),
                invoice_date: date.to_string(),
                invoice_value: 10.0,
                invoice_currency: "USD".to_string(),
            },
            invoice: SavePayloadInvoice { shipment_total: 10.0 },
            line_items: vec![SavePayloadLineItem {
                part_number: "P-DUP-1".to_string(),
                item_name: "Part".to_string(),
                quantity: 1.0,
                unit_price: 10.0,
            }],
            log_id: None,
            ai_confidence: None,
            used_ocr: false,
        };
        save_ai_extracted_invoice_in_conn(&mut c, p("INV-DUP-001", "2025-03-01"))
            .expect("first save");
        let err = save_ai_extracted_invoice_in_conn(&mut c, p("INV-DUP-001", "2025-03-01"))
            .expect_err("second save must fail");
        assert!(err.contains("Duplicate invoice detected"));
    }

    #[test]
    fn save_ai_extracted_warns_unmatched_item() {
        let mut c = conn_with_migrations().expect("db");
        let r = save_ai_extracted_invoice_in_conn(
            &mut c,
            SaveAiExtractedPayload {
                supplier: SavePayloadSupplier {
                    supplier_name: "Solo Co".to_string(),
                },
                shipment: SavePayloadShipment {
                    invoice_number: "INV-2".to_string(),
                    invoice_date: "2025-01-20".to_string(),
                    invoice_value: 1.0,
                    invoice_currency: "USD".to_string(),
                },
                invoice: SavePayloadInvoice { shipment_total: 1.0 },
                line_items: vec![SavePayloadLineItem {
                    part_number: "UNKNOWN-PART".to_string(),
                    item_name: "N/A".to_string(),
                    quantity: 1.0,
                    unit_price: 1.0,
                }],
                log_id: None,
                ai_confidence: None,
                used_ocr: false,
            },
        )
        .expect("save");
        assert_eq!(r.warnings.len(), 1);
    }

    #[test]
    fn save_updates_extraction_log_with_composite_confidence() {
        use crate::confidence_engine::calculate_final_confidence;
        let mut c = conn_with_migrations().expect("db");
        let sup_id = generate_id(Some("Sup".to_string()));
        c.execute(
            "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) \
             VALUES (?1, 'Acme Plc', NULL, 'N/A', 'a@b.c', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1)",
            [&sup_id],
        )
        .expect("sup");
        let itm = generate_id(Some("ITM".to_string()));
        c.execute(
            "INSERT INTO items (id, part_number, item_description, unit, currency, unit_price, hsn_code, supplier_id, is_active) \
             VALUES (?1, 'P-1001', 'Bolt', 'PC', 'USD', 1, '0000', NULL, 1)",
            [&itm],
        )
        .expect("item");
        c.execute(
            "INSERT INTO ai_extraction_log (file_hash, file_name, supplier_hint, provider_used, prompt_version, status) \
             VALUES ('h', 'a.pdf', NULL, 'mock', 'v0', 'success')",
            [],
        )
        .expect("log");
        let log_id = c.last_insert_rowid();

        let r = save_ai_extracted_invoice_in_conn(
            &mut c,
            SaveAiExtractedPayload {
                supplier: SavePayloadSupplier {
                    supplier_name: "Acme Plc".to_string(),
                },
                shipment: SavePayloadShipment {
                    invoice_number: "INV-CMP-1".to_string(),
                    invoice_date: "2025-01-20".to_string(),
                    invoice_value: 10.0,
                    invoice_currency: "USD".to_string(),
                },
                invoice: SavePayloadInvoice { shipment_total: 10.0 },
                line_items: vec![SavePayloadLineItem {
                    part_number: "P-1001".to_string(),
                    item_name: "Bolt".to_string(),
                    quantity: 1.0,
                    unit_price: 10.0,
                }],
                log_id: Some(log_id),
                ai_confidence: Some(0.8),
                used_ocr: false,
            },
        )
        .expect("save");
        assert!(!r.invoice_id.is_empty());

        let want = calculate_final_confidence(Some(0.8), true, 1, 1, false) as f64;
        let got: f64 = c
            .query_row(
                "SELECT confidence_score FROM ai_extraction_log WHERE id = ?1",
                [log_id],
                |row| row.get(0),
            )
            .expect("row");
        assert!((got - want).abs() < 1e-4, "got {got} want {want}");
    }

    static AI_FALLBACK_TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

    /// Logged as `local-fallback` when the DeepSeek path completes via the Ollama handoff.
    #[test]
    fn local_fallback_label_persisted_in_log() {
        const MOCK: &str = r#"{
        "supplierName": "FB Co", "invoiceNumber": "F-1", "invoiceDate": "2025-01-01",
        "invoiceValue": 1.0, "invoiceCurrency": "USD", "shipmentTotal": 1.0,
        "lineItems": [ { "partNumber": "P1", "itemName": "X", "quantity": 1, "unitPrice": 1.0 } ],
        "confidenceScore": 0.5
    }"#;
        let c = conn_with_migrations().expect("db");
        c.execute(
            "INSERT INTO ai_extraction_log (file_hash, file_name, supplier_hint, provider_used, prompt_version, status) \
             VALUES ('hf', 'a.pdf', NULL, 'deepseek', 'v0.2.2-deepseek', 'pending')",
            [],
        )
        .expect("ins");
        let log_id = c.last_insert_rowid();
        let parsed = parse_extraction_from_assistant_text(MOCK).expect("parse");
        let response = super::parsed_extraction_to_response(&parsed, log_id);
        let extracted = serde_json::to_string(
            &serde_json::json!({
                "supplier": response.supplier,
                "shipment": response.shipment,
                "invoice": response.invoice
            }),
        )
        .expect("json");
        super::update_log_success(
            &c,
            log_id,
            r#"{"via":"ollama"}"#,
            &extracted,
            Some(0.5f64),
            super::PROVIDER_LOCAL_FALLBACK,
            super::STATUS_SUCCESS,
        )
        .expect("up");
        let p: String = c
            .query_row(
                "SELECT provider_used FROM ai_extraction_log WHERE id = ?1",
                [log_id],
                |r| r.get(0),
            )
            .expect("row");
        assert_eq!(p, super::PROVIDER_LOCAL_FALLBACK);
    }

    #[test]
    fn retriable_string_triggers_ollama_fallback_criteria() {
        assert!(is_retriable_network_timeout_or_5xx("Network error when calling AI API: e"));
        assert!(is_retriable_network_timeout_or_5xx("DeepSeek API error (HTTP 502): x"));
    }

    #[test]
    fn non_retriable_does_not_trigger_ollama_fallback() {
        assert!(!is_retriable_network_timeout_or_5xx("Model did not return valid JSON"));
    }

    /// When DeepSeek fails with a retriable error and Ollama also fails, the original DeepSeek
    /// error is returned; only one `ai_extraction_log` row is written (no duplicate for fallback try).
    #[test]
    fn one_log_row_when_fallback_try_fails() {
        let _lock = AI_FALLBACK_TEST_ENV_LOCK.lock().expect("env");
        let old_key = std::env::var("AI_API_KEY").ok();
        let old_ds = std::env::var("AI_DEEPSEEK_ENDPOINT").ok();
        let old_ol = std::env::var("OLLAMA_ENDPOINT").ok();
        let old_om = std::env::var("OLLAMA_MODEL").ok();
        let old_dm = std::env::var("AI_DEEPSEEK_MODEL").ok();
        std::env::set_var("AI_API_KEY", "sk-test");
        std::env::set_var("AI_DEEPSEEK_ENDPOINT", "http://127.0.0.1:1/v1/chat/completions");
        std::env::set_var("OLLAMA_ENDPOINT", "http://127.0.0.1:1/api/chat");
        let c = conn_with_migrations().expect("db");
        let n0: i64 = c
            .query_row("SELECT COUNT(*) FROM ai_extraction_log", [], |r| r.get(0))
            .expect("c0");
        let file_bytes: Vec<u8> =
            include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/icons/32x32.png")).to_vec();
        let r = super::extract_invoice_with_ai_inner(
            &c,
            ExtractInvoiceRequest {
                file_bytes,
                file_name: "f.png".to_string(),
                supplier_hint: None,
                provider: "deepseek".to_string(),
            },
        );
        assert!(r.is_err());
        // Original DeepSeek user-facing error format
        let err = r.expect_err("fail");
        assert!(err.contains("AI extraction (DeepSeek)"), "{err}");
        let n1: i64 = c
            .query_row("SELECT COUNT(*) FROM ai_extraction_log", [], |r| r.get(0))
            .expect("c1");
        for (k, v) in [
            ("AI_API_KEY", old_key),
            ("AI_DEEPSEEK_ENDPOINT", old_ds),
            ("OLLAMA_ENDPOINT", old_ol),
            ("OLLAMA_MODEL", old_om),
            ("AI_DEEPSEEK_MODEL", old_dm),
        ] {
            match v {
                Some(s) if !s.is_empty() => std::env::set_var(k, s),
                _ => std::env::remove_var(k),
            }
        }
        assert_eq!(n1 - n0, 1, "must not insert a second log row for Ollama fallback try");
    }
}
