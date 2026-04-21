/**
 * Playwright dev-server shim: re-exports Tauri core types/helpers from the real
 * package while stubbing `invoke` so the Vite UI can load without the Rust host.
 *
 * `@tauri-apps/api/core-real` is aliased in `vite.config.ts` to the real `core.js`.
 */
import * as realCore from '@tauri-apps/api/core-real';

export const Channel = realCore.Channel;
export const Resource = realCore.Resource;
export const SERIALIZE_TO_IPC_FN = realCore.SERIALIZE_TO_IPC_FN;
export const transformCallback = realCore.transformCallback;
export const convertFileSrc = realCore.convertFileSrc;

const emptyBrowseTable = (tableName: string) => ({
  tableName,
  columns: [] as string[],
  rows: [] as unknown[][],
  totalCount: 0,
  page: 1,
  pageSize: 50,
});

/** In-memory suppliers for Playwright import assertions (real Tauri uses SQLite). */
const stubSuppliers: Record<string, unknown>[] = [];
const stubShipments: Record<string, unknown>[] = [];
const stubInvoices: Record<string, unknown>[] = [];
const stubItems: Record<string, unknown>[] = [];
const stubBoes: Record<string, unknown>[] = [];

/** Persists stub live DB across `page.reload()` in Playwright (in-memory module resets on reload). */
const PW_LIVE_DB_SESSION_KEY = '__import_manager_pw_live_snapshot__';

function persistLiveDbToSession(): void {
  if (
    import.meta.env.VITE_PLAYWRIGHT !== '1' ||
    typeof window === 'undefined'
  ) {
    return;
  }
  try {
    sessionStorage.setItem(PW_LIVE_DB_SESSION_KEY, captureDbSnapshot());
  } catch {
    /* ignore quota / private mode */
  }
}

function tryHydrateLiveDbFromSession(): void {
  if (
    import.meta.env.VITE_PLAYWRIGHT !== '1' ||
    typeof window === 'undefined'
  ) {
    return;
  }
  try {
    const raw = sessionStorage.getItem(PW_LIVE_DB_SESSION_KEY);
    if (raw && raw.length > 2) {
      restoreDbFromSnapshot(raw);
    }
  } catch {
    sessionStorage.removeItem(PW_LIVE_DB_SESSION_KEY);
  }
}

const stubExpenseTypes: Record<string, unknown>[] = [
  {
    id: 'et-customs',
    name: 'Customs Clearance',
    defaultCgstRate: 900,
    defaultSgstRate: 900,
    defaultIgstRate: 0,
    isActive: true,
  },
  {
    id: 'et-freight',
    name: 'Freight Charges',
    defaultCgstRate: 0,
    defaultSgstRate: 0,
    defaultIgstRate: 1800,
    isActive: true,
  },
];

const stubServiceProviders: Record<string, unknown>[] = [
  {
    id: 'sp-abc',
    name: 'ABC Logistics Ltd',
  },
  {
    id: 'sp-xyz',
    name: 'XYZ Customs Brokers',
  },
  {
    id: 'sp-acme',
    name: 'ACME Logistics',
  },
];

type StubExpenseLine = Record<string, unknown>;

const stubExpensesByShipment = new Map<string, StubExpenseLine[]>();
let stubExpenseSeq = 1;

/** Serialized in-memory DB for Playwright backup/restore E2E (mirrors real SQLite flows). */
interface StubDbSnapshot {
  suppliers: Record<string, unknown>[];
  shipments: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  items: Record<string, unknown>[];
  boes: Record<string, unknown>[];
  expenseEntries: [string, StubExpenseLine[]][];
}

let stubBackupSeq = 0;
const stubBackupSnapshots = new Map<string, string>();
const stubBackupHistoryList: Array<{
  id: number;
  filename: string;
  path: string;
  destination: string;
  size_bytes: number;
  created_at: string;
  status: string;
  notes?: string;
}> = [];

