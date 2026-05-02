# IMPORT MANAGER — FULL SYSTEM DISCOVERY REPORT

## SYSTEM OVERVIEW

| Field | Value |
|---|---|
| Project Name | Import Manager |
| Version | 0.2.3 |
| Architecture | Desktop App — Tauri v2 (Rust backend + React frontend) |
| Frontend Framework | React 19 + Vite 8 + React Router v7 + TailwindCSS v4 |
| Backend Framework | Tauri 2.10 / Rust 2021 edition |
| Database | SQLite (rusqlite 0.31 bundled) with WAL mode + Refinery migrations |
| Platform | Windows-only (win32) |
| Auto-update | GitHub Releases via Tauri updater plugin |

---

## SECTION 1 — FRONTEND MODULE DISCOVERY

### Pages (27 total from App.tsx routing)

| Page Name | Route Path | Primary Purpose |
|---|---|---|
| Login | `/login` | Authentication gate (localStorage token) |
| Dashboard | `/` | KPI metrics, charts, exception alerts, monthly summary |
| Shipment | `/shipment`, `/shipment/:id/view`, `/shipment/:id/edit` | Shipment CRUD + CSV bulk import |
| Invoice | `/invoice`, `/invoice/:id/view`, `/invoice/:id/edit` | Invoice management + line items |
| Invoice Wizard | `/invoice-wizard` | Step-by-step invoice creation |
| Item Master | `/item-master`, `/item-master/:id/view`, `/item-master/:id/edit`, `/item-master/new` | Item catalog CRUD + CSV import |
| Supplier | `/supplier`, `/supplier/:id/view`, `/supplier/:id/edit` | Supplier CRUD + CSV import |
| BOE | `/boe`, `/boe/:id/view`, `/boe/:id/edit`, `/boe/new` | Bill of Entry management |
| BOE Entry | `/boe-entry`, `/boe-entry/:id/view`, `/boe-entry/:id/edit`, `/boe-entry/new` | BOE duty calculator |
| BOE Summary | `/boe-summary`, `/boe-summary/:id` | BOE landed cost summary view |
| Expenses | `/expenses` | Expense invoices management |
| Expense Reports | `/expense-reports` | GST/expense reporting |
| Expense Data Manager | `/expense-data-manager` | Bulk expense data management |
| Frozen Shipments | `/frozen-shipments` | View/manage frozen shipments |
| Reports | `/report` | Combined landed cost report view |
| Settings | `/settings` | Number/date/text format + module field settings + invoice precision |
| Database Management | `/database-management` | Audit logs, backups, soft-delete, recycle bin, raw table browser |
| Recycle Bin | `/recycle-bin` | Restore soft-deleted records |
| Logs | `/logs` | Application log viewer |
| Account | `/account`, `/account/update`, `/account/password` | User account management |
| Admin: Activity Log | `/admin/activity-log` | Dashboard activity audit log |
| Admin: Automation Rules | `/admin/automation-rules` | Workflow automation rule management |
| Admin: Operations Center | `/admin/operations-center` | Workflow incident management center |
| Notifications | (via context) | In-app notification system |

**Key Components per Major Module:**

- **Shipment**: `form-professional.tsx`, `view-professional.tsx`, `columns.tsx`, `table.tsx`, `pagination.tsx`, `shipment-multiline-form.tsx`
- **Invoice**: `form.tsx` (32KB), `columns.tsx`, `view.tsx`, `wizard/`
- **Supplier**: `form.tsx`, `edit.tsx`, `responsive-table.tsx`, `pagination.tsx`
- **BOE**: `form.tsx`, `columns.tsx`, `data-table.tsx`
- **Expenses**: `expense-form.tsx`, `expense-import.tsx`, `expense-multiline-form.tsx`, `expense-reports.tsx` (56KB)
- **Dashboard**: `ExceptionOperationsPanel.tsx`, `WorkflowHealthPanel.tsx`, `WorkflowAlertSignalsPanel.tsx`
- **UI Library**: 51 Radix-based components in `src/components/ui/`

---

## SECTION 2 — BACKEND COMMAND DISCOVERY

35 command files in `src-tauri/src/commands/`. Total registered handlers: **~200+**.

### Core Business Commands

