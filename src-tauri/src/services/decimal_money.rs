use rust_decimal::prelude::{FromPrimitive, ToPrimitive};
use rust_decimal::Decimal;

pub fn to_decimal(value: f64) -> Decimal {
    Decimal::from_f64(value).unwrap_or(Decimal::ZERO)
}

pub fn round_money(value: f64) -> f64 {
    to_decimal(value).round_dp(2).to_f64().unwrap_or(0.0)
}

pub fn sum_money(values: &[f64]) -> f64 {
    values
        .iter()
        .fold(Decimal::ZERO, |acc, value| acc + to_decimal(*value))
        .round_dp(2)
        .to_f64()
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_money_two_decimal_places() {
        assert!((round_money(10.006) - 10.01).abs() < 1e-9);
        assert!((round_money(1.234) - 1.23).abs() < 1e-9);
        assert!((round_money(-88.888) - -88.89).abs() < 1e-9);
    }

    #[test]
    fn sum_money_empty_is_zero() {
        assert!((sum_money(&[]) - 0.0).abs() < 1e-9);
    }

    #[test]
    fn sum_money_rounds_total() {
        let s = sum_money(&[0.1, 0.2, 0.3]);
        assert!((s - 0.6).abs() < 1e-9);
        let t = sum_money(&[10.006, 3.004]);
        assert!((t - 13.01).abs() < 1e-9);
    }

    #[test]
    fn to_decimal_nan_like_large_handling() {
        let d = to_decimal(f64::NAN);
        assert_eq!(d, Decimal::ZERO);
    }

    #[test]
    fn round_money_tax_style_percent() {
        // 18% of 100.005 → round to cents
        let base = 100.005;
        let rate = 0.18;
        assert!((round_money(base * rate) - 18.0).abs() < 1e-9);
    }

    #[test]
    fn sum_money_many_small_lines_invoice_style() {
        let lines: Vec<f64> = (0..100).map(|_| 0.01).collect();
        assert!((sum_money(&lines) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn sum_money_mixed_signs_and_zeros() {
        let s = sum_money(&[0.0, -10.0, 10.004, -0.004]);
        assert!((s - 0.0).abs() < 1e-9);
        assert!((sum_money(&[0.0, 0.0]) - 0.0).abs() < 1e-9);
    }

    #[test]
    fn line_totals_round_then_sum_matches_invoice_pattern() {
        let qty = [3.0, 2.0, 1.0];
        let unit = [10.333, 4.445, 99.994];
        let rounded_line_totals: Vec<f64> = qty
            .iter()
            .zip(unit.iter())
            .map(|(q, u)| round_money(q * u))
            .collect();
        assert!((sum_money(&rounded_line_totals) - 139.88).abs() < 1e-9);
    }
}
