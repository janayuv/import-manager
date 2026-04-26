//! Fuzzy supplier name matching for AI-extracted orders (strsim / Levenshtein).

use rusqlite::Connection;
use strsim::normalized_levenshtein;

const MIN_SCORE: f64 = 0.80;

/// Result of a successful fuzzy [0.0, 1.0] Levenshtein match against a DB row.
#[derive(Debug, Clone, PartialEq)]
pub struct SupplierFuzzyMatch {
    pub id: String,
    pub name: String,
    pub score: f64,
}

fn normalize(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Returns the best matching supplier if normalized Levenshtein similarity is at least 0.80.
pub fn find_best_supplier_match(
    supplier_name: &str,
    db_connection: &Connection,
) -> std::result::Result<Option<SupplierFuzzyMatch>, String> {
    let needle = normalize(supplier_name);
    if needle.is_empty() {
        return Ok(None);
    }

    let mut best: Option<SupplierFuzzyMatch> = None;

    let mut stmt = db_connection
        .prepare("SELECT id, supplier_name FROM suppliers")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query([])
        .map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let name: String = row.get(1).map_err(|e| e.to_string())?;
        let hay = normalize(&name);
        if hay.is_empty() {
            continue;
        }
        let score = normalized_levenshtein(&needle, &hay);
        const TIE: f64 = 1e-9;
        let is_better = best.as_ref().is_none() || {
            let b = best.as_ref().expect("is_none checked");
            if (score - b.score).abs() < TIE {
                id < b.id
            } else {
                score > b.score
            }
        };
        if is_better {
            best = Some(SupplierFuzzyMatch { id, name, score });
        }
    }

    match &best {
        Some(m) if m.score >= MIN_SCORE => Ok(Some(m.clone())),
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::DatabaseMigrations;
    use rusqlite::Connection;

    fn conn_with_migrations() -> std::result::Result<Connection, String> {
        let mut c = Connection::open_in_memory().map_err(|e| e.to_string())?;
        DatabaseMigrations::run_migrations_test(&mut c).map_err(|e| e.to_string())?;
        Ok(c)
    }

    fn insert_supplier(
        c: &Connection,
        id: &str,
        name: &str,
    ) -> std::result::Result<(), String> {
        c.execute(
            "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) \
             VALUES (?1, ?2, NULL, 'N/A', 'x@y.z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1)",
            [id, name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[test]
    fn exact_match_ignoring_case_and_trim() {
        let c = conn_with_migrations().expect("db");
        // Same logical string after lower+trim: internal spaces must match for score 1.0.
        insert_supplier(&c, "Sup-Exact-1", "  Acme Limited  ")
            .expect("ins");
        let m = find_best_supplier_match("ACME limited", &c)
            .expect("query")
            .expect("match");
        assert_eq!(m.id, "Sup-Exact-1");
        assert!((m.score - 1.0).abs() < 1e-6);
    }

    #[test]
    fn near_match_single_typo_above_threshold() {
        let c = conn_with_migrations().expect("db");
        // One-char difference on a long name keeps normalized Levenshtein > 0.8.
        insert_supplier(
            &c,
            "Sup-Acme-1",
            "aaaaaaaaaaaaaaa0",
        )
        .expect("ins");
        let m = find_best_supplier_match("aaaaaaaaaaaaaaa1", &c)
            .expect("query")
            .expect("match");
        assert!(m.id == "Sup-Acme-1" && m.score >= 0.80, "score={}", m.score);
    }

    #[test]
    fn no_match_inserts_treated_separately() {
        let c = conn_with_migrations().expect("db");
        insert_supplier(&c, "Sup-Only", "Alpha Industries").expect("ins");
        let m = find_best_supplier_match("Zebra Completely Different", &c).expect("query");
        assert!(m.is_none());
    }
}
