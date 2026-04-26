//! Tesseract-based OCR for scanned images when vision extraction is unavailable or low-confidence.
//!
//! PDFs are not passed to Tesseract directly; the Poppler `pdftoppm` tool (install on `PATH`)
//! converts the first page to PNG when bytes start with the PDF signature.

use std::borrow::Cow;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::deepseek_client::ParsedInvoiceExtraction;
use crate::retry_engine;
use tesseract::{ocr_from_frame, Tesseract};
use uuid::Uuid;

/// User-facing message when [`run_ocr_on_image`] cannot produce usable text.
pub const OCR_FAILED: &str = "OCR processing failed.";

const OCR_ENG: &str = "eng";
const OCR_LOW_CONF_CUTOFF: f32 = 0.50;

const PDF_HEADER: &[u8] = b"%PDF";

fn is_pdf_bytes(data: &[u8]) -> bool {
    data.len() >= 4 && data[0..4] == *PDF_HEADER
}

/// Renders the first page of a PDF to PNG using `pdftoppm` (Poppler). The binary must be on `PATH`.
///
/// 1) Write `file_bytes` to a temp `*.pdf`  
/// 2) `pdftoppm -png -f 1 -l 1 input output_prefix`  
/// 3) Read the first page file (`<prefix>-1.png`).
pub fn convert_pdf_to_png_bytes(file_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if file_bytes.is_empty() {
        return Err("empty PDF".to_string());
    }
    if !is_pdf_bytes(file_bytes) {
        return Err("not a PDF".to_string());
    }
    let id = Uuid::new_v4();
    let base = std::env::temp_dir();
    let pdf_name = format!("im_extract_{id}.pdf");
    let pdf_path: PathBuf = base.join(&pdf_name);
    let out_prefix: PathBuf = base.join(format!("im_ppm_{id}"));
    let out_str = out_prefix
        .to_str()
        .ok_or("temp path is not valid UTF-8 for pdftoppm")?
        .to_string();

    fs::write(&pdf_path, file_bytes).map_err(|e| e.to_string())?;
    let output = {
        let mut c = Command::new("pdftoppm");
        c.arg("-png");
        c.arg("-f");
        c.arg("1");
        c.arg("-l");
        c.arg("1");
        c.arg(pdf_path.as_os_str());
        c.arg(&out_str);
        c.output()
    };
    let res = output.map_err(|e| {
        if e.kind() == ErrorKind::NotFound {
            "pdftoppm not found (install Poppler and add pdftoppm to PATH)".to_string()
        } else {
            e.to_string()
        }
    });

    // Always best-effort cleanup of the written PDF
    if let Err(e) = fs::remove_file(&pdf_path) {
        log::debug!(
            target: "import_manager::ocr",
            "Could not remove temp PDF {}: {}",
            pdf_path.display(),
            e
        );
    }

    let out = res?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        if err.is_empty() {
            return Err(format!("pdftoppm exit {}", out.status));
        }
        return Err(err.into_owned());
    }

    // Normal output: <prefix>-1.png (or similar page suffix)
    let candidate = PathBuf::from(format!("{out_str}-1.png"));
    if candidate.is_file() {
        return read_and_remove_png(&candidate);
    }
    if let Some(p) = first_pdftoppm_png(&base, &out_prefix) {
        return read_and_remove_png(&p);
    }
    Err("pdftoppm produced no PNG output for page 1".to_string())
}

fn read_and_remove_png(p: &Path) -> Result<Vec<u8>, String> {
    let b = fs::read(p).map_err(|e| e.to_string())?;
    if b.is_empty() {
        return Err("empty PNG from pdftoppm".to_string());
    }
    if let Err(e) = fs::remove_file(p) {
        log::debug!(
            target: "import_manager::ocr",
            "Could not remove temp PNG {}: {}",
            p.display(),
            e
        );
    }
    Ok(b)
}

