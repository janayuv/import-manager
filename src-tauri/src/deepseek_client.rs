//! HTTP client for DeepSeek OpenAI-compatible chat/vision API.

use std::collections::HashSet;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use reqwest::blocking::Client;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
use serde::Deserialize;
use serde_json::json;

use crate::app_settings::{get_app_setting, KEY_DEEPSEEK_API_KEY};
use crate::ai_prompt_builder::build_invoice_extraction_prompt;
use crate::ai_prompt_builder::InvoiceExtractionPrompts;
use crate::retry_engine;
use rusqlite::Connection;

const DEEPSEEK_DEFAULT_ENDPOINT: &str = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-chat";
const REQUEST_TIMEOUT_SEC: u64 = 60;
const AI_INVOICE_MAX_TOKENS: u32 = 12_000;

// --- config ---

/// DeepSeek API connection settings (API key is required; load via [`load_deepseek_config`] when using provider DeepSeek).
#[derive(Debug, Clone)]
pub struct DeepSeekConfig {
    /// API key (from `app_settings` or `AI_API_KEY` env; see [`load_deepseek_config`]).
    pub api_key: String,
    /// Full URL for `POST` (e.g. `.../v1/chat/completions`).
    pub endpoint: String,
    pub model_name: String,
}

/// `AI_API_KEY` in environment, or `deepseek_api_key` in `app_settings` (DB), is required.
/// Optional: `AI_DEEPSEEK_ENDPOINT`, `AI_DEEPSEEK_MODEL` (env only; not stored in app_settings in V0.2.3).
pub fn load_deepseek_config(conn: &Connection) -> Result<DeepSeekConfig, String> {
    let from_db = get_app_setting(conn, KEY_DEEPSEEK_API_KEY)
        .ok()
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let from_env = std::env::var("AI_API_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let api_key = from_db
        .or(from_env)
        .ok_or_else(|| {
            "AI extraction (DeepSeek) is misconfigured: set the key in Settings → AI Provider, or set environment variable AI_API_KEY"
                .to_string()
        })?;
    if api_key.trim().is_empty() {
        return Err(
            "AI extraction (DeepSeek) is misconfigured: API key must not be empty".to_string(),
        );
    }
    let endpoint = std::env::var("AI_DEEPSEEK_ENDPOINT")
        .unwrap_or_else(|_| DEEPSEEK_DEFAULT_ENDPOINT.to_string());
    if endpoint.trim().is_empty() {
        return Err("AI_DEEPSEEK_ENDPOINT is set but empty".to_string());
    }
    let model_name =
        std::env::var("AI_DEEPSEEK_MODEL").unwrap_or_else(|_| DEEPSEEK_DEFAULT_MODEL.to_string());
    if model_name.trim().is_empty() {
        return Err("AI_DEEPSEEK_MODEL is set but empty".to_string());
    }
    Ok(DeepSeekConfig {
        api_key,
        endpoint,
        model_name,
    })
}

// --- request / response shapes ---

#[derive(Debug, Deserialize)]
struct OpenAiStyleResponse {
    choices: Option<Vec<OpenAiChoice>>,
    error: Option<OpenAiErrorBody>,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorBody {
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    content: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmInvoiceJson {
    supplier_name: String,
    /// JSON `null` or missing → [None]; never fails [serde] on null.
    #[serde(default)]
    invoice_number: Option<String>,
    #[serde(default)]
    invoice_date: Option<String>,
    #[serde(default)]
    invoice_value: Option<f64>,
    #[serde(default)]
    invoice_currency: Option<String>,
    #[serde(default)]
    shipment_total: Option<f64>,
    #[serde(default)]
    line_items: Vec<LlmLineItemJson>,
    /// Optional: model may omit.
    confidence_score: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmLineItemJson {
    part_number: String,
    item_name: String,
    quantity: f64,
    unit_price: f64,
}

/// Parsed structured extraction and full raw API body for logging.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedInvoiceExtraction {
    pub supplier_name: String,
    /// `None` if the model sent JSON `null` or omitted the field; never a parse error for null.
    pub invoice_number: Option<String>,
    pub invoice_date: Option<String>,
    pub invoice_value: Option<f64>,
    pub invoice_currency: Option<String>,
    pub shipment_total: Option<f64>,
    pub line_items: Vec<ParsedLineItem>,
    pub confidence_score: Option<f32>,
    /// Full response body from the DeepSeek API (stringified JSON) for `ai_extraction_log.raw_ai_response`.
    pub raw_api_response: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedLineItem {
    pub part_number: String,
    pub item_name: String,
    pub quantity: f64,
    pub unit_price: f64,
}

fn data_url_mime_for_file_name(file_name: &str) -> &'static str {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".pdf") {
        return "application/pdf";
    }
    if lower.ends_with(".png") {
        return "image/png";
    }
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        return "image/jpeg";
    }
    "application/octet-stream"
}

/// Vision: system + user (schema) + image/payload as `image_url`.
fn build_request_json_vision(
    model: &str,
    b64: &str,
    mime: &str,
    prompts: &InvoiceExtractionPrompts,
) -> serde_json::Value {
    let data_url = format!("data:{mime};base64,{b64}");
    json!({
        "model": model,
        "messages": [
            { "role": "system", "content": &prompts.system },
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": &prompts.user },
                    { "type": "image_url", "image_url": { "url": data_url } }
                ]
            }
        ],
        "max_tokens": AI_INVOICE_MAX_TOKENS
    })
}

