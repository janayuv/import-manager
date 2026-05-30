# Import Manager — Premium Production Grade Application Plan

> **Version:** 0.4.10 · **Date:** 2026-05-30 · **Scope:** Windows-only Tauri 2 desktop app · **Operator model:** Single trusted owner, two PCs (home + office), shared SQLite database

---

## Executive Summary

Import Manager is a **feature-rich, locally-first desktop application** with strong foundations: 78 SQL migrations, 45+ Rust command modules, AES-256-GCM backups, RBAC, workflow/observability admin surfaces, and a mature CI pipeline on Windows runners. Core operational pages (Supplier, Shipment, Invoice, Item Master, BOE) have been migrated to the **Industrial Console** design system.

**Production grade** for this product does not mean multi-tenant SaaS scale—it means **reliability, data integrity, operator trust, and zero-surprise upgrades** for one owner running the same database on two machines. This plan closes the gap between “CI green” and “I trust this with my business data every day.”

### Target outcome (v1.0 production)

| Pillar | Definition of done |
|--------|-------------------|
| **Correctness** | Critical import workflows (shipment → invoice → BOE → expenses) verified by automated tests and manual operator checklist |
| **Data safety** | Backup/restore/sync across PCs is documented, tested, and recoverable within 15 minutes |
| **Consistency** | Industrial Console UX on all high-traffic surfaces; no debug tooling in release builds |
| **Observability** | Errors captured, actionable in-app; operator runbook covers every failure mode |
| **Release discipline** | Signed updater, changelog, rollback path, pre-release verification script |

---

## Current State Assessment

### Strengths (ship-ready foundations)

- **Domain completeness:** 30+ routes covering suppliers, shipments, invoices, items, BOE entry/summary, expenses stack, reports, frozen shipments, database admin, recycle bin, settings, and 9 admin consoles (`src/App.tsx`).
- **Backend depth:** Refinery migrations through V79, soft-delete pattern, audit logging, encrypted backups, Google Drive OAuth with keyring storage, scheduled backups, workflow/exception engines.
- **Security stack:** Strict CSP (`tauri.conf.json`), gitleaks in CI + pre-commit, cargo-deny, CodeQL, bcrypt session gate, RBAC permissions.
- **CI/CD:** `ci.yml` runs lint, typecheck, Rust fmt/clippy/deny, Vitest coverage, cargo test, Playwright subset, Tauri build on Windows.
- **Release pipeline:** `release.yml` on `v*` tags; updater artifacts configured in `tauri.conf.json`.
- **Industrial tables:** Supplier (reference), Shipment, Invoice, Item Master, BOE list — all using `im-table-shell` pattern.

### Gaps (production blockers & debt)

| ID | Gap | Impact | Evidence |
|----|-----|--------|----------|
| G1 | **Test coverage thin on frontend** | Regressions in UI/IPC chains undetected | 7 lib unit tests; no page/component coverage except reports |
| G2 | **CI E2E subset** | 16 of 24 Playwright specs not in `test:e2e:ci` | `package.json` scripts |
| G3 | **No Tauri-native E2E** | Stub mode (`VITE_PLAYWRIGHT=1`) misses real IPC/CSP/session | `playwright.config.ts` |
| G4 | **IPC convention drift** | Inconsistent error handling; raw `invoke` on hot paths | `shipment.tsx`, `LoginPage.tsx`, expenses |
| G5 | **Debug UI in production** | Expenses Debug tab exposes dev commands | `expenses.tsx` → `ExpenseDebug` |
| G6 | **Doc drift** | CLAUDE/AGENTS say v0.4.2, industrial pages “remaining” | vs code at v0.4.10 |
| G7 | **Orphan / duplicate routes** | Dead notifications page; duplicate `/frozen-shipments` | `notifications.tsx`, `App.tsx` |
| G8 | **Industrial UX incomplete** | Dashboard, expenses, reports, settings use legacy shells | grep for `im-page-header` |
| G9 | **Notification audit open** | Template/duplicate notification debt | `docs/implementation/CRITICAL_AUDIT_FINDINGS.md` |
| G10 | **Coverage not gated** | Codecov `fail_ci_if_error: false` | `.github/workflows/ci.yml` |
| G11 | **Hardcoded backend user** | `admin-001` TODO in expense paths | `src-tauri/src/expense.rs` |
| G12 | **React Query vs Context policy** | Architectural inconsistency | `@tanstack/react-query` in `main.tsx` + dashboard |

---

## Production Architecture Principles

