use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use regex::Regex;
use lazy_static::lazy_static;

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

lazy_static! {
    // Email validation pattern
    static ref EMAIL_PATTERN: Regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    
    // Phone number pattern (international format)
    static ref PHONE_PATTERN: Regex = Regex::new(r"^[\+]?[1-9][\d]{0,15}$").unwrap();
    
    // Currency code pattern (ISO 4217)
    static ref CURRENCY_PATTERN: Regex = Regex::new(r"^[A-Z]{3}$").unwrap();
    
    // Country code pattern (ISO 3166-1 alpha-2)
    static ref COUNTRY_PATTERN: Regex = Regex::new(r"^[A-Z]{2}$").unwrap();
    
    // HSN/SAC code pattern (Indian GST)
    static ref HSN_PATTERN: Regex = Regex::new(r"^[0-9]{4,8}$").unwrap();
    
    // GSTIN pattern (Indian GST number)
    static ref GSTIN_PATTERN: Regex = Regex::new(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$").unwrap();
    
    // PAN pattern (Indian PAN number)
    static ref PAN_PATTERN: Regex = Regex::new(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$").unwrap();
    
    // Invoice number pattern
    static ref INVOICE_PATTERN: Regex = Regex::new(r"^[A-Z0-9\-_/]+$").unwrap();
    
    // Part number pattern
    static ref PART_NUMBER_PATTERN: Regex = Regex::new(r"^[A-Z0-9\-_/.]+$").unwrap();
    
    // Container number pattern (ISO 6346)
    static ref CONTAINER_PATTERN: Regex = Regex::new(r"^[A-Z]{4}[0-9]{7}$").unwrap();
    
    // BL/AWB number pattern
    static ref BL_AWB_PATTERN: Regex = Regex::new(r"^[A-Z0-9\-]+$").unwrap();
    
    // Bank account number pattern
    static ref ACCOUNT_PATTERN: Regex = Regex::new(r"^[0-9]{9,18}$").unwrap();
    
    // SWIFT/BIC code pattern
    static ref SWIFT_PATTERN: Regex = Regex::new(r"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$").unwrap();
    
    // IBAN pattern (basic)
    static ref IBAN_PATTERN: Regex = Regex::new(r"^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$").unwrap();
    
    // SQL injection patterns
    static ref SQL_INJECTION_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)").unwrap(),
        Regex::new(r"(\b(OR|AND)\b\s+\d+\s*=\s*\d+)").unwrap(),
        Regex::new(r"(\b(OR|AND)\b\s+['\"]\w+['\"]\s*=\s*['\"]\w+['\"])").unwrap(),
        Regex::new(r"(--|/\*|\*/|;)").unwrap(),
        Regex::new(r"(\b(WAITFOR|DELAY)\b)").unwrap(),
    ];
    
    // XSS patterns
    static ref XSS_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>").unwrap(),
        Regex::new(r"javascript:").unwrap(),
        Regex::new(r"on\w+\s*=").unwrap(),
        Regex::new(r"<iframe\b[^<]*(?:(?!</iframe>)<[^<]*)*</iframe>").unwrap(),
        Regex::new(r"<object\b[^<]*(?:(?!</object>)<[^<]*)*</object>").unwrap(),
        Regex::new(r"<embed\b[^<]*(?:(?!</embed>)<[^<]*)*</embed>").unwrap(),
    ];
}

// ============================================================================
// VALIDATION ERROR TYPES
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
    pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<ValidationError>,
}

impl ValidationResult {
    pub fn new() -> Self {
        Self {
            is_valid: true,
            errors: Vec::new(),
        }
    }

    pub fn add_error(&mut self, field: &str, message: &str, code: &str) {
        self.is_valid = false;
        self.errors.push(ValidationError {
            field: field.to_string(),
            message: message.to_string(),
            code: code.to_string(),
        });
    }

    pub fn merge(&mut self, other: ValidationResult) {
        if !other.is_valid {
            self.is_valid = false;
            self.errors.extend(other.errors);
        }
    }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

// String validation and sanitization
pub fn validate_string(value: &str, field: &str, min_length: usize, max_length: usize) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "This field is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value);
    
