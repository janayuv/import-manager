# IPC invoke audit

> **Phase 0 failure metric:** raw `invoke` only in `boe-summary/client.tsx` or `item/form.tsx`; `error-memory.ts` is excluded and documented below as the intentional exception.

Living audit for IPC call-site hygiene. Update when files change. Bulk page migration tracked for Phase 4.

| File | Pattern | Call count | Priority | Owner | Removal target | Notes |
|------|---------|------------|----------|-------|----------------|-------|
| `src/lib/error-memory.ts` | raw `@tauri-apps/api/core` | 6 | P1 | Phase 4 (review) | **Intentional exception** | Used by `ipc-safe.ts` error capture loop; raw invoke avoids circular dependency |
| `src/lib/ipc-safe.ts` | wrapper (`tauriInvoke`) | 1 | — | — | N/A | Expected wrapper implementation |
| `src/components/boe-summary/client.tsx` | `safeInvoke as invoke` | 2 | P0 | BOE | **Phase 0 (fixed)** | Was raw invoke; migrated in Phase 0 |
| `src/components/item/form.tsx` | `safeInvoke as invoke` | 1 | P0 | Item Master | **Phase 0 (fixed)** | Was raw invoke; migrated in Phase 0 |
| `src/lib/automation-console.ts` | `safeInvoke as invoke` | 25 | P1 | Phase 4 / admin | Phase 4 bulk | High traffic admin automation |
| `src/pages/database-management.tsx` | `safeInvoke as invoke` | 20 | P1 | Phase 4 / DB admin | Phase 4 bulk | Power-user surface |
| `src/pages/shipment.tsx` | `safeInvoke as invoke` | 16 | P0 | Phase 4 / shipments | Phase 4 bulk | Daily operator path |
| `src/pages/supplier.tsx` | `safeInvoke as invoke` | 9 | P0 | Phase 4 / suppliers | Phase 4 bulk | Daily operator path |
| `src/pages/invoice.tsx` | `safeInvoke as invoke` | 5 | P0 | Phase 4 / invoices | Phase 4 bulk | Daily operator path |
| `src/pages/item.tsx` | `safeInvoke as invoke` | 5 | P0 | Phase 4 / items | Phase 4 bulk | Daily operator path |
| `src/lib/incident-management.ts` | `safeInvoke as invoke` | 5 | P2 | Phase 4 / workflow | Phase 4 bulk | Admin workflow |
| `src/pages/boe.tsx` | `safeInvoke as invoke` | 4 | P0 | Phase 4 / BOE | Phase 4 bulk | Daily operator path |
| `src/pages/admin/security-center.tsx` | `safeInvoke as invoke` | 4 | P2 | Phase 4 / security | Phase 4 bulk | Admin only |
| `src/lib/exception-workflow.ts` | `safeInvoke as invoke` | 4 | P2 | Phase 4 / workflow | Phase 4 bulk | Admin workflow |
| `src/pages/boe-entry.tsx` | `safeInvoke as invoke` | 3 | P0 | Phase 4 / BOE | Phase 4 bulk | Entry workflow |
| `src/pages/LoginPage.tsx` | `safeInvoke as invoke` | 3 | P1 | Phase 4 / auth | Phase 4 bulk | Login hot path |
| `src/components/expenses/expense-form.tsx` | `safeInvoke as invoke` | 3 | P1 | Phase 4 / expenses | Phase 4 bulk | Operator path |
| `src/lib/logger.ts` | `safeInvoke as invoke` | 3 | P2 | Phase 4 | Phase 4 bulk | Diagnostics |
| `src/components/expenses/shipment-selector.tsx` | `safeInvoke as invoke` | 3 | P1 | Phase 4 / expenses | Phase 4 bulk | Operator path |

## Phase 0 metric status

- [x] Zero raw invoke in `boe-summary/client.tsx` (uses `safeInvoke`)
- [x] Zero raw invoke in `item/form.tsx` (uses `safeInvoke`)
- [x] `error-memory.ts` documented as intentional exception (excluded from failure metric)

## Phase 4 backlog

Remaining files import `safeInvoke as invoke` but should be reviewed for consistent `ipcErrorMessage` handling and removal of any stray raw `invoke` imports during bulk migration. Regenerate row counts with:

```powershell
rg "invoke\(" src --glob "*.{ts,tsx}" -c | Sort-Object { [int]($_ -split ':')[-1] } -Descending
```