These principles govern all work in this plan:

1. **Local-first, single-user** — No cloud auth servers, no multi-tenant complexity. Cross-PC consistency via shared DB file + encrypted backup sync.
2. **Soft-delete always** — User data never hard-deleted; recycle bin is the escape hatch.
3. **IPC as the only DB boundary** — All persistence through Rust commands; `safeInvoke` + `ipcErrorMessage` everywhere.
4. **Industrial Console on operator paths** — List pages and primary workflows share tokens from `table-industrial.css`.
5. **Release builds are boring** — No debug tabs, no `console.log`, no demo widgets.
6. **Evidence before ship** — Every phase ends with runnable verification (script + checklist).

---

## Phase Roadmap

### Phase 0 — Baseline & Hygiene (1 week)

**Goal:** Align documentation, repo health, and quick wins before feature polish.

| Task | Deliverable | Verification |
|------|-------------|--------------|
| 0.1 Update CLAUDE.md / AGENTS.md | Version 0.4.10, industrial status accurate, migration count | Doc review |
| 0.2 Fix route hygiene | Remove duplicate `/frozen-shipments`; wire `/notifications` | `npm run type-check`; route grep |
| 0.3 Remove debug from release | Relocate ExpenseDebug to Admin → System Tools | Visual + build inspect |
| 0.4 IPC audit spreadsheet | List all `invoke` call sites; prioritize top 20 by traffic | Grep report in `docs/audits/` |
| 0.5 Fix `admin-001` TODO | Pass real session user from desktop session in expense commands | `cargo test` expense module |
| 0.6 Strip stray `console.log` | `supplier.tsx`, `database-management.tsx` → logger or remove | ESLint / grep |

**Exit gate:** `npm run test:ci` green; no debug UI in `npm run build` output paths.

---

### Phase 1 — Test & Quality Gates (2–3 weeks)

**Goal:** Confidence that core business workflows cannot break silently.

#### 1A — Unit test expansion (Vitest)

Priority modules (pure logic, high blast radius):

| Module | Why | Target file |
|--------|-----|-------------|
| `financial.ts` | Duty/tax calculations | extend existing tests |
| `parse-percentage.ts` | Invoice tax snapshots | new `parse-percentage.test.ts` |
| `multiline-paste.ts` | Invoice wizard paste | new test file |
| `csv-helpers.ts` | Item master import | new test file |
| `auth.ts` / `permissions.ts` | Session + RBAC | extend permissions tests |
| `ipc-error.ts` | Error parsing | new test file |
| `date-format.ts` | Display/input consistency | new test file |

**Coverage thresholds (add to `vitest.config.ts`):**

```ts
coverage: {
  thresholds: {
    lines: 60,
    functions: 55,
    branches: 50,
    statements: 60,
  },
  // Per-file overrides for critical lib:
  // financial.ts, permissions.ts → 85%+
}
```

#### 1B — E2E expansion

| Tier | Specs | When |
|------|-------|------|
| **CI required** | Add `accessibility.spec.ts`, `ui-settings.spec.ts`, `ui-dashboard.spec.ts` | Phase 1 |
| **Nightly** | Full `npm run test:e2e` (all 24 specs) | Already in `nightly.yml` — enforce failure alerts |
| **Pre-release manual** | Operator checklist (see Appendix A) | Every release |

#### 1C — Rust integration tests

- Add command-level tests for: backup restore round-trip, recycle bin restore, BOE calculation snapshot, expense duplicate detection.
- Migration test: fresh DB → apply all migrations → seed smoke data.

**Exit gate:** Vitest thresholds enforced in CI; E2E CI count ≥ 12 specs; `cargo test` coverage report for new integration tests.

---

### Phase 2 — UX & Industrial Console Completion (3–4 weeks)

**Goal:** Cohesive operator experience across daily workflows.

#### 2A — Industrial shell adoption

| Page | Work |
|------|------|
| **Dashboard** | `im-page-header`, monospace KPI labels, status bar for loaded widgets |
| **Expenses** | Header + tab strip aligned to industrial tokens; remove card-heavy chrome |
| **Reports** | Toolbar + table shell for tabular outputs |
| **Settings** | Section headers monospace; preserve theme picker quality |
| **Frozen shipments** | Full industrial table (reuse shipment patterns) |
| **Recycle bin** | Industrial table + status pills for entity type |

Reference: `src/components/supplier/table-industrial.tsx` + `table-industrial.css`.

#### 2B — Wizard & form polish (non-table flows)

