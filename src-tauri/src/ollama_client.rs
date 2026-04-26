//! Local Ollama chat API for AI invoice extraction (same prompts as DeepSeek).

use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use reqwest::blocking::Client;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;
use serde_json::json;

use crate::app_settings::{get_app_setting, KEY_OLLAMA_ENDPOINT, KEY_OLLAMA_MODEL};
use crate::ai_prompt_builder::build_invoice_extraction_prompt;
use crate::ai_prompt_builder::InvoiceExtractionPrompts;
use crate::deepseek_client::{parse_extraction_from_assistant_text, ParsedInvoiceExtraction};
use crate::retry_engine;
use rusqlite::Connection;

const OLLAMA_DEFAULT_ENDPOINT: &str = "http://localhost:11434/api/chat";
const OLLAMA_DEFAULT_MODEL: &str = "llama3";
const REQUEST_TIMEOUT_SEC: u64 = 60;
/// Ollama `options.num_predict` (generation cap). Large values reduce truncation for long [lineItems] output.
const AI_INVOICE_MAX_TOKENS: i32 = 12_000;

/// Local Ollama `POST` target (e.g. `/api/chat` on the host; default port 11434).
#[derive(Debug, Clone)]
pub struct OllamaConfig {
    /// Full URL for the chat API (e.g. `http://localhost:11434/api/chat`).
    pub endpoint: String,
    /// Model name (e.g. `llama3`, or a vision model for image inputs).
    pub model_name: String,
}

/// `ollama_endpoint` / `ollama_model` in `app_settings` override `OLLAMA_ENV` and defaults.
pub fn load_ollama_config(conn: &Connection) -> Result<OllamaConfig, String> {
    let endpoint = get_app_setting(conn, KEY_OLLAMA_ENDPOINT)
        .ok()
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            std::env::var("OLLAMA_ENDPOINT")
                .ok()
                .map(|s| s.trim().to_string())
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| OLLAMA_DEFAULT_ENDPOINT.to_string());
    if endpoint.trim().is_empty() {
        return Err("Ollama endpoint is set but empty".to_string());
    }
    let model_name = get_app_setting(conn, KEY_OLLAMA_MODEL)
        .ok()
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("OLLAMA_MODEL").ok().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| OLLAMA_DEFAULT_MODEL.to_string());
    if model_name.trim().is_empty() {
        return Err("Ollama model is set but empty".to_string());
    }
    Ok(OllamaConfig {
        endpoint,
        model_name,
    })
}

/// Ollama chat with optional base64 `images` on the user turn (vision-capable models).
fn build_ollama_request_vision(
    model: &str,
    b64: &str,
    prompts: &InvoiceExtractionPrompts,
) -> serde_json::Value {
    // Ollama expects raw base64 strings in `images`, not a data: URL.
    json!({
        "model": model,
        "stream": false,
        "messages": [
            { "role": "system", "content": &prompts.system },
            {
                "role": "user",
                "content": &prompts.user,
                "images": [ b64 ]
            }
        ],
        "options": { "num_predict": AI_INVOICE_MAX_TOKENS }
    })
}

/// Text-only messages (e.g. Excel-derived structured text; no `images` field).
fn build_ollama_request_text(model: &str, system: &str, user: &str) -> serde_json::Value {
    json!({
        "model": model,
        "stream": false,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "options": { "num_predict": AI_INVOICE_MAX_TOKENS }
    })
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: OllamaChatMessage,
}

#[derive(Debug, Deserialize)]
struct OllamaChatMessage {
    content: String,
}

fn assistant_text_from_ollama_response_body(body: &str) -> Result<String, String> {
    let v: OllamaChatResponse = serde_json::from_str(body)
        .map_err(|e| format!("Invalid Ollama response JSON: {e}"))?;
    let t = v.message.content.trim();
    if t.is_empty() {
        return Err("Ollama returned an empty message".to_string());
    }
    Ok(t.to_string())
}

const LOCAL_SERVICE_UNAVAILABLE: &str = "Local AI service not available.";

fn map_ollama_transport_error(_e: &reqwest::Error) -> String {
    LOCAL_SERVICE_UNAVAILABLE.to_string()
}

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SEC))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|_e| LOCAL_SERVICE_UNAVAILABLE.to_string())
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

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

