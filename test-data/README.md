# Import Manager — sample CSV test data

These files are for **manual QA** of import flows. Paths match the **Import Manager** UI (see each module’s Import / template buttons).

## Conventions

- **UTF-8** (some files include **BOM** `U+FEFF` on purpose — see filenames).
- **Supplier** imports use a **simple comma split** (no full CSV quoting). Avoid **commas** inside fields in `supplier-valid.csv`; files that intentionally break parsing are under `invalid/` or `edge/`.
- **Shipment** CSVs use the same column set as `SHIPMENT_IMPORT_CSV_HEADERS` in `src/lib/shipment-import.ts` (see `shipment-valid.csv` header row).
- **Invoice** bulk import expects headers: `shipmentInvoiceNumber`, `itemPartNumber`, `quantity`, `unitPrice`. You must have a **shipment** with that invoice number and an **item** with that part number **before** importing.
- **Item Master** import requires CSV headers to include at least: `partNumber`, `itemDescription`, `unit`, `currency`, `unitPrice` (see `src/lib/csv-helpers.ts`).
- **BOE** import matches the in-app template shape: `beNumber`, `beDate`, `location`, `totalAssessmentValue`, `dutyAmount`, `paymentDate`, `dutyPaid`.
- **Expenses** CSV uses human-readable headers (`Expense Type`, `Service Provider`, …). Valid samples use **`Customs Clearance`** and **`ABC Logistics Ltd`** (same strings as `src/lib/mock-expense-data.ts`). If your database uses different names, edit the CSV or add matching master data.

## Folder layout

| Folder     | Contents                                      |
|-----------|------------------------------------------------|
| `supplier/` | Supplier import (app template column order)   |
| `shipment/` | Shipment CSV import                           |
| `invoice/`  | Invoice bulk CSV                              |
| `item-master/` | Item Master import                         |
| `boe/`      | BOE CSV import                                |
| `expenses/` | Expense import (Manage Expenses → import UI) |

## Suggested order of testing

1. Import **`supplier/valid/`** (or invalid/edge) — no FK dependencies.
2. Create or import a supplier with id **`Sup-001`** (or change `shipment/valid` `supplierId` to match your DB).
3. Import **`shipment/valid/`** — adjust `supplierId` / `invoiceNumber` to avoid duplicates.
4. Import **`item-master/valid/`** — align `supplierId` / `supplierName` with your options.
5. Import **`invoice/valid/`** after shipment + item exist.
6. Import **`boe/valid/`** — independent.
7. On Expenses: pick a shipment, then import **`expenses/valid/`** (after expense types / service providers exist).

## Files overview

- **`valid/`** — should parse and pass client-side validation (backend / FK rules may still reject rows; fix IDs to match your DB).
- **`invalid/`** — should fail validation or parsing (or skip all rows).
- **`edge/`** — UTF-8, BOM, duplicates, missing columns, bad types, unknown FK strings for expenses, etc.

## File manifest

### Supplier (`test-data/supplier/`)

| Path | Intent |
|------|--------|
| `valid/supplier-valid.csv` | Two clean rows; **no commas** inside fields (import uses naive `split`). |
| `invalid/supplier-invalid-binary-placeholder.csv` | Not a CSV row structure — expect import error. |
| `invalid/supplier-invalid-wrong-headers.csv` | Wrong header names — data mis-parsed / wrong columns. |
| `invalid/supplier-invalid-short-row.csv` | Too few columns on data row. |
| `edge/supplier-edge-utf8-names.csv` | CJK + German **umlaut** in names. |
| `edge/supplier-edge-utf8-bom.csv` | UTF-8 **BOM** + one row. |
| `edge/supplier-edge-duplicate-consecutive-rows.csv` | Same `supplierName` twice (two separate imports if both succeed). |

### Shipment (`test-data/shipment/`)

| Path | Intent |
|------|--------|
| `valid/shipment-valid.csv` | Full header per `SHIPMENT_IMPORT_CSV_HEADERS`; `supplierId=Sup-001`; unique `invoiceNumber`. |
| `invalid/shipment-invalid-wrong-headers.csv` | Wrong headers — parser cannot map fields. |
| `invalid/shipment-invalid-empty-invoiceNumber.csv` | Empty `invoiceNumber` — row skipped / no new data. |
| `edge/shipment-edge-duplicate-invoiceNumber.csv` | Duplicate `invoiceNumber` — second row skipped. |
| `edge/shipment-edge-utf8-bom.csv` | BOM + UTF-8 in `goodsCategory`. |
| `edge/shipment-edge-semicolon-delimiter.csv` | **Semicolon** delimiter (supported by `guessShipmentCsvDelimiter`). |

### Invoice bulk (`test-data/invoice/`)

| Path | Intent |
|------|--------|
| `valid/invoice-bulk-valid.csv` | Needs existing **shipment** `TEST-INV-SHP-001` and items **`TEST-PART-INV-001`**, **`TEST-PART-INV-002`**. |
| `invalid/invoice-bulk-missing-headers.csv` | Missing `quantity` / `unitPrice` columns. |
| `invalid/invoice-bulk-unknown-shipment-item.csv` | Valid shape; expect skip / warnings for missing FKs. |
| `edge/invoice-bulk-zero-quantity.csv` | Zero quantity edge case. |

### Item Master (`test-data/item-master/`)

| Path | Intent |
|------|--------|
| `valid/item-master-valid.csv` | Full columns; first row references `Sup-001` + name from supplier valid fixture. |
| `invalid/item-master-missing-required-unitPrice.csv` | Missing required **`unitPrice`** header. |
| `invalid/item-master-bad-unitPrice.csv` | Non-numeric `unitPrice`. |
| `edge/item-master-duplicate-partNumber.csv` | Same `partNumber` twice — second skipped on re-import. |
| `edge/item-master-utf8-description.csv` | UTF-8 in `itemDescription`. |

### BOE (`test-data/boe/`)

| Path | Intent |
|------|--------|
| `valid/boe-valid.csv` | Two BOE rows; same column set as in-app template. |
| `invalid/boe-invalid-wrong-headers.csv` | Wrong headers — parse / import failure. |
| `invalid/boe-invalid-empty.csv` | Empty file — expect error or no rows. |
| `edge/boe-edge-utf8-location.csv` | UTF-8 in `location`. |
| `edge/boe-edge-utf8-bom.csv` | BOM + one row. |

### Expenses (`test-data/expenses/`)

| Path | Intent |
|------|--------|
| `valid/expense-import-valid.csv` | Types/providers from **`mock-expense-data.ts`** (`Customs Clearance`, `Freight Charges`, `ABC Logistics Ltd`, `XYZ Customs Brokers`). |
| `invalid/expense-import-bad-date.csv` | Invalid date string. |
| `invalid/expense-import-negative-amount.csv` | Negative `Amount` / `Total Amount`. |
| `invalid/expense-import-unknown-type-provider.csv` | Unknown type and provider names. |
| `invalid/expense-import-only-header.csv` | Header row only — parser throws “at least one data row”. |
| `edge/expense-import-utf8-remarks.csv` | UTF-8 in `Remarks` (no commas). |
| `edge/expense-import-header-alias-row.csv` | **camelCase** header aliases (`expenseTypeName`, …) supported by `parseCSV`. |