- Invoice wizard: consistent step indicator, field error surfacing via `ipcErrorMessage`.
- BOE entry: keyboard navigation audit; sticky totals bar.
- Database management: split “operator” vs “power user” tabs; reduce visual noise.

#### 2C — Accessibility (WCAG 2.2 AA target for operator paths)

- Focus rings on industrial row actions (hover-only → keyboard visible).
- Status pills: not color-only (text labels already uppercase — verify contrast).
- Run `tests/accessibility.spec.ts` in CI.

**Exit gate:** All list pages use `im-table-shell`; accessibility spec in CI; operator sign-off on home + office machines.

---

### Phase 3 — Data Integrity & Cross-PC Operations (2 weeks)

**Goal:** Owner can move DB between home and office without fear.

| Task | Detail |
|------|--------|
| 3.1 **Backup playbook** | Document: manual backup, scheduled backup, Drive upload, restore on second PC |
| 3.2 **Restore drill** | Automated test: create DB → backup → wipe → restore → verify row counts |
| 3.3 **Conflict policy** | Document single-writer rule: never open same DB on two PCs simultaneously |
| 3.4 **Encryption key export** | Verify key export/import UI with runbook section in `docs/OPERATOR_RUNBOOK.md` |
| 3.5 **Migration safety** | Pre-upgrade hook: backup prompt before app starts after version bump |
| 3.6 **Drift detection** | Run `npm run generate:drift-report` in release pipeline |

**Exit gate:** Operator completes restore drill twice (home → office simulation); runbook signed off.

---

### Phase 4 — Security Hardening (1–2 weeks)

**Goal:** Production credentials and defense-in-depth for a single-owner app.

| Task | Detail |
|------|--------|
| 4.1 **Change default admin** | Enforce `VITE_ADMIN_PASSWORD_HASH` in release build verification (`prebuild:verify`) |
| 4.2 **IPC migration** | Convert remaining raw `invoke` to `safeInvoke`; standardize toast on `ipcErrorMessage` |
| 4.3 **CSP audit** | Verify no new `connect-src` or script sources after Phase 2 UI work |
| 4.4 **Secret scan** | gitleaks required pass (already CI); add local `npm run security:gitleaks` to release script |
| 4.5 **Dependency audit** | cargo-deny + npm audit in `release:local` script |
| 4.6 **Resolve notification audit** | Close or accept items in `CRITICAL_AUDIT_FINDINGS.md` with dated decision log |

**Exit gate:** `npm run release:local` passes; no HIGH npm/cargo advisories without documented acceptance.

---

### Phase 5 — Performance & Observability (1–2 weeks)

**Goal:** Large datasets (1000+ shipments/items) remain responsive; failures are visible.

| Task | Detail |
|------|--------|
| 5.1 **Table virtualization** | Audit TanStack tables for pagination defaults; virtualize if >500 rows common |
| 5.2 **IPC pagination** | Ensure all list commands use limit/offset; no unbounded fetches |
| 5.3 **Dashboard cache** | Verify background cache thread TTL; document invalidation |
| 5.4 **Perf baselines** | Enforce `npm run test:performance` in nightly; alert on regression |
| 5.5 **Error memory** | Wire `V78__error_memory.sql` data into Error Center admin UI if not fully surfaced |
| 5.6 **Web Vitals** | Review `src/lib/performance/index.ts` thresholds for desktop (adjust CLS/LCP for Tauri) |

**Exit gate:** Performance budget script passes; p95 list load < 500ms on reference dataset (1000 suppliers).

---

### Phase 6 — Release Engineering & v1.0 (1 week)

**Goal:** Repeatable, signed, documented releases.

| Task | Detail |
|------|--------|
| 6.1 **Updater signing** | Configure `TAURI_PRIVATE_KEY` in GitHub secrets; test delta update home → office |
| 6.2 **Changelog automation** | Conventional commits or release notes template in `CHANGELOG.md` |
| 6.3 **Version bump script** | Single command syncs `package.json`, `Cargo.toml`, `tauri.conf.json` |
| 6.4 **Pre-release checklist** | Extend `scripts/local-release-check.ps1` with full gate list |
| 6.5 **MSI + NSIS smoke** | Install fresh on clean VM; launch; login; one CRUD cycle per module |
| 6.6 **Tag v1.0.0** | GitHub release with artifacts, changelog, operator runbook link |

**Exit gate:** Successful auto-update test; clean install test; tagged release published.

---

## Optional Phase 7 — Tauri-Native E2E (future)