fn run_ollama_invoice_request_once(
    config: &OllamaConfig,
    body: &serde_json::Value,
) -> Result<ParsedInvoiceExtraction, String> {
    let client = build_http_client()?;
    let resp = client
        .post(&config.endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(body)
        .send();
    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            return Err(map_ollama_transport_error(&e));
        }
    };
    let status = resp.status();
    let text = read_response_text(resp);
    log::debug!(
        "AI response length: {} characters",
        text.len()
    );
    if !status.is_success() {
        let detail = if text.chars().count() > 400 {
            truncate(&text, 400)
        } else {
            text.clone()
        };
        let friendly = format!("Ollama error (HTTP {}): {}", status.as_u16(), detail);
        return Err(friendly);
    }
    let assist = match assistant_text_from_ollama_response_body(&text) {
        Ok(a) => a,
        Err(e) => {
            return Err(format!("{e}. Body (truncated): {}", truncate(&text, 500)));
        }
    };
    let mut parsed = parse_extraction_from_assistant_text(&assist)
        .map_err(|e| format!("{e} — assistant output (truncated): {}", truncate(&assist, 800)))?;
    parsed.raw_api_response = text;
    Ok(parsed)
}

fn run_ollama_invoice_request(
    config: &OllamaConfig,
    body: &serde_json::Value,
) -> Result<ParsedInvoiceExtraction, String> {
    retry_engine::execute_with_retry(
        || run_ollama_invoice_request_once(config, body),
        retry_engine::DEFAULT_MAX_RETRIES,
        retry_engine::is_retriable_network_timeout_or_5xx,
    )
}

/// Vision: base64 `images` on user message, same `ai_prompt_builder` text as DeepSeek; transport/5xx retries via `retry_engine`.
pub fn call_ollama_vision(
    config: &OllamaConfig,
    file_bytes: &[u8],
    file_name: &str,
    supplier_hint: Option<&str>,
) -> Result<ParsedInvoiceExtraction, String> {
    let b64 = B64.encode(file_bytes);
    let file_name_for_prompt = {
        let n = file_name.trim();
        if n.is_empty() {
            None
        } else {
            Some(n)
        }
    };
    let prompts = build_invoice_extraction_prompt(supplier_hint, file_name_for_prompt);
    let body = build_ollama_request_vision(&config.model_name, &b64, &prompts);
    run_ollama_invoice_request(config, &body)
}

/// Structured spreadsheet text, no `images` field.
pub fn call_ollama_parsed_text(
    config: &OllamaConfig,
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
    let body = build_ollama_request_text(&config.model_name, &base.system, &user);
    run_ollama_invoice_request(config, &body)
}

/// Text-only request with OCR body, after vision failed or was low-confidence.
pub fn call_ollama_ocr_text(
    config: &OllamaConfig,
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
    let body = build_ollama_request_text(&config.model_name, &base.system, &user);
    run_ollama_invoice_request(config, &body)
}

/// Stored in `ai_extraction_log.provider_used` for the local Ollama path.
pub fn ollama_provider_label() -> &'static str {
    "local"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_prompt_builder::build_invoice_extraction_prompt;
    use serde_json::json;

    #[test]
    fn ollama_num_predict_12000_stream_false() {
        let prompts = build_invoice_extraction_prompt(None, None);
        let v = build_ollama_request_vision("m", "AAAA", &prompts);
        assert_eq!(v.get("options").and_then(|o| o.get("num_predict")), Some(&json!(12_000i32)));
        assert_eq!(v.get("stream"), Some(&json!(false)));
        let t = build_ollama_request_text("m", "s", "u");
        assert_eq!(t.get("options").and_then(|o| o.get("num_predict")), Some(&json!(12_000i32)));
        assert_eq!(t.get("stream"), Some(&json!(false)));
    }

    #[test]
    fn mock_ollama_body_parses_to_assistant_then_invoice_json() {
        let invoice_content = r#"{
            "supplierName": "Ollama Co",
            "invoiceNumber": "INV-OL-1",
            "invoiceDate": "2025-04-01",
            "invoiceValue": 200.0,
            "invoiceCurrency": "INR",
            "shipmentTotal": 200.0,
            "lineItems": [
                {
                    "partNumber": "P-1",
                    "itemName": "Gasket",
                    "quantity": 2.0,
                    "unitPrice": 100.0
                }
            ],
            "confidenceScore": 0.88
        }"#;
        let body = json!({
            "model": "llama3",
            "message": { "role": "assistant", "content": invoice_content },
            "done": true
        });
        let s = body.to_string();
        let assist = assistant_text_from_ollama_response_body(&s).expect("ollama");
        let p = parse_extraction_from_assistant_text(&assist).expect("extract");
        assert_eq!(p.supplier_name, "Ollama Co");
        assert!((p.shipment_total.unwrap() - 200.0).abs() < 1e-6);
        assert_eq!(p.line_items.len(), 1);
        assert!((p.confidence_score.unwrap() - 0.88f32).abs() < 0.01);
    }
}
