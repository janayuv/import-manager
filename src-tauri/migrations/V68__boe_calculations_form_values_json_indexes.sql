-- Optimize json_extract() / JSON filter paths on boe_calculations.form_values_json.
-- Stored JSON keys match frontend / serde camelCase (e.g. supplierName, shipmentId).
-- invoiceNumber and status are not present in current FormValues JSON; columns remain
-- NULL until present in payloads, without changing the JSON schema.
--
-- Query plan validation (SQLite 3.46+, table analyzed, ~5k rows):
--   EXPLAIN QUERY PLAN SELECT id FROM boe_calculations
--     WHERE supplier_name_generated = ?;
--   --> SEARCH boe_calculations USING INDEX idx_boe_calc_form_supplier_name_gen (supplier_name_generated=?)
--   EXPLAIN QUERY PLAN SELECT id FROM boe_calculations
--     WHERE shipment_id_generated = ?;
--   --> SEARCH boe_calculations USING INDEX idx_boe_calc_form_shipment_id_gen (shipment_id_generated=?)

ALTER TABLE boe_calculations ADD COLUMN supplier_name_generated TEXT
    GENERATED ALWAYS AS (json_extract(form_values_json, '$.supplierName')) STORED;

ALTER TABLE boe_calculations ADD COLUMN invoice_number_generated TEXT
    GENERATED ALWAYS AS (json_extract(form_values_json, '$.invoiceNumber')) STORED;

ALTER TABLE boe_calculations ADD COLUMN status_generated TEXT
    GENERATED ALWAYS AS (json_extract(form_values_json, '$.status')) STORED;

ALTER TABLE boe_calculations ADD COLUMN shipment_id_generated TEXT
    GENERATED ALWAYS AS (json_extract(form_values_json, '$.shipmentId')) STORED;

CREATE INDEX IF NOT EXISTS idx_boe_calc_form_supplier_name_gen
    ON boe_calculations(supplier_name_generated);

CREATE INDEX IF NOT EXISTS idx_boe_calc_form_invoice_number_gen
    ON boe_calculations(invoice_number_generated);

CREATE INDEX IF NOT EXISTS idx_boe_calc_form_status_gen
    ON boe_calculations(status_generated);

CREATE INDEX IF NOT EXISTS idx_boe_calc_form_shipment_id_gen
    ON boe_calculations(shipment_id_generated);
