# Import Manager — AGENTS.md

## Project Overview

Import Manager is a **Windows-only Tauri 2 desktop application** that replaces spreadsheets for managing import/export operations. It handles suppliers, shipments, invoices, items, bills of entry (BOE), expenses, reporting, and operational dashboards. Data is stored in a local SQLite database with AES-256-GCM encrypted backups and optional Google Drive sync.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (Rust) + WebView2 (Windows) |
| Frontend | React 19, TypeScript, Vite 8 |
| Routing | React Router DOM 7 |
| Styling | Tailwind CSS 4, Radix UI primitives |
| State | React Context + localStorage (no Redux/Zustand) |
| Forms | React Hook Form + Zod + @hookform/resolvers |
| Tables | TanStack React Table 8 |
| Charts | Recharts |
| Notifications | Sonner, react-hot-toast |
| Motion/UX | Framer Motion, Vaul, react-resizable-panels, @dnd-kit |
| Data I/O | Papaparse (CSV), ExcelJS |
| Auth | bcryptjs (client) + Rust desktop session |
| Backend | Rust (stable, edition 2021, 1.71+) |
| Database | SQLite via rusqlite (bundled), refinery migrations |
| Crypto | aes-gcm, pbkdf2 (100k iterations), sha2 |
| Scheduling | cron, chrono, chrono-tz |
| HTTP | reqwest (rustls) for Google Drive |
| Secrets | Windows keyring with SQLite fallback |
| Testing | Vitest, Testing Library, Playwright, cargo test |
| Linting | ESLint, Prettier, rustfmt, Clippy, cargo-deny |

## Folder Structure

```
import-manager/
├── src/                        # React frontend
│   ├── App.tsx                 # Main router + all route definitions
│   ├── main.tsx                # React entry point
│   ├── pages/                  # 24 route-level page components
│   ├── components/             # Feature + shared UI components
│   │   └── ui/                 # 40+ Radix/shadcn primitives
│   ├── lib/                    # 51 utility files (auth, IPC bridge, settings, validation)
│   ├── contexts/               # NotificationContext
│   ├── providers/              # App-wide React providers
│   ├── hooks/                  # 6 custom hooks
│   └── types/                  # 12 TypeScript type files
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs             # Tauri app builder, IPC handler registration
│   │   ├── commands/           # 45 Tauri command modules (one per domain)
│   │   ├── db/                 # Database structs and queries
│   │   ├── migrations/         # 79 SQL refinery migrations
│   │   └── utils/              # Encryption, backup, keyring utilities
│   ├── Cargo.toml
│   ├── build.rs                # Copies SQLCipher DLLs on non-CI builds
│   ├── tauri.conf.json         # Tauri app config, CSP, bundle resources
│   └── capabilities/
├── tests/                      # Playwright E2E specs
├── scripts/                    # 34 PowerShell/JS helper scripts
├── .github/workflows/          # CI/CD (ci.yml, release.yml, codeql.yml, gitleaks.yml)
├── .env.example                # Environment variable template
├── vite.config.ts              # Vite config with manual chunking
├── playwright.config.ts        # E2E config (port 1422)
└── package.json                # version 0.4.10, os: ["win32"]
```

## How to Run, Build, and Test

### Prerequisites
- Windows 10/11
- Node.js 20.x or 22.x
- Rust stable (1.71+)
- WebView2 runtime (standard on Windows 10/11)

### Commands

```bash
# Install
npm ci

# Development
npm run tauri dev          # Full Tauri app with hot reload
npm run dev                # Vite only (port 1421, IPC stubs)

# Type / Lint / Format
npm run type-check
npm run lint
npm run format             # Prettier
npm run format:check
npm run format:rust        # rustfmt

# Testing
npm run test:unit          # Vitest
npm run test:unit:coverage # Vitest + coverage (Codecov in CI)
npm run test:e2e           # Playwright interactive
npm run test:e2e:ci        # Playwright CI (Chromium, 1 worker)
cd src-tauri && cargo test # Rust unit tests

# Build
npm run build              # Frontend only → dist/
npm run tauri build        # Full production app (MSI + NSIS)
npm run build:tauri        # Production with SQLite bundling

# Cleanup
npm run clean              # Remove node_modules, dist, target
npm run clean:tauri-cache  # Remove build caches
```

## Environment Variables