function expenseLineCount(): number {
  let n = 0;
  for (const lines of stubExpensesByShipment.values()) {
    n += lines.length;
  }
  return n;
}

function getStubDatabaseStats() {
  const totalRows =
    stubSuppliers.length +
    stubShipments.length +
    stubItems.length +
    stubInvoices.length +
    stubBoes.length +
    expenseLineCount();
  return {
    db_size_bytes: Math.max(4096, totalRows * 512),
    table_counts: {
      suppliers: stubSuppliers.length,
      shipments: stubShipments.length,
      items: stubItems.length,
      invoices: stubInvoices.length,
      boe_details: stubBoes.length,
      expense_lines: expenseLineCount(),
    },
    last_backup: stubBackupHistoryList[0]?.created_at,
    next_scheduled_backup: undefined as string | undefined,
    encryption_status: 'Encrypted',
  };
}

function captureDbSnapshot(): string {
  const expenseEntries: [string, StubExpenseLine[]][] = [];
  for (const [k, v] of stubExpensesByShipment.entries()) {
    expenseEntries.push([k, v.map(r => ({ ...r }))]);
  }
  const snap: StubDbSnapshot = {
    suppliers: stubSuppliers.map(s => ({ ...s })),
    shipments: stubShipments.map(s => ({ ...s })),
    invoices: stubInvoices.map(s => ({ ...s })),
    items: stubItems.map(s => ({ ...s })),
    boes: stubBoes.map(s => ({ ...s })),
    expenseEntries,
  };
  return JSON.stringify(snap);
}

function restoreDbFromSnapshot(raw: string): void {
  const snap = JSON.parse(raw) as StubDbSnapshot;
  stubSuppliers.length = 0;
  stubSuppliers.push(...(snap.suppliers ?? []));
  stubShipments.length = 0;
  stubShipments.push(...(snap.shipments ?? []));
  stubInvoices.length = 0;
  stubInvoices.push(...(snap.invoices ?? []));
  stubItems.length = 0;
  stubItems.push(...(snap.items ?? []));
  stubBoes.length = 0;
  stubBoes.push(...(snap.boes ?? []));
  stubExpensesByShipment.clear();
  for (const [k, rows] of snap.expenseEntries ?? []) {
    stubExpensesByShipment.set(
      k,
      rows.map(r => ({ ...r }))
    );
  }
  persistLiveDbToSession();
}

function seedPlaywrightDefaults(): void {
  stubSuppliers.length = 0;
  stubSuppliers.push({
    id: 'Sup-001',
    supplierName: 'Seed Supplier',
    country: 'India',
    email: 'seed@example.com',
    isActive: true,
  });

  stubShipments.length = 0;
  stubShipments.push({
    id: 'SHP-SEED-001',
    supplierId: 'Sup-001',
    invoiceNumber: 'TEST-INV-SHP-001',
    invoiceDate: '2024-06-01',
    goodsCategory: 'Electronics',
    invoiceValue: 200000,
    invoiceCurrency: 'INR',
    incoterm: 'FOB',
    shipmentMode: 'FCL',
    shipmentType: '40FT',
    blAwbNumber: 'BL-SEED-001',
    blAwbDate: '2024-06-02',
    vesselName: 'Seed Vessel',
    containerNumber: 'CONT-SEED-01',
    grossWeightKg: 1000,
    etd: '2024-06-03',
    eta: '2024-06-20',
    status: 'in-transit',
    dateOfDelivery: '',
    isFrozen: false,
  });

  stubItems.length = 0;
  stubItems.push(
    {
      id: 'ITM-100',
      partNumber: 'TEST-PART-INV-001',
      itemDescription: 'Seed part one',
      unit: 'PCS',
      currency: 'INR',
      unitPrice: 125.5,
      hsnCode: '85423100',
      supplierId: 'Sup-001',
      isActive: true,
      countryOfOrigin: 'India',
      bcd: '7.5',
      sws: '5',
      igst: '18',
    },
    {
      id: 'ITM-101',
      partNumber: 'TEST-PART-INV-002',
      itemDescription: 'Seed part two',
      unit: 'PCS',
      currency: 'INR',
      unitPrice: 88,
      hsnCode: '39269099',
      supplierId: 'Sup-001',
      isActive: true,
      countryOfOrigin: 'India',
      bcd: '7.5',
      sws: '5',
      igst: '18',
    }
  );

  stubInvoices.length = 0;
  stubBoes.length = 0;
  stubExpensesByShipment.clear();
  stubExpenseSeq = 1;
  stubBackupSeq = 0;
  stubBackupSnapshots.clear();
  stubBackupHistoryList.length = 0;
  persistLiveDbToSession();
}