Playwright stub mode cannot validate WebView2 + real SQLite + keyring. For maximum confidence:

- Add `tests/tauri/` using Tauri WebDriver or custom harness launching `tauri dev` with test DB.
- Scope: login, one supplier CRUD, backup command — 3 smoke tests.
- Run weekly (not every PR) due to Windows runner cost.

---

## Quality Gates (Definition of Production Ready)

All must pass before declaring **Production Grade**:

```
□ npm run type-check
□ npm run lint
□ npm run test:ci (with coverage thresholds)
□ cd src-tauri && cargo test && cargo clippy -- -D warnings
□ npm run test:e2e (full suite)
□ npm run test:performance
□ npm run release:local
□ Manual operator checklist (Appendix A)
□ Restore drill documented and executed
□ No DEBUG UI in production bundle
□ Admin password not default hash
□ CHANGELOG + version aligned
```

---

## Success Metrics

| Metric | Baseline (now) | Target (v1.0) |
|--------|----------------|---------------|
| Vitest line coverage (`src/lib`) | ~15% est. | ≥ 60% global; ≥ 85% financial/permissions |
| Playwright specs in CI | 8 | ≥ 12 |
| Raw `invoke` call sites | ~dozens | 0 outside ipc-safe wrapper |
| Industrial pages | 5 list pages | All operator list pages + dashboard header |
| P95 list load (1000 rows) | unmeasured | < 500ms |
| Restore drill success | ad hoc | 100% documented path |
| Release cycle | manual | Script-driven ≤ 30 min |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Simultaneous DB open on two PCs | Medium | **Critical** (corruption) | Runbook + startup warning if lock file detected |
| Stub E2E misses IPC bugs | Medium | High | Phase 1 Rust integration tests; optional Phase 7 |
| Migration failure on upgrade | Low | **Critical** | Auto-backup before migrate; migration tests in CI |
| Google Drive token expiry | Medium | Medium | Clear re-auth UI; offline mode fully functional |
| Industrial redesign scope creep | High | Medium | Phase 2 limited to shell/tokens, not feature rewrites |
| Default password in prod | Low | **Critical** | `prebuild:verify` hard fail |

---

## Team & Execution Model

For single-owner + AI-assisted development:

| Role | Responsibility |
|------|----------------|
| **Operator (you)** | Sign-off on workflows, restore drills, daily-use friction |
| **Implementer (agent/dev)** | Phases 0–6 tasks, tests first on logic changes |
| **Release owner** | Tag, changelog, updater keys |

**Recommended cadence:** One phase per sprint; no parallel phase work that touches the same pages.

---

## Appendix A — Operator Pre-Release Checklist

Manual verification on **both** target PCs (or VM simulating each):

- [ ] Login with production password
- [ ] Create supplier → shipment → invoice line → BOE entry → expense line
- [ ] CSV import item master (small file)
- [ ] Run report export
- [ ] Manual backup → verify `.enc` file exists
- [ ] Restore to test path → verify counts
- [ ] Soft-delete + recycle bin restore
- [ ] Settings: theme switch, date format persists after restart
- [ ] Updater check (if configured)
- [ ] Google Drive connect/disconnect (if used)

---

## Appendix B — File Reference Map

| Concern | Primary files |
|---------|---------------|
| Routes | `src/App.tsx` |
| Industrial CSS | `src/components/supplier/table-industrial.css` |
| IPC safety | `src/lib/ipc-safe.ts`, `src/lib/ipc-error.ts` |
| Auth | `src/lib/auth.ts`, Rust session commands |
| Backups | `src-tauri/src/utils/encryption.rs`, backup commands |
| CI | `.github/workflows/ci.yml`, `nightly.yml`, `release.yml` |
| E2E | `tests/`, `playwright.config.ts` |
| Release | `scripts/local-release-check.ps1`, `scripts/build-with-check.ps1` |
| Operator docs | `docs/OPERATOR_RUNBOOK.md`, `docs/SECURITY.md` |
| IPC audit | `docs/audits/ipc-invoke-audit.md` |

---

## Recommended Execution Order (Summary)

```
Phase 0 Hygiene → Phase 1 Tests → Phase 3 Data (parallel start after 1A)
                → Phase 2 UX (after 1A unit tests protect calculations)
                → Phase 4 Security → Phase 5 Performance → Phase 6 Release
```

**Estimated timeline:** 10–14 weeks at sustainable pace for one operator + implementer.

---

*This plan is the single source of truth for production readiness. Update section “Current State Assessment” when phases complete.*