| Command File | Key Commands | Tables Used |
|---|---|---|
| `shipments.rs` | get_shipments, get_shipments_paginated, add_shipment, update_shipment, add_shipments_bulk, freeze_shipment, validate_shipment_import, log_shipment_import_result, check_shipment_duplicate | shipments, shipment_import_log |
| `suppliers.rs` | get_suppliers, add_supplier, update_supplier, add_suppliers_bulk, get_suppliers_count, delete_supplier, restore_supplier | suppliers |
| `invoices.rs` | get_invoices, add_invoice, add_invoices_bulk, update_invoice, bulk_finalize_invoices, delete_invoice, get_unfinalized_shipments | invoices, invoice_line_items, shipments |
| `items.rs` | get_items, add_item, add_items_bulk, update_item | items |
| `boe.rs` | get_boes, add_boe, update_boe, delete_boe, get_boe_calculations, add_boe_calculation, update_boe_calculation, add_boe_attachment, reconcile_boe_attachments | boe_details, boe_calculations |
| `expenses.rs` | get_expense_invoices_for_shipment, add_expense_invoice_with_expenses, add_expenses_bulk, generate_shipment_expense_report, generate_monthly_gst_summary | expenses, expense_invoices, service_providers, expense_types |
| `reports.rs` | get_report | report_view (SQL VIEW) |
| `dashboard_metrics.rs` | get_dashboard_metrics, get_kpi_metadata, get_kpi_snapshot_history, get_kpi_alert_rules, save_kpi_alert_rule, log_dashboard_activity | dashboard_metrics_cache, kpi_daily_snapshots, kpi_alert_rules, dashboard_activity_log |
| `dashboard_cache.rs` | invalidate_dashboard_metrics_cache, tick_dashboard_maintenance, run_kpi_snapshot_retention_cleanup | dashboard_metrics_cache, kpi_daily_snapshots, dashboard_activity_log |
| `options.rs` | get_units, get_currencies, get_countries, get_bcd_rates, get_incoterms, get_shipment_modes, add_option (generic) | units, currencies, countries, bcd_rates, sws_rates, igst_rates, incoterms, shipment_modes, shipment_types, shipment_statuses |

### Infrastructure Commands

| Command File | Key Commands | Purpose |
|---|---|---|
| `db_management.rs` | browse_table_data, update_record, bulk_delete_records, create_audit_log, get_audit_logs, get_database_stats, soft_delete_record, create_backup, restore_database | Full DB admin |
| `recycle_bin.rs` | get_deleted_records, restore_deleted_records, permanently_delete_records, preview_restore | Soft-delete recovery |
| `app_settings.rs` | get_invoice_calculation_settings, set_invoice_calculation_settings | Decimal precision |
| `app_metadata.rs` | get_app_metadata_value, set_app_metadata_value | Key-value config store |
| `backup_key.rs` | has_backup_key_in_keyring, export_backup_key, import_backup_key_from_path, create_backup_schedule | Backup encryption keys |
| `google_drive.rs` | google_drive_status, google_drive_connect, google_drive_disconnect | Cloud backup |
| `logs.rs` | get_application_logs, log_client_event | Log retrieval |

### Workflow/Automation Commands

| Command File | Purpose | Size |
|---|---|---|
| `workflow_incident_management.rs` | Incident lifecycle, correlation, stabilization, suppression | 252KB |
| `workflow_automation.rs` | Decision rules, ROI metrics, cost intelligence, learning | 142KB |
| `workflow_job_monitoring.rs` | Background job health, scheduling, missed run recovery | 82KB |
| `workflow_rule_deployment.rs` | Rule versioning, staging, canary, approval, rollback | 69KB |
| `exception_workflow.rs` | Exception cases, resolution notes, lifecycle events | 30KB |
| `exception_reliability.rs` | Exception integrity, load simulation | 32KB |
| `workflow_observability.rs` | Health summary, predictive risk, audit verification | 23KB |
| `workflow_production_observability.rs` | System metrics, alert signals, CSV export | 31KB |
| `workflow_multienv.rs` | Multi-environment tenants, promotion | 22KB |
| `deployment_safety.rs` | Deployment freeze, dry-run, safety enforcement | 19KB |
| `reference_scan.rs` | FK diagnostics, hard-delete impact analysis | 52KB |

---

## SECTION 3 — DATABASE SCHEMA

**67 migration files** (V1–V67). Tables and views:

### Core Domain Tables (V1)