/// Finds generated files like `prefix-1.png` in `base` when the exact `prefix-1.png` path is missing.
fn first_pdftoppm_png(base: &Path, prefix: &Path) -> Option<PathBuf> {
    let stem = prefix.file_name()?.to_str()?;
    let prefix_dash = format!("{stem}-");
    let dir = std::fs::read_dir(base).ok()?;
    let mut found: Vec<PathBuf> = dir
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|path| {
            path.file_name()
                .and_then(|f| f.to_str())
                .map(|f| f.starts_with(&prefix_dash) && f.ends_with(".png"))
                .unwrap_or(false)
        })
        .collect();
    found.sort();
    found.into_iter().next()
}

/// `true` when a follow-up text-model pass should run on OCR (vision failed, or model confidence is low).
pub fn should_run_ocr_fallback(vision: &Result<ParsedInvoiceExtraction, String>) -> bool {
    match vision {
        Err(_) => true,
        Ok(p) => p.confidence_score.unwrap_or(0.0) < OCR_LOW_CONF_CUTOFF,
    }
}

/// Decode `file_bytes` as an image, run Tesseract (English), return raw recognized text.
/// No transport-level retries (local engine); uses [`retry_engine::execute_with_retry`] with retriable = never.
pub fn run_ocr_on_image(file_bytes: &[u8]) -> Result<String, String> {
    retry_engine::execute_with_retry(
        || run_ocr_on_image_once(file_bytes),
        retry_engine::NO_TRANSPORT_RETRIES,
        retry_engine::never_retriable,
    )
}

fn run_ocr_on_image_once(file_bytes: &[u8]) -> Result<String, String> {
    if file_bytes.is_empty() {
        return Err(OCR_FAILED.to_string());
    }
    let image_bytes: Cow<'_, [u8]> = if is_pdf_bytes(file_bytes) {
        let Some(png) = convert_pdf_to_png_bytes(file_bytes)
            .ok()
            .filter(|p| !p.is_empty())
        else {
            return Err(OCR_FAILED.to_string());
        };
        Cow::Owned(png)
    } else {
        Cow::Borrowed(file_bytes)
    };
    ocr_tried_first(image_bytes.as_ref())
        .or_else(|| ocr_tried_set_image_from_mem(image_bytes.as_ref()))
        .ok_or_else(|| OCR_FAILED.to_string())
        .and_then(|s| {
            if s.trim().is_empty() {
                Err(OCR_FAILED.to_string())
            } else {
                Ok(s)
            }
        })
}

fn ocr_tried_first(file_bytes: &[u8]) -> Option<String> {
    let img = image::load_from_memory(file_bytes).ok()?;
    let rgba = img.to_rgba8();
    let w = i32::try_from(rgba.width()).ok()?;
    let h = i32::try_from(rgba.height()).ok()?;
    if w <= 0 || h <= 0 {
        return None;
    }
    let bpl = w
        .checked_mul(4)
        .and_then(|n| (n >= 0).then_some(n))?;
    ocr_from_frame(
        rgba.as_raw(),
        w,
        h,
        4,
        bpl,
        OCR_ENG,
    )
    .ok()
}

