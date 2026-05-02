-- Precomputed heavy dashboard aggregates (duty JOIN, avg transit, directory counts).
-- NULL extended columns mark rows written before this migration; readers force regeneration.

ALTER TABLE dashboard_kpi_snapshot ADD COLUMN reconciled_boes INTEGER;
ALTER TABLE dashboard_kpi_snapshot ADD COLUMN duty_total REAL;
ALTER TABLE dashboard_kpi_snapshot ADD COLUMN avg_transit_days REAL;
ALTER TABLE dashboard_kpi_snapshot ADD COLUMN shipments_missing_eta INTEGER;
ALTER TABLE dashboard_kpi_snapshot ADD COLUMN shipments_missing_etd INTEGER;
ALTER TABLE dashboard_kpi_snapshot ADD COLUMN total_suppliers INTEGER;
ALTER TABLE dashboard_kpi_snapshot ADD COLUMN total_items INTEGER;