| Table | Key Columns | PK | FKs |
|---|---|---|---|
| `suppliers` | id, supplier_name, short_name, country, email, phone, bank details, is_active | id (TEXT) | — |
| `shipments` | id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery, is_frozen | id (TEXT) | supplier_id→suppliers |
| `items` | id, part_number (UNIQUE), item_description, unit, currency, unit_price, hsn_code, supplier_id, is_active, country_of_origin, bcd, sws, igst, category, end_use, net_weight_kg, purchase_uom, gross_weight_per_uom_kg, photo_path | id (TEXT) | supplier_id→suppliers |
| `invoices` | id, shipment_id, status | id (TEXT) | shipment_id→shipments CASCADE |
| `invoice_line_items` | id, invoice_id, item_id, quantity, unit_price | id (TEXT) | invoice_id→invoices CASCADE, item_id→items |
| `boe_details` | id, be_number, be_date, location, total_assessment_value, duty_amount, payment_date, duty_paid, challan_number, ref_id, transaction_id | id (TEXT), UNIQUE(be_number,be_date) | — |
| `boe_calculations` | id, shipment_id, boe_id, supplier_name, invoice_number, status, form_values_json, item_inputs_json, calculation_result_json, attachments_json, created_at | id (TEXT) | shipment_id→shipments CASCADE |
| `service_providers` | id, name, gstin, state, contact_* | id (TEXT) | — |
| `expense_types` | id, name (UNIQUE), default_cgst/sgst/igst_rate, is_active | id (TEXT) | — |
| `expense_invoices` | id, shipment_id, service_provider_id, invoice_no, invoice_date, total_amount, cgst/sgst/igst amounts | id (TEXT) | shipment_id→shipments, service_provider_id→service_providers |
| `expenses` | id, expense_invoice_id, shipment_id, service_provider_id, invoice_no, expense_type_id, amount, tax rates, **computed columns** (cgst/sgst/igst/tds/total_amount GENERATED ALWAYS), remarks | id (TEXT) | Multiple FKs to expense_invoices, shipments, service_providers, expense_types |
| `expense_attachments` | id, expense_id, file_name, file_path, file_type | id (TEXT) | expense_id→expenses |

### Lookup/Option Tables (V1)
`units`, `currencies`, `countries`, `bcd_rates`, `sws_rates`, `igst_rates`, `categories`, `end_uses`, `purchase_uoms`, `incoterms`, `shipment_modes`, `shipment_types`, `shipment_statuses` — all (value TEXT PK, label TEXT UNIQUE)

### System Tables

| Table | Migration | Purpose |
|---|---|---|
| `notifications` | V2 | In-app notifications |
| `audit_logs` | V4 | Change tracking (table_name, row_id, action, before/after JSON) |
| `backups` | V4 | Backup history |
| `backup_schedules` | V4 | Cron-based backup scheduling |
| `user_roles` | V4 | RBAC (admin, db_manager, user, viewer) |
| `app_metadata` | V7 | Key-value config store |
| `kpi_governance` | V13 | KPI metadata registry |
| `kpi_daily_snapshots` | V13 | Daily KPI time-series |
| `dashboard_metrics_cache` | V15 | TTL=180s metrics cache |
| `kpi_alert_rules` | V15 | KPI threshold alert definitions |
| `kpi_alert_log` | V15 | Triggered alert history |
| `daily_exception_summary` | V15 | Daily exception snapshot |
| `role_dashboard_permissions` | V15 | Widget visibility by role |
| `dashboard_activity_log` | V15 | User action audit trail |
| `shipment_compliance_score` | V15 | Per-shipment document compliance score |
| `exception_cases` | V17 | Active exception cases (OPEN/IN_PROGRESS/RESOLVED) |
| `exception_resolution_log` | V17 | Resolution audit |
| `exception_lifecycle_events` | V17 | State change history |
| `exception_notes` | V17 | Resolution notes |
| `workflow_reliability_*` | V18 | Workflow reliability metrics |
| `workflow_observability_*` | V19 | Observability snapshots |
| `workflow_automation_*` | V20–V23 | Automation rules, logs, ROI, cost |
| `workflow_rule_versions` | V24 | Rule versioning |
| `workflow_environments/tenants` | V25 | Multi-env/tenant support |
| `workflow_deployment_*` | V26 | Deployment safety, freeze, canary |
| `workflow_background_jobs` | V27–V29 | Job registry, execution log, schedule recovery |
| `workflow_production_observability_*` | V30 | Production metrics, alert signals |
| `workflow_incident_*` | V31–V40 | Incident engine, correlation, suppression, stabilization |
| `workflow_failure_forecast_*` | V41–V43 | Failure forecasting, explainability, preventive actions |
| `system_integrity_snapshot` | V45 | Integrity health snapshots |
| `app_settings` | V47 | Key-value app settings (invoice precision etc.) |
| `shipment_import_log` | V67 | Import audit (file_name, total/inserted/skipped/error rows, status) |
| `dashboard_kpi_snapshot` | V64 | Daily KPI pre-aggregation |
| `dashboard_exception_snapshot` | V65 | Daily exception pre-aggregation |
| `dashboard_workflow_snapshot` | V66 | Daily workflow pre-aggregation |
| `platform_reliability_journal` | V58 | Platform-wide write reliability journal |