/// Text-only chat (no `image_url`): e.g. structured spreadsheet text from [`crate::excel_parser`].
fn build_request_json_text(model: &str, system: &str, user: &str) -> serde_json::Value {
    json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "max_tokens": AI_INVOICE_MAX_TOKENS
    })
}

/// Extract assistant `content` from OpenAI-style body (handles string or array parts).
fn assistant_text_from_openai_response(body: &str) -> Result<String, String> {
    let v: OpenAiStyleResponse =
        serde_json::from_str(body).map_err(|e| format!("Invalid API response JSON: {e}"))?;
    if let Some(e) = v.error {
        let m = e.message.unwrap_or_else(|| "Unknown API error".to_string());
        return Err(m);
    }
    let first = v
        .choices
        .as_ref()
        .and_then(|c| c.first())
        .ok_or_else(|| "API response has no choices".to_string())?;
    match &first.message.content {
        serde_json::Value::String(s) => Ok(s.clone()),
        serde_json::Value::Array(parts) => {
            let mut out = String::new();
            for p in parts {
                if let Some(t) = p.get("text").and_then(|x| x.as_str()) {
                    out.push_str(t);
                }
            }
            if out.is_empty() {
                Err("API message content is empty or unsupported format".to_string())
            } else {
                Ok(out)
            }
        }
        _ => Err("API message content has unexpected type".to_string()),
    }
}

/// Strip optional ``` or ```json fences and trim.
pub(crate) fn strip_code_fences(text: &str) -> String {
    let t = text.trim();
    if !t.starts_with("```") {
        return t.to_string();
    }
    let mut inner = &t[3..];
    inner = inner.trim_start();
    if inner.len() >= 4 && inner[..4].eq_ignore_ascii_case("json") {
        inner = inner[4..].trim_start();
    }
    if let Some(i) = inner.rfind("```") {
        inner = &inner[..i];
    }
    inner.trim().to_string()
}

/// Drop repeated rows with the same part number, quantity, and unit price (first occurrence wins, order kept).
fn dedupe_line_items_preserve_order(items: Vec<ParsedLineItem>) -> Vec<ParsedLineItem> {
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let key = format!(
            "{}-{}-{}",
            item.part_number.trim(),
            item.quantity,
            item.unit_price
        );
        if seen.insert(key) {
            out.push(item);
        }
    }
    out
}

/// Parse the assistant’s JSON (invoice fields) into structured data. Used for tests and production.
pub fn parse_extraction_from_assistant_text(assistant: &str) -> Result<ParsedInvoiceExtraction, String> {
    let cleaned = strip_code_fences(assistant);
    let l: LlmInvoiceJson = serde_json::from_str(&cleaned)
        .map_err(|e| format!("Model did not return valid JSON for invoice fields: {e}"))?;
    let supplier = l.supplier_name.trim();
    if supplier.is_empty() {
        return Err("Missing supplierName in model JSON".to_string());
    }
    let line_items: Vec<ParsedLineItem> = l
        .line_items
        .into_iter()
        .map(|x| ParsedLineItem {
            part_number: x.part_number,
            item_name: x.item_name,
            quantity: x.quantity,
            unit_price: x.unit_price,
        })
        .collect();
    let line_items = dedupe_line_items_preserve_order(line_items);
    log::debug!(
        "Line items after deduplication: {}",
        line_items.len()
    );
    Ok(ParsedInvoiceExtraction {
        supplier_name: supplier.to_string(),
        invoice_number: l.invoice_number,
        invoice_date: l.invoice_date,
        invoice_value: l.invoice_value,
        invoice_currency: l.invoice_currency,
        shipment_total: l.shipment_total,
        line_items,
        confidence_score: l.confidence_score,
        raw_api_response: String::new(), // set by caller when known
    })
}

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SEC))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP client: {e}"))
}