    if sanitized.len() < min_length {
        result.add_error(
            field,
            &format!("Must be at least {} characters.", min_length),
            "MIN_LENGTH"
        );
    }
    
    if sanitized.len() > max_length {
        result.add_error(
            field,
            &format!("Must be no more than {} characters.", max_length),
            "MAX_LENGTH"
        );
    }
    
    result
}

// Email validation
pub fn validate_email(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Email is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_lowercase();
    
    if !EMAIL_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid email address.", "INVALID_EMAIL");
    }
    
    result
}

// Phone number validation
pub fn validate_phone(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Phone number is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value);
    
    if !PHONE_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid phone number.", "INVALID_PHONE");
    }
    
    result
}

// Currency code validation
pub fn validate_currency(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Currency is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !CURRENCY_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid currency code (e.g., USD, EUR, INR).", "INVALID_CURRENCY");
    }
    
    result
}

// Country code validation
pub fn validate_country(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Country is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !COUNTRY_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid country code (e.g., US, IN, DE).", "INVALID_COUNTRY");
    }
    
    result
}

// HSN/SAC code validation
pub fn validate_hsn_code(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "HSN/SAC code is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value);
    
    if !HSN_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid HSN/SAC code (4-8 digits).", "INVALID_HSN");
    }
    
    result
}

// GSTIN validation
pub fn validate_gstin(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "GSTIN is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !GSTIN_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid GSTIN.", "INVALID_GSTIN");
    }
    
    result
}

// PAN validation
pub fn validate_pan(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "PAN is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !PAN_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid PAN number.", "INVALID_PAN");
    }
    
    result
}

// Invoice number validation
pub fn validate_invoice_number(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Invoice number is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !INVOICE_PATTERN.is_match(&sanitized) {
        result.add_error(
            field,
            "Invoice number can only contain letters, numbers, hyphens, underscores, and forward slashes.",
            "INVALID_INVOICE"
        );
    }
    
    result
}

// Part number validation
pub fn validate_part_number(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Part number is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !PART_NUMBER_PATTERN.is_match(&sanitized) {
        result.add_error(
            field,
            "Part number can only contain letters, numbers, hyphens, underscores, dots, and forward slashes.",
            "INVALID_PART_NUMBER"
        );
    }
    
    result
}

// Container number validation
pub fn validate_container_number(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Container number is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !CONTAINER_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid container number (4 letters + 7 digits).", "INVALID_CONTAINER");
    }
    
    result
}

// BL/AWB number validation
pub fn validate_bl_awb_number(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "BL/AWB number is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !BL_AWB_PATTERN.is_match(&sanitized) {
        result.add_error(field, "BL/AWB number can only contain letters, numbers, and hyphens.", "INVALID_BL_AWB");
    }
    
    result
}

// Bank account number validation
pub fn validate_account_number(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Account number is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value);
    
    if !ACCOUNT_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid account number (9-18 digits).", "INVALID_ACCOUNT");
    }
    
    result
}

// SWIFT code validation
pub fn validate_swift_code(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "SWIFT code is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !SWIFT_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid SWIFT/BIC code.", "INVALID_SWIFT");
    }
    
    result
}

// IBAN validation
pub fn validate_iban(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "IBAN is required.", "REQUIRED");
        return result;
    }
    
    let sanitized = sanitize_string(value).to_uppercase();
    
    if !IBAN_PATTERN.is_match(&sanitized) {
        result.add_error(field, "Please enter a valid IBAN.", "INVALID_IBAN");
    }
    
    result
}

// Number validation
pub fn validate_number(value: f64, field: &str, min: Option<f64>, max: Option<f64>) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if let Some(min_val) = min {
        if value < min_val {
            result.add_error(
                field,
                &format!("Must be at least {}.", min_val),
                "MIN_VALUE"
            );
        }
    }
    
    if let Some(max_val) = max {
        if value > max_val {
            result.add_error(
                field,
                &format!("Must be no more than {}.", max_val),
                "MAX_VALUE"
            );
        }
    }
    
    result
}