function nextInvoiceId(): string {
  const n =
    stubInvoices.reduce((max, inv) => {
      const id = typeof inv.id === 'string' ? inv.id : '';
      const num = parseInt(id.replace(/^INV-/, ''), 10);
      return !Number.isNaN(num) && num > max ? num : max;
    }, 0) + 1;
  return `INV-${String(n).padStart(4, '0')}`;
}

function nextItemNumericId(): number {
  return stubItems.reduce((max, it) => {
    const id = typeof it.id === 'string' ? it.id : '';
    const n = parseInt(id.replace(/^ITM-/, ''), 10);
    return !Number.isNaN(n) && n > max ? n : max;
  }, 0);
}

function nextBoeId(): string {
  const n =
    stubBoes.reduce((max, b) => {
      const id = typeof b.id === 'string' ? b.id : '';
      const num = parseInt(id.replace(/^BOE-/, ''), 10);
      return !Number.isNaN(num) && num > max ? num : max;
    }, 0) + 1;
  return `BOE-${String(n).padStart(4, '0')}`;
}

function shipmentHasFinalizedInvoice(shipmentId: string): boolean {
  return stubInvoices.some(
    inv =>
      inv.shipmentId === shipmentId &&
      (inv.status === 'Finalized' || inv.status === 'finalized')
  );
}