fn run_deepseek_invoice_request_once(
    config: &DeepSeekConfig,
    body: &serde_json::Value,
) -> Result<ParsedInvoiceExtraction, String> {
    let client = build_http_client()?;
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", config.api_key))
            .map_err(|e| format!("Invalid API key for header: {e}"))?,
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    let resp = client
        .post(&config.endpoint)
        .headers(headers)
        .json(body)
        .send();
    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            return Err(friendly_request_error(&e));
        }
    };
    let status = resp.status();
    let text = read_response_text(resp);
    log::debug!(
        "AI response length: {} characters",
        text.len()
    );
    if !status.is_success() {
        let msg = parse_api_error_from_body(&text).unwrap_or_else(|| text.clone());
        let friendly = format!("DeepSeek API error (HTTP {}): {}", status.as_u16(), msg);
        return Err(friendly);
    }
    let assist = match assistant_text_from_openai_response(&text) {
        Ok(a) => a,
        Err(e) => {
            return Err(format!("{e}. Body (truncated): {} ", truncate(&text, 500)));
        }
    };
    let mut parsed = parse_extraction_from_assistant_text(&assist)
        .map_err(|e| format!("{e} — assistant output (truncated): {}", truncate(&assist, 800)))?;
    parsed.raw_api_response = text;
    Ok(parsed)
}

fn run_deepseek_invoice_request(
    config: &DeepSeekConfig,
    body: &serde_json::Value,
) -> Result<ParsedInvoiceExtraction, String> {
    retry_engine::execute_with_retry(
        || run_deepseek_invoice_request_once(config, body),
        retry_engine::DEFAULT_MAX_RETRIES,
        retry_engine::is_retriable_network_timeout_or_5xx,
    )
}

/// POST to DeepSeek (vision: image + prompt); transient network / timeout / 5xx are retried via `retry_engine`.
pub fn call_deepseek_vision(
    config: &DeepSeekConfig,
    file_bytes: &[u8],
    file_name: &str,
    supplier_hint: Option<&str>,
) -> Result<ParsedInvoiceExtraction, String> {
    let b64 = B64.encode(file_bytes);
    let mime = data_url_mime_for_file_name(file_name);
    let file_name_for_prompt = {
        let n = file_name.trim();
        if n.is_empty() {
            None
        } else {
            Some(n)
        }
    };
    let prompts = build_invoice_extraction_prompt(supplier_hint, file_name_for_prompt);
    let body = build_request_json_vision(
        &config.model_name,
        &b64,
        mime,
        &prompts,
    );
    run_deepseek_invoice_request(config, &body)
}

/// Text-only DeepSeek request (e.g. structured text from `excel_parser`); no base64/vision.
pub fn call_deepseek_parsed_text(
    config: &DeepSeekConfig,
    structured_text: &str,
    file_name: &str,
    supplier_hint: Option<&str>,
) -> Result<ParsedInvoiceExtraction, String> {
    let file_name_for_prompt = {
        let n = file_name.trim();
        if n.is_empty() {
            None
        } else {
            Some(n)
        }
    };
    let base = build_invoice_extraction_prompt(supplier_hint, file_name_for_prompt);
    let user = format!(
        "{}\n\n---\nSpreadsheet (parsed, structured text):\n{}",
        base.user, structured_text
    );
    let body = build_request_json_text(&config.model_name, &base.system, &user);
    run_deepseek_invoice_request(config, &body)
}

/// Text-only request with OCR body (Tesseract), after vision failed or was low-confidence.
pub fn call_deepseek_ocr_text(
    config: &DeepSeekConfig,
    ocr_text: &str,
    file_name: &str,
    supplier_hint: Option<&str>,
) -> Result<ParsedInvoiceExtraction, String> {
    let file_name_for_prompt = {
        let n = file_name.trim();
        if n.is_empty() {
            None
        } else {
            Some(n)
        }
    };
    let base = build_invoice_extraction_prompt(supplier_hint, file_name_for_prompt);
    let user = format!(
        "{}\n\n---\nOCR-extracted text from document:\n{}",
        base.user, ocr_text
    );
    let body = build_request_json_text(&config.model_name, &base.system, &user);
    run_deepseek_invoice_request(config, &body)
}

