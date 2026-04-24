-- Align KPI registry with dashboard metrics implementation (duty from report_view in scope).
UPDATE kpi_metadata
SET
    formula = 'SUM(report_view.bcd_amount + sws_amount + igst_amount) JOIN shipments filter',
    description = 'Sum of BCD, SWS, and IGST from consolidated report_view rows, scoped like shipment filters',
    last_updated = datetime('now')
WHERE kpi_name = 'duty_total';