// Percentage validation (0-100)
pub fn validate_percentage(value: f64, field: &str) -> ValidationResult {
    validate_number(value, field, Some(0.0), Some(100.0))
}

// Date validation (not in future)
pub fn validate_past_date(value: &str, field: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if value.trim().is_empty() {
        result.add_error(field, "Date is required.", "REQUIRED");
        return result;
    }
    
    match chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        Ok(date) => {
            let today = chrono::Utc::now().naive_utc().date();
            if date > today {
                result.add_error(field, "Date cannot be in the future.", "FUTURE_DATE");
            }
        }
        Err(_) => {
            result.add_error(field, "Please enter a valid date (YYYY-MM-DD).", "INVALID_DATE");
        }
    }
    
    result
}

// ============================================================================
// SECURITY VALIDATION
// ============================================================================

// Check for SQL injection patterns
pub fn contains_sql_injection(text: &str) -> bool {
    SQL_INJECTION_PATTERNS.iter().any(|pattern| pattern.is_match(text))
}

// Check for XSS patterns
pub fn contains_xss(text: &str) -> bool {
    XSS_PATTERNS.iter().any(|pattern| pattern.is_match(text))
}

// Validate and sanitize user input
pub fn validate_user_input(
    input: &str,
    max_length: Option<usize>,
    check_sql_injection: bool,
    check_xss: bool,
) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    let max_len = max_length.unwrap_or(1000);
    
    if input.len() > max_len {
        result.add_error(
            "input",
            &format!("Input must be no more than {} characters.", max_len),
            "MAX_LENGTH"
        );
    }
    
    if check_sql_injection && contains_sql_injection(input) {
        result.add_error(
            "input",
            "Input contains potentially dangerous SQL patterns.",
            "SQL_INJECTION"
        );
    }
    
    if check_xss && contains_xss(input) {
        result.add_error(
            "input",
            "Input contains potentially dangerous XSS patterns.",
            "XSS"
        );
    }
    
    result
}

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

// Sanitize string input
pub fn sanitize_string(input: &str) -> String {
    input
        .trim()
        .chars()
        .filter(|&c| c.is_ascii_alphanumeric() || c.is_ascii_whitespace() || c.is_ascii_punctuation())
        .collect()
}

// Sanitize HTML content (basic)
pub fn sanitize_html(html: &str) -> String {
    // Remove script tags and their content
    let mut sanitized = html.to_string();
    
    // Remove script tags
    sanitized = regex::Regex::new(r"<script[^>]*>.*?</script>")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();
    
    // Remove iframe tags
    sanitized = regex::Regex::new(r"<iframe[^>]*>.*?</iframe>")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();
    
    // Remove object tags
    sanitized = regex::Regex::new(r"<object[^>]*>.*?</object>")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();
    
    // Remove embed tags
    sanitized = regex::Regex::new(r"<embed[^>]*>.*?</embed>")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();
    
    // Remove javascript: protocols
    sanitized = regex::Regex::new(r"javascript:")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();
    
    // Remove event handlers
    sanitized = regex::Regex::new(r"on\w+\s*=")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();
    
    sanitized
}

// ============================================================================
// ENTITY VALIDATION
// ============================================================================