Copy `.env.example` to `.env`. These are **compile-time** Vite variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_ADMIN_USERNAME` | Desktop admin login username | `Jana` |
| `VITE_ADMIN_PASSWORD_HASH` | bcrypt hash for admin password | dev default in code |
| `VITE_PLAYWRIGHT` | Set to `1` for Playwright IPC stub mode | unset |
| `VITE_DEV_SERVER_PORT` | Vite dev port | `1421` |

Rust compile-time env (set in CI secrets):
- `IMPORT_MANAGER_GOOGLE_CLIENT_ID` / `IMPORT_MANAGER_GOOGLE_CLIENT_SECRET` — Google Drive OAuth
- `LIBSQLITE3_SYS_BUNDLED=1` — production builds only
- `TAURI_PRIVATE_KEY` / `TAURI_PRIVATE_KEY_PASSWORD` — updater signing (optional)

## Coding Conventions

### TypeScript / React
- **File naming**: PascalCase for components (`LoginPage.tsx`), camelCase for utilities (`auth.ts`)
- **Imports**: Organized by category — Tauri, hooks, lib, components, UI primitives
- **IPC calls**: Always wrap `invoke` with `safeInvoke` from `@/lib/ipc-safe` for type-safe error handling
- **IPC errors**: Use `parseIpcError` / `ipcErrorMessage` from `@/lib/ipc-error` — do not access `error.message` directly
- **Forms**: React Hook Form + Zod schema + `@hookform/resolvers/zod` — no raw `useState` for form fields
- **Styling**: Tailwind utility classes; use `class-variance-authority` for component variants
- **Notifications**: Use `sonner` (`toast.success/error`) for user feedback
- **Path alias**: `@/` resolves to `./src/`

### Rust / Backend
- **Commands**: `#[tauri::command]` on public functions, `State<DbState>` for DB access
- **DB access**: `state.db.lock().unwrap()` then prepared statements with `params![]`
- **Error propagation**: `.map_err(|e| e.to_string())?` for IPC serialization — all commands return `Result<T, String>`
- **Soft deletes**: Filter with `deleted_at IS NULL` — never hard-delete user data rows
- **Search/pagination**: Commands accept `Option<String>` search_text, `Option<i64>` limit/offset

### State Management
- Global state lives in `SettingsProvider`, `UserProvider`, `NotificationProvider`, `ThemeProvider`
- Persist to localStorage (key: `import-manager-settings`, `currentUser`)
- No server state library — all data fetched via Tauri IPC on mount or user action

## What NOT To Do

- **Don't add Zustand, Redux, or React Query** — the codebase intentionally uses Context + localStorage
- **Don't call `invoke` directly** — always use `safeInvoke` from `@/lib/ipc-safe`
- **Don't hard-delete rows** — use `deleted_at` soft-delete pattern; rows land in the recycle bin
- **Don't add new migrations by editing existing ones** — create a new numbered migration file in `src-tauri/migrations/`
- **Don't commit secrets** — gitleaks runs in CI and as a pre-commit check; use `.env` for local secrets
- **Don't run on Linux/macOS** — `package.json` declares `"os": ["win32"]`; Rust code uses Windows keyring APIs
- **Don't bypass CSP** — `tauri.conf.json` has strict CSP; no `unsafe-eval`, no `object-src`
- **Don't use `console.log` in production code** — Vite's `remove-console` plugin strips them in builds, but Playwright tests may rely on console output
- **Don't skip type-check before PR** — `npm run type-check` must pass; CI enforces it
- **Don't write raw SQL in page components** — all DB access goes through Rust commands via IPC
- **Don't create worktree branches for page redesigns** — always work directly on the main branch unless explicitly asked to create a feature branch.

## Key Architectural Patterns

### IPC Bridge
```typescript
// Always use safeInvoke, never raw invoke
import { safeInvoke as invoke } from '@/lib/ipc-safe';
const result = await invoke<SupplierList>('get_suppliers', { limit: 50, offset: 0 });
```

### Rust Command Pattern
```rust
#[tauri::command]
pub fn get_suppliers(
    state: State<DbState>,
    limit: Option<i64>,
    offset: Option<i64>,
    search_text: Option<String>,
) -> Result<Vec<Supplier>, String> {
    let conn = state.db.lock().unwrap();
    // prepared statement + params![] + row mapping
}
```

