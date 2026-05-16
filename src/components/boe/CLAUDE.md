# BOE Module — Developer Reference

Bill of Entry (BOE) covers three workflows:

1. **BOE Master** (`/boe`) — CRUD for official BE records from customs.
2. **BOE Entry** (`/boe-entry`) — duty-calculation workspace; user enters rates and saves a `SavedBoe`.
3. **BOE Summary** (`/boe-summary`) — read-only reconciliation dashboard; compares calculated duty vs actual shipment rates.

---

## Table of Contents

1. [TypeScript Types](#typescript-types)
2. [Pages](#pages)
3. [Components — boe/](#components--boe)
4. [Components — boe-entry/](#components--boe-entry)
5. [Components — boe-summary/](#components--boe-summary)
6. [Utilities — duty-calculator.ts](#utilities--duty-calculatorts)
7. [Utilities — financial.ts](#utilities--financialts)
8. [Utilities — ipc-safe.ts](#utilities--ipc-safets)
9. [Utilities — tauri-bridge.ts](#utilities--tauri-bridgets)
10. [Utilities — settings.ts](#utilities--settingsts)
11. [Rust Commands](#rust-commands)
12. [Database Schema](#database-schema)
13. [Frontend ↔ Backend Data Flow](#frontend--backend-data-flow)

---

## TypeScript Types

### `src/types/boe.ts`

```ts
interface BoeDetails {
  id: string;
  beNumber: string;
  beDate: string; // ISO date string
  location: string;
  totalAssessmentValue: number;
  dutyAmount: number;
  paymentDate?: string; // ISO date string
  dutyPaid?: number;
  challanNumber?: string;
  refId?: string;
  transactionId?: string;
}
```

### `src/types/boe-entry.ts`

```ts
// Calculation inputs per line item
interface BoeItemInput {
  partNo: string;
  calculationMethod: 'Standard' | 'CEPA' | 'Rodtep';
  boeBcdRate: number; // percentage, e.g. 7.5
  boeSwsRate: number; // percentage of BCD
  boeIgstRate: number; // percentage
}

// One calculated row returned by calculateDuties()
interface CalculatedDutyItem {
  partNo: string;
  description: string;
  assessableValue: number; // INR
  bcdValue: number; // INR
  swsValue: number; // INR
  igstValue: number; // INR
}

interface CalculationResult {
  calculatedItems: CalculatedDutyItem[];
  bcdTotal: number; // INR, rounded to whole rupee
  swsTotal: number;
  igstTotal: number;
  interest: number;
  customsDutyTotal: number; // BCD+SWS+IGST+interest, whole rupee
}

type BoeStatus =
  | 'Awaiting BOE Data'
  | 'Discrepancy Found'
  | 'Reconciled'
  | 'Investigation'
  | 'Closed';

interface SavedBoe {
  id: string;
  shipmentId: string;
  boeId?: string; // FK into BoeDetails.id (optional link)
  invoiceNumber: string;
  supplierName: string;
  status: BoeStatus;
  formValues: {
    supplierName: string;
    shipmentId: string;
    exchangeRate: number; // INR per foreign-currency unit
    freightCost: number; // INR
    exwCost: number; // INR
    insuranceRate: number; // percentage of (itemValueINR + exwCost)
    interest?: number; // INR, added flat to total duty
  };
  itemInputs: BoeItemInput[];
  calculationResult: CalculationResult;
  attachments?: Attachment[];
}

interface Attachment {
  id: string;
  documentType: string; // e.g. 'BOE Scan'
  fileName: string;
  url: string;
  uploadedAt: string; // ISO date string
}

interface Shipment {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number; // foreign currency
  invoiceCurrency: string;
  incoterm: string; // 'CIF' disables freight/EXW/insurance fields
  status: string;
  items: InvoiceItem[];
}

interface InvoiceItem {
  partNo: string;
  description: string;
  qty: number;
  unitPrice: number;
  hsCode: string;
  lineTotal: number;
  actualBcdRate: number; // percentage — from customs tariff
  actualSwsRate: number;
  actualIgstRate: number;
}
```

---

## Pages

### `src/pages/boe.tsx` — BOE Master

**Routes:** `/boe`, `/boe/new`, `/boe/:boeId/view`, `/boe/:boeId/edit`

**Exports:**

- `boeDetailPath(boeId: string, mode: 'view' | 'edit'): string`
- `boeNewPath: '/boe/new'`

**State:**

| useState variable    | Type                                     | Purpose                                              |
| -------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `boes`               | `BoeDetails[]`                           | Current page of BOE records                          |
| `totalCount`         | `number`                                 | Total rows for pagination                            |
| `page`               | `number`                                 | Current page (1-indexed)                             |
| `pageSize`           | `number`                                 | From `settings.modules.boe.itemsPerPage`, default 50 |
| `loading`            | `boolean`                                | Skeleton/spinner flag                                |
| `isDeleteDialogOpen` | `boolean`                                | Controls delete `AlertDialog`                        |
| `boeToDelete`        | `{ id: string; number: string } \| null` | Pending delete target                                |

**useMemo:**

- `boePanel` — derives `'none' | 'view' | 'edit' | 'add'` from `location.pathname`
- `decodedBoeId` — URL-decoded `:boeId` param
- `selectedBoeFromUrl` — `BoeDetails` matching the URL param, looked up from `boes`

**useEffect triggers:**

| Trigger                                | Action                                                 |
| -------------------------------------- | ------------------------------------------------------ |
| `[fetchData]` (on mount + page change) | Calls `get_boes_paginated` → sets `boes`, `totalCount` |

**Tauri commands invoked:**

| Command                                  | When                     |
| ---------------------------------------- | ------------------------ |
| `get_boes_paginated({ page, pageSize })` | On mount and page change |
| `add_boe({ payload })`                   | Form submit (new)        |
| `update_boe({ boe })`                    | Form submit (edit)       |
| `delete_boe({ id })`                     | Delete confirm           |

**Additional features:**

- **CSV import:** `openTextFile()` from `tauri-bridge.ts` (native dialog in Tauri, hidden `<input type="file">` in browser) → `Papa.parse()` → validates `beNumber` not blank → loops `invoke('add_boe')` per row → `fetchData()` refresh.
- **CSV export:** `Papa.unparse(boes)` → `save()` from `tauri-bridge.ts` (native save dialog) or browser `<a download>` blob fallback.
- **Template download:** always uses browser `<a download>` blob (no Tauri dialog) — produces a CSV with header row only.

---

### `src/pages/boe-entry.tsx` — BOE Entry / Calculation

**Routes:** `/boe-entry`, `/boe-entry/new`, `/boe-entry/:savedBoeId/view`, `/boe-entry/:savedBoeId/edit`

**Exports:**

- `boeEntryDetailPath(savedBoeId: string, mode: 'view' | 'edit'): string`
- `boeEntryNewPath: '/boe-entry/new'`

**State:**

| useState variable | Type               | Purpose                                |
| ----------------- | ------------------ | -------------------------------------- |
| `shipments`       | `Shipment[]`       | Available shipments (no saved BOE yet) |
| `savedBoes`       | `SavedBoe[]`       | Paginated list of saved calculations   |
| `allBoes`         | `BoeDetails[]`     | Full BOE master list (for linking)     |
| `isLoading`       | `boolean`          | Initial load skeleton                  |
| `deletingBoe`     | `SavedBoe \| null` | Controls `DeleteConfirmDialog`         |
| `savedBoePage`    | `number`           | Pagination page for saved calculations |
| `savedBoeTotal`   | `number`           | Total saved calc count                 |

**useMemo:**

- `entryPanel` — `'none' | 'view' | 'edit' | 'add'` from `location.pathname`
- `decodedSavedBoeId` — URL-decoded `:savedBoeId`
- `selectedSavedBoeFromUrl` — `SavedBoe` matching URL param

**useEffect triggers:**

| Trigger                                          | Action                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `[fetchData]` (on mount + `savedBoePage` change) | Parallel: `get_shipments_for_boe_entry_paginated`, `get_boe_calculations_paginated`, `get_boes_paginated` |

**Tauri commands invoked:**

| Command                                                                | When                   |
| ---------------------------------------------------------------------- | ---------------------- |
| `get_shipments_for_boe_entry_paginated({ page: 1, pageSize: 100 })`    | On mount               |
| `get_boe_calculations_paginated({ page: savedBoePage, pageSize: 50 })` | On mount + page change |
| `get_boes_paginated({ page: 1, pageSize: 100 })`                       | On mount               |
| `add_boe_calculation({ payload })`                                     | Form save (new)        |
| `update_boe_calculation({ payload })`                                  | Form save (edit)       |
| `delete_boe_calculation({ id })`                                       | Delete confirm         |

---

### `src/pages/boe-summary.tsx` — BOE Reconciliation Summary

**Routes:** `/boe-summary`, `/boe-summary/:savedBoeId`

**Exports:**

- `boeSummaryPath(savedBoeId: string): string`

**State:**

| useState variable | Type           | Purpose                         |
| ----------------- | -------------- | ------------------------------- |
| `savedBoes`       | `SavedBoe[]`   | All saved calculations          |
| `shipments`       | `Shipment[]`   | All shipments (for rate lookup) |
| `allBoes`         | `BoeDetails[]` | BOE master records              |
| `isLoading`       | `boolean`      | Loading skeleton                |

**useMemo:**

- `decodedSavedBoeId` — URL-decoded `:savedBoeId`
- `urlBoeNotFound` — true if param present but not in `savedBoes`

**useEffect triggers:**

| Trigger           | Action                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| `[]` (mount only) | Parallel: `get_shipments_for_boe_summary`, `get_boe_calculations`, `get_boes` |

**Tauri commands invoked:**

| Command                           | When     |
| --------------------------------- | -------- |
| `get_shipments_for_boe_summary()` | On mount |
| `get_boe_calculations()`          | On mount |
| `get_boes()`                      | On mount |

`BoeSummaryClient` is lazy-loaded (`React.lazy`) and receives data as props. Status updates via `update_boe_status` are invoked inside `BoeSummaryClient`.

---

## Components — `boe/`

### `src/components/boe/form.tsx` — `BoeForm`

**Props:**

| Prop           | Type                                                  | Description                                             |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `isOpen`       | `boolean`                                             | Controls dialog visibility (ignored in page mode)       |
| `onOpenChange` | `(isOpen: boolean) => void`                           | Dialog open/close callback                              |
| `onSubmit`     | `(data: Omit<BoeDetails, 'id'>, id?: string) => void` | Called with form data; `id` present when editing        |
| `boeToEdit`    | `BoeDetails \| null \| undefined`                     | Pre-fills form when editing; `null`/`undefined` = new   |
| `existingBoes` | `BoeDetails[]`                                        | Used for duplicate BE number+date validation            |
| `presentation` | `'dialog' \| 'page'`                                  | Default `'dialog'`; `'page'` renders a full `<section>` |
| `className`    | `string \| undefined`                                 | Extra CSS on the root element                           |

**Internal state:**

| useState variable | Type                        | Initial                          |
| ----------------- | --------------------------- | -------------------------------- |
| `formData`        | `FormState`                 | `initialFormState` (all empty/0) |
| `errors`          | `{ [key: string]: string }` | `{}`                             |

**useEffect triggers:**

| Deps                   | Action                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[boeToEdit, visible]` | If `boeToEdit` exists, populates `formData` from it (dates formatted via `formatDateForInput`). If no `boeToEdit` and form is visible, resets to `initialFormState`. |

**No Tauri calls** — all mutations delegated to `onSubmit` callback in the page.

**Validation rules:** `beNumber` required, `beDate` required, `location` required, duplicate check on `(beNumber, beDate)` against `existingBoes`.

---

### `src/components/boe/columns.tsx` — `getBoeColumns`

Not a component; a factory function.

```ts
getBoeColumns({
  onView: (boe: BoeDetails) => void;
  onEdit: (boe: BoeDetails) => void;
  onDelete: (boe: BoeDetails) => void;
  settings?: AppSettings;
}): ColumnDef<BoeDetails>[]
```

Reads `settings.modules.boe.fields[key].visible` and `.order` to filter and sort columns. Uses `getFieldConfig('boe', fieldName)` for per-field text/number formatting. Always includes the `actions` column last.

---

### `src/components/boe/view.tsx` — `BoeViewDialog`

**Props:**

| Prop           | Type                        | Description                                  |
| -------------- | --------------------------- | -------------------------------------------- |
| `isOpen`       | `boolean`                   | Dialog open state                            |
| `onOpenChange` | `(isOpen: boolean) => void` | Dialog close callback                        |
| `boe`          | `BoeDetails \| null`        | Record to display; renders nothing if `null` |
| `presentation` | `'dialog' \| 'page'`        | Default `'dialog'`                           |
| `className`    | `string \| undefined`       | Extra CSS                                    |
| `onEdit`       | `() => void \| undefined`   | Shows "Edit BOE" button when provided        |

**No state, no effects, no Tauri calls.** Pure display component.

---

### `src/components/boe/actions.tsx` — `BoeActions`

**Props:**

| Prop       | Type                                        | Description                         |
| ---------- | ------------------------------------------- | ----------------------------------- |
| `boe`      | `BoeDetails`                                | Row data                            |
| `onView`   | `(boe: BoeDetails) => void`                 | View callback                       |
| `onEdit`   | `(boe: BoeDetails) => void`                 | Edit callback                       |
| `onDelete` | `(boeId: string, beNumber: string) => void` | Delete callback (passes id + label) |

**No state, no effects, no Tauri calls.**

---

### `src/components/boe/select.tsx` — Select primitives

Thin styled wrappers around `@radix-ui/react-select` primitives. No custom props — each export passes all props through to the underlying Radix component.

**Exports:**

| Export            | Radix primitive             | Notes                                                            |
| ----------------- | --------------------------- | ---------------------------------------------------------------- |
| `Select`          | `SelectPrimitive.Root`      | Re-exported directly (no wrapper)                                |
| `SelectGroup`     | `SelectPrimitive.Group`     | Re-exported directly                                             |
| `SelectValue`     | `SelectPrimitive.Value`     | Re-exported directly                                             |
| `SelectTrigger`   | `SelectPrimitive.Trigger`   | Adds border/focus ring styles; appends `ChevronDown` icon        |
| `SelectContent`   | `SelectPrimitive.Content`   | Wraps in `Portal`; handles `position='popper'` translate offsets |
| `SelectLabel`     | `SelectPrimitive.Label`     | Adds padding/font-semibold styles                                |
| `SelectItem`      | `SelectPrimitive.Item`      | Adds `Check` icon indicator on the selected item                 |
| `SelectSeparator` | `SelectPrimitive.Separator` | Thin horizontal rule                                             |

**No internal state, no effects, no Tauri calls.**

---

### `src/components/boe/data-table.tsx` + `data-table-pagination.tsx`

Thin wrappers around `ResponsiveDataTable` and pagination UI. Pass-through; no internal logic.

---

## Components — `boe-entry/`

### `src/components/boe-entry/form.tsx` — `BoeEntryForm`

**Props:**

| Prop                 | Type                              | Description                                                                 |
| -------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `shipments`          | `Shipment[]`                      | Available shipments to pick from                                            |
| `allBoes`            | `BoeDetails[]`                    | Full BOE master list for optional linking                                   |
| `savedBoes`          | `SavedBoe[]`                      | Existing saved calculations (for filtering out already-used BOE IDs)        |
| `onSaveOrUpdate`     | `(boeData: SavedBoe) => void`     | Called after user clicks "Save BOE" / "Update BOE"                          |
| `initialData`        | `SavedBoe \| null`                | Pre-populates form when editing; `null` = new                               |
| `onCancelEdit`       | `() => void`                      | Cancel button callback (edit mode only)                                     |
| `setEditingBoe`      | `(boe: SavedBoe \| null) => void` | Optional; used after CSV override import to set a draft state in the parent |
| `presetSupplierName` | `string \| undefined`             | Auto-selects a supplier on mount                                            |
| `presetShipmentId`   | `string \| undefined`             | Auto-selects a shipment on mount                                            |

**Internal state:**

| useState variable     | Type                        | Purpose                                                                                     |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `suppliers`           | `string[]`                  | Deduplicated supplier list derived from `shipments`                                         |
| `availableInvoices`   | `Shipment[]`                | Shipments for the selected supplier                                                         |
| `selectedShipment`    | `Shipment \| null`          | The shipment chosen by the user                                                             |
| `itemInputs`          | `BoeItemInput[]`            | Per-item rate inputs; initialised from shipment actual rates                                |
| `calculationResult`   | `CalculationResult \| null` | Output of `calculateDuties()`; `null` until calculated                                      |
| `lastValidFormValues` | `FormValues \| null`        | RHF values snapshot at last successful submit                                               |
| `overrideFile`        | `File \| null`              | Optional CSV rate-override file                                                             |
| `selectedBoeId`       | `string`                    | ID of linked `BoeDetails` record                                                            |
| `selectedBoeDetails`  | `BoeDetails \| null`        | Full `BoeDetails` for the linked BOE                                                        |
| `isCif`               | `boolean`                   | True when selected shipment has `incoterm === 'CIF'`; disables freight/EXW/insurance inputs |

**React Hook Form schema (Zod):**

| Field           | Type                  | Default | Validation      |
| --------------- | --------------------- | ------- | --------------- |
| `supplierName`  | `string`              | `''`    | min 1           |
| `shipmentId`    | `string`              | `''`    | min 1           |
| `exchangeRate`  | `number`              | `83.5`  | min 0           |
| `freightCost`   | `number`              | `0`     | min 0           |
| `exwCost`       | `number`              | `0`     | min 0           |
| `insuranceRate` | `number`              | `0.015` | min 0           |
| `interest`      | `number \| undefined` | `0`     | min 0, optional |

**useEffect triggers:**

| Deps                                                           | Action                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[selectedShipment, form]`                                     | If CIF shipment selected, sets `freightCost`, `exwCost`, `insuranceRate` to 0 and sets `isCif` flag                                                                       |
| `[shipments, settings.textFormat]`                             | Rebuilds deduplicated `suppliers` list                                                                                                                                    |
| `[initialData, shipments, allBoes, form, settings.textFormat]` | When editing: resets RHF to `initialData.formValues`, re-filters `availableInvoices`, sets `selectedShipment`, `itemInputs`, `calculationResult`, `selectedBoeId/Details` |
| `[presetSupplierName, presetShipmentId, ...]`                  | On mount (new mode only): calls `handleSupplierChange` / `handleInvoiceChange` for preset values                                                                          |

**No direct Tauri calls.** All saves delegated via `onSaveOrUpdate` to the parent page.

**Key logic:**

- On form submit: parses optional override CSV → merges with defaults → calls `calculateDuties()` locally → sets `calculationResult`.
- BCD discrepancy check: `boeBcdRate > actualBcdRate` shows `toast.error` and blocks save.
- Duty-paid validation: if a linked `BoeDetails` has `dutyPaid`, it must equal `calculationResult.customsDutyTotal` (±0.01) before save is allowed.

---

### `src/components/boe-entry/items-table.tsx` — `ItemsTable`

**Props:**

| Prop            | Type                                       | Description                             |
| --------------- | ------------------------------------------ | --------------------------------------- |
| `items`         | `InvoiceItem[]`                            | Read-only shipment items (actual rates) |
| `itemInputs`    | `BoeItemInput[]`                           | Editable BOE rate inputs                |
| `setItemInputs` | `Dispatch<SetStateAction<BoeItemInput[]>>` | Update callback                         |

**Internal state:**

| useState variable | Type     | Purpose                                       |
| ----------------- | -------- | --------------------------------------------- |
| `scrollTop`       | `number` | Current scroll position for virtual rendering |
| `viewportHeight`  | `number` | Container height for virtual rendering        |

**useEffect triggers:**

| Deps                  | Action                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| `[]` (mount)          | Attaches `resize` event listener on the container ref to update `viewportHeight`    |
| `[items, itemInputs]` | Validates all rows on load; shows `toast.error` if any `boeBcdRate > actualBcdRate` |

**Virtualisation:** Rows > 25 use manual virtual rendering with `rowHeight = 60px`, `overscan = 6`.

**No Tauri calls.** `boeIgstRate` input is read-only (disabled in UI).

---

### `src/components/boe-entry/calculation-results.tsx` — `CalculationResults`

**Props:**

| Prop      | Type      | Description                                                      |
| --------- | --------- | ---------------------------------------------------------------- |
| `results` | `unknown` | Accepts a `CalculationResult`-shaped object; uses safe accessors |

**No state, no effects, no Tauri calls.**

Renders three cards: BCD/SWS/IGST totals summary, per-item breakdown table, and exchange rate / calculation date.

---

### `src/components/boe-entry/saved-boe-list.tsx` — `SavedBoeList`

**Props:**

| Prop        | Type                      | Description     |
| ----------- | ------------------------- | --------------- |
| `savedBoes` | `SavedBoe[]`              | List to display |
| `onView`    | `(boeId: string) => void` | View callback   |
| `onEdit`    | `(boeId: string) => void` | Edit callback   |
| `onDelete`  | `(boeId: string) => void` | Delete callback |

**Internal state:**

| useState variable | Type     | Purpose                               |
| ----------------- | -------- | ------------------------------------- |
| `scrollTop`       | `number` | Scroll position for virtual rendering |
| `viewportHeight`  | `number` | Container height                      |

**useEffect triggers:**

| Deps         | Action                                                |
| ------------ | ----------------------------------------------------- |
| `[]` (mount) | Attaches `resize` listener to update `viewportHeight` |

**Virtualisation:** Rows > 20 use manual virtual rendering with `rowHeight = 56px`, `overscan = 6`.

Returns `null` when `savedBoes.length === 0`.

---

### `src/components/boe-entry/boe-details-table.tsx` — `BoeDetailsTable`

**Props:**

| Prop  | Type         | Description          |
| ----- | ------------ | -------------------- |
| `boe` | `BoeDetails` | BOE record to render |

**No state, no effects, no Tauri calls.** Displays BE date, location, assessment value, duty paid.

---

### `src/components/boe-entry/view-boe-dialog.tsx` — `ViewBoeDialog`

**Props:**

| Prop           | Type                      | Description                     |
| -------------- | ------------------------- | ------------------------------- |
| `boe`          | `SavedBoe`                | Calculation to display          |
| `onClose`      | `() => void`              | Close callback                  |
| `presentation` | `'dialog' \| 'page'`      | Default `'dialog'`              |
| `className`    | `string \| undefined`     | Extra CSS                       |
| `onEdit`       | `() => void \| undefined` | Shows "Edit calculation" button |

**No state, no effects, no Tauri calls.** Delegates to `CalculationResults`.

---

### `src/components/boe-entry/delete-confirm-dialog.tsx` — `DeleteConfirmDialog`

**Props:**

| Prop        | Type         | Description                                             |
| ----------- | ------------ | ------------------------------------------------------- |
| `boe`       | `SavedBoe`   | Record to be deleted (shows `invoiceNumber` in message) |
| `onConfirm` | `() => void` | Confirm callback                                        |
| `onCancel`  | `() => void` | Cancel callback                                         |

**No state, no effects, no Tauri calls.**

---

### `src/components/boe-entry/columns.tsx`, `data-table.tsx`, `actions.tsx`

Column definitions, table wrapper, and row-action buttons for `SavedBoeList`. No internal logic.

---

## Components — `boe-summary/`

### `src/components/boe-summary/client.tsx` — `BoeSummaryClient`

**Props:**

| Prop                | Type             | Description                              |
| ------------------- | ---------------- | ---------------------------------------- |
| `savedBoes`         | `SavedBoe[]`     | All saved calculations                   |
| `shipments`         | `Shipment[]`     | All shipments                            |
| `allBoes`           | `BoeDetails[]`   | BOE master records                       |
| `initialSavedBoeId` | `string \| null` | Pre-selects a saved BOE (from URL param) |

**Internal state:**

| useState variable   | Type                                | Purpose                                       |
| ------------------- | ----------------------------------- | --------------------------------------------- |
| `selectedSupplier`  | `string`                            | Supplier filter dropdown                      |
| `selectedInvoiceId` | `string`                            | Selected `SavedBoe.id`                        |
| `statusFilter`      | `string`                            | Status dropdown; `'All'` = no filter          |
| `pendingStatus`     | `string`                            | Local pending value for status update UI      |
| `isUpdatingStatus`  | `boolean`                           | Spinner flag during `update_boe_status` call  |
| `boeOverrides`      | `Record<string, Partial<SavedBoe>>` | Optimistic local overrides for status updates |

**useMemo:**

- `mergedSavedBoes` — merges `savedBoes` with `boeOverrides` (optimistic updates)
- `suppliers` — distinct supplier names from `mergedSavedBoes`
- `availableInvoices` — `SavedBoe[]` filtered by `selectedSupplier` + `statusFilter`
- `selectedData` — full computation for the selected `SavedBoe`: totals, linked shipment, linked `BoeDetails`
- `shipmentQuantityMap` — `Record<partNo, qty>` from `selectedData.shipment.items`
- `shipmentRatesMap` — `Record<partNo, { bcdRate, swsRate, igstRate }>` from shipment items
- `methodByPartMap` — `Record<partNo, CalculationMethod>` from `selectedData.savedBoe.itemInputs`

**useEffect triggers:**

| Deps                                                           | Action                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `[selectedData?.savedBoe?.id, selectedData?.savedBoe?.status]` | Syncs `pendingStatus` to current selection                                    |
| `[initialSavedBoeId, mergedSavedBoes]`                         | On deep-link: finds the BOE and sets `selectedSupplier` + `selectedInvoiceId` |
| `[initialSavedBoeId]`                                          | When `initialSavedBoeId` is cleared, resets `selectedInvoiceId`               |

**Tauri commands invoked:**

| Command                             | When                                           |
| ----------------------------------- | ---------------------------------------------- |
| `update_boe_status({ id, status })` | User saves a new status in the status dropdown |

**Sub-components (file-private):**

- `ItemDetailsTable` — renders per-item duty breakdown; calls `computePerUnitDuty`, `computeLandedCostPerUnit`, `computeDutyFromRates`, `computeSavingsFromActualVsBoe` from `financial.ts`
- `BoeSummaryTable` — renders totals comparison (Calculated vs BOE vs Variance)

**Exports:** CSV (inline `downloadCsv`), Excel (`exceljs`), Print (popup window or iframe fallback).

---

### `src/components/boe-summary/status-badge.tsx` — `StatusBadge`

**Props:**

| Prop     | Type                 |
| -------- | -------------------- |
| `status` | `SavedBoe['status']` |

Maps each `BoeStatus` to a `Badge` variant: `info`, `destructive`, `success`, `warning`, `neutral`.

---

## Utilities — `duty-calculator.ts`

**File:** `src/lib/duty-calculator.ts`

### `calculateDuties(input: CalculatorInput): CalculationResult`

**Input:**

```ts
interface CalculatorInput {
  shipment: Shipment;
  formValues: {
    exchangeRate: number; // INR per foreign currency unit
    freightCost: number; // INR, shared across all items pro-rata
    exwCost: number; // INR, shared pro-rata
    insuranceRate: number; // percentage (e.g. 1.125 means 1.125%)
    interest?: number; // INR flat, added to final total
  };
  itemInputs: BoeItemInput[]; // matched to shipment items by partNo
}
```

**Returns:** `CalculationResult` (see types above)

**Per-item formulas:**

```
itemValueINR   = round(item.lineTotal × exchangeRate, 2)
itemFreight    = round((freightCost / totalInvoiceValue) × item.lineTotal, 2)
itemEXW        = round((exwCost / totalInvoiceValue) × item.lineTotal, 2)
itemInsurance  = round((itemValueINR + itemEXW) × (insuranceRate / 100), 1)
assessableValue = round(itemValueINR + itemFreight + itemEXW + itemInsurance, 1)
```

`totalInvoiceValue` = `shipment.invoiceValue` (foreign currency total).
Freight and EXW are pro-rated by each item's `lineTotal / totalInvoiceValue`.

**Duty calculation by method:**

| Method     | BCD                            | SWS                                            | IGST                                                                         |
| ---------- | ------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `Standard` | `assessableValue × boeBcdRate` | `bcdValue × boeSwsRate`                        | `(assessableValue + bcdValue + swsValue) × boeIgstRate`                      |
| `CEPA`     | Same as Standard               | Same as Standard                               | Same as Standard                                                             |
| `Rodtep`   | `assessableValue × boeBcdRate` | `assessableValue × actualBcdRate × boeSwsRate` | `(assessableValue + assessableValue×actualBcdRate + swsValue) × boeIgstRate` |

`Rodtep` uses the shipment's `actualBcdRate` (not the entered `boeBcdRate`) as the base for SWS and IGST, because the benefit is a credit against standard BCD — so SWS and IGST are computed on the standard base.

**Rounding:**

- Per-item duty values: `round(raw, 1)` (one decimal)
- Aggregate totals: `Math.round(sum)` (whole rupee)
- Final `customsDutyTotal`: `Math.round(bcdTotal + swsTotal + igstTotal + interest)`

---

## Utilities — `financial.ts`

**File:** `src/lib/financial.ts`

### `round(value: number, decimals = 2): number`

```
parseFloat(value.toFixed(decimals))
```

### `computePerUnitDuty(totalDuty: number, quantity: number | undefined | null): number`

```
qty = quantity > 0 ? quantity : 1
result = round(totalDuty / qty, 2)          // INR per unit
```

### `computeLandedCostPerUnit(assessableValue: number, totalDuty: number, quantity: number | undefined | null): number`

```
qty = quantity > 0 ? quantity : 1
assessablePerUnit = assessableValue / qty
dutyPerUnit = computePerUnitDuty(totalDuty, qty)
result = round(assessablePerUnit + dutyPerUnit, 2)   // INR per unit
```

### `computePotentialDuty(assessableValue: number, rates: { bcdRate, swsRate, igstRate }): DutyBreakdown`

Same Standard-method formula as `calculateDuties`. Used for comparison.

```
bcd   = assessableValue × (bcdRate / 100)
sws   = bcd × (swsRate / 100)
igst  = (assessableValue + bcd + sws) × (igstRate / 100)
total = bcd + sws + igst
```

Returns `{ bcd, sws, igst, total }` all rounded to 2 decimals.

### `computeDutyFromRates(assessableValue, rates): DutyBreakdown`

Alias for `computePotentialDuty`. Used in `BoeSummaryClient` for "Actual Duty" column.

### `computeDutySavings(actualDutyTotal: number, potentialDutyTotal: number): number`

```
result = round(Math.max(potentialDutyTotal - actualDutyTotal, 0), 2)
```

Returns 0 if actual >= potential (no savings).

### `computeSavingsFromActualVsBoe(params): number`

```ts
params: {
  method: 'Standard' | 'CEPA' | 'Rodtep';
  assessableValue: number;
  actualRates: {
    (bcdRate, swsRate, igstRate);
  }
  boe: DutyBreakdown;
}
```

```
if method === 'Standard': return 0   // Standard = no benefit
actual = computeDutyFromRates(assessableValue, actualRates)
diff   = actual.total - boe.total
result = round(Math.max(diff, 0), 2)
```

Only CEPA/Rodtep generate duty savings vs actual tariff rates.

### `toFixed2(n: number | undefined | null): string`

Formats a number to 2 decimal places; returns `'0.00'` for null/NaN.

### `buildReportCsv(rows: Array<Record<string, unknown>>): string`

Generates a CSV string with fixed header columns: Supplier, Invoice No, Date, Part No, Description, Unit, Qty, Unit Price, Assessable Value, BCD, SWS, IGST, Expenses, LDC per qty.

---

## Utilities — `ipc-safe.ts`

**File:** `src/lib/ipc-safe.ts`

### `safeInvoke<T>(command, args?, options?): Promise<T>`

```ts
safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: { skipErrorCapture?: boolean }
): Promise<T>
```

Wraps `@tauri-apps/api/core` `invoke`. On failure:

1. If `options.skipErrorCapture` is falsy, calls `captureErrorEvent` (from `src/lib/error-memory`) with:
   - `moduleName: 'frontend.ipc'`
   - `commandName: command`
   - `errorCode: 'FE_IPC_COMMAND_FAILED'`
   - `errorCategory: 'ipc'`, `severity: 'error'`, `recoverable: false`, `retryable: true`
   - `redactedInputContext: safeArgsPreview(args)` — JSON preview truncated at 1000 chars
2. Always re-throws the error.

Pass `{ skipErrorCapture: true }` for expected failures (e.g., not-found checks) where you don't want an error event logged.

---

## Utilities — `tauri-bridge.ts`

**File:** `src/lib/tauri-bridge.ts`

Environment detection (checked in order): `globalThis.isTauri` → `window.isTauri` → `window.__TAURI__` → `window.__TAURI_INTERNALS__` → `VITE_PLAYWRIGHT` env var.

```ts
export const isTauriEnvironment: boolean; // true if running inside Tauri
export const useNativeFileDialogs: boolean; // true only in Tauri + not Playwright
```

### Key exports

| Export                            | Tauri behaviour                                               | Browser behaviour                                                                               |
| --------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `openTextFile(options?)`          | `@tauri-apps/plugin-dialog` open dialog → reads via plugin-fs | Creates hidden `<input type="file">`, returns contents on change; 300 ms focus-cancel detection |
| `save(content, options?)`         | Native save dialog → writes file                              | Browser `<a download>` blob                                                                     |
| `writeTextFile(path, content)`    | `@tauri-apps/plugin-fs` write                                 | No-op / throws                                                                                  |
| `confirm(message)`                | Native confirm dialog                                         | `window.confirm`                                                                                |
| `assertTrustworthySavePath(path)` | Validates path is inside allowed dirs                         | No-op                                                                                           |

`openTextFile` returns `OpenedTextFile = { contents: string; name: string | null; path?: string | null }`.

---

## Utilities — `settings.ts`

**File:** `src/lib/settings.ts`

Settings are persisted in `localStorage` under key `'import-manager-settings'`. On load they are deep-merged with `defaultSettings`. A schema migration guard clears stale localStorage entries.

### `boe` module defaults (`settings.modules.boe`)

| Field key              | Order | Format    | Notes |
| ---------------------- | ----- | --------- | ----- |
| `id`                   | 1     | uppercase |       |
| `beNumber`             | 2     | uppercase |       |
| `beDate`               | 3     | none      |       |
| `location`             | 4     | titlecase |       |
| `totalAssessmentValue` | 5     | currency  |       |
| `dutyAmount`           | 6     | currency  |       |
| `paymentDate`          | 7     | none      |       |
| `dutyPaid`             | 8     | currency  |       |
| `challanNumber`        | 9     | uppercase |       |
| `refId`                | 10    | uppercase |       |
| `transactionId`        | 11    | uppercase |       |
| `actions`              | 12    | none      |       |

All fields default `visible: true`. Default `itemsPerPage: 10`.

Migration guard: resets `boe` settings if `id`, `refId`, or `transactionId` fields are missing.

### `boeSummary` module defaults (`settings.modules.boeSummary`)

| Field key           | Order | Format    | Notes            |
| ------------------- | ----- | --------- | ---------------- |
| `partNo`            | 1     | uppercase |                  |
| `description`       | 2     | titlecase |                  |
| `assessableValue`   | 3     | currency  |                  |
| `totalDuty`         | 4     | currency  |                  |
| `actualDuty`        | 5     | currency  |                  |
| `qty`               | 6     | integer   |                  |
| `landedCostPerUnit` | 7     | currency  |                  |
| `perUnitDuty`       | 8     | currency  |                  |
| `bcd`               | 9     | decimal   |                  |
| `sws`               | 10    | decimal   |                  |
| `igst`              | 11    | decimal   |                  |
| `savings`           | 12    | currency  | `showSign: true` |

Default `showActions: false`.

---

## Rust Commands

**File:** `src-tauri/src/commands/boe.rs`
**Service:** `src-tauri/src/services/boe_service.rs`

All commands are registered via `#[tauri::command]` and serialised with `camelCase` renaming.

### BOE Master (touches `boe_details` table)

| Command              | Params                     | Returns                       | DB operation                                                                      |
| -------------------- | -------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `get_boes`           | —                          | `Vec<BoeDetails>`             | SELECT all, ORDER BY `be_date DESC, id DESC`                                      |
| `get_boes_paginated` | `page: i64, pageSize: i64` | `PaginatedResult<BoeDetails>` | SELECT with LIMIT/OFFSET; page_size clamped to [1, 100]                           |
| `add_boe`            | `payload: NewBoePayload`   | `String` (new ID)             | Validates via `validate_boe_payload`; INSERT; audits; invalidates dashboard cache |
| `update_boe`         | `boe: BoeDetails`          | `()`                          | Validates; UPDATE WHERE id; audits                                                |
| `delete_boe`         | `id: String`               | `()`                          | DELETE WHERE id; audits; invalidates dashboard cache                              |

**`NewBoePayload`** = `BoeDetails` without `id` field.

All writes go through `with_boe_write_queue` (serialised mutex).

---

### BOE Calculations (touches `boe_calculations`, `boe_attachments`, `boe_items`, `boe_write_recovery`)

| Command                          | Params                       | Returns                     | DB operation                                                                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_boe_calculations`           | —                            | `Vec<SavedBoe>`             | SELECT all, ORDER BY `created_at DESC`; JSON columns deserialized; in-process cache keyed on JSON strings                                                                                                                                                         |
| `get_boe_calculations_paginated` | `page: i64, pageSize: i64`   | `PaginatedResult<SavedBoe>` | SELECT LIMIT/OFFSET                                                                                                                                                                                                                                               |
| `add_boe_calculation`            | `payload: SavedBoe`          | `String` (ID)               | Validates; checks shipment FK; serialises 3 JSON blobs; transaction: inserts recovery record → inserts `boe_calculations` → inserts `boe_attachments` → inserts `boe_items` → updates shipment status to `customs-clearance` → commits → marks recovery completed |
| `update_boe_calculation`         | `payload: SavedBoe`          | `()`                        | Same as add but UPDATE + DELETE/re-INSERT attachments and items                                                                                                                                                                                                   |
| `delete_boe_calculation`         | `id: String`                 | `()`                        | DELETE WHERE id; invalidates dashboard cache                                                                                                                                                                                                                      |
| `update_boe_status`              | `id: String, status: String` | `()`                        | Validates status string; UPDATE `boe_calculations SET status = ?`                                                                                                                                                                                                 |

---

### Shipment Queries (reads `shipments`, `suppliers`, `invoices`, `invoice_line_items`, `items`)

| Command                                  | Params                     | Returns                        | Notes                                                                                                 |
| ---------------------------------------- | -------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `get_shipments_for_boe_entry`            | —                          | `Vec<BoeShipment>`             | Excludes shipments that already have a `boe_calculations` record; requires `inv.status = 'Finalized'` |
| `get_shipments_for_boe_entry_paginated`  | `page: i64, pageSize: i64` | `PaginatedResult<BoeShipment>` | Same filter                                                                                           |
| `get_shipments_for_boe_summary`          | —                          | `Vec<BoeShipment>`             | All shipments (no exclusion); used for reconciliation                                                 |
| `get_shipment_ids_with_boe_calculations` | —                          | `Vec<String>`                  | Returns shipment IDs that have at least one saved BOE calculation                                     |

---

### Attachments (touches `boe_attachments`)

| Command                    | Params                                                         | Returns                  | Notes                         |
| -------------------------- | -------------------------------------------------------------- | ------------------------ | ----------------------------- |
| `add_boe_attachment`       | `boeCalculationId: String, fileName: String, filePath: String` | `String` (attachment ID) | INSERT into `boe_attachments` |
| `save_boe_attachment_file` | `srcPath: String`                                              | `String` (dest path)     | Copies file into app data dir |
| `save_item_photo_file`     | `srcPath: String`                                              | `String` (dest path)     | Same; different subdirectory  |

---

### Reconciliation & Health (diagnostic / maintenance)

| Command                                    | Returns                   | Notes                                                                      |
| ------------------------------------------ | ------------------------- | -------------------------------------------------------------------------- |
| `get_boe_reconciliation(savedBoeId)`       | `BoeReconciliationReport` | Joins `boe_calculations` + `shipments`; builds per-item actual vs BOE diff |
| `validate_boe_integrity_command()`         | JSON string               | Checks referential integrity; orphaned rows, missing FKs                   |
| `reconcile_boe_attachments_command()`      | `i64`                     | Count of attachment records fixed                                          |
| `recover_interrupted_boe_writes_command()` | `i64`                     | Count of pending `boe_write_recovery` entries resolved                     |
| `get_boe_health_summary_command()`         | `BoeHealthSummary`        | Counts, JSON sizes, index usage                                            |
| `get_boe_largest_json_rows(limit)`         | `Vec<JsonPayloadInfo>`    | Top N rows by JSON column size                                             |
| `analyze_boe_query_plans_command()`        | JSON string               | EXPLAIN QUERY PLAN findings + index recommendations                        |

---

## Database Schema

### `boe_details`

| Column                   | Type    | Notes                 |
| ------------------------ | ------- | --------------------- |
| `id`                     | TEXT PK |                       |
| `be_number`              | TEXT    | UNIQUE with `be_date` |
| `be_date`                | TEXT    | ISO date              |
| `location`               | TEXT    |                       |
| `total_assessment_value` | REAL    |                       |
| `duty_amount`            | REAL    |                       |
| `payment_date`           | TEXT    | nullable              |
| `duty_paid`              | REAL    | nullable              |
| `challan_number`         | TEXT    | nullable              |
| `ref_id`                 | TEXT    | nullable              |
| `transaction_id`         | TEXT    | nullable              |

UNIQUE constraint: `(be_number, be_date)`

### `boe_calculations`

| Column                    | Type    | Notes                            |
| ------------------------- | ------- | -------------------------------- |
| `id`                      | TEXT PK |                                  |
| `shipment_id`             | TEXT    | FK → `shipments(id)`             |
| `boe_id`                  | TEXT    | nullable, FK → `boe_details(id)` |
| `supplier_name`           | TEXT    |                                  |
| `invoice_number`          | TEXT    |                                  |
| `status`                  | TEXT    | `BoeStatus` values               |
| `form_values_json`        | TEXT    | Serialised `FormValues`          |
| `item_inputs_json`        | TEXT    | Serialised `BoeItemInput[]`      |
| `calculation_result_json` | TEXT    | Serialised `CalculationResult`   |
| `attachments_json`        | TEXT    | Serialised `Attachment[]`        |
| `created_at`              | TEXT    |                                  |

Generated columns (V68): `supplier_name_generated`, `invoice_number_generated`, `status_generated`, `shipment_id_generated` — extracted from `form_values_json` for index-backed lookups.

Indexes: `idx_boe_created_at`, `idx_boe_status`, `idx_boe_shipment_status`, `idx_boe_number`.

### `boe_attachments` (V56)

| Column               | Type    | Notes                       |
| -------------------- | ------- | --------------------------- |
| `id`                 | TEXT PK |                             |
| `boe_calculation_id` | TEXT    | FK → `boe_calculations(id)` |
| `file_name`          | TEXT    |                             |
| `file_path`          | TEXT    |                             |
| `uploaded_at`        | TEXT    |                             |

Index: `idx_boe_attachments_calc_id`

### `boe_items` (V57)

> **Column naming note:** `bcd_rate`, `sws_rate`, `igst_rate` are misnamed — they store computed duty **values** in INR, not rates.

| Column               | Type | Constraints                                             | Notes                                            |
| -------------------- | ---- | ------------------------------------------------------- | ------------------------------------------------ |
| `id`                 | TEXT | PK NOT NULL                                             |                                                  |
| `boe_calculation_id` | TEXT | NOT NULL, FK → `boe_calculations(id)` ON DELETE CASCADE |                                                  |
| `item_id`            | TEXT | NOT NULL                                                | part number                                      |
| `assessable_value`   | REAL | NOT NULL                                                |                                                  |
| `bcd_rate`           | REAL | NOT NULL                                                | stores computed BCD **value** in INR (misnamed)  |
| `sws_rate`           | REAL | NOT NULL                                                | stores computed SWS **value** in INR (misnamed)  |
| `igst_rate`          | REAL | NOT NULL                                                | stores computed IGST **value** in INR (misnamed) |
| `total`              | REAL | NOT NULL                                                | BCD + SWS + IGST                                 |

Index: `idx_boe_items_calc_id` on `boe_calculation_id`

### `boe_write_recovery` (V57)

| Column               | Type | Constraints                                                           | Notes                                                          |
| -------------------- | ---- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `id`                 | TEXT | PK NOT NULL                                                           |                                                                |
| `boe_calculation_id` | TEXT | nullable                                                              | linked calculation (may be null if write failed before insert) |
| `operation`          | TEXT | NOT NULL                                                              | e.g. `'upsert_boe_calculation'`                                |
| `status`             | TEXT | NOT NULL                                                              | `'pending'` → `'completed'`                                    |
| `created_at`         | TEXT | NOT NULL, DEFAULT `strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')` |                                                                |

Index: `idx_boe_write_recovery_status` on `status`

---

## Frontend ↔ Backend Data Flow

### Create / Update a BOE Calculation

```
User fills BoeEntryForm
    │
    ├─ Selects supplier → handleSupplierChange() → filters availableInvoices
    ├─ Selects invoice  → handleInvoiceChange()  → sets selectedShipment, seeds itemInputs from actualRates
    ├─ (Optional) selects BoeDetails record      → selectedBoeId / selectedBoeDetails
    ├─ Edits rates in ItemsTable                 → setItemInputs()
    ├─ Clicks "Calculate Duties"
    │       └─ onSubmit(formValues)
    │               ├─ (Optional) parseOverrideFile(CSV) → merges into itemInputs
    │               └─ calculateDuties({ shipment, formValues, itemInputs })
    │                       ├─ Per item: itemValueINR, freight, EXW, insurance → assessableValue
    │                       ├─ BCD / SWS / IGST by method (Standard|CEPA|Rodtep)
    │                       └─ Returns CalculationResult → setCalculationResult()
    │
    └─ Clicks "Save BOE" / "Update BOE"
            └─ handleSaveOrUpdate()
                    ├─ BCD discrepancy guard
                    ├─ Duty-paid match guard (if BoeDetails linked)
                    └─ onSaveOrUpdate(SavedBoe) → [parent page]
                            └─ invoke('add_boe_calculation' | 'update_boe_calculation', { payload })
                                    └─ Rust: validate → JSON-serialize 3 blobs → transaction:
                                            boe_write_recovery INSERT (pending)
                                            boe_calculations INSERT/UPDATE
                                            boe_attachments INSERT/DELETE
                                            boe_items INSERT/DELETE
                                            shipments UPDATE status → 'customs-clearance'
                                            COMMIT
                                            boe_write_recovery UPDATE (completed)
```

### Read (BOE Entry list)

```
BoeEntryPage mount
    └─ Promise.all([
           invoke('get_shipments_for_boe_entry_paginated')   → Rust: JOIN shipments+items, exclude where boe_calculations exists
           invoke('get_boe_calculations_paginated')          → Rust: SELECT boe_calculations, deserialize JSON blobs (with in-process cache)
           invoke('get_boes_paginated')                      → Rust: SELECT boe_details
       ])
    └─ setShipments / setSavedBoes / setAllBoes
```

### Reconciliation (BOE Summary)

```
BoeSummaryPage mount
    └─ Promise.all([
           invoke('get_shipments_for_boe_summary')   → all shipments with item rates
           invoke('get_boe_calculations')             → all SavedBoe records
           invoke('get_boes')                         → all BoeDetails
       ])
    └─ props → BoeSummaryClient
            ├─ User selects supplier + invoice
            └─ selectedData computed from mergedSavedBoes
                    └─ ItemDetailsTable maps calculatedItems:
                            assessableValue, bcd/sws/igstValue   ← from calculationResult
                            actualDuty = computeDutyFromRates(assessableValue, shipment.actualRates)
                            savings    = computeSavingsFromActualVsBoe({ method, assessableValue, actualRates, boe })
                            perUnitDuty = computePerUnitDuty(totalDuty, qty)
                            landedCost  = computeLandedCostPerUnit(assessableValue, totalDuty, qty)
```

### Status Update

```
BoeSummaryClient: user changes status dropdown → clicks Save
    └─ invoke('update_boe_status', { id, status })
            └─ Rust: validate_status() → UPDATE boe_calculations SET status = ? WHERE id = ?
    └─ setBoeOverrides(optimistic local merge)  ← immediate UI update before re-fetch
```

### BOE Master CRUD

```
BoePage
    ├─ mount                 → invoke('get_boes_paginated')
    ├─ add/edit form submit  → invoke('add_boe' | 'update_boe') → fetchData()
    ├─ delete confirm        → invoke('delete_boe')             → fetchData()
    ├─ CSV import            → openTextFile() [tauri-bridge] → Papa.parse() → validate beNumber → loop invoke('add_boe') per row
    ├─ CSV export            → Papa.unparse(boes) → save() [tauri-bridge] or browser blob download
    └─ Template download     → browser <a download> blob (fixed header CSV, no Tauri dialog)
```
