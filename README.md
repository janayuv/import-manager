# Import Manager

[![CI](https://img.shields.io/github/actions/workflow/status/janayuv/import-manager/ci.yml?branch=main&label=CI&logo=github)](https://github.com/janayuv/import-manager/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/janayuv/import-manager?label=release&logo=github)](https://github.com/janayuv/import-manager/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Windows-focused **Tauri 2** desktop app for managing import operations: suppliers, shipments, invoices, item master, bills of entry (BOE), expenses, reporting, and operational dashboards. Data lives in a local **SQLite** database with **AES-256-GCM** encrypted backup artifacts, optional **Google Drive** upload, **audit logging**, **recycle bin**, scheduled backups, and a large set of **workflow / exception / automation** admin APIs surfaced in the UI.

---

## Overview

Import Manager is a single-user (front-end gated) business application that replaces scattered spreadsheets with a structured database, CSV/Excel import paths, and printable/reportable views. The **React** UI runs inside a **Tauri** webview and talks to **Rust** commands over **IPC** (`invoke`). Sensitive backup material is encrypted before it leaves the machine; cloud sync uses **Google OAuth** with the **`drive.file`** scope (files created by the app), not full-drive access.

---

## Features

- **Supplier, shipment, invoice, item master** CRUD with tables, filters, bulk import (CSV), and module-specific column settings.
- **BOE** registry, **BOE entry** workflow, **BOE summary** views and calculations.
- **Expenses**: per-shipment expense lines, expense invoices, reports, and a data manager for reference data.
- **Dashboard**: KPIs, charts (Recharts), activity log, exception operations, workflow health, alert signals, observability admin card.
- **Reports** page for analytical exports/views.
- **Frozen shipments** workflow for held cargo.
- **Database management**: stats, browse/edit, bulk search/delete, backup/restore, schedules, user roles, audit log tab, encryption/key export.
- **Recycle bin** for soft-deleted records with restore and permanent delete.
- **Application logs** viewer (filtered tail of backend log file).
- **Settings**: number/date/text formatting and per-module field visibility/order (stored in `localStorage`).
- **Authentication**: bcrypt-verified login with configurable admin user via Vite env (default credentials exist for dev; change for production).
- **Backups**: full DB snapshot → AES-256-GCM `.enc` file; SHA-256 sidecar for local files; history in DB; optional upload to Google Drive; cron-based schedules (six-field cron, UTC or Asia/Kolkata).
- **Google Drive**: OAuth 2.0 desktop loopback (`http://127.0.0.1:8765/`), tokens in Windows **keyring** with SQLite `app_metadata` fallback.
- **CI/CD**: GitHub Actions on Windows (lint, typecheck, Rust clippy/deny, Vitest coverage, Playwright, Tauri build); release on `v*` tags.
- **Updater hooks** in `tauri.conf.json` (public key placeholder; configure for your org).

---

## Technology Stack

| Layer | Technology |
|--------|------------|
| Desktop shell | **Tauri 2** (Rust, WebView2 on Windows) |
| UI | **React 19**, **TypeScript**, **Vite 8** |
| Routing | **React Router DOM 7** (not TanStack Router) |
| Styling | **Tailwind CSS 4**, **tw-animate-css**, **tailwind-merge**, **class-variance-authority** |
| Components | **shadcn/ui**-style primitives on **Radix UI** |
| Tables | **TanStack React Table 8** |
| Forms | **React Hook Form**, **Zod**, **@hookform/resolvers** |
| Charts | **Recharts** |
| Notifications | **Sonner**, **react-hot-toast** |
| Motion / UX | **Framer Motion**, **vaul** (drawer), **react-resizable-panels** |
| DnD | **@dnd-kit** |
| CSV / Excel | **Papaparse**, **ExcelJS** |
| Auth (UI) | **bcryptjs** (client-side check against env or default hash) |
| State | **React Context** (`SettingsProvider`, `UserProvider`, `NotificationProvider`, `ThemeProvider`, `ResponsiveProvider`) + **`localStorage`** for settings and session flags — **Zustand is not used** in this repo |
| Tauri plugins | **log**, **dialog**, **fs** |
| Backend | **Rust**, **rusqlite** (bundled SQLite for app DB in `Cargo.toml`) |
| Crypto (backups) | **aes-gcm**, **pbkdf2** (100k iterations) + **HMAC-SHA256**, **sha2** |
| Scheduling | **cron**, **chrono**, **chrono-tz** |
| HTTP (Drive) | **reqwest** (rustls) |
| Secrets | **keyring** |
| Tests | **Vitest**, **Testing Library**, **Playwright**, **`cargo test`** |
| Lint / format | **ESLint**, **Prettier**, **rustfmt**, **Clippy**, **cargo-deny** |

---

## Architecture (IPC)

```
┌─────────────────────────────────────────────────────────────┐
│  Windows: WebView2 (Chromium)                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  React SPA (Vite)                                      │ │
│  │  • react-router-dom routes                             │ │
│  │  • invoke('command_name', { payload })                 │ │
│  │  • @tauri-apps/plugin-dialog / fs where used           │ │
│  └───────────────────────────┬───────────────────────────┘ │
└────────────────────────────────┼────────────────────────────┘
                                 │ Tauri IPC (JSON serialize)
                                 ▼
┌────────────────────────────────────────────────────────────┐
│  Rust: tauri::Builder + invoke_handler![...]                │
│  • commands::* (DB, CRUD, backup, Drive, workflow, …)      │
│  • DbState: Mutex<rusqlite::Connection>                     │
│  • SQLite file under app data dir; migrations on startup    │
│  • Background thread: backup schedule tick + dashboard cache │
└────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- **Windows 10/11** (the product is explicitly Windows-oriented; `package.json` lists `"os": ["win32"]`).
- **Node.js** 20.x or 22.x (matches CI matrix).
- **npm** (lockfile present: use `npm ci` in CI style installs).
- **Rust** stable (`rustup`, edition 2021, `rust-version` in `Cargo.toml` is 1.71+).
- **WebView2** runtime (normally present on current Windows).
- **Production / local Tauri build with SQLCipher-linked artifacts**: CI sets `SQLCIPHER_*` via vcpkg paths; local `build.rs` copies `sqlcipher.dll`, OpenSSL, zlib from common vcpkg locations into the target dir when **not** in `CI`. For a minimal dev loop, bundled SQLite is used; encrypted-at-rest SQLCipher path is a deployment concern (see `main.rs` notes on bundled vs encrypted DB detection).

---

## Installation & Setup

1. **Clone**

   ```bash
   git clone https://github.com/janayuv/import-manager.git
   cd import-manager
   ```

2. **Install JS dependencies**

   ```bash
   npm ci
   ```

3. **Environment files**

   - Copy `.env.example` to `.env` in the repo root.
   - Optional **Vite** variables for login (override defaults):

     | Variable | Purpose |
     |----------|---------|
     | `VITE_ADMIN_USERNAME` | Login username (default in code: `Jana`) |
     | `VITE_ADMIN_PASSWORD_HASH` | bcrypt hash for the admin password (strongly recommended for any real deployment) |

   - Optional **Tauri updater / signing** (commented in `.env.example`):

     ```bash
     # TAURI_PRIVATE_KEY=
     # TAURI_PRIVATE_KEY_PASSWORD=
     ```

4. **Google Drive (optional, build-time)**

   Set at **Rust compile time** (not only `.env` unless your build pipeline injects them):

   - `IMPORT_MANAGER_GOOGLE_CLIENT_ID`
   - `IMPORT_MANAGER_GOOGLE_CLIENT_SECRET`

   In Google Cloud Console, use an OAuth **Desktop** client and add redirect URI: `http://127.0.0.1:8765/` (see `src-tauri/src/commands/google_drive.rs`).

5. **Backup encryption key**

   The first successful backup creates a **32-byte random key**, base64-encoded, stored in the Windows credential vault under service **`ImportManager`** / user **`backup_encryption_password`**. Export a disaster-recovery **`.imkey`** file from **Database Management → Overview** (Export Backup Key) after backups exist.

---

## Development

- **Start Vite + Tauri** (from repo root):

  ```bash
  npm run tauri dev
  ```

  This runs `beforeDevCommand: npm run dev` and opens the app with dev URL `http://localhost:1421` (see `src-tauri/tauri.conf.json` and `vite.config.ts`). Override port with `VITE_DEV_SERVER_PORT` if needed.

- **Vite alone** (browser only; IPC will fail unless stubs are used):

  ```bash
  npm run dev
  ```

- **Playwright against Vite** uses port **1422** (see `playwright.config.ts`). Stubs can be enabled with `VITE_PLAYWRIGHT=1` (see `vite.config.ts` aliases).

- **Hot reload**: Vite HMR applies to the React layer; Rust changes require **Tauri rebuild** / restart.

- **Debug**: run `tauri dev` with `TAURI_DEBUG=1` to skip console stripping in Vite config and enable source maps in the frontend build path.

---

## Building for Production

```bash
npm run tauri build
```

- **Frontend**: `beforeBuildCommand` runs `npm run build` (`tsc -b && vite build`) → output in `dist/`.
- **Installer artifacts**: `src-tauri/target/release/bundle/` (MSI, NSIS `.exe`, optional `exe/` bundle per Tauri target matrix).
- **Scripted Windows build** (includes installer fix script and bundled SQLite flag):

  ```bash
  npm run build:tauri
  ```

  (`package.json`: `powershell … scripts\fix-installer-issues.ps1` + `cross-env LIBSQLITE3_SYS_BUNDLED=1 tauri build`)

### Signing

- **`tauri.conf.json`** references `${TAURI_SIGNING_PUBLIC_KEY}` for the updater plugin.
- **GitHub Actions `release.yml`**: optional `SIGNING_CERTIFICATE` secret; current workflow contains a **placeholder** step for signing commands—wire your real **Authenticode** or Tauri signing tooling there.
- Local signing: follow [Tauri distribution](https://v2.tauri.app/distribute/) and set `TAURI_PRIVATE_KEY` / public key in config for updates.

---

## Project Structure (high level)

| Path | Role |
|------|------|
| `src/` | React application, hooks, libs, contexts, pages, types |
| `src/components/` | Feature components + `ui/` design primitives |
| `src/pages/` | Route-level screens |
| `src/lib/` | Auth, settings, Tauri bridge, domain helpers |
| `src/contexts/` | React contexts (e.g. notifications) |
| `src/providers/` | App-wide providers |
| `src-tauri/src/` | Rust: `main.rs`, `commands/`, `db/`, `migrations/`, `encryption.rs`, `utils/` |
| `src-tauri/migrations/` | SQL migrations consumed by refinery |
| `src-tauri/tauri.conf.json` | Tauri app id, window, bundle resources (DLLs), updater |
| `tests/` | Playwright specs (`tests/e2e/`, `tests/ui-*.spec.ts`, etc.) |
| `.github/workflows/` | CI, release, security, dependabot automation |
| `scripts/` | Installer fixes, gitleaks, drift report, performance checks |

---

## Frontend Details

### Routing

All routes are declared in `src/App.tsx` using **`BrowserRouter`**, **`Routes`**, and **`Route`**. Protected routes require `localStorage.isAuthenticated === 'true'`; otherwise navigate to `/login`.

| Path | Page component |
|------|----------------|
| `/login` | `LoginPage` |
| `/` | `DashboardPage` |
| `/supplier`, `/supplier/:id/view`, `/supplier/:id/edit` | `SupplierPage` |
| `/shipment`, `/shipment/:id/view`, `/shipment/:id/edit` | `ShipmentPage` |
| `/invoice`, `/invoice/:id/view`, `/invoice/:id/edit` | `InvoicePage` |
| `/invoice-wizard` | `InvoiceWizardPage` |
| `/item-master`, `/item-master/new`, `/item-master/:id/view`, … | `ItemMasterPage` |
| `/boe`, `/boe/new`, `/boe/:id/view`, … | `BOEPage` |
| `/boe-entry`, `/boe-entry/new`, `/boe-entry/:savedBoeId/...` | `BOEEntrypage` |
| `/boe-summary`, `/boe-summary/:savedBoeId` | `BoeSummaryPage` |
| `/expenses` | `ExpensesPage` |
| `/expense-reports` | `ExpenseReportsPage` |
| `/expense-data-manager` | `ExpenseDataManagerPage` |
| `/frozen-shipments` | `FrozenShipmentsPage` |
| `/report` | `ReportsPage` |
| `/account`, `/account/update`, `/account/password` | Account pages |
| `/settings` | `SettingsPage` |
| `/database-management` | `DatabaseManagement` |
| `/admin/activity-log` | `AdminActivityLogPage` |
| `/admin/automation-rules` | `AutomationRulesAdminPage` |
| `/admin/operations-center` | `OperationsCenterPage` |
| `/recycle-bin` | `RecycleBin` |
| `/logs` | `LogsPage` |

`src/pages/notifications.tsx` exists but is **not mounted** in `App.tsx` (no route).

### State management

- **`SettingsProvider`** (`src/lib/settings-context.tsx`): loads/saves **`import-manager-settings`** JSON in `localStorage` via `src/lib/settings.ts`.
- **`UserProvider`** (`src/lib/user-context.tsx`): mirrors `getCurrentUser()` from `localStorage` (`currentUser`).
- **`NotificationProvider`** (`src/contexts/NotificationContext.tsx`): in-app notification state.
- **`ThemeProvider`** (`src/components/layout/theme-provider.tsx`): theme mode + accent; persistence key `import-manager-theme`.
- **`ResponsiveProvider`**: breakpoint-aware layout helpers.

There is **no `@tauri-apps/plugin-store`** in dependencies.

### Styling

- **Tailwind v4** via `@tailwindcss/vite`.
- **Radix** primitives + **shadcn-style** wrappers under `src/components/ui/*` (Button variants, Card, Dialog, Sheet, Sidebar, Table, etc.).
- **`next-themes`** pattern adapted in custom theme provider.

### React components and responsibilities

Below, every **`.tsx`** under `src/components/` is listed with a short responsibility (grouped by folder).

#### Layout

| Component | Responsibility |
|-----------|----------------|
| `AppLayout.tsx` | Main shell: sidebar, header, outlet for pages |
| `app-sidebar.tsx` | Sidebar composition, nav data, branding |
| `nav-main.tsx` | Primary nav links and collapsible submenus |
| `nav-secondary.tsx` | Secondary links |
| `nav-projects.tsx` | Project-style nav section |
| `nav-user.tsx` | User menu: account routes, frozen shipments, logout |
| `site-header.tsx` | Top bar / page chrome |
| `search-form.tsx` | Header search UI |
| `theme-provider.tsx` | Theme / accent persistence |
| `theme-context.tsx` | Theme context definition |

#### Error boundaries

| Component | Responsibility |
|-----------|----------------|
| `error-boundary/AsyncErrorBoundary.tsx` | Async-friendly boundary wrapper |
| `error-boundary/ErrorBoundary.tsx` | Classic React error boundary |
| `error-boundary/ModuleErrorBoundary.tsx` | Module-scoped errors |
| `error-boundary/ErrorBoundaryTest.tsx` | Test harness |
| `ErrorBoundary.tsx` | Legacy/simple boundary used by some pages |

#### Admin

| Component | Responsibility |
|-----------|----------------|
| `admin/DeploymentActivityDrawer.tsx` | Drawer UI for deployment activity (automation console) |

#### BOE (`components/boe/`)

| Component | Responsibility |
|-----------|----------------|
| `actions.tsx` | Row / toolbar actions for BOE list |
| `columns.tsx` | TanStack column defs for BOE table |
| `data-table.tsx` | BOE data table |
| `data-table-pagination.tsx` | Pagination controls |
| `form.tsx` | BOE create/edit form |
| `select.tsx` | BOE-related selects |
| `view.tsx` | BOE view dialog / read-only presentation |

#### BOE entry (`components/boe-entry/`)

| Component | Responsibility |
|-----------|----------------|
| `actions.tsx` | Toolbar actions for BOE entry |
| `boe-details-table.tsx` | Line items / details grid |
| `calculation-results.tsx` | Duty / tax calculation output |
| `columns.tsx` | Column definitions |
| `data-table.tsx` | Main entry table |
| `data-table-pagination.tsx` | Pagination |
| `delete-confirm-dialog.tsx` | Confirm destructive deletes |
| `form.tsx` | BOE entry form (large multi-section UI) |
| `import-dialog-old.tsx` | Legacy import dialog |
| `saved-boe-list.tsx` | List of saved BOE drafts |
| `view-boe-dialog.tsx` | Read-only BOE dialog |

#### BOE summary (`components/boe-summary/`)

| Component | Responsibility |
|-----------|----------------|
| `client.tsx` | Client-side summary table / interactions |
| `columns.tsx` | Column defs |
| `status-badge.tsx` | Visual status chips |

#### CSV (`components/csv/`)

| Component | Responsibility |
|-----------|----------------|
| `CsvTestComponent.tsx` | CSV parsing experiments / tests |

#### Dashboard (`components/dashboard/`)

| Component | Responsibility |
|-----------|----------------|
| `ExceptionOperationsPanel.tsx` | Exception queue operations from dashboard |
| `WorkflowAlertSignalsPanel.tsx` | Alert signal KPIs / lists |
| `WorkflowHealthPanel.tsx` | Workflow health summary |
| `WorkflowObservabilityAdminCard.tsx` | Admin observability shortcuts / metrics |

#### Examples (`components/examples/`)

| Component | Responsibility |
|-----------|----------------|
| `AccentButtonDemo.tsx` | Accent color button demo |
| `ResponsiveExample.tsx` | Responsive layout demo |

#### Expenses (`components/expenses/`)

| Component | Responsibility |
|-----------|----------------|
| `expense-data-manager.tsx` | Embedded data manager UI |
| `expense-debug.tsx` | Developer/debug panels for expense data |
| `expense-form.tsx` | Single expense line form |
| `expense-import.tsx` | CSV/import flow for expenses |
| `expense-invoice-form.tsx` | Expense invoice header/lines |
| `expense-list.tsx` | List of expenses for a context |
| `expense-multiline-form.tsx` | Multiline rapid entry |
| `expense-reports.tsx` | Report generation UI |
| `shipment-selector.tsx` | Pick shipment for expense context |

#### Invoice (`components/invoice/`)

| Component | Responsibility |
|-----------|----------------|
| `actions.tsx` | Invoice list actions |
| `alert-dialog.tsx` | Invoice-specific confirmations |
| `columns.tsx` | Invoice table columns |
| `combobox.tsx` | Searchable selectors |
| `form.tsx` | Invoice edit form |
| `select.tsx` | Invoice selects |
| `view.tsx` | Invoice view dialog |
| `wizard/InvoiceWizard.tsx` | Stepwise invoice creation wizard |

#### Item master (`components/item/`)

| Component | Responsibility |
|-----------|----------------|
| `actions.tsx` | Item row actions |
| `columns.tsx` | Item columns |
| `combobox-creatable.tsx` | Creatable combobox for codes/descriptions |
| `data-table-pagination.tsx` | Pagination |
| `form.tsx` | Item create/edit |
| `view.tsx` | Item view |

#### Module settings (`components/module-settings*.tsx`)

| Component | Responsibility |
|-----------|----------------|
| `module-settings.tsx` | Per-module field visibility, order, formatting |
| `module-settings-demo.tsx` | Demo card on Settings page |

#### Notifications (`components/notifications/`)

| Component | Responsibility |
|-----------|----------------|
| `NotificationDropdown.tsx` | Header dropdown list |
| `NotificationSheet.tsx` | Sheet panel for notifications |
| `NotificationDemo.tsx` | Demo / test notifications |

#### Performance (`components/performance/`)

| Component | Responsibility |
|-----------|----------------|
| `OptimizedComponents.tsx` | Memoized / optimized table cells etc. |

#### Shipment (`components/shipment/`)

| Component | Responsibility |
|-----------|----------------|
| `actions.tsx` | Shipment row actions |
| `columns.tsx` | Column definitions |
| `data-table-pagination.tsx` | Pagination |
| `form.tsx` | Legacy/simple shipment form |
| `form-professional.tsx` | Primary shipment form UI |
| `pagination.tsx` | Alternate pagination |
| `shipment-multiline-form.tsx` | Bulk multiline paste form |
| `sort-indicator.tsx` | Column sort affordance |
| `table.tsx` | Shipment table |
| `view.tsx` | Simple view |
| `view-professional.tsx` | Primary read-only shipment dialog |

#### Shared (`components/shared/`)

| Component | Responsibility |
|-----------|----------------|
| `data-table.tsx` | Generic data table |
| `data-table-pagination.tsx` | Shared pagination |

#### Supplier (`components/supplier/`)

| Component | Responsibility |
|-----------|----------------|
| `actions.tsx` | Supplier actions |
| `edit.tsx` | Edit panel |
| `form.tsx` | Add supplier form |
| `pagination.tsx` | Pagination |
| `responsive-table.tsx` | Responsive supplier table |
| `table.tsx` | Supplier table |
| `view.tsx` | Supplier view panel |

#### Validation (`components/validation/`)

| Component | Responsibility |
|-----------|----------------|
| `ValidationTest.tsx` | Validation dev/test UI |

#### UI primitives (`components/ui/`)

| File | Role |
|------|------|
| `alert.tsx`, `alert-dialog.tsx` | Status and destructive confirmations |
| `avatar.tsx` | User avatar |
| `badge.tsx`, `badge-variants.ts`, `button.tsx`, `button-variants.ts` | Chips and buttons |
| `breadcrumb.tsx` | Navigation breadcrumbs |
| `card.tsx` | Card layout |
| `chart.tsx` | Chart helpers (with Recharts) |
| `checkbox.tsx` | Checkbox input |
| `collapsible.tsx` | Collapse sections |
| `combobox.tsx`, `combobox-creatable.tsx` | Command-style comboboxes |
| `command.tsx` | cmdk palette base |
| `custom-color-picker.tsx` | Accent / custom color |
| `dialog.tsx`, `drawer.tsx`, `sheet.tsx` | Overlays |
| `dropdown-menu.tsx`, `menubar.tsx`, `navigation-menu.tsx` | Menus |
| `form.tsx`, `form-hooks.tsx`, `use-form-field.ts` | Form field primitives |
| `input.tsx`, `label.tsx`, `textarea.tsx` | Inputs |
| `kpi-card.tsx` | Dashboard statistic cards |
| `pagination.tsx` | Page index controls |
| `popover.tsx` | Anchored popovers |
| `progress.tsx` | Progress bar |
| `resizable.tsx`, `resizable-layout.tsx` | Split panes |
| `responsive.tsx`, `responsive-form.tsx`, `responsive-table.tsx` | Responsive helpers |
| `scroll-area.tsx` | Scroll container |
| `select.tsx` | Radix select |
| `separator.tsx` | Divider |
| `sidebar.tsx`, `use-sidebar.ts` | App sidebar primitives |
| `skeleton.tsx` | Loading placeholders |
| `sonner.tsx` | Toaster wiring |
| `switch.tsx`, `toggle.tsx` | Toggles |
| `table.tsx` | Table primitives |
| `tabs.tsx` | Tabs |
| `tooltip.tsx` | Tooltips |

#### Other root components

| Component | Responsibility |
|-----------|----------------|
| `about-dialog.tsx` | About / version dialog |

---

## Backend Details (Rust)

### Database and process model

- SQLite connection is stored in **`DbState`** (`Mutex<Connection>`) and opened in `main.rs` under the app data directory (`playwright_db::active_db_filename()`).
- **Migrations** run on startup (`migrations::DatabaseMigrations::run_migrations`).
- A background thread runs every **60s**: `tick_backup_schedules` and `tick_dashboard_maintenance`.

### Encryption (backup files)

Implementation: `src-tauri/src/utils/encryption.rs`.

| Topic | Detail |
|-------|--------|
| Algorithm | **AES-256-GCM** |
| Key material | 32-byte key derived with **PBKDF2-HMAC-SHA256**, **100,000** iterations, per-file random **16-byte salt** |
| Nonce | **12-byte** random GCM nonce |
| File format | `IMBK1` (5-byte magic) + salt + nonce + ciphertext (ciphertext includes GCM auth tag) |
| Key storage | Random **32-byte** key, **base64** in Windows **keyring** (`ImportManager` / `backup_encryption_password`), created on first backup (`utils/backup_keyring.rs`) |
| `.imkey` export | Text file: comment line + single base64 line (`commands/backup_key.rs`) |

**Live SQLite “encryption” module** (`src-tauri/src/encryption.rs`) is currently a **no-op** for bundled SQLite builds (always reports unencrypted); the UI may still show a generic “AES-256 Enabled” string from DB stats. **Actual confidentiality for portable copies is the `.enc` backup pipeline**, not SQLCipher in the default bundled path.

### Google Drive integration

File: `src-tauri/src/commands/google_drive.rs`.

| Topic | Detail |
|-------|--------|
| OAuth type | Desktop / installed app |
| Redirect | `http://127.0.0.1:8765/` |
| Scopes | `drive.file` + `userinfo.email` |
| Client credentials | Compile-time env: `IMPORT_MANAGER_GOOGLE_CLIENT_ID`, `IMPORT_MANAGER_GOOGLE_CLIENT_SECRET` |
| Refresh token | Prefer **keyring** (`ImportManager` / `google_drive_refresh_token`); **SQLite `app_metadata`** fallback keys `gdrive_access_token`, `gdrive_refresh_token`, `gdrive_token_expiry` |
| Remote path prefix | Stored paths use `gdrive:{fileId}` |
| Cancellation | `google_drive_reset_cancel`, `google_drive_cancel_operation` set/clear an atomic flag read during streaming upload/download |

### Backup engine

- **Model**: each run is a **full** SQLite file copy to a temp `.db`, then encrypted to **`.enc`**, plaintext staging removed.
- **Local**: writes `.enc` plus **`.enc.sha256`** sidecar (hex digest). Restore validates sidecar when present.
- **Google Drive**: uploads encrypted file via Drive API multipart; DB row stores `gdrive:fileId`; local temp removed after upload.
- **Retention**: up to **30** completed backups pruned (see `BACKUP_RETENTION_MAX`); Google Drive prune spawns async deletes.
- **Schedules**: cron **six fields** (`sec min hour dom mon dow`) with timezone field interpreted as UTC or Asia/Kolkata/IST (`db_management.rs`).

### Tauri commands (catalog)

Commands are registered in `src-tauri/src/main.rs` inside `invoke_handler![...]`. The list is long; below they are grouped by domain. Unless noted, payloads are JSON-friendly structs/strings from the frontend—see the corresponding `#[tauri::command]` in `src-tauri/src/commands/*.rs` for exact parameter names (Tauri uses the Rust parameter names in the invoke payload).

#### App / shell / metadata

| Command | Purpose |
|---------|---------|
| `get_shell_version` | Tauri / shell version info |
| `log_client_event` | Client-side telemetry / log line to Rust logger |
| `get_app_metadata_value` / `set_app_metadata_value` | Key/value `app_metadata` table |
| `get_current_user_info` / `get_user_context` | User context for IPC consumers |

#### Suppliers, shipments, items, invoices, BOE, options

| Command | Purpose |
|---------|---------|
| `get_suppliers`, `add_supplier`, `update_supplier`, `add_suppliers_bulk` | Supplier CRUD / bulk |
| `get_shipments`, `get_active_shipments`, `add_shipment`, `update_shipment`, `add_shipments_bulk`, `freeze_shipment`, `update_shipment_status`, … | Shipment lifecycle (includes status automation helpers) |
| `get_items`, `add_item`, `add_items_bulk`, `update_item` | Item master |
| `get_invoices`, `add_invoice`, `add_invoices_bulk`, `update_invoice`, `bulk_finalize_invoices`, `delete_invoice`, `get_unfinalized_shipments` | Invoices |
| `get_boes`, `add_boe`, `update_boe`, `delete_boe` | BOE headers |
| `get_boe_calculations`, `get_shipment_ids_with_boe_calculations`, `add_boe_calculation`, `update_boe_calculation`, `delete_boe_calculation`, `get_shipments_for_boe_entry`, `get_shipments_for_boe_summary`, `update_boe_status`, `add_boe_attachment`, `get_boe_reconciliation`, `save_boe_attachment_file`, `save_item_photo_file` | BOE workflow / files |
| `add_option`, `get_units`, `add_unit`, … (countries, rates, categories, incoterms, modes, types, statuses) | Reference data |

#### Expenses

| Command | Purpose |
|---------|---------|
| `get_service_providers`, `add_service_provider`, `get_expense_types`, `add_expense_type`, `add_expense_type_with_rates`, many `debug_*` / `fix_*` / `cleanup_*` commands | Maintenance and diagnostics |
| `get_expense_invoices_for_shipment`, `get_expenses_for_invoice`, `get_expenses_for_shipment`, `add_expense_invoice_with_expenses`, `check_expense_invoice_exists`, `add_expense`, `update_expense`, `delete_expense`, `attach_invoice_to_expense`, `add_expenses_bulk`, `delete_expense_invoice`, … | Expense CRUD |
| `create_expense_invoice`, `preview_expense_invoice`, `combine_expense_duplicates`, `get_expense_invoice` | `expense` module production commands |
| `generate_shipment_expense_report`, `get_shipment_ids_with_expense_lines`, `generate_monthly_gst_summary`, `generate_detailed_expense_report`, various `generate_expense_summary_*`, `debug_expense_report_filters`, `debug_expense_dates` | Reporting |

#### Reports & dashboard

| Command | Purpose |
|---------|---------|
| `get_report` | Report payloads |
| `get_dashboard_metrics`, `get_kpi_metadata`, `get_kpi_snapshot_history`, `get_kpi_alert_rules`, `save_kpi_alert_rule`, `log_dashboard_activity`, `get_dashboard_activity_log`, `query_dashboard_activity_log`, `get_exception_trend_history`, `set_kpi_snapshot_retention_days` | Dashboard / KPI / activity |

#### Exception workflow & reliability

| Command | Purpose |
|---------|---------|
| `list_exception_cases`, `update_exception_case`, `add_exception_note`, `list_exception_notes`, `get_exception_lifecycle_events`, `record_exception_viewed`, `bulk_resolve_exception_cases` | Exception inbox |
| `validate_exception_integrity_command`, `revalidate_open_exceptions_command`, `simulate_exception_load_command`, `simulate_rule_execution_command`, `get_exception_reliability_report` | Reliability tooling |

#### Workflow observability

| Command | Purpose |
|---------|---------|
| `get_workflow_health_summary`, `get_workflow_maintenance_history`, `run_recovery_readiness_check`, `reconstruct_exception_lifecycle`, `get_reliability_diagnostics`, `get_predictive_workflow_risk`, `get_audit_verification_summary` | Observability / diagnostics |

#### Workflow automation (representative set)

Includes: `list_workflow_decision_rules`, `set_workflow_decision_rule_enabled`, `set_workflow_automation_master_enabled`, `set_automation_guardrails`, adaptive SLA toggles and queries, automation logs, health/impact summaries, `run_workflow_automation_cycle_command`, efficiency analysis, resolution suggestions, rollback, effectiveness metrics, safety indices, stability alerts, ROI / cost / capacity / benchmarks, optimization and learning suggesters, multi-rule simulation, cost limits, economics indices, etc. (full list in `main.rs`).

#### Workflow rule deployment, multi-environment, jobs, production observability, incidents

- **Deployment / versioning**: `list_workflow_rule_versions`, `create_workflow_rule_version`, staging/approval/deploy/rollback, canary, freeze, impact metrics, … (`workflow_rule_deployment.rs`; `deployment_safety` helpers invoked via these commands).
- **Multi-env / tenant**: `list_workflow_environments`, `list_workflow_tenants`, `get_workflow_execution_context`, `set_workflow_active_tenant`, `set_workflow_execution_environment`, promotion, dashboards, deployment logs (`workflow_multienv.rs`).
- **Background jobs**: list jobs, execution log, health dashboard, retry, simulate, failure detection, missed schedules, recovery exports, dependency tree, timeline, manual overrides (`workflow_job_monitoring.rs`).
- **Production observability**: system metrics/health, alert signal log/dashboard, simulate alert, CSV export (`workflow_production_observability.rs`).
- **Incident / forecast / stabilization**: operations center dashboard, forecast feedback/ack, incident detail/notes/resolve, CSV export, correlated timeline, failure bursts, stabilization, suppression, debug triggers (`workflow_incident_management.rs`).

#### Google Drive

| Command | Parameters / behavior |
|---------|------------------------|
| `google_drive_status` | Returns `configured`, `connected`, `state`, optional `email` |
| `google_drive_refresh_profile` | Refreshes email display |
| `google_drive_connect` | Starts OAuth; requires `State<DbState>` |
| `google_drive_disconnect` | Clears session |
| `google_drive_reset_cancel` | Clears cancel flag |
| `google_drive_cancel_operation` | Requests cancel for in-flight transfer |

#### Database management, backup, restore, audit

| Command | Purpose |
|---------|---------|
| `create_audit_log`, `get_audit_logs` | Auditing |
| `get_database_stats` | Size, counts, last backup, encryption label |
| `has_backup_key_in_keyring`, `export_backup_key`, `export_backup_key_to_path`, `import_backup_key_from_path` | Backup AES key lifecycle |
| `create_backup` | `BackupRequest` + optional `userId`; destination `local` or `google_drive` |
| `get_backup_history` | Lists backup rows |
| `restore_database`, `preview_restore` | Restore pipeline with integrity checks |
| `soft_delete_record`, `get_deleted_records`, `restore_deleted_records`, `permanently_delete_records`, `hard_delete_record`, `get_recycle_bin_deleted_count` | Recycle bin |
| `get_reference_counts`, `preview_delete_dependencies`, `get_soft_delete_tables` | Safe delete previews |
| `get_application_logs` | Log tail for UI |
| `browse_table_data`, `update_record`, `bulk_search_records`, `bulk_delete_records` | Admin table tools |
| `create_backup_schedule`, `get_backup_schedules`, `update_backup_schedule`, `delete_backup_schedule`, `run_scheduled_backup` | Scheduling |
| `create_user_role`, `get_user_roles`, `update_user_role`, `delete_user_role`, `check_user_permission`, `get_user_permissions` | RBAC tables |

#### Misc

| Command | Purpose |
|---------|---------|
| `validate_shipment_import`, `check_supplier_exists` | Import validation |
| `migrate_shipment_statuses`, `check_and_update_ready_for_delivery`, `update_shipment_status_on_invoice_add`, `update_shipment_status_on_boe_add` | Status automation |
| `reset_test_database` | Test reset (`test_reset.rs`) |
| `get_shell_version`, `log_client_event` | Diagnostics |

> **Note:** `commands/deployment_safety.rs` exists as a module but the public surface is reached through **`workflow_rule_deployment`** command wrappers (see `commands/mod.rs` exports).

---

## Security

- **Backups**: AES-256-GCM with per-file salt and strong PBKDF2; key in **OS keyring**; optional `.imkey` offline backup of raw key material.
- **Google Drive**: **Not zero-knowledge**—Google hosts ciphertext, but the encryption key is local; Google cannot decrypt without the key file/passphrase workflow used at restore. Only **`drive.file`**-created objects are intended to be touched.
- **Session**: front-end `localStorage` gate (`isAuthenticated`, `currentUser`); suitable only in a **trusted single-user** Windows profile; not a multi-tenant server auth model.
- **Passwords**: override **`VITE_ADMIN_PASSWORD_HASH`**; default hash in source is for **development only**.
- **Updater**: `tauri.conf.json` expects **`TAURI_SIGNING_PUBLIC_KEY`** at build time; keep private key out of git.
- **Code signing**: configure in release pipeline / MSI toolchain.

---

## Testing

| Type | Command | Notes |
|------|---------|-------|
| Unit (TS) | `npm run test:unit` | Vitest |
| Unit coverage | `npm run test:unit:coverage` | CI uploads to Codecov (non-fatal on error) |
| Unit (Rust) | `cd src-tauri && cargo test` | |
| E2E (Playwright, CI subset) | `npm run test:e2e:ci` | Chromium, `workers=1`, fixed spec list in `package.json` |
| E2E (local) | `npm run test:e2e` / `test:e2e:ui` / `test:e2e:headed` / `test:e2e:debug` | |
| Lint | `npm run lint` | ESLint |
| Format | `npm run format:check` / `npm run format` | Prettier |
| Typecheck | `npm run type-check` | `tsc --noEmit` |
| Rust deny | `cargo deny check` | In CI |
| Secrets scan | `npm run security:gitleaks` / `security:full` | Optional local/CI |
| Performance | `npm run test:performance` | Baseline script |

---

## CI/CD (GitHub Actions)

### `ci.yml` (primary CI)

Triggers: **push** and **pull_request** to `main` and **`develop`**.

| Job | What it does |
|-----|----------------|
| `frontend-lint` | Node **20.x / 22.x** matrix: `npm ci`, `npm run lint`, `npm run format:check`, `npm run type-check`; asserts workflow stays Windows-only |
| `backend-check` | `cargo check`, `cargo clippy -D warnings`, `cargo fmt --check`, `cargo deny check`, Windows guard |
| `unit-tests` | After frontend+backend: `npm run test:unit:coverage`, `cargo test`, Codecov upload on 22.x |
| `e2e-tests` | `npm run test:e2e:ci` with cached Playwright browsers; uploads `playwright-report/`, `test-results/` artifacts |
| `build` | `npm run tauri build` with SQLCipher-related env; uploads `src-tauri/target/release/bundle/` as `import-manager-build` artifact |

**Secrets:** none required for default CI. **Codecov token** is optional for Codecov uploads.

### `release.yml`

Triggers: **tags** `v*` or **workflow_dispatch**.

- Sets SQLCipher/vcpkg-style env and `LIBSQLITE3_SYS_BUNDLED=1`.
- `npm ci` → `npm run tauri build`.
- Verifies **MSI** and **NSIS exe** exist under `src-tauri/target/release/bundle/`.
- Creates **GitHub Release** with `softprops/action-gh-release`, attaching MSI/NSIS/exe bundle patterns.

**Secrets:**

| Secret | Purpose |
|--------|---------|
| `SIGNING_CERTIFICATE` | If non-empty, runs optional signing block (placeholder—implement signing) |
| (Recommended by `.github/README.md`, not wired identically in `release.yml`) `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD` | Tauri updater signing |

### `dependabot-auto-merge.yml`

Runs on `pull_request` when actor is **`dependabot[bot]`**. Uses `dependabot/fetch-metadata@v1`. The auto-merge step is **guarded** by:

```yaml
contains(steps.metadata.outputs.dependency-names, 'my-dependency')
```

That condition is a **placeholder** copied from Dependabot’s template—in practice it will **not auto-merge** until you replace `my-dependency` with real package names or remove the filter.

### Other workflows (brief)

| Workflow | Role |
|----------|------|
| `codeql.yml` | GitHub CodeQL security scanning |
| `gitleaks.yml` | Secret scanning |
| `format.yml` | Formatting checks |
| `nightly.yml` | Scheduled / extended checks |
| `workflow-lint.yml` | Action workflow YAML validation |

---

## Usage Guide — Page by Page

### Login (`/login`)

- **Purpose**: Sets `localStorage` session after password check.
- **Fields**: **Username**, **Password** (both required).
- **Actions**: **Login** button (or Enter in password field): calls `authenticateUser`; on success sets `isAuthenticated` + `currentUser`, toast “Login successful!”, navigates to `/`.
- **Validation**: Empty fields → toast “Please enter both username and password”; wrong credentials → toast with generic invalid message; network/exception → “Login failed. Please try again.”
- **Defaults**: Username defaults to **`Jana`** unless `VITE_ADMIN_USERNAME` is set. Password must match bcrypt of configured hash (built-in default hash matches the dev password commented in `auth.ts`—**change this** for real use).

### Dashboard (`/`)

- **Purpose**: Operational overview—KPIs, charts, filters, activity, exception and workflow panels for admins/automation roles.
- **Controls** (representative): timeframe selectors (**weekly / monthly / 3-month / 6-month / yearly**), **module** filter (`all`, shipment-invoice, items, expenses), **refresh** actions, **KPI history** range (`7d`, `30d`, `90d`, `12m`, `all`), layout toggles (**`LayoutControls`**, **`ResizableLayout`**), links to exception/shipment flows via `getExceptionNavigationTarget`.
- **Data**: Invokes `get_dashboard_metrics`, KPI history/metadata/alert APIs, dashboard activity log commands, workflow health / alert / observability commands (see `dashboard.tsx` imports).
- **Submit/cancel**: Read-only analytics except where dialogs confirm actions (e.g. bulk resolve exceptions).

### Supplier (`/supplier`, `/supplier/:id/view`, `/supplier/:id/edit`)

- **Purpose**: Maintain supplier master; view/edit in slide-over or routed panels depending on URL.
- **List**: Responsive table with sorting, **Add** supplier, **Import** (Excel/CSV flows), **Export**, **Settings** (opens **`ModuleSettings`** for supplier module).
- **Row actions** (`SupplierActions`): navigate to view/edit, delete with confirmations where implemented.
- **Forms** (`AddSupplierForm`, `SupplierEditPanel`): fill supplier fields per columns; **Save** persists via `invoke` add/update; **Cancel** navigates back to list.
- **View** (`SupplierViewPanel`): read-only detail.

### Shipment (`/shipment`, …)

- **Purpose**: Shipment lifecycle, ETA/status tracking, multiline paste import, CSV template download/upload, integration with invoices/BOE/expenses.
- **Toolbar**: **New shipment**, **Refresh**, **Import** menu (template download, CSV upload with validation), **Export**, **Module settings**, optional **database** shortcut, filters (status, supplier, search text, invoice date range, “show exceptions” type filters—see page state in `shipment.tsx`).
- **Forms**: **`ProfessionalShipmentForm`** for main capture; **`ShipmentMultilineForm`** for rapid multi-row entry; validations toast on server errors.
- **View**: **`ProfessionalShipmentViewDialog`** for read-only review.

### Invoice (`/invoice`, …)

- **Purpose**: Commercial invoices per shipment; ties to items and tax snapshots.
- **List**: Columns with duty/tax; **Add**, **Import** (including bulk invoice line import pattern), **Finalize** flows, **Settings** dialog for module columns.
- **Form / view**: `InvoiceForm`, `InvoiceViewDialog`; delete confirm via **`AlertDialog`**.

### Invoice Wizard (`/invoice-wizard`)

- **Purpose**: Guided **`InvoiceWizard`** stepper for creating invoices without starting from the grid page.
- **Behavior**: Follow step UI (shipment selection → line items → review); **Back/Next** style navigation inside the wizard component; final submit creates invoice via backend (see wizard source for exact invoke sequence).

### Item Master (`/item-master`, …)

- **Purpose**: Parts / SKU catalog linked to invoices and BOE.
- **Table** + **Item form** (`ItemForm`): codes, descriptions, UOM, pricing-related fields per types; **Creatable combobox** for quick add of related entities.
- **Import/export** patterns similar to other master pages.

### BOE — View all (`/boe`, …)

- **Purpose**: Register of **Bill of Entry** documents.
- **Routes**: `/boe/new` opens add panel; `/boe/:id/view` and `/edit` open **`BoeViewDialog`** / **`BoeForm`**.
- **List actions**: CSV import/export, delete with **`AlertDialog`** confirmation (`isDeleteDialogOpen`).

### BOE Entry (`/boe-entry`, …)

- **Purpose**: Detailed duty calculation workspace (**`BoeEntryForm`**, **`BoeDetailsTable`**, **`CalculationResults`**).
- **Saved BOEs**: **`SavedBoeList`**; continue/edit flows by `savedBoeId` route param.

### BOE Summary (`/boe-summary`, …)

- **Purpose**: Aggregated BOE reporting client (`boe-summary/client.tsx`) with status badges.

### Expenses (`/expenses`)

- **Purpose**: Capture expense lines per shipment/invoice context; uses **`ExpenseList`**, **`ExpenseForm`**, **`ExpenseInvoiceForm`**, **`ShipmentSelector`**, import/debug components as wired on the page.

### Expense Reports (`/expense-reports`)

- **Purpose**: Launch **`ExpenseReports`** UI to generate summaries (by type, provider, shipment, month—backed by report commands).

### Expense Data Manager (`/expense-data-manager`)

- **Purpose**: Maintain reference dimensions (service providers, expense types, rates) via **`ExpenseDataManager`** component.

### Report (`/report`)

- **Purpose**: Analytical **`ReportsPage`** (charts/tables/exports depending on implementation).

### Frozen Shipments (`/frozen-shipments`)

- **Purpose**: List and unfreeze shipments placed in frozen state from operations (`freeze_shipment` backend). Reachable from **user menu → “Unfreeze shipments”** as well.

### Account (`/account`, `/account/update`, `/account/password`)

- **Account details**: Read-only card of name, email, username, role from `localStorage` user; if missing user, prompts to log in again.
- **Update profile**: **Name**, **Email** inputs; **Save** writes updated user via `setAuthenticated(true, updatedUser)` and refreshes context; toasts on success/failure.
- **Change password**: **Current**, **New**, **Confirm** fields; **Update Password** validates new ≥ **6** chars and matching confirm; on success shows toast **only** (does **not** persist a new bcrypt hash—**stub UI**; production must replace with real password change).

### Settings (`/settings`)

- **Purpose**: Formatting defaults + module column settings.
- **Header buttons**: **Reset** (reload defaults from `loadSettings()`), **Clear All Settings** (`clearSettings()` + defaults), **Save Settings** (toast; most changes already persisted on edit via context).
- **Module Settings**: Click a module tile (**Shipment, Invoice, BOE, BOE Summary, Supplier, Item Master, Expenses**) → opens **`ModuleSettings`** card with **Close**—configure visible columns, order, widths, number display, pagination counts.
- **Number Formatting**: **Decimal places** select (0–3), **Currency symbol** input (e.g. `₹`), **Thousands separator** switch, live preview.
- **Date Formatting**: **Format** select (`DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY`), **Include time** switch, preview.
- **Text Formatting**: **Case** select, **Trim whitespace** switch, preview.
- **`ModuleSettingsDemo`**: in-page demo of settings behavior.

### Database Management (`/database-management`)

- **Purpose**: Administer SQLite data, backups, schedules, roles, and audit history.

#### Header strip

- **Refresh** stats, **Maintenance** actions (if shown in your build), **Export / Import backup key** buttons call `export_backup_key*` / `import_backup_key_from_path` via handlers.

#### Tab: Overview

- Cards: **Database size**, **table counts**, **last / next backup**, **Security** badge (shows `encryption_status` string + note “Backups: AES-256-GCM (key in system keyring)”) with **Export Backup Key** / **Import Backup Key** buttons (disabled outside Tauri).

#### Tab: Browse & Edit

- **Table** select: `suppliers`, `shipments`, `items`, `invoices`, `expenses`, `notifications`.
- **Page size** 25/50/100, **Include deleted** checkbox, **Refresh** loads `browse_table_data`.
- Grid: **Edit** (pencil) opens edit dialog path; **Trash** soft-deletes (`soft_delete_record`).
- Pagination: **Previous / Next**.

#### Tab: Bulk Operations

- **Table** select (adds `boe_details`, `audit_logs`), **Include deleted**, **Search** with spinner when `bulkOperationInProgress`.
- Filters: **Name**, **Status**, **Description** text inputs (table-dependent meaning).
- Select rows → **Bulk delete** / related actions (see page for destructive confirmations via `confirmDestructive`).

#### Tab: Backup & Restore

- **Google Drive panel**: status text; **Connect** / **Disconnect** / **Refresh email**; informational alert if OAuth not compiled.
- **Destination** select: **Local Storage**, **Google Drive**, disabled **AWS S3 (Coming Soon)**.
- **Filename (optional)**: overrides auto name.
- **Notes**: free text stored on backup row.
- **Create Backup Now**: disabled when busy or when Drive selected but not connected/configured; shows progress for local path.
- **Backup History**: each row **Preview Restore** (enabled only for `status === 'completed'`) → opens restore preview dialog (checksum, schema warnings). Playwright-only **Download snapshot** may appear in stub builds.

#### Tab: Backup Schedules

- **Create Schedule** opens dialog: **Name**, **Preset** (`daily` / `weekly` / `monthly` / `custom`), time fields, **Destination** `local` | `google_drive`, retention counts/days, **Enabled** switch, **Notes**; cron built as six-field expression internally.
- Lists active schedules with **Edit** / **Delete** / **Run now** patterns (see handlers).

#### Tab: User Roles

- CRUD-ish UI for `user_roles` via `create_user_role`, `get_user_roles`, `update_user_role`, `delete_user_role` (exact field layout in page).

#### Tab: Audit Logs

- Filterable table of `get_audit_logs` results.

#### Tab: Settings (sub-tab)

- Database-related toggles (e.g. retention knobs if present)—distinct from `/settings` page.

### Admin — Activity log (`/admin/activity-log`)

- **Purpose**: **`AdminActivityLogPage`**—richer dashboard activity / ERP-style audit feed (invoke `query_dashboard_activity_log` / related APIs per source file).

### Admin — Automation rules (`/admin/automation-rules`)

- **Purpose**: **`AutomationRulesAdminPage`**—manage workflow decision rules, toggles, guardrails, logs exposed by `workflow_automation` commands.

### Admin — Operations center (`/admin/operations-center`)

- **Purpose**: **`OperationsCenterPage`**—incident/forecast/signal overview using `get_operations_center_dashboard_command` and related incident APIs; may include **`DeploymentActivityDrawer`**.

### Recycle Bin (`/recycle-bin`)

- **Purpose**: Restore or permanently delete soft-deleted rows.
- **Filters**: search box, **table** select, pagination.
- **Actions**: **Restore selected** (may error with structured “missing parent” copy if FK graph incomplete), **Delete permanently** with strong confirmation; uses `get_deleted_records`, `restore_deleted_records`, `permanently_delete_records`.

### Logs (`/logs`)

- **Purpose**: Tail **`get_application_logs`** output.
- **Filter** select: `all`, `recycle_bin`, `restore`, `delete`, `schema`.
- **Refresh** / auto-refresh every **5s** in Tauri; blank when not in Tauri.

### User menu (sidebar footer)

- **Unfreeze shipments** → `/frozen-shipments`.
- **Account details** → `/account`.
- **Update user details** → `/account/update`.
- **Change password** → `/account/password`.
- **Logout** → clears `isAuthenticated`, navigates `/login`, toast.

---

## Troubleshooting

| Issue | Mitigation |
|-------|------------|
| **Port 1421 busy** | Set `VITE_DEV_SERVER_PORT` or stop other Vite instances. |
| **Playwright vs Tauri** | Default Playwright `baseURL` is `http://localhost:1422`; ensure `webServer` in config started Vite on that port; IPC errors expected unless stubs enabled. |
| **Google Drive “not configured”** | Rebuild Rust with `IMPORT_MANAGER_GOOGLE_CLIENT_*` set; register redirect `http://127.0.0.1:8765/`. |
| **OAuth loopback blocked** | Allow localhost port **8765** through firewall; complete sign-in in system browser window. |
| **Drive backup fails after connect** | Check token expiry handling; try **Disconnect** then **Connect**; inspect logs. |
| **Restore / decryption errors** | Ensure same **keyring** or imported **`.imkey`** as used when encrypting; wrong key yields “Decryption failed (wrong key or corrupt file).” |
| **Checksum mismatch on restore** | File corrupted or tampered; re-copy backup; sidecar must match `.enc`. |
| **SQLCipher / DLL copy failures** | Ensure vcpkg bin path in `build.rs` exists on your machine or rely on CI’s bundled path; check `src-tauri/target` for copied DLLs. |
| **Bundled vs encrypted legacy DB** | `main.rs` backs up SQLCipher file to `import-manager.db.sqlcipher-backup` when switching to bundled SQLite—recover data manually if needed. |
| **Dependabot never auto-merges** | Fix `dependabot-auto-merge.yml` placeholder dependency name. |

---

## Contributing

- **Branches**: feature work typically branches from **`main`** or **`develop`** (both wired in CI).
- **PRs**: use `.github/pull_request_template.md` when opening a PR; ensure **lint, typecheck, tests, and Windows CI** pass.
- **Commits**: Conventional, imperative messages (e.g. `fix: correct backup checksum validation`); keep changes scoped.
- **Pre-commit**: Husky is configured (`npm run prepare`); respect **lint-staged** if present in your checkout.

---

## License

The Rust crate metadata specifies **MIT** (`src-tauri/Cargo.toml`: `license = "MIT"`). Root `package.json` does not duplicate a `license` field—treat the project as **MIT** unless the repository owner adds a different top-level `LICENSE` file.

---

## Acknowledgements

Built with **Tauri**, **React**, **Vite**, **Tailwind CSS**, **Radix UI**, **TanStack Table**, **Recharts**, **SQLite** / **rusqlite**, **SQLCipher** (deployment), **reqwest**, **serde**, **keyring**, **Playwright**, **Vitest**, **GitHub Actions**, and the broader open-source ecosystem. See `package.json` and `Cargo.toml` for the authoritative dependency list.

---

*This README was generated to match the repository layout and code paths as of the workspace snapshot. For the exact live command signatures, always refer to `src-tauri/src/main.rs` and the `#[tauri::command]` definitions in `src-tauri/src/commands/`.*