### SQL VIEW
`report_view` — Joins shipments + suppliers + boe_calculations (JSON parse) + invoice_line_items + items + expenses for landed cost calculation.

### Large/Frequently Written Tables
- `shipments` — PRIMARY write target, bulk imports, status updates
- `audit_logs` — Written on every CRUD, high-volume
- `expenses` — Has 5 computed/GENERATED columns (performance impact)
- `boe_calculations` — Stores large JSON blobs (form_values_json, calculation_result_json)
- `dashboard_metrics_cache` — Invalidated on every shipment/invoice write
- `workflow_incident_*` cluster — Multiple correlated writes per incident

---
## SECTION 4 — IMPORT PIPELINES

### 4.1 Shipment Import Pipeline

| Stage | Detail |
|---|---|
| **Source** | CSV file (UTF-8 or BOM, comma/tab/semicolon auto-detected) |
| **Entry Point** | `shipment.tsx` → file picker → `parseShipmentImportCsv()` / `parseShipmentImportCsvStream()` |
| **Header Normalization** | `canonicalShipmentCsvHeader()` maps aliases (case-insensitive, underscore/hyphen-stripped) |
| **Validation (Frontend)** | `validateCsvContent()` — file size ≤10MB, rows ≤10,000, required headers: invoiceNumber, invoiceDate, invoiceValue; date format check, numeric check |
| **Validation (Backend)** | `validate_shipment_import` command — checks supplier_id exists in suppliers/service_providers, invoice_number not empty, invoice_date parseable, invoice_value ≥ 0, duplicate detection |
| **Database Write** | `add_shipments_bulk` — single SQLite transaction; full rollback on any row error |
| **Logging** | `shipment_import_log` table: file_name, total_rows, inserted_rows, skipped_rows, error_rows, status (SUCCESS/FAILED) |
| **Post-write** | Dashboard metrics cache invalidated |
| **Max Rows** | 10,000 per file (frontend limit) |

### 4.2 Item Master Import Pipeline

| Stage | Detail |
|---|---|
| **Source** | CSV |
| **Entry Point** | `item.tsx` → `importItemsFromCsv()` in `csv-helpers.ts` |
| **Required Headers** | partNumber, itemDescription, unit, currency, unitPrice |
| **Validation** | DOMPurify sanitization, numeric fields (unitPrice, netWeightKg), tax rate range 0–100%, duplicate part_number detection |
| **Database Write** | `add_items_bulk` command |
| **Dedup** | Skips existing part numbers; tracks in-batch duplicates |

### 4.3 Supplier Import Pipeline

| Stage | Detail |
|---|---|
| **Source** | CSV |
| **Required Headers** | supplierName, country |
| **Validation** | Email format, phone format validation |
| **Database Write** | `add_suppliers_bulk` command |

### 4.4 BOE Import Pipeline

| Stage | Detail |
|---|---|
| **Source** | CSV |
| **Required Headers** | beNumber, beDate |
| **Validation** | Numeric: totalAssessmentValue, dutyAmount, dutyPaid; date format: beDate, paymentDate |
| **Database Write** | `add_boe` command |

### 4.5 Invoice Bulk Import

| Stage | Detail |
|---|---|
| **Source** | UI form with line items |
| **Database Write** | `add_invoices_bulk` — inserts invoices + invoice_line_items; triggers `update_shipment_status_on_invoice_add` |

### 4.6 Expense Import