### Database Migrations
- Files live in `src-tauri/migrations/` — numbered `V{n}__{description}.sql`
- Refinery runs them on startup automatically
- 79 migrations as of v0.4.10

Production readiness roadmap: `docs/PRODUCTION_GRADE_PLAN.md`

### Playwright E2E Stubs
- Set `VITE_PLAYWRIGHT=1` to activate IPC stub mode in `src/lib/tauri-bridge.ts`
- Playwright tests run against Vite dev server (port 1422), not a full Tauri build

## Module Reference

### Key helper modules (`src/lib/`)

| File | Purpose |
|------|---------|
| `ipc-safe.ts` | `safeInvoke` wrapper — **always import from here**, never raw `invoke` |
| `ipc-error.ts` | `parseIpcError` / `ipcErrorMessage` for IPC error handling |
| `tauri-bridge.ts` | Tauri API wrappers: file dialogs, `confirm`, window ops |
| `auth.ts` | Session resolution, permission checks |
| `settings.ts` + `use-settings.ts` | Settings read/write — use `useSettings()` hook in components |
| `settings-context-definition.ts` | `AppSettings` type definition |
| `date-format.ts` | `formatDateForInput` / `formatDateForDisplay` — use these, never `.toISOString()` directly |
| `financial.ts` | Duty and tax calculations |
| `csv-helpers.ts` | CSV import/export logic for item master |
| `multiline-paste.ts` | Multi-line paste parser (invoice wizard) |
| `shipment-multiline-paste.ts` | Multi-line paste parser (shipment flow) |
| `parse-percentage.ts` | `invoiceTaxSnapshotFromItem` — snapshots BCD/SWS/IGST from an item onto a line |
| `validation/` | Zod-based form validation helpers |
| `cache/` | localStorage cache layer with TTL |
| `performance/` | Performance monitoring utilities |
| `debug-utils.ts` | Env detection + dev-only logger — do not call directly in page/component code |

### UI shells (`src/components/layout/`)

| File | Purpose |
|------|---------|
| `AppLayout.tsx` | Root shell — sidebar + main content area |
| `app-sidebar.tsx` | Navigation sidebar (links, collapse state) |
| `theme-provider.tsx` + `theme-context.tsx` | Dark/light mode + accent color wiring |
| `site-header.tsx` | Top bar |

All reusable primitives live in `src/components/ui/` (Radix/shadcn wrappers). Use them — don't reach for raw HTML elements for standard UI.

Notable non-obvious ui/ components: `resizable-layout.tsx` (split panels), `responsive-table.tsx` (data table with responsive column hiding), `combobox-creatable.tsx` (searchable + create-new dropdown).

### Where to put tests for new logic

| What you're testing | Where it goes |
|--------------------|--------------|
| Pure logic (calculations, parsing, validation) | Colocate: `src/lib/<module>.test.ts` — see `financial.test.ts`, `permissions.test.ts`, `shipment-multiline-paste.test.ts` as examples |
| UI flows / page behaviour | `tests/ui-<domain>.spec.ts` (Playwright) |
| Smoke / navigation | `tests/e2e/smoke.spec.ts` or `tests/e2e/<feature>.spec.ts` |

Run unit tests with `npm run test:unit`, E2E with `npm run test:e2e`.

## Conventions from recent cleanup

- **No hardcoded color classes on page titles** — don't use `text-blue-600` (or any fixed color) on `h1` or `CardTitle`. Let the element's default `text-foreground` apply; it respects the user's chosen accent theme.
- **Debug/test buttons don't belong in production UI** — even if wired to real backend commands. Remove them before shipping; use the "Debug & Setup" tab in expenses if dev tooling is genuinely needed.
- **Pass the full payload through IPC chains** — when a page-level `handleSubmit` re-maps line items received from a child component, include every field (e.g. `dutyPercent`, `swsPercent`, `igstPercent`). Silent field drops are hard to catch in tests.
- **`console.log/debug/time` in pages** — Vite strips these in production builds, but they accumulate fast. Don't add new ones; use the `logger` from `debug-utils.ts` if you need dev-only tracing.
- **Demo/documentation widgets** don't belong in production pages — components named `*Demo` or containing "Usage Example" code snippets should not be rendered in shipped pages.

## Page Design System (Industrial Console Theme)

