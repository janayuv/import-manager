-- Snapshot duty / SWS / IGST rates on each invoice line so Item Master changes do not alter historical invoices.
ALTER TABLE invoice_line_items ADD COLUMN duty_percent REAL;
ALTER TABLE invoice_line_items ADD COLUMN sws_percent REAL;
ALTER TABLE invoice_line_items ADD COLUMN igst_percent REAL;