fn ocr_tried_set_image_from_mem(file_bytes: &[u8]) -> Option<String> {
    let t = Tesseract::new(None, Some(OCR_ENG)).ok()?;
    let t = t.set_image_from_mem(file_bytes).ok()?;
    let mut t = t.recognize().ok()?;
    t.get_text().ok()
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    use super::*;
    use crate::deepseek_client::ParsedLineItem;

    /// W3C minimal PDF (remote resource); used to validate Poppler + OCR pipeline.
    const DUMMY_PDF: &[u8] =
        include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/test_fixtures/dummy.pdf"));

    /// Minimal 1×1 white PNG.
    const PNG_1X1: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
        0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01,
        0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn ocr_fails_on_invalid_image_bytes() {
        let e = run_ocr_on_image(b"not an image at all");
        assert!(e.is_err());
        assert_eq!(e.unwrap_err(), OCR_FAILED);
    }

    /// With Tesseract + `eng` data installed. Run locally when validating OCR; outcome depends on the engine.
    #[test]
    #[ignore = "Requires system Tesseract and eng.traineddata; optional smoke test"]
    fn ocr_tiny_white_png_ignored_smoke() {
        let _ = run_ocr_on_image(PNG_1X1);
    }

    fn ok_parse(conf: Option<f32>) -> Result<ParsedInvoiceExtraction, String> {
        Ok(ParsedInvoiceExtraction {
            supplier_name: "S".to_string(),
            invoice_number: Some("1".to_string()),
            invoice_date: Some("d".to_string()),
            invoice_value: Some(0.0),
            invoice_currency: Some("USD".to_string()),
            shipment_total: Some(0.0),
            line_items: vec![ParsedLineItem {
                part_number: "p".to_string(),
                item_name: "i".to_string(),
                quantity: 1.0,
                unit_price: 1.0,
            }],
            confidence_score: conf,
            raw_api_response: String::new(),
        })
    }

    #[test]
    fn should_run_ocr_on_vision_error() {
        let v: Result<ParsedInvoiceExtraction, String> = Err("x".to_string());
        assert!(should_run_ocr_fallback(&v));
    }

    #[test]
    fn should_run_ocr_on_low_or_missing_confidence() {
        assert!(should_run_ocr_fallback(&ok_parse(Some(0.0))));
        assert!(should_run_ocr_fallback(&ok_parse(Some(0.49))));
        assert!(should_run_ocr_fallback(&ok_parse(None)));
        assert!(!should_run_ocr_fallback(&ok_parse(Some(0.5))));
    }

    #[test]
    fn should_not_run_ocr_when_confidence_high() {
        assert!(!should_run_ocr_fallback(&ok_parse(Some(0.5))));
        assert!(!should_run_ocr_fallback(&ok_parse(Some(0.9))));
    }

    #[test]
    fn convert_pdf_rejects_empty() {
        assert!(convert_pdf_to_png_bytes(b"").is_err());
    }

    #[test]
    fn convert_pdf_rejects_non_pdf() {
        assert!(convert_pdf_to_png_bytes(b"not a PDF").is_err());
    }

    #[test]
    fn w3c_dummy_fixture_is_pdf() {
        assert_eq!(&DUMMY_PDF[0..4], b"%PDF");
    }

    /// Requires Poppler `pdftoppm` on `PATH` (e.g. Windows: add Poppler `bin` to environment).
    #[test]
    #[ignore = "Requires Poppler (pdftoppm) in PATH; run: cargo test pdf_conversion_produces_png -- --ignored --nocapture"]
    fn pdf_conversion_produces_png() {
        let _ = Command::new("pdftoppm")
            .arg("-v")
            .output()
            .expect("pdftoppm must be on PATH for this test");
        let raw = convert_pdf_to_png_bytes(DUMMY_PDF).expect("expected pdftoppm to render page 1");
        assert!(!raw.is_empty());
        assert_eq!(&raw[0..4], &[0x89, 0x50, 0x4e, 0x47], "output must be PNG");
        let _ = image::load_from_memory(&raw).expect("PNG should decode for OCR");
    }

    /// On PDF, OCR should follow the same image path as feeding the converted PNG (no Tesseract on raw PDF).
    #[test]
    #[ignore = "Requires Poppler (pdftoppm) and Tesseract with eng data; run: cargo test ocr_on_pdf_matches_ocr_on_converted_png -- --ignored --nocapture"]
    fn ocr_on_pdf_matches_ocr_on_converted_png() {
        let _ = Command::new("pdftoppm")
            .arg("-v")
            .output()
            .expect("pdftoppm must be on PATH for this test");
        let png = convert_pdf_to_png_bytes(DUMMY_PDF)
            .expect("convert; install Poppler and ensure pdftoppm is on PATH");
        let from_pdf = run_ocr_on_image(DUMMY_PDF);
        let from_png = run_ocr_on_image(&png);
        assert_eq!(
            from_pdf, from_png,
            "OCR on a PDF should match OCR on the same page rendered to PNG; image OCR logic is unchanged"
        );
    }
}
