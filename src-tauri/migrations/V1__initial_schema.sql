-- V1__initial_schema.sql
-- Initial database schema migration

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    short_name TEXT,
    country TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    beneficiary_name TEXT,
    bank_name TEXT,
    branch TEXT,
    bank_address TEXT,
    account_no TEXT,
    iban TEXT,
    swift_code TEXT,
    is_active BOOLEAN NOT NULL
);

-- Shipments table
CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY, 
    supplier_id TEXT NOT NULL, 
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL, 
    goods_category TEXT NOT NULL, 
    invoice_value REAL NOT NULL,
    invoice_currency TEXT NOT NULL, 
    incoterm TEXT NOT NULL, 
    shipment_mode TEXT,
    shipment_type TEXT, 
    bl_awb_number TEXT, 
    bl_awb_date TEXT, 
    vessel_name TEXT,
    container_number TEXT, 
    gross_weight_kg REAL, 
    etd TEXT, 
    eta TEXT,
    status TEXT, 
    date_of_delivery TEXT, 
    is_frozen BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);

-- Items table
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    part_number TEXT NOT NULL UNIQUE,
    item_description TEXT NOT NULL,
    unit TEXT NOT NULL,
    currency TEXT NOT NULL,
    unit_price REAL NOT NULL,
    hsn_code TEXT NOT NULL,
    supplier_id TEXT,
    is_active BOOLEAN NOT NULL,
    country_of_origin TEXT,
    bcd TEXT,
    sws TEXT,
    igst TEXT,
    technical_write_up TEXT,
    category TEXT,
    end_use TEXT,
    net_weight_kg REAL,
    purchase_uom TEXT,
    gross_weight_per_uom_kg REAL,
    photo_path TEXT,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY NOT NULL,
    shipment_id TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

-- Invoice line items table
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id TEXT PRIMARY KEY NOT NULL,
    invoice_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- BOE Details table
CREATE TABLE IF NOT EXISTS boe_details (
    id TEXT PRIMARY KEY NOT NULL,
    be_number TEXT NOT NULL,
    be_date TEXT NOT NULL,
    location TEXT NOT NULL,
    total_assessment_value REAL NOT NULL,
    duty_amount REAL NOT NULL,
    payment_date TEXT,
    duty_paid REAL,
    challan_number TEXT,
    ref_id TEXT,
    transaction_id TEXT,
    UNIQUE(be_number, be_date)
);

-- BOE Calculations table
CREATE TABLE IF NOT EXISTS boe_calculations (
    id TEXT PRIMARY KEY NOT NULL,
    shipment_id TEXT NOT NULL,
    boe_id TEXT,
    supplier_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Awaiting BOE Data',
    form_values_json TEXT NOT NULL,
    item_inputs_json TEXT NOT NULL,
    calculation_result_json TEXT NOT NULL,
    attachments_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

-- Service Providers table
CREATE TABLE IF NOT EXISTS service_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gstin TEXT UNIQUE,
    state TEXT,
    contact_person TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expense Types table
CREATE TABLE IF NOT EXISTS expense_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    default_cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    default_sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    default_igst_rate DECIMAL(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expense Invoices table
CREATE TABLE IF NOT EXISTS expense_invoices (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    service_provider_id TEXT NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    total_cgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_sgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_igst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    remarks TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id),
    FOREIGN KEY (service_provider_id) REFERENCES service_providers(id),
    UNIQUE(service_provider_id, invoice_no)
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    expense_invoice_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    service_provider_id TEXT NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    expense_type_id TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    igst_rate DECIMAL(5, 2) DEFAULT 0.00,
    tds_rate DECIMAL(5, 2) DEFAULT 0.00,
    cgst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * cgst_rate / 100) STORED,
    sgst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * sgst_rate / 100) STORED,
    igst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * igst_rate / 100) STORED,
    tds_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * tds_rate / 100) STORED,
    total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount + (amount * (cgst_rate + sgst_rate + igst_rate) / 100)) STORED,
    remarks TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_invoice_id) REFERENCES expense_invoices(id),
    FOREIGN KEY (shipment_id) REFERENCES shipments(id),
    FOREIGN KEY (service_provider_id) REFERENCES service_providers(id),
    FOREIGN KEY (expense_type_id) REFERENCES expense_types(id),
    UNIQUE(expense_invoice_id, expense_type_id)
);