| Stage | Detail |
|---|---|
| **Source** | Multiline paste or CSV via `expense-import.tsx` |
| **Database Write** | `add_expenses_bulk` or `add_expense_invoice_with_expenses` |

---

## SECTION 5 — SETTINGS & CONFIGURATION

### 5.1 Frontend Settings (localStorage via `src/lib/settings.ts`)

| Category | Options |
|---|---|
| **Number Format** | decimalPlaces (0–3), useThousandsSeparator, currencySymbol, currencyPosition (before/after), useCompactNotation, compactThreshold, useScientificNotation, negativeFormat (minus/parentheses/brackets), zeroFormat |
| **Date Format** | format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY), includeTime, timeFormat (12h/24h) |
| **Text Format** | case (lowercase/uppercase/titlecase/sentencecase), trimWhitespace |
| **Module Field Settings** | Per module (shipment, invoice, boe, boeSummary, supplier, itemMaster, expenses): field visibility, order, width, case transform, numberFormat, precision |
| **Module Table Settings** | showTotals, showActions, itemsPerPage |
| **Theme** | mode (light/dark), color accent, stored in localStorage key `import-manager-theme` |

### 5.2 Backend Settings (SQLite `app_settings` table)

| Key | Values | Purpose |
|---|---|---|
| `line_total_decimals` | 0 or 2 | Invoice line total precision |
| `invoice_total_decimals` | 0 or 2 | Invoice total precision |

### 5.3 App Metadata (SQLite `app_metadata` table)

| Key | Default | Purpose |
|---|---|---|
| `kpi_snapshot_retention_days` | 365 | KPI history retention |
| `kpi_retention_last_run` | '' | Guards duplicate daily run |
| `exception_retention_days` | 365 | Exception history retention |
| `dashboard_activity_retention_days` | 90 | Activity log retention |
| `recycle_retention_days` | (managed) | Recycle bin expiry |
| `last_database_maintenance` | (timestamp) | Maintenance tracking |

### 5.4 Configuration Files

| File | Purpose |
|---|---|
| `tauri.conf.json` | Window (1100×650 maximized), CSP null, asset protocol `$APPDATA/**`, Tauri updater via GitHub Releases |
| `.env.example` / `env.example` | Environment variable templates |
| `vite.config.ts` | Vite dev server port 1421, path alias `@/` |
| `tailwind.config.js` | TailwindCSS theme |
| `vitest.config.ts` | Unit test configuration |
| `playwright.config.ts` | E2E test configuration |

---

## SECTION 6 — BACKGROUND WORKFLOWS

### 6.1 Main Background Thread (spawned at startup in `main.rs`)

Runs in `std::thread::spawn` loop with **60-second interval**:

| Task | Function | DB Impact |
|---|---|---|
| Backup schedule tick | `tick_backup_schedules()` | Reads backup_schedules, writes backups |
| Dashboard maintenance | `tick_dashboard_maintenance()` | Writes dashboard_kpi_snapshot, dashboard_monthly_snapshot, dashboard_exception_snapshot, dashboard_workflow_snapshot — **once per calendar day** |
| DB governance tick | `governance_tick()` | Reads/updates app_metadata, purges old logs |
| BOE maintenance | `run_boe_maintenance()` | Reads/repairs boe_calculations, boe_details |
| Platform integrity validation | `validate_system_integrity()` | Reads platform_reliability_journal |
| Workflow job daily tick | `run_daily_dashboard_tick_jobs()` | Reads/updates workflow_background_jobs, workflow_job_execution_log |

### 6.2 Startup Tasks (run once on app launch)

| Task | Purpose |
|---|---|
| `run_migrations()` | Apply pending Refinery DB migrations |
| `cleanup_expired_recycle_records()` | Purge old soft-deleted records |
| `run_database_maintenance()` | VACUUM, integrity check, ANALYZE |
| `run_startup_fk_diagnostics()` | Check FK consistency |
| `reconcile_boe_attachments()` | Sync file references |
| `recover_interrupted_boe_writes()` | Complete partial BOE transactions |
| `validate_boe_integrity()` | BOE data consistency |
| `recover_interrupted_writes()` | Platform-wide write recovery |
| `detect_invalid_date_rows()` | Find malformed shipment dates |
| `check_timezone_consistency()` | Date timezone audit |

---

## SECTION 7 — PERFORMANCE-SENSITIVE AREAS

