//! Composite confidence after supplier + line-item validation (does not replace raw AI `confidenceScore` in extraction).

const SUPPLIER_BONUS: f32 = 0.20;
const ITEM_RATIO_WEIGHT: f32 = 0.20;
const OCR_PENALTY: f32 = 0.10;
const AI_CONF_UNWRAP_DEFAULT: f32 = 0.5;

/// Blend AI-reported score with post-save validation. AI score is the starting point (`unwrap_or(0.5)`), then
/// supplier match, item match ratio, and OCR use adjust the value; result is clamped to \[0, 1\].
pub fn calculate_final_confidence(
    ai_confidence: Option<f32>,
    supplier_matched: bool,
    matched_line_items: usize,
    total_line_items: usize,
    used_ocr: bool,
) -> f32 {
    let mut score = ai_confidence.unwrap_or(AI_CONF_UNWRAP_DEFAULT);
    if supplier_matched {
        score += SUPPLIER_BONUS;
    } else {
        score -= SUPPLIER_BONUS;
    }
    let ratio = if total_line_items == 0 {
        0.0
    } else {
        (matched_line_items as f32) / (total_line_items as f32)
    };
    score += ratio * ITEM_RATIO_WEIGHT;
    if used_ocr {
        score -= OCR_PENALTY;
    }
    score.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EPS: f32 = 1e-5;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < EPS
    }

    /// Near‑ideal: supplier match, all lines match, not OCR, AI high.
    #[test]
    fn full_match() {
        let c = calculate_final_confidence(
            Some(0.8),
            true,
            2,
            2,
            false,
        );
        // 0.8 + 0.2 + 1.0 * 0.2 = 1.2 -> 1.0
        assert!(approx_eq(c, 1.0), "got {c}");
    }

    /// Some line items not in master: ratio < 1.
    #[test]
    fn partial_match() {
        let c = calculate_final_confidence(
            Some(0.5),
            true,
            1,
            2,
            false,
        );
        // 0.5 + 0.2 + 0.5*0.2 = 0.5 + 0.2 + 0.1 = 0.8
        assert!(approx_eq(c, 0.8), "got {c}");
    }

    /// New supplier, no line matches, default AI.
    #[test]
    fn no_match_supplier_and_zero_line_ratio() {
        let c = calculate_final_confidence(
            Some(0.5),
            false,
            0,
            1,
            false,
        );
        // 0.5 - 0.2 + 0.0*0.2 = 0.3
        assert!(approx_eq(c, 0.3), "got {c}");
    }

    #[test]
    fn ocr_penalty_applied() {
        // Scores that stay below 1.0 so clamp does not mask the 0.1 OCR penalty.
        let with_ocr = calculate_final_confidence(Some(0.6), true, 2, 2, true);
        let no_ocr = calculate_final_confidence(Some(0.6), true, 2, 2, false);
        assert!((no_ocr - with_ocr - OCR_PENALTY).abs() < EPS, "no_ocr={no_ocr} with_ocr={with_ocr}");
    }

    #[test]
    fn clamp_to_one() {
        let c = calculate_final_confidence(Some(0.95), true, 1, 1, false);
        // 0.95 + 0.2 + 0.2 = 1.35 -> 1.0
        assert!(approx_eq(c, 1.0), "got {c}");
    }

    #[test]
    fn clamp_to_zero() {
        // 0 - 0.2 (no supplier) - 0.1 (OCR) = -0.3 -> 0.0
        let c2 = calculate_final_confidence(
            Some(0.0),
            false,
            0,
            5,
            true,
        );
        assert!(approx_eq(c2, 0.0), "got {c2}");
    }

    #[test]
    fn no_line_items_ratio_is_zero() {
        let c = calculate_final_confidence(
            None,
            true,
            0,
            0,
            false,
        );
        // 0.5 + 0.2 + 0 = 0.7
        assert!(approx_eq(c, 0.7), "got {c}");
    }
}