Reference implementation: Supplier page ✅ (Shipment pending re-do)
Files: src/components/supplier/table-industrial.tsx
       src/components/supplier/table-industrial.css

### Standard page structure

Header row:
- Monospace ALL-CAPS page title (SUPPLIERS, SHIPMENTS etc.)
- Amber record-count badge: className="im-record-badge"
- Right-aligned action buttons: className="im-hdr-btn"
- Primary action uses className="im-btn-primary"

Toolbar:
- Row 1: search input (dominant width) + primary filter buttons
- Row 2: secondary filters + exception toggles + Clear button

Table shell: className="im-table-shell"
- 36px row height, no exceptions
- Sticky header with dark panel background #0D0D0B
- Uppercase monospace column labels
- Alt-row tinting: #101010 / #0C0C0B alternating
- Row hover background: #161513
- Selected row: 2px amber inset left rail + rgba(232,162,58,0.10) bg
- No border-radius on table elements (sharp corners throughout)

Row actions (visible on hover only):
- Icon-only buttons: Eye / Pencil / domain action
- opacity: 0 → 1 on row hover or when row is selected
- Context-aware: hide actions not relevant to current row state
- Never use hamburger/kebab menu for primary row actions

Status pills:
- Always UPPERCASE text
- font-size: 11px
- letter-spacing: 0.05em
- Monospace font

Exception rows:
- Overdue: box-shadow: inset 3px 0 0 amber
- Other exceptions: box-shadow: inset 3px 0 0 blue

Status bar (bottom, fixed):
- Left: Total: n · Selected: n · Loaded: n
- Right: Page N of N ← →
- Selected count turns amber when > 0

### Design tokens (CSS custom properties on .im-table-shell)
- --im-accent: amber-400
- --im-good: green-400  
- --im-bad: red-400
- --im-panel: neutral-950 (#0D0D0B)
- Row alternation: #101010 / #0C0C0B
- Row hover: #161513
- Selected bg: rgba(232,162,58,0.10)

### Typography
- IDs, codes, amounts: font-family Consolas, 'Courier New', monospace
- ID column: 11.5px, muted color
- Name cell: bold name + monospace shortName subtitle below
- Page title: monospace ALL-CAPS
- Column headers: uppercase monospace

### Status pill color map
Supplier: ACTIVE = green · INACTIVE = red
Shipment: DOCS RCVD = teal · IN TRANSIT = blue · CUSTOMS = purple · READY = amber · DELIVERED = green
Invoice: DRAFT = gray · SENT = blue · PAID = green · OVERDUE = red
BOE: FILED = blue · ASSESSED = amber · CLEARED = green · ON HOLD = red

### Pages completed
- Supplier ✅ (reference: src/components/supplier/table-industrial.tsx)
- Shipment ✅ (src/components/shipment/table-shipment.tsx + table-shipment.css + src/pages/shipment-columns.tsx)
- Invoice ✅
- Item Master ✅
- BOE list ✅

### Pages remaining
- Dashboard
- Expenses (shell/tokens)
- Reports
- Settings
- Frozen shipments
- Recycle bin

---

## CSS Class Reference (Industrial Console)

These classes are already defined in 
src/components/supplier/table-industrial.css.
Import this CSS or extend it for other pages.

| Class | Purpose |
|---|---|
| .im-table-shell | Root wrapper, holds all CSS tokens |
| .im-page-header | Page header flex row |
| .im-page-header__title | Title + badge group |
| .im-record-badge | Amber record count badge |
| .im-page-header__actions | Right-aligned button group |
| .im-hdr-btn | Standard header action button |
| .im-btn-primary | Primary CTA button (amber) |
| .im-toolbar | Toolbar container |
| .im-search | Search input |
| .im-filter-btn | Filter toggle button |
| .im-filter-btn--active | Active filter state |
| .im-status-bar | Bottom status bar |
| .im-pill | Base status pill |
| .im-pill--green | ACTIVE / DELIVERED |
| .im-pill--red | INACTIVE / OVERDUE |
| .im-pill--blue | IN TRANSIT / SENT / FILED |
| .im-pill--amber | READY / ASSESSED |
| .im-pill--teal | DOCS RCVD |
| .im-pill--purple | CUSTOMS |
| .im-pill--gray | DRAFT / UNKNOWN |