| Area | Risk | Reason |
|---|---|---|
| `add_shipments_bulk` | **CRITICAL** | Single transaction for up to 10,000 rows; row-by-row INSERT (no batch VALUES); rollback on any failure means re-processing entire file |
| `get_dashboard_metrics` | **HIGH** | Multi-join query across shipments, expenses, boe_calculations, exception_cases; partially mitigated by 180s cache |
| `dashboard.tsx` (60KB) | **HIGH** | Largest frontend page; fetches multiple Tauri commands on load; recharts rendering |
| `boe_calculations` JSON queries | **HIGH** | Uses `json_extract()` on large blobs in `report_view`; no index on JSON paths |
| `expenses` GENERATED columns | **HIGH** | 5 computed columns (cgst/sgst/igst/tds/total_amount) — SQLite recalculates on every INSERT/UPDATE |
| `database-management.tsx` (167KB) | **HIGH** | Largest file in the project; complex table browser with dynamic queries |
| `automation-rules.tsx` (142KB) | **HIGH** | Extremely large admin page |
| `workflow_incident_management.rs` (252KB) | **HIGH** | Most complex backend file; incident correlation, pattern detection |
| `shipment.tsx` (69KB) | **MEDIUM** | Large page with paginated table, filters, import wizard |
| `supplier.tsx` (38KB) | **MEDIUM** | Table + form + import |
| `report_view` SQL VIEW | **MEDIUM** | Multi-CTE with JSON parsing, multiple JOINs, no materialization |
| Recycle bin cleanup at startup | **MEDIUM** | DELETE from multiple soft-delete tables |
| `get_shipments` (non-paginated) | **MEDIUM** | Fetches ALL shipments — legacy endpoint; `get_shipments_paginated` preferred |

### Index Coverage (key migrations)

- V10, V48, V50–V52, V55–V56, V59–V61, V63: Added performance indexes on shipments(status, supplier_id, invoice_date, eta, is_frozen), suppliers(deleted_at), invoices(shipment_id), boe_calculations(shipment_id), expenses(shipment_id, expense_invoice_id)

---

## SECTION 8 — FRONTEND STATE & DATA FLOW

### State Architecture

| Layer | Mechanism | Scope |
|---|---|---|
| App-wide settings | `SettingsContext` (React Context + localStorage) | All modules |
| User identity | `UserContext` (React Context + localStorage) | Auth, permissions |
| Notifications | `NotificationContext` (React Context) | Global alerts |
| Responsive layout | `ResponsiveProvider` | Mobile/desktop switching |
| Theme | `ThemeProvider` (next-themes + localStorage) | Light/dark + accent color |

### Data Fetching Patterns

- **Direct Tauri invoke**: Each page calls `invoke('command_name', params)` directly — no centralized API layer
- **No global cache/query library**: No React Query or SWR; data refetched on navigation
- **Paginated tables**: Shipment, Supplier, BOE use paginated commands (`get_shipments_paginated`, `get_boes_paginated`)
- **Performance monitoring**: `usePerformance` hook + `initializePerformanceMonitoring()` at App startup

### State-Heavy Components

| Component | State Concern |
|---|---|
| `shipment.tsx` | Import wizard state (5+ steps), table filters, selected rows, CSV parse state |
| `invoice.tsx` | Line items array, totals computation, wizard steps |
| `expenses.tsx` | Multi-row expense forms, GST calculation |
| `database-management.tsx` | Table browser with dynamic columns, bulk selection, audit log pagination |
| `admin/automation-rules.tsx` | Rule CRUD, staging, approval workflow state |

---

## SECTION 9 — DEPENDENCY INVENTORY

### Frontend Dependencies