// Supplier validation
pub fn validate_supplier(data: &HashMap<String, serde_json::Value>) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    // Validate required fields
    if let Some(name) = data.get("supplierName") {
        if let Some(name_str) = name.as_str() {
            let name_result = validate_string(name_str, "supplierName", 2, 100);
            result.merge(name_result);
        } else {
            result.add_error("supplierName", "Supplier name must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("supplierName", "Supplier name is required.", "REQUIRED");
    }
    
    if let Some(country) = data.get("country") {
        if let Some(country_str) = country.as_str() {
            let country_result = validate_country(country_str, "country");
            result.merge(country_result);
        } else {
            result.add_error("country", "Country must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("country", "Country is required.", "REQUIRED");
    }
    
    if let Some(email) = data.get("email") {
        if let Some(email_str) = email.as_str() {
            let email_result = validate_email(email_str, "email");
            result.merge(email_result);
        } else {
            result.add_error("email", "Email must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("email", "Email is required.", "REQUIRED");
    }
    
    if let Some(phone) = data.get("phone") {
        if let Some(phone_str) = phone.as_str() {
            let phone_result = validate_phone(phone_str, "phone");
            result.merge(phone_result);
        } else {
            result.add_error("phone", "Phone must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("phone", "Phone is required.", "REQUIRED");
    }
    
    // Validate optional fields
    if let Some(account_no) = data.get("accountNo") {
        if let Some(account_str) = account_no.as_str() {
            let account_result = validate_account_number(account_str, "accountNo");
            result.merge(account_result);
        } else {
            result.add_error("accountNo", "Account number must be a string.", "INVALID_TYPE");
        }
    }
    
    if let Some(iban) = data.get("iban") {
        if let Some(iban_str) = iban.as_str() {
            if !iban_str.trim().is_empty() {
                let iban_result = validate_iban(iban_str, "iban");
                result.merge(iban_result);
            }
        }
    }
    
    if let Some(swift) = data.get("swiftCode") {
        if let Some(swift_str) = swift.as_str() {
            if !swift_str.trim().is_empty() {
                let swift_result = validate_swift_code(swift_str, "swiftCode");
                result.merge(swift_result);
            }
        }
    }
    
    result
}

// Shipment validation
pub fn validate_shipment(data: &HashMap<String, serde_json::Value>) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    // Validate required fields
    if let Some(invoice_number) = data.get("invoiceNumber") {
        if let Some(invoice_str) = invoice_number.as_str() {
            let invoice_result = validate_invoice_number(invoice_str, "invoiceNumber");
            result.merge(invoice_result);
        } else {
            result.add_error("invoiceNumber", "Invoice number must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("invoiceNumber", "Invoice number is required.", "REQUIRED");
    }
    
    if let Some(invoice_date) = data.get("invoiceDate") {
        if let Some(date_str) = invoice_date.as_str() {
            let date_result = validate_past_date(date_str, "invoiceDate");
            result.merge(date_result);
        } else {
            result.add_error("invoiceDate", "Invoice date must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("invoiceDate", "Invoice date is required.", "REQUIRED");
    }
    
    if let Some(value) = data.get("invoiceValue") {
        if let Some(value_num) = value.as_f64() {
            let value_result = validate_number(value_num, "invoiceValue", Some(0.0), None);
            result.merge(value_result);
        } else {
            result.add_error("invoiceValue", "Invoice value must be a number.", "INVALID_TYPE");
        }
    } else {
        result.add_error("invoiceValue", "Invoice value is required.", "REQUIRED");
    }
    
    if let Some(currency) = data.get("invoiceCurrency") {
        if let Some(currency_str) = currency.as_str() {
            let currency_result = validate_currency(currency_str, "invoiceCurrency");
            result.merge(currency_result);
        } else {
            result.add_error("invoiceCurrency", "Currency must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("invoiceCurrency", "Currency is required.", "REQUIRED");
    }
    
    // Validate optional fields
    if let Some(bl_awb) = data.get("blAwbNumber") {
        if let Some(bl_awb_str) = bl_awb.as_str() {
            if !bl_awb_str.trim().is_empty() {
                let bl_awb_result = validate_bl_awb_number(bl_awb_str, "blAwbNumber");
                result.merge(bl_awb_result);
            }
        }
    }
    
    if let Some(container) = data.get("containerNumber") {
        if let Some(container_str) = container.as_str() {
            if !container_str.trim().is_empty() {
                let container_result = validate_container_number(container_str, "containerNumber");
                result.merge(container_result);
            }
        }
    }
    
    result
}

// Item validation
pub fn validate_item(data: &HashMap<String, serde_json::Value>) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    // Validate required fields
    if let Some(part_number) = data.get("partNumber") {
        if let Some(part_str) = part_number.as_str() {
            let part_result = validate_part_number(part_str, "partNumber");
            result.merge(part_result);
        } else {
            result.add_error("partNumber", "Part number must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("partNumber", "Part number is required.", "REQUIRED");
    }
    
    if let Some(description) = data.get("itemDescription") {
        if let Some(desc_str) = description.as_str() {
            let desc_result = validate_string(desc_str, "itemDescription", 10, 500);
            result.merge(desc_result);
        } else {
            result.add_error("itemDescription", "Item description must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("itemDescription", "Item description is required.", "REQUIRED");
    }
    
    if let Some(price) = data.get("unitPrice") {
        if let Some(price_num) = price.as_f64() {
            let price_result = validate_number(price_num, "unitPrice", Some(0.0), None);
            result.merge(price_result);
        } else {
            result.add_error("unitPrice", "Unit price must be a number.", "INVALID_TYPE");
        }
    } else {
        result.add_error("unitPrice", "Unit price is required.", "REQUIRED");
    }
    
    if let Some(hsn) = data.get("hsnCode") {
        if let Some(hsn_str) = hsn.as_str() {
            let hsn_result = validate_hsn_code(hsn_str, "hsnCode");
            result.merge(hsn_result);
        } else {
            result.add_error("hsnCode", "HSN code must be a string.", "INVALID_TYPE");
        }
    } else {
        result.add_error("hsnCode", "HSN code is required.", "REQUIRED");
    }
    
    // Validate optional fields
    if let Some(bcd) = data.get("bcd") {
        if let Some(bcd_num) = bcd.as_f64() {
            let bcd_result = validate_percentage(bcd_num, "bcd");
            result.merge(bcd_result);
        }
    }
    
    if let Some(sws) = data.get("sws") {
        if let Some(sws_num) = sws.as_f64() {
            let sws_result = validate_percentage(sws_num, "sws");
            result.merge(sws_result);
        }
    }
    
    if let Some(igst) = data.get("igst") {
        if let Some(igst_num) = igst.as_f64() {
            let igst_result = validate_percentage(igst_num, "igst");
            result.merge(igst_result);
        }
    }
    
    result
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Validate JSON data against a schema
pub fn validate_json_data(data: &serde_json::Value, entity_type: &str) -> ValidationResult {
    match entity_type {
        "supplier" => {
            if let Some(obj) = data.as_object() {
                let map: HashMap<String, serde_json::Value> = obj.clone();
                validate_supplier(&map)
            } else {
                let mut result = ValidationResult::new();
                result.add_error("data", "Data must be an object.", "INVALID_TYPE");
                result
            }
        }
        "shipment" => {
            if let Some(obj) = data.as_object() {
                let map: HashMap<String, serde_json::Value> = obj.clone();
                validate_shipment(&map)
            } else {
                let mut result = ValidationResult::new();
                result.add_error("data", "Data must be an object.", "INVALID_TYPE");
                result
            }
        }
        "item" => {
            if let Some(obj) = data.as_object() {
                let map: HashMap<String, serde_json::Value> = obj.clone();
                validate_item(&map)
            } else {
                let mut result = ValidationResult::new();
                result.add_error("data", "Data must be an object.", "INVALID_TYPE");
                result
            }
        }
        _ => {
            let mut result = ValidationResult::new();
            result.add_error("entity_type", "Unknown entity type.", "UNKNOWN_ENTITY");
            result
        }
    }
}

// Validate CSV data
pub fn validate_csv_data(data: &[serde_json::Value], entity_type: &str) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    for (index, row) in data.iter().enumerate() {
        let row_result = validate_json_data(row, entity_type);
        if !row_result.is_valid {
            for error in row_result.errors {
                let mut new_error = error;
                new_error.field = format!("row_{}_{}", index, error.field);
                result.errors.push(new_error);
            }
            result.is_valid = false;
        }
    }
    
    result
}