if (typeof window !== 'undefined') {
  (
    window as unknown as {
      __IMPORT_MANAGER_STUB__?: { resetSuppliers: () => void };
    }
  ).__IMPORT_MANAGER_STUB__ = {
    resetSuppliers: () => {
      stubSuppliers.length = 0;
    },
  };
}

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  switch (cmd) {
    case 'get_suppliers':
      return stubSuppliers.map(s => ({ ...s })) as T;
    case 'add_suppliers_bulk': {
      const incoming =
        (args?.suppliers as Record<string, unknown>[] | undefined) ?? [];
      stubSuppliers.push(...incoming.map(s => ({ ...s })));
      persistLiveDbToSession();
      return undefined as T;
    }
    case 'get_shipments':
      return stubShipments.map(s => ({ ...s })) as T;
    case 'get_active_shipments':
      return stubShipments.filter(s => !s.isFrozen).map(s => ({ ...s })) as T;
    case 'get_unfinalized_shipments':
      return stubShipments
        .filter(s => !shipmentHasFinalizedInvoice(String(s.id)))
        .map(s => ({ ...s })) as T;
    case 'validate_shipment_import':
      return [] as unknown as T;
    case 'add_shipments_bulk': {
      const incoming =
        (args?.shipments as Record<string, unknown>[] | undefined) ?? [];
      for (const row of incoming) {
        stubShipments.push({ ...row });
      }
      persistLiveDbToSession();
      return undefined as T;
    }
    case 'add_shipment': {
      const shipment = args?.shipment as Record<string, unknown> | undefined;
      if (shipment) {
        stubShipments.push({ ...shipment });
      }
      return undefined as T;
    }
    case 'update_shipment': {
      const shipment = args?.shipment as Record<string, unknown> | undefined;
      if (!shipment?.id) return undefined as T;
      const idx = stubShipments.findIndex(s => s.id === shipment.id);
      if (idx >= 0) stubShipments[idx] = { ...stubShipments[idx], ...shipment };
      return undefined as T;
    }
    case 'update_shipment_status': {
      const shipmentId = String(args?.shipmentId ?? '');
      const status = String(args?.status ?? '');
      const dateOfDelivery = args?.dateOfDelivery;
      const idx = stubShipments.findIndex(s => s.id === shipmentId);
      if (idx >= 0) {
        stubShipments[idx] = {
          ...stubShipments[idx],
          status,
          ...(typeof dateOfDelivery === 'string' ? { dateOfDelivery } : {}),
        };
      }
      return undefined as T;
    }
    case 'check_and_update_ready_for_delivery':
    case 'migrate_shipment_statuses':
    case 'add_option':
    case 'update_expense':
      return undefined as T;
    case 'freeze_shipment': {
      const shipmentId = String(args?.shipmentId ?? '');
      const frozen = Boolean(args?.frozen);
      const idx = stubShipments.findIndex(s => s.id === shipmentId);
      if (idx >= 0)
        stubShipments[idx] = { ...stubShipments[idx], isFrozen: frozen };
      return undefined as T;
    }
    case 'get_invoices':
      return stubInvoices.map(i => ({ ...i })) as T;
    case 'add_invoices_bulk': {
      const payloads =
        (args?.payloads as Record<string, unknown>[] | undefined) ?? [];
      for (const p of payloads) {
        const shipmentId = String(p.shipmentId ?? '');
        const shipment = stubShipments.find(s => s.id === shipmentId);
        const lineItemsRaw = (p.lineItems as Record<string, unknown>[]) ?? [];
        let calculated = 0;
        const invId = nextInvoiceId();
        const lineItems = lineItemsRaw.map((li, i) => {
          const qty = Number(li.quantity) || 0;
          const price = Number(li.unitPrice) || 0;
          calculated += qty * price;
          return {
            id: `${invId}-L${i}`,
            itemId: String(li.itemId ?? ''),
            quantity: qty,
            unitPrice: price,
          };
        });
        stubInvoices.push({
          id: invId,
          invoiceNumber: shipment
            ? String(shipment.invoiceNumber ?? '')
            : 'UNKNOWN',
          shipmentId,
          invoiceDate: shipment ? String(shipment.invoiceDate ?? '') : '',
          status: String(p.status ?? 'Draft'),
          calculatedTotal: calculated,
          shipmentTotal: shipment ? Number(shipment.invoiceValue) || 0 : 0,
          lineItems,
        });
      }
      persistLiveDbToSession();
      return undefined as T;
    }
    case 'add_invoice':
    case 'update_invoice':
    case 'delete_invoice':
      return undefined as T;
    case 'bulk_finalize_invoices': {
      const ids =
        (args?.input as { invoiceIds?: string[] } | undefined)?.invoiceIds ??
        (args?.invoiceIds as string[] | undefined) ??
        [];
      let finalized = 0;
      let failed = 0;
      const errorMessages: string[] = [];
      for (const id of ids) {
        const idx = stubInvoices.findIndex(i => i.id === id);
        if (idx < 0) {
          failed += 1;
          errorMessages.push(`Invoice not found: ${id}`);
          continue;
        }
        const inv = stubInvoices[idx];
        if (inv.status !== 'Draft') {
          failed += 1;
          errorMessages.push(`${inv.invoiceNumber}: not in Draft status`);
          continue;
        }
        const shipmentTotal = Number(
          (inv as Record<string, unknown>).shipmentTotal
        );
        const calculatedTotal = Number(
          (inv as Record<string, unknown>).calculatedTotal
        );
        if (Math.abs(shipmentTotal - calculatedTotal) >= 0.01) {
          failed += 1;
          errorMessages.push(
            `${inv.invoiceNumber}: shipment total does not match calculated total`
          );
          continue;
        }
        stubInvoices[idx] = { ...inv, status: 'Finalized' };
        finalized += 1;
      }
      return { finalized, failed, errorMessages } as T;
    }
    case 'get_items':
      return stubItems.map(i => ({ ...i })) as T;
    case 'add_items_bulk': {
      const incoming =
        (args?.items as Record<string, unknown>[] | undefined) ?? [];
      let n = nextItemNumericId();
      for (const row of incoming) {
        n += 1;
        stubItems.push({
          ...row,
          id:
            typeof row.id === 'string' && row.id
              ? row.id
              : `ITM-${String(n).padStart(3, '0')}`,
        });
      }
      persistLiveDbToSession();
      return undefined as T;
    }
    case 'add_item':
    case 'update_item':
      return undefined as T;
    case 'get_boes':
      return stubBoes.map(b => ({ ...b })) as T;
    case 'add_boe': {
      const payload = (args?.payload ?? args?.boe) as
        | Record<string, unknown>
        | undefined;
      if (!payload) return undefined as T;
      const id =
        typeof payload.id === 'string' && payload.id ? payload.id : nextBoeId();
      stubBoes.push({
        ...payload,
        id,
      });
      persistLiveDbToSession();
      return undefined as T;
    }
    case 'update_boe':
    case 'delete_boe':
      return undefined as T;
    case 'get_expense_types':
      return stubExpenseTypes.map(e => ({ ...e })) as T;
    case 'get_service_providers':
      return stubServiceProviders.map(s => ({ ...s })) as T;
    case 'get_expenses_for_shipment': {
      const shipmentId = String(args?.shipmentId ?? '');
      const list = stubExpensesByShipment.get(shipmentId) ?? [];
      return list.map(e => ({ ...e })) as T;
    }
    case 'preview_expense_invoice': {
      const payload = args?.payload as Record<string, unknown> | undefined;
      const linesIn = (payload?.lines as Record<string, unknown>[]) ?? [];
      const lines = linesIn.map((line, idx) => {
        const amountPaise = Number(line.amount_paise) || 0;
        const et = stubExpenseTypes.find(t => t.id === line.expense_type_id) as
          | { name?: string }
          | undefined;
        return {
          expense_type_id: String(line.expense_type_id ?? ''),
          expense_type_name: et?.name ?? `Type-${idx}`,
          amount_paise: amountPaise,
          cgst_rate: Number(line.cgst_rate) || 0,
          sgst_rate: Number(line.sgst_rate) || 0,
          igst_rate: Number(line.igst_rate) || 0,
          tds_rate: Number(line.tds_rate) || 0,
          cgst_amount_paise: 0,
          sgst_amount_paise: 0,
          igst_amount_paise: 0,
          tds_amount_paise: 0,
          total_amount_paise: amountPaise,
          net_amount_paise: amountPaise,
          remarks: line.remarks,
        };
      });
      const total = lines.reduce((s, l) => s + (l.amount_paise as number), 0);
      return {
        lines,
        total_amount_paise: total,
        total_cgst_amount_paise: 0,
        total_sgst_amount_paise: 0,
        total_igst_amount_paise: 0,
        total_tds_amount_paise: 0,
        net_amount_paise: total,
      } as T;
    }
    case 'create_expense_invoice': {
      const payload = args?.payload as Record<string, unknown> | undefined;
      const shipmentId = String(payload?.shipment_id ?? '');
      const lines = (payload?.lines as Record<string, unknown>[]) ?? [];
      const invoiceNo = String(payload?.invoice_number ?? 'EXP-INV');
      const invoiceDate = String(payload?.invoice_date ?? '');
      const serviceProviderId = String(payload?.service_provider_id ?? '');
      const list = stubExpensesByShipment.get(shipmentId) ?? [];
      const exInvId = `EXINV-${stubExpenseSeq++}`;
      for (const line of lines) {
        const id = `EXP-${stubExpenseSeq++}`;
        const etId = String(line.expense_type_id ?? '');
        const et = stubExpenseTypes.find(t => t.id === etId) as
          | { name?: string }
          | undefined;
        const amountPaise = Number(line.amount_paise) || 0;
        list.push({
          id,
          expenseInvoiceId: exInvId,
          expenseTypeId: etId,
          amount: amountPaise / 100,
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          tdsRate: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          tdsAmount: 0,
          totalAmount: amountPaise / 100,
          remarks: String(line.remarks ?? ''),
          serviceProviderId,
          invoiceNo,
          invoiceDate,
          expenseTypeName: et?.name ?? 'Expense',
        });
      }
      stubExpensesByShipment.set(shipmentId, list);
      persistLiveDbToSession();
      return undefined as T;
    }
    case 'add_expenses_bulk': {
      const payload = args?.payload as Record<string, unknown> | undefined;
      const shipmentId = String(payload?.shipmentId ?? '');
      const rows = (payload?.expenses as Record<string, unknown>[]) ?? [];
      const list = stubExpensesByShipment.get(shipmentId) ?? [];
      for (const row of rows) {
        const typeName = String(row.expenseTypeName ?? '');
        const et = stubExpenseTypes.find(
          t => (t.name as string).toLowerCase() === typeName.toLowerCase()
        ) as { id?: string; name?: string } | undefined;
        const id = `EXP-${stubExpenseSeq++}`;
        list.push({
          id,
          expenseInvoiceId: `EXINV-${stubExpenseSeq}`,
          expenseTypeId: et?.id ?? 'et-unknown',
          amount: Number(row.amount) || 0,
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          tdsRate: 0,
          cgstAmount: Number(row.cgstAmount) || 0,
          sgstAmount: Number(row.sgstAmount) || 0,
          igstAmount: Number(row.igstAmount) || 0,
          tdsAmount: Number(row.tdsAmount) || 0,
          totalAmount: Number(row.totalAmount) || 0,
          remarks: String(row.remarks ?? ''),
          serviceProviderId: String(row.serviceProviderId ?? ''),
          invoiceNo: String(row.invoiceNo ?? ''),
          invoiceDate: String(row.invoiceDate ?? ''),
          expenseTypeName: et?.name ?? typeName,
        });
      }
      stubExpensesByShipment.set(shipmentId, list);
      persistLiveDbToSession();
      return undefined as T;
    }
    case 'generate_detailed_expense_report': {
      const filters = (args?.filters as Record<string, unknown>) ?? {};
      const rows: Record<string, unknown>[] = [];
      for (const [shipmentId, exps] of stubExpensesByShipment) {
        if (filters.shipmentId && filters.shipmentId !== shipmentId) continue;
        const shipment = stubShipments.find(s => s.id === shipmentId);
        for (const e of exps) {
          rows.push({
            invoice_id: String(e.expenseInvoiceId ?? 'inv'),
            invoice_number: String(e.invoiceNo ?? ''),
            invoice_date: String(e.invoiceDate ?? ''),
            shipment_id: shipmentId,
            shipment_number: shipment
              ? String(shipment.invoiceNumber ?? '')
              : shipmentId,
            service_provider_id: String(e.serviceProviderId ?? ''),
            service_provider_name: String(
              stubServiceProviders.find(p => p.id === e.serviceProviderId)
                ?.name ?? ''
            ),
            expense_type_id: String(e.expenseTypeId ?? ''),
            expense_type_name: String(e.expenseTypeName ?? ''),
            amount_paise: Math.round(Number(e.amount) * 100),
            cgst_amount_paise: Math.round(Number(e.cgstAmount) * 100),
            sgst_amount_paise: Math.round(Number(e.sgstAmount) * 100),
            igst_amount_paise: Math.round(Number(e.igstAmount) * 100),
            tds_amount_paise: Math.round(Number(e.tdsAmount) * 100),
            total_amount_paise: Math.round(Number(e.totalAmount) * 100),
            net_amount_paise: Math.round(Number(e.totalAmount) * 100),
            currency: 'INR',
            remarks: String(e.remarks ?? ''),
            created_at: new Date().toISOString(),
          });
        }
      }
      return {
        rows,
        totals: {
          total_amount_paise: rows.reduce(
            (s, r) => s + (Number(r.amount_paise) || 0),
            0
          ),
          total_cgst_amount_paise: 0,
          total_sgst_amount_paise: 0,
          total_igst_amount_paise: 0,
          total_tds_amount_paise: 0,
          total_net_amount_paise: rows.reduce(
            (s, r) => s + (Number(r.net_amount_paise) || 0),
            0
          ),
          invoice_count: rows.length,
          expense_line_count: rows.length,
        },
        filtersApplied: filters,
      } as T;
    }
    case 'generate_expense_summary_by_type':
      return [] as unknown as T;
    case 'generate_expense_summary_by_provider':
      return [] as unknown as T;
    case 'generate_expense_summary_by_shipment':
      return [] as unknown as T;
    case 'generate_expense_summary_by_month':
      return [] as unknown as T;
    case 'debug_expense_data_counts':
      return JSON.stringify({
        shipments: stubShipments.length,
        expenseRows: [...stubExpensesByShipment.values()].reduce(
          (n, a) => n + a.length,
          0
        ),
      }) as T;
    case 'create_test_expense_data':
    case 'debug_expense_dates':
    case 'debug_expense_report_filters':
      return 'ok' as T;
    case 'get_report':
      return {
        rows: [],
        totalRows: 0,
        totals: null,
      } as T;
    case 'get_database_stats':
      return getStubDatabaseStats() as T;
    case 'get_backup_history': {
      const limit =
        typeof args?.limit === 'number' && Number.isFinite(args.limit)
          ? args.limit
          : undefined;
      const list = stubBackupHistoryList.map(b => ({ ...b }));
      return (limit !== undefined ? list.slice(0, limit) : list) as T;
    }
    case 'google_drive_status':
      return {
        configured: true,
        connected: true,
        state: 'connected',
        email: 'playwright@test.local',
      } as T;
    case 'google_drive_refresh_profile':
      return 'playwright@test.local' as T;
    case 'google_drive_reset_cancel':
    case 'google_drive_cancel_operation':
    case 'google_drive_connect':
    case 'google_drive_disconnect':
      return undefined as T;
    case 'create_backup_schedule':
      return 1 as T;
    case 'update_backup_schedule':
    case 'delete_backup_schedule':
      return undefined as T;
    case 'run_scheduled_backup': {
      const id =
        Number(
          (args as { scheduleId?: unknown })?.scheduleId ??
            (args as { schedule_id?: unknown })?.schedule_id ??
            0
        ) || 1;
      return {
        id,
        filename: `scheduled-backup-${id}.db`,
        path: `playwright-stub://scheduled-${id}`,
        destination: 'local',
        created_at: new Date().toISOString(),
        status: 'completed',
      } as T;
    }
    case 'create_backup': {
      const req = (args?.request ?? {}) as Record<string, unknown>;
      const snapshot = captureDbSnapshot();
      const id = ++stubBackupSeq;
      const filename =
        typeof req.filename === 'string' && req.filename.trim()
          ? String(req.filename)
          : `import-manager-backup-${id}.db`;
      const path = `playwright-stub://${encodeURIComponent(filename)}`;
      stubBackupSnapshots.set(path, snapshot);
      const info = {
        id,
        filename,
        path,
        destination: String(req.destination ?? 'local'),
        size_bytes: snapshot.length,
        created_at: new Date().toISOString(),
        status: 'completed',
        notes: typeof req.notes === 'string' ? req.notes : undefined,
      };
      stubBackupHistoryList.unshift(info);
      return info as T;
    }
    case 'restore_database': {
      const backupPath = String(args?.backupPath ?? '');
      const raw = stubBackupSnapshots.get(backupPath);
      if (!raw) {
        return {
          success: false,
          message: 'Backup not found',
          integrity_check: 'n/a',
          tables_affected: [] as string[],
        } as T;
      }
      restoreDbFromSnapshot(raw);
      return {
        success: true,
        message: 'Restored from backup',
        backup_created: `pre-restore-${Date.now()}.bak`,
        integrity_check: 'ok',
        tables_affected: [
          'suppliers',
          'shipments',
          'items',
          'invoices',
          'boe_details',
          'expenses',
        ],
      } as T;
    }
    case 'browse_table_data': {
      const tableName =
        typeof args?.tableName === 'string' ? args.tableName : 'suppliers';
      return emptyBrowseTable(tableName) as T;
    }
    case 'bulk_search_records':
      return emptyBrowseTable('bulk') as T;
    case 'soft_delete_record':
      persistLiveDbToSession();
      return undefined as T;
    case 'bulk_delete_records': {
      const ids = Array.isArray(args?.recordIds)
        ? (args.recordIds as unknown[])
        : [];
      persistLiveDbToSession();
      return {
        success: true,
        deleted_count: ids.length,
        total_requested: ids.length,
        failed_deletions: [] as string[],
        message: `Deleted ${ids.length} record(s).`,
      } as T;
    }
    case 'reset_test_database': {
      seedPlaywrightDefaults();
      console.info('Test database reset completed');
      return undefined as T;
    }
    /** Test-only: return raw snapshot JSON for E2E download assertions (not a production command). */
    case 'playwright_read_backup_snapshot': {
      const backupPath = String(args?.backupPath ?? '');
      const raw = stubBackupSnapshots.get(backupPath);
      if (!raw) {
        throw new Error(
          `playwright_read_backup_snapshot: missing ${backupPath}`
        );
      }
      return raw as T;
    }
    case 'preview_restore': {
      const backupPath = String(args?.backupPath ?? '');
      if (!stubBackupSnapshots.has(backupPath)) {
        throw new Error(`Backup not found for preview: ${backupPath}`);
      }
      const meta = stubBackupHistoryList.find(b => b.path === backupPath);
      const snapBytes = stubBackupSnapshots.get(backupPath)!.length;
      return {
        backup_info: {
          filename: meta?.filename ?? 'backup',
          path: backupPath,
          destination: meta?.destination ?? 'local',
          created_at: meta?.created_at ?? new Date().toISOString(),
          status: 'completed',
          size_bytes: snapBytes,
        },
        current_db_stats: getStubDatabaseStats(),
        integrity_check: 'Backup readable; integrity OK (Playwright stub).',
        schema_compatibility: true,
        estimated_changes: {},
        warnings: [] as string[],
      } as T;
    }
    /** Test-only: register a JSON snapshot from an uploaded file for preview/restore (Playwright). */
    case 'playwright_register_restore_snapshot': {
      const snapshotJson = String(args?.snapshotJson ?? '');
      JSON.parse(snapshotJson) as unknown;
      const id = ++stubBackupSeq;
      const filename = `e2e-uploaded-backup-${id}.json`;
      const path = `playwright-stub://upload-${id}`;
      stubBackupSnapshots.set(path, snapshotJson);
      stubBackupHistoryList.unshift({
        id,
        filename,
        path,
        destination: 'local',
        size_bytes: snapshotJson.length,
        created_at: new Date().toISOString(),
        status: 'completed',
      });
      return { backupPath: path } as T;
    }
    default:
      if (cmd.startsWith('get_') || cmd.startsWith('browse_')) {
        return [] as unknown as T;
      }
      return undefined as T;
  }
}

type InvokeFn = <T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
) => Promise<T>;

tryHydrateLiveDbFromSession();

/** Lets Playwright call the same stub `invoke` from `page.evaluate` (bare module specifiers are unavailable there). */
if (import.meta.env.VITE_PLAYWRIGHT === '1' && typeof window !== 'undefined') {
  (
    window as unknown as { __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__?: InvokeFn }
  ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__ = invoke;
}