| Library | Version | Purpose |
|---|---|---|
| react | ^19.2.5 | UI framework |
| react-dom | ^19.2.5 | DOM rendering |
| react-router-dom | ^7.14.1 | Client-side routing |
| @tauri-apps/api | ^2.10.1 | Tauri IPC bridge |
| @tauri-apps/plugin-dialog | ^2.7.0 | Native file dialogs |
| @tauri-apps/plugin-fs | ^2.5.0 | Native filesystem access |
| tailwindcss | ^4.2.2 | Utility CSS framework |
| papaparse | ^5.5.3 | CSV parsing |
| exceljs | ^4.4.0 | Excel file generation |
| @tanstack/react-table | ^8.21.3 | Headless table |
| recharts | ^3.8.1 | Charts (dashboard) |
| framer-motion | ^12.38.0 | Animations |
| react-hook-form | ^7.72.1 | Form state management |
| zod | ^4.3.6 | Schema validation |
| @radix-ui/* | Various | Accessible UI primitives (15+ packages) |
| @dnd-kit/* | Various | Drag-and-drop |
| date-fns | ^4.1.0 | Date utilities |
| dompurify | ^3.4.0 | CSV input sanitization |
| lucide-react | ^1.8.0 | Icons |
| next-themes | ^0.4.6 | Theme management |
| sonner | ^2.0.7 | Toast notifications |
| bcryptjs | ^3.0.3 | Frontend password hashing |
| react-dropzone | ^15.0.0 | File drop zone |
| cmdk | ^1.1.1 | Command palette |

### Backend (Rust) Dependencies

| Crate | Version | Purpose |
|---|---|---|
| tauri | 2.10 | Desktop app framework |
| rusqlite | 0.31.0 (bundled) | SQLite driver |
| refinery | 0.8 (rusqlite feature) | DB migrations |
| serde / serde_json | 1.0 | Serialization |
| chrono | 0.4.41 | Date/time handling |
| chrono-tz | 0.10 | Timezone support |
| uuid | 1.17.0 (v4+serde) | UUID generation |
| thiserror | 1.0 | Error types |
| regex | 1.0 | Pattern matching |
| reqwest | 0.12 (rustls-tls) | HTTP client (Google Drive) |
| calamine | 0.25 | Excel reading |
| argon2 | 0.5.3 | Password hashing |
| rust_decimal | 1 | Decimal arithmetic |
| sysinfo | 0.30 | System metrics |
| aes-gcm / hmac / pbkdf2 | Various | Encryption/key derivation |
| sha2 | 0.10 | Hashing |
| keyring | 3.6 | OS keychain (backup keys) |
| cron | 0.12 | Cron expression parsing |
| image | 0.25.6 | Image processing (item photos) |
| strsim | 0.11 | Fuzzy string matching |
| log / tauri-plugin-log | 0.4 / 2.8 | Logging (5MB rolling, 5 files) |

### Dev Dependencies

| Tool | Version | Purpose |
|---|---|---|
| @playwright/test | ^1.59.1 | E2E testing |
| vitest | ^4.1.4 | Unit testing |
| vite | ^8.0.8 | Build tool |
| typescript | ^6.0.3 | Type checking |
| husky + lint-staged | Various | Git hooks |

---

## SECTION 10 — RUNTIME ENTRY POINTS

### Frontend Entry

```
index.html
  └── src/main.tsx
        ├── applyCustomAccentFromLocalStorage()   [theme pre-hydration]
        └── bootstrap()
              └── ReactDOM.createRoot → <App />
                    ├── ThemeProvider
                    ├── AsyncErrorBoundary
                    ├── SettingsProvider          [localStorage settings]
                    ├── UserProvider              [localStorage auth]
                    ├── NotificationProvider      [in-app alerts]
                    ├── ResponsiveProvider        [breakpoint detection]
                    ├── ErrorBoundary
                    └── BrowserRouter → Routes    [27 routes]
                          └── ProtectedRoute      [localStorage isAuthenticated check]
```

**App.tsx startup effects:**
1. `initializePerformanceMonitoring()`
2. `validateBuildMetadata()`
3. `runVersionConsistencyCheck()`
4. `logStartupContextOnce()`

### Backend Entry (`src-tauri/src/main.rs`)

```
main()
  ├── tauri_plugin_log (5MB rolling, 5 files, stdout + webview + file)
  ├── tauri_plugin_dialog
  ├── tauri_plugin_fs
  └── setup()
        ├── Get app data dir → DB path
        ├── SQLite detection: bundled vs SQLCipher
        ├── configure_sqlite_runtime()
        │     ├── PRAGMA journal_mode=WAL
        │     ├── PRAGMA synchronous=NORMAL
        │     ├── PRAGMA busy_timeout=5000
        │     └── PRAGMA temp_store=MEMORY
        ├── DatabaseMigrations::run_migrations()  [Refinery, 67 migrations]
        ├── cleanup_expired_recycle_records()
        ├── run_database_maintenance()
        ├── run_startup_fk_diagnostics()
        ├── reconcile_boe_attachments()
        ├── recover_interrupted_boe_writes()
        ├── validate_boe_integrity()
        ├── recover_interrupted_writes()          [platform reliability]
        ├── validate_system_integrity()
        ├── detect_invalid_date_rows()
        ├── analyze_boe_query_plans()
        ├── app.manage(DbState { db: Mutex<Connection> })
        ├── app.manage(ConnectionManager)
        └── Background thread (60s tick loop)
              ├── tick_backup_schedules()
              ├── tick_dashboard_maintenance()    [once/day]
              ├── governance_tick()
              ├── run_boe_maintenance()
              └── validate_system_integrity()
```

**Services layer** (`src-tauri/src/services/`):
- `shipment_service.rs` (40KB) — paginated queries, date validation, timezone checks, query plan analysis
- `boe_service.rs` (18KB) — BOE reconciliation, attachment management, integrity validation
- `platform_reliability.rs` (8KB) — interrupted write recovery, index recommendations
- `decimal_money.rs` — Decimal arithmetic utilities

---

## FINAL SYSTEM MAP SUMMARY

### FRONTEND MODULES
27 UI pages: Login, Dashboard, Shipment, Invoice, Invoice Wizard, Item Master, Supplier, BOE, BOE Entry, BOE Summary, Expenses, Expense Reports, Expense Data Manager, Frozen Shipments, Reports, Settings, Database Management, Recycle Bin, Logs, Account (×3), Admin Activity Log, Admin Automation Rules, Admin Operations Center, Notifications

### BACKEND COMMANDS
~200 registered Tauri commands across 35 files covering: Shipments, Suppliers, Items, Invoices, BOE, Expenses, Reports, Dashboard Metrics, Exception Workflow, Workflow Automation, Workflow Incidents, Workflow Jobs, Workflow Deployment, Multi-env, Database Management, Backup/Restore, Google Drive, Settings, User Roles, Logs

### DATABASE TABLES
**~80+ tables** across 67 migrations:
- Domain: suppliers, shipments, items, invoices, invoice_line_items, boe_details, boe_calculations, service_providers, expense_types, expense_invoices, expenses, expense_attachments
- Lookup: 13 option tables
- System: audit_logs, backups, backup_schedules, user_roles, app_metadata, app_settings, notifications, shipment_import_log
- Dashboard: dashboard_metrics_cache, kpi_alert_rules, kpi_daily_snapshots, dashboard_*_snapshot, dashboard_activity_log
- Workflow: exception_cases, exception_*, workflow_automation_*, workflow_incident_*, workflow_job_*, workflow_rule_*, workflow_environment_*
- Views: report_view

### IMPORT PIPELINES
6 pipelines: Shipment (CSV, 10K rows max, transactional), Item Master (CSV), Supplier (CSV), BOE (CSV), Invoice (UI bulk), Expense (CSV/multiline paste)

### SETTINGS MODULES
3 systems: Frontend localStorage (number/date/text/module field settings), Backend SQLite app_settings (invoice precision), Backend SQLite app_metadata (retention/operational config)

### BACKGROUND WORKFLOWS
7 background tasks on 60s tick: backup schedule execution, daily dashboard KPI/exception/workflow snapshots, DB governance, BOE maintenance, platform integrity validation, workflow job monitoring

### PERFORMANCE HOTSPOTS
- CRITICAL: Bulk shipment insert (row-by-row, no batch VALUES)
- HIGH: Dashboard metrics query, boe_calculations JSON extraction, expenses GENERATED columns, database-management.tsx (167KB), automation-rules.tsx (142KB)
- MEDIUM: report_view multi-CTE, non-paginated get_shipments, startup cleanup tasks

---

## SYSTEM COMPLEXITY SCORE

**ENTERPRISE**

Rationale:
- 67 database migrations, 80+ tables
- ~200 Tauri IPC commands across 35 backend modules
- 27 frontend routes with complex state
- Full workflow automation engine with incident management, rule deployment, multi-environment tenancy, forecasting, and cost intelligence
- Platform reliability system with write recovery, integrity validation, and query plan analysis
- Complete audit trail (audit_logs, exception_lifecycle_events, dashboard_activity_log)
- Backup system with encryption (keyring + AES-GCM), scheduling, Google Drive integration
- RBAC with role-based dashboard widget permissions
- Performance index management system with automated recommendations