-- Expense Attachments table
CREATE TABLE IF NOT EXISTS expense_attachments (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by TEXT,
    FOREIGN KEY (expense_id) REFERENCES expenses(id)
);

-- Create option tables for dropdowns
CREATE TABLE IF NOT EXISTS units (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS currencies (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS countries (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS bcd_rates (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS sws_rates (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS igst_rates (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS categories (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS end_uses (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS purchase_uoms (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS incoterms (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS shipment_modes (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS shipment_types (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS shipment_statuses (value TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL UNIQUE);

-- Create report view
CREATE VIEW IF NOT EXISTS report_view AS
WITH 
boe_items AS (
    SELECT
        bc.id AS boe_calc_id,
        bc.shipment_id,
        bc.supplier_name,
        bc.invoice_number,
        json_extract(item.value, '$.partNo') AS part_no,
        json_extract(item.value, '$.description') AS boe_description,
        CAST(json_extract(item.value, '$.assessableValue') AS REAL) AS boe_assessable_value,
        CAST(json_extract(item.value, '$.bcdValue') AS REAL) AS boe_bcd_amount,
        CAST(json_extract(item.value, '$.swsValue') AS REAL) AS boe_sws_amount,
        CAST(json_extract(item.value, '$.igstValue') AS REAL) AS boe_igst_amount
    FROM boe_calculations bc
    JOIN json_each(json_extract(bc.calculation_result_json, '$.calculatedItems')) AS item
),
shipment_expenses AS (
    SELECT ei.shipment_id, 
           SUM(e.amount) AS shipment_expenses_basic,
           SUM(e.total_amount) AS shipment_expenses_total
    FROM expense_invoices ei
    JOIN expenses e ON e.expense_invoice_id = ei.id
    GROUP BY ei.shipment_id
),
boe_assessable AS (
    SELECT shipment_id, SUM(boe_assessable_value) AS shipment_boe_assessable_total
    FROM boe_items
    GROUP BY shipment_id
)
SELECT 
    sup.supplier_name AS supplier,
    s.supplier_id AS supplier_id,
    s.invoice_number AS invoice_no,
    s.invoice_date AS invoice_date,
    bi.part_no AS part_no,
    COALESCE(i.item_description, bi.boe_description) AS description,
    i.unit AS unit,
    ili.quantity AS qty,
    ili.unit_price AS unit_price,
    bi.boe_assessable_value AS assessable_value,
    bi.boe_bcd_amount AS bcd_amount,
    bi.boe_sws_amount AS sws_amount,
    bi.boe_igst_amount AS igst_amount,
    COALESCE(se.shipment_expenses_basic, 0.0) * 
      (bi.boe_assessable_value / NULLIF(ba.shipment_boe_assessable_total, 0)) AS expenses_total,
    (
      (bi.boe_assessable_value + bi.boe_bcd_amount + bi.boe_sws_amount
       + (COALESCE(se.shipment_expenses_basic, 0.0) * (bi.boe_assessable_value / NULLIF(ba.shipment_boe_assessable_total, 0))))
    ) / NULLIF(ili.quantity, 0) AS ldc_per_qty
FROM boe_items bi
JOIN shipments s ON s.id = bi.shipment_id
JOIN suppliers sup ON sup.id = s.supplier_id
JOIN invoices inv ON inv.shipment_id = s.id
JOIN items i ON i.part_number = bi.part_no
JOIN invoice_line_items ili ON ili.invoice_id = inv.id AND ili.item_id = i.id
LEFT JOIN shipment_expenses se ON se.shipment_id = s.id
LEFT JOIN boe_assessable ba ON ba.shipment_id = s.id;