fn read_response_text(resp: reqwest::blocking::Response) -> String {
    let status = resp.status();
    let mut r = match resp.text() {
        Ok(t) => t,
        Err(e) => return format!(r#"{{"read_error": "{e}", "http_status": "{}" }}"#, status),
    };
    r.truncate(1_000_000);
    r
}

fn parse_api_error_from_body(body: &str) -> Option<String> {
    if let Ok(v) = serde_json::from_str::<OpenAiStyleResponse>(body) {
        if let Some(e) = v.error {
            return e.message;
        }
    }
    None
}

fn friendly_request_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "AI extraction request timed out (60s). Check your network and try again.".to_string()
    } else {
        format!("Network error when calling AI API: {e}")
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

/// Provider string stored in the DB and logs.
pub fn deepseek_provider_label() -> &'static str {
    "deepseek"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_prompt_builder::build_invoice_extraction_prompt;
    use serde_json::json;

    const MOCK_LLM_JSON: &str = r#"
    {
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
    }
    "#;

    #[test]
    fn mock_response_parses_and_maps_fields() {
        let p = parse_extraction_from_assistant_text(MOCK_LLM_JSON).expect("parse");
        assert_eq!(p.supplier_name, "ACME Co");
        assert!((p.shipment_total.unwrap() - 500.0).abs() < 1e-6);
        assert_eq!(p.line_items.len(), 1);
        assert!((p.confidence_score.unwrap() - 0.91).abs() < 1e-3);
    }

    /// Null invoice fields and empty line items must not fail JSON [serde] or extract pipeline.
    #[test]
    fn null_invoice_fields_parses_successfully() {
        let s = r#"
    {
        "supplierName": "INZI CONTROLS CO., LTD.",
        "invoiceNumber": null,
        "invoiceDate": null,
        "invoiceValue": null,
        "invoiceCurrency": null,
        "shipmentTotal": null,
        "lineItems": []
    }"#;
        let p = parse_extraction_from_assistant_text(s).expect("parse");
        assert_eq!(p.supplier_name, "INZI CONTROLS CO., LTD.");
        assert!(p.invoice_number.is_none());
        assert!(p.invoice_date.is_none());
        assert!(p.invoice_currency.is_none());
        assert!(p.invoice_value.is_none());
        assert!(p.shipment_total.is_none());
        assert!(p.line_items.is_empty());
    }

    #[test]
    fn parse_strips_fenced_json() {
        let s = r#"```json
{"supplierName": "A","invoiceNumber": "1","invoiceDate": "d","invoiceValue": 1,"invoiceCurrency": "INR","shipmentTotal": 1,"lineItems": [{"partNumber": "p","itemName": "i","quantity": 1,"unitPrice": 1}],"confidenceScore": 0.5}
```"#;
        let p = parse_extraction_from_assistant_text(s).expect("parse");
        assert_eq!(p.supplier_name, "A");
    }

    #[test]
    fn deepseek_request_max_tokens_12000_vision_and_text() {
        let p = build_invoice_extraction_prompt(None, None);
        let v = build_request_json_vision("m", "a", "image/png", &p);
        assert_eq!(v.get("max_tokens"), Some(&json!(12_000u32)));
        let t = build_request_json_text("m", "sys", "user");
        assert_eq!(t.get("max_tokens"), Some(&json!(12_000u32)));
    }

    /// Large invoice: parser accepts many [lineItems] (output cap fix prevents truncation in production).
    #[test]
    fn parse_extraction_line_items_greater_than_ten() {
        let items: Vec<serde_json::Value> = (0..12)
            .map(|i| {
                json!({
                    "partNumber": format!("P-{}", i),
                    "itemName": "N",
                    "quantity": 1.0,
                    "unitPrice": 1.0
                })
            })
            .collect();
        let root = json!({
            "supplierName": "S",
            "invoiceNumber": "1",
            "invoiceDate": "2025-01-01",
            "invoiceValue": 1.0,
            "invoiceCurrency": "USD",
            "shipmentTotal": 1.0,
            "lineItems": items
        });
        let s = root.to_string();
        let p = parse_extraction_from_assistant_text(&s).expect("parse");
        assert!(p.line_items.len() > 10);
    }

    /// Five identical [lineItems] rows (same part, quantity, price) must become a single row.
    #[test]
    fn dedupe_removes_five_identical_line_items() {
        let s = r#"
    {
        "supplierName": "DupTest",
        "invoiceNumber": "1",
        "invoiceDate": "2025-01-01",
        "invoiceValue": 50.0,
        "invoiceCurrency": "USD",
        "shipmentTotal": 50.0,
        "lineItems": [
            { "partNumber": "94270733", "itemName": "Bolt", "quantity": 2, "unitPrice": 5.0 },
            { "partNumber": "94270733", "itemName": "Bolt", "quantity": 2, "unitPrice": 5.0 },
            { "partNumber": "94270733", "itemName": "Bolt", "quantity": 2, "unitPrice": 5.0 },
            { "partNumber": "94270733", "itemName": "Bolt", "quantity": 2, "unitPrice": 5.0 },
            { "partNumber": "94270733", "itemName": "Bolt", "quantity": 2, "unitPrice": 5.0 }
        ]
    }"#;
        let p = parse_extraction_from_assistant_text(s).expect("parse");
        assert_eq!(p.line_items.len(), 1);
        assert_eq!(p.line_items[0].part_number, "94270733");
    }
}
