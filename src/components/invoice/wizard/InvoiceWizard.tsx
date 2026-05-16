import { Loader2 } from 'lucide-react';
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import * as React from 'react';

import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { formatDateForInput, formatDateForDisplay } from '@/lib/date-format';
import { invoiceTaxSnapshotFromItem } from '@/lib/parse-percentage';
import {
  parseMultiLinePaste,
  type ParsedPasteLine,
} from '@/lib/multiline-paste';
import type { Invoice, InvoiceLineItem } from '@/types/invoice';
import type { Item } from '@/types/item';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

type WizardStep = 1 | 2 | 3;

export interface InvoiceWizardDraftHeader {
  invoiceNumber: string;
  invoiceDate: string;
  supplierId: string;
  currency: string;
  shipmentId?: string;
  notes?: string;
}

export interface InvoiceWizardDraftLineItem extends InvoiceLineItem {
  partNumber?: string;
}

export interface InvoiceWizardDraft {
  id: string;
  header: InvoiceWizardDraftHeader;
  lines: InvoiceWizardDraftLineItem[];
  updatedAt: number;
  savedAt: number;
}

export interface InvoiceWizardProps {
  shipments: Shipment[];
  items: Item[];
  suppliers: Supplier[];
  invoices: Invoice[];
  onSubmit: (invoiceData: Omit<Invoice, 'id'>) => Promise<void> | void;
}

const DRAFT_STORAGE_KEY = 'invoice_wizard_drafts';
const MAX_DRAFTS = 20;
const DRAFT_TTL_DAYS = 30;
const DRAFT_TTL_MS = DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;

function isValidDraft(value: unknown): value is InvoiceWizardDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<InvoiceWizardDraft>;
  return (
    typeof draft.id === 'string' &&
    typeof draft.header === 'object' &&
    Array.isArray(draft.lines)
  );
}

function normalizeAndCleanupDrafts(rawDrafts: unknown): InvoiceWizardDraft[] {
  if (!Array.isArray(rawDrafts)) return [];

  const now = Date.now();
  const expiryTime = now - DRAFT_TTL_MS;

  const normalized = rawDrafts
    .filter(isValidDraft)
    .map(draft => {
      const fallbackTimestamp =
        typeof draft.updatedAt === 'number' && Number.isFinite(draft.updatedAt)
          ? draft.updatedAt
          : now;
      const savedAt =
        typeof draft.savedAt === 'number' && Number.isFinite(draft.savedAt)
          ? draft.savedAt
          : fallbackTimestamp;
      const updatedAt =
        typeof draft.updatedAt === 'number' && Number.isFinite(draft.updatedAt)
          ? draft.updatedAt
          : savedAt;

      return {
        ...draft,
        updatedAt,
        savedAt,
      };
    })
    .filter(draft => draft.savedAt >= expiryTime)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_DRAFTS);

  return normalized;
}

function readDrafts(): InvoiceWizardDraft[] {
  console.time('draftLoad');
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      console.timeEnd('draftLoad');
      return [];
    }
    const parsed = JSON.parse(raw);
    const cleaned = normalizeAndCleanupDrafts(parsed);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(cleaned));
    console.timeEnd('draftLoad');
    return cleaned;
  } catch {
    console.timeEnd('draftLoad');
    return [];
  }
}

function writeDrafts(drafts: InvoiceWizardDraft[]) {
  const cleaned = normalizeAndCleanupDrafts(drafts);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(cleaned));
}

function upsertDraft(draft: InvoiceWizardDraft) {
  const drafts = readDrafts();
  const now = Date.now();
  const normalizedDraft: InvoiceWizardDraft = {
    ...draft,
    updatedAt: now,
    savedAt: now,
  };
  const idx = drafts.findIndex(d => d.id === draft.id);
  if (idx >= 0) drafts[idx] = normalizedDraft;
  else drafts.push(normalizedDraft);
  writeDrafts(drafts);
}

function deleteDraft(draftId: string) {
  writeDrafts(readDrafts().filter(d => d.id !== draftId));
}

function getLatestDraftForShipment(
  shipmentId: string | undefined
): InvoiceWizardDraft | undefined {
  if (!shipmentId) return undefined;
  const drafts = readDrafts().filter(d => d.header?.shipmentId === shipmentId);
  if (drafts.length === 0) return undefined;
  drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  return drafts[0];
}

export function InvoiceWizard({
  shipments,
  items,
  suppliers,
  invoices,
  onSubmit,
}: InvoiceWizardProps) {
  const [step, setStep] = React.useState<WizardStep>(1);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [draftId, setDraftId] = React.useState<string>(() =>
    crypto.randomUUID()
  );
  const [loadedFromDraft, setLoadedFromDraft] = React.useState(false);

  const supplierOptions: ComboboxOption[] = suppliers.map(s => ({
    value: s.id,
    label: s.supplierName,
  }));

  // Filter out finalized shipments and shipments with existing invoices
  const availableShipments = React.useMemo(() => {
    // Backend already filters for unfinalized and uninvoiced shipments,
    // but we keep the logic here as a defensive double-check.
    const shipmentIdsWithInvoices = new Set(
      invoices.map(inv => inv.shipmentId)
    );

    const filtered = shipments.filter(s => {
      // Filter out shipments with status "Finalized", "Closed", or similar
      const status = s.status?.toLowerCase() || '';
      const isTerminal =
        status.includes('finalized') ||
        status.includes('closed') ||
        status.includes('completed') ||
        status.includes('delivered') ||
        status.includes('cancelled');

      // Filter out shipments that already have invoices
      const hasInvoices = shipmentIdsWithInvoices.has(s.id);

      return !isTerminal && !hasInvoices;
    });

    console.debug(
      'Available shipments (frontend filtered):',
      filtered.map(s => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        status: s.status,
      }))
    );

    if (shipments.length > 0 && filtered.length === 0) {
      console.warn(
        'Shipments exist but all were filtered out by frontend logic.'
      );
    }

    return filtered;
  }, [shipments, invoices]);

  const shipmentOptions: ComboboxOption[] = availableShipments.map(s => ({
    value: s.id,
    label: `${s.invoiceNumber} (${s.invoiceCurrency})`,
  }));

  if (shipments.length > 0 && availableShipments.length === 0) {
    // Safety fallback UI message
    console.log('No available shipments after filtering.');
  }

  const [header, setHeader] = React.useState<InvoiceWizardDraftHeader>(() => ({
    invoiceNumber: '',
    invoiceDate: formatDateForDisplay(new Date().toISOString().slice(0, 10)),
    supplierId: '',
    currency: 'USD',
    shipmentId: undefined,
    notes: '',
  }));

  const [lines, setLines] = React.useState<InvoiceWizardDraftLineItem[]>([]);
  const [pasteText, setPasteText] = React.useState('');
  const [parsedPreview, setParsedPreview] = React.useState<ParsedPasteLine[]>(
    []
  );
  const itemsLoading = React.useMemo(() => items.length === 0, [items]);
  const [invoiceFinalized, setInvoiceFinalized] = React.useState(false);
  const [shipmentFrozen, setShipmentFrozen] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);

  // Get selected shipment for date display
  const selectedShipment = React.useMemo(() => {
    const found = header.shipmentId
      ? availableShipments.find(s => s.id === header.shipmentId)
      : undefined;
    console.debug('Selected shipment:', found);
    return found;
  }, [header.shipmentId, availableShipments]);

  const currency = React.useMemo(() => {
    if (header.shipmentId) {
      const sh = availableShipments.find(s => s.id === header.shipmentId);
      return sh?.invoiceCurrency || header.currency;
    }
    return header.currency;
  }, [header.currency, header.shipmentId, availableShipments]);

  React.useEffect(() => {
    // If a shipment is selected, hydrate header fields from it
    if (header.shipmentId) {
      const sh = availableShipments.find(s => s.id === header.shipmentId);
      if (sh) {
        setHeader(prev => ({
          ...prev,
          invoiceNumber: sh.invoiceNumber,
          invoiceDate: formatDateForDisplay(sh.invoiceDate),
          supplierId: sh.supplierId,
          currency: sh.invoiceCurrency,
        }));
        setShipmentFrozen(
          !!sh.isFrozen || (sh.status || '').toLowerCase().includes('final')
        );
      }
    }
  }, [header.shipmentId, availableShipments]);

  const availableItems = React.useMemo(() => {
    if (!header.supplierId) return [] as Item[];
    return items.filter(i => i.supplierId === header.supplierId);
  }, [items, header.supplierId]);

  // Helper function to normalize part numbers for better matching
  const normalizeCode = (code: string): string => {
    return code
      .trim()
      .toUpperCase()
      .replace(/^0+/, '') // Remove leading zeros
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, '') // remove non-breaking/zero-width spaces
      .replace(/[^\w-]/g, '') // Remove special characters except hyphens
      .replace(/\s+/g, ''); // Remove all whitespace
  };

  // Helper function to normalize currency codes for Intl.NumberFormat
  const normalizeCurrencyCode = (currencyCode: string): string => {
    const normalized = currencyCode?.trim().toUpperCase() || 'USD';

    // Common currency code mappings
    const currencyMap: Record<string, string> = {
      EURO: 'EUR',
      DOLLAR: 'USD',
      POUND: 'GBP',
      YEN: 'JPY',
      WON: 'KRW',
      RUPEE: 'INR',
      YUAN: 'CNY',
    };

    return currencyMap[normalized] || normalized;
  };

  const partNumberToItem = React.useMemo(() => {
    const map = new Map<string, Item>();
    availableItems.forEach(it => {
      if (it.partNumber) {
        // Normalize part number for better matching
        const normalized = normalizeCode(it.partNumber);
        map.set(normalized, it);

        // Also store original for exact matches
        map.set(it.partNumber.trim().toUpperCase(), it);
      }
    });
    return map;
  }, [availableItems]);

  const itemIdOptions: ComboboxOption[] = availableItems.map(i => ({
    value: i.id,
    label: i.partNumber,
  }));

  const totalCalculated = React.useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
        0
      ),
    [lines]
  );

  const stepsCount = 3;
  const currentProgress =
    step === 1
      ? 100 / stepsCount
      : step === 2
        ? (100 / stepsCount) * 2
        : (100 / stepsCount) * 3;

  const validateHeader = () => {
    if (!header.invoiceNumber) return false;
    if (!header.invoiceDate) return false;
    if (!header.supplierId) return false;
    if (!currency) return false;

    // Additional validation: ensure selected shipment is available and not already invoiced
    if (header.shipmentId) {
      const selectedShipment = availableShipments.find(
        s => s.id === header.shipmentId
      );
      if (!selectedShipment) {
        return false;
      }

      // Check if shipment already has invoices
      const existingInvoices = invoices.filter(
        inv => inv.shipmentId === header.shipmentId
      );
      if (existingInvoices.length > 0) {
        return false;
      }
    }

    return true;
  };

  const handlePasteParse = () => {
    if (itemsLoading) {
      toast.warning('Items are still loading. Please wait before parsing.');
      return;
    }
    if (items.length === 0) {
      toast.warning('Item Master not loaded yet. Please wait.');
      return;
    }
    if (!pasteText.trim()) {
      setParsedPreview([]);
      return;
    }
    const parsed = parseMultiLinePaste(pasteText, {
      delimiter: 'auto',
      skipHeader: false,
    });

    // Add price comparison warnings to parsed lines
    const parsedWithWarnings = parsed.map(line => {
      const pnRaw = line.partNumber || '';
      const pn = pnRaw.trim().toUpperCase();
      const normalizedPn = pn ? normalizeCode(pn) : '';

      // Try multiple matching strategies
      let matchedItem = pn ? partNumberToItem.get(pn) : undefined;
      if (!matchedItem && normalizedPn) {
        matchedItem = partNumberToItem.get(normalizedPn);
      }

      if (
        matchedItem &&
        line.unitPrice !== undefined &&
        line.unitPrice !== matchedItem.unitPrice
      ) {
        return {
          ...line,
          priceWarning: {
            itemMasterPrice: matchedItem.unitPrice,
            pastedPrice: line.unitPrice,
            difference: line.unitPrice - matchedItem.unitPrice,
          },
        };
      }
      return {
        ...line,
        matched: !!matchedItem,
      };
    });

    setParsedPreview(parsedWithWarnings);
  };

  const acceptParsedPreview = () => {
    if (itemsLoading) {
      toast.warning(
        'Items are still loading. Please wait before adding lines.'
      );
      return;
    }
    if (items.length === 0) {
      toast.warning('Item Master not loaded yet. Please wait.');
      return;
    }
    if (!parsedPreview.length) return;
    const newLines: InvoiceWizardDraftLineItem[] = [];
    const notFound: string[] = [];

    parsedPreview.forEach(p => {
      const pnRaw = p.partNumber || '';
      const pn = pnRaw.trim().toUpperCase();
      const normalizedPn = pn ? normalizeCode(pn) : '';

      // Try multiple matching strategies
      let matched = pn ? partNumberToItem.get(pn) : undefined;
      if (!matched && normalizedPn) {
        matched = partNumberToItem.get(normalizedPn);
      }

      if (!matched) {
        notFound.push(p.partNumber || p.raw);
        return;
      }
      newLines.push({
        id: `tmp-${crypto.randomUUID()}`,
        itemId: matched.id,
        partNumber: matched.partNumber,
        quantity: p.quantity || 0,
        unitPrice: p.unitPrice ?? matched.unitPrice ?? 0,
        ...invoiceTaxSnapshotFromItem(matched),
      });
    });

    setLines(prev => [...prev, ...newLines]);
    setParsedPreview([]);
    setPasteText('');
    if (newLines.length) toast.success(`${newLines.length} line(s) added`);
    if (notFound.length) {
      toast.warning(
        `Skipped ${notFound.length} unknown parts: ${notFound.slice(0, 3).join(', ')}${notFound.length > 3 ? '...' : ''}`
      );
    }
  };

  const updateLine = (
    id: string,
    field: keyof InvoiceWizardDraftLineItem,
    value: string | number
  ) => {
    setLines(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const handleLineItemIdChange = (lineId: string, itemId: string) => {
    const item = items.find(i => i.id === itemId);
    setLines(prev =>
      prev.map(l => {
        if (l.id !== lineId) return l;
        if (!item) {
          return {
            ...l,
            itemId,
            dutyPercent: 0,
            swsPercent: 0,
            igstPercent: 0,
          };
        }
        const snap = invoiceTaxSnapshotFromItem(item);
        return {
          ...l,
          itemId,
          dutyPercent: snap.dutyPercent,
          swsPercent: snap.swsPercent,
          igstPercent: snap.igstPercent,
          unitPrice:
            l.unitPrice !== undefined && l.unitPrice !== 0
              ? l.unitPrice
              : item.unitPrice,
        };
      })
    );
  };

  const removeLine = (id: string) =>
    setLines(prev => prev.filter(l => l.id !== id));

  const saveDraft = () => {
    if (!validateHeader()) {
      toast.error('Please complete required header fields before saving draft');
      return;
    }
    setSaving(true);
    const draft: InvoiceWizardDraft = {
      id: draftId,
      header,
      lines,
      updatedAt: Date.now(),
      savedAt: Date.now(),
    };
    upsertDraft(draft);
    setTimeout(() => {
      setSaving(false);
      toast.success('Draft saved');
    }, 200);
  };

  const restoreDraft = (id: string) => {
    const found = readDrafts().find(d => d.id === id);
    if (!found) return;
    setDraftId(found.id);
    setHeader(found.header);
    setLines(found.lines);
    setLoadedFromDraft(true);
    toast.success('Draft restored');
  };

  const deleteCurrentDraft = () => {
    deleteDraft(draftId);
    setDraftId(crypto.randomUUID());
    toast.success('Draft deleted');
  };

  const handleSubmit = async () => {
    if (!validateHeader()) {
      // Check if the issue is with shipment availability or duplication
      if (header.shipmentId) {
        const selectedShipment = availableShipments.find(
          s => s.id === header.shipmentId
        );
        if (!selectedShipment) {
          toast.error(
            'Selected shipment is not available or has been finalized. Please select an active shipment.'
          );
          setStep(1);
          return;
        }

        // Check if shipment already has invoices
        const existingInvoices = invoices.filter(
          inv => inv.shipmentId === header.shipmentId
        );
        if (existingInvoices.length > 0) {
          toast.error(
            'This shipment already has an invoice. Please choose another.'
          );
          setStep(1);
          return;
        }
      }

      toast.error('Please complete required header fields');
      setStep(1);
      return;
    }
    if (lines.length === 0) {
      toast.error('Please add at least one line item');
      setStep(2);
      return;
    }

    // Build payload using selected shipment if present; otherwise, use header values
    const selectedShipment = header.shipmentId
      ? availableShipments.find(s => s.id === header.shipmentId)
      : undefined;
    const payload: Omit<Invoice, 'id'> = {
      invoiceNumber: selectedShipment?.invoiceNumber || header.invoiceNumber,
      shipmentId: selectedShipment?.id || '',
      invoiceDate:
        selectedShipment?.invoiceDate || formatDateForInput(header.invoiceDate),
      status: 'Draft',
      calculatedTotal: Math.round(totalCalculated * 100) / 100,
      shipmentTotal:
        selectedShipment?.invoiceValue ||
        Math.round(totalCalculated * 100) / 100,
      lineItems: lines.map(l => ({
        id: l.id,
        itemId: l.itemId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        dutyPercent: l.dutyPercent,
        swsPercent: l.swsPercent,
        igstPercent: l.igstPercent,
      })),
    };

    console.debug('Saving to shipmentId:', payload.shipmentId);

    try {
      setSubmitting(true);
      await onSubmit(payload);
      toast.success('Invoice saved');
      deleteDraft(draftId);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const draftList = React.useMemo(
    () => readDrafts().sort((a, b) => b.updatedAt - a.updatedAt),
    []
  );

  // Try to auto-load latest draft for selected shipment
  React.useEffect(() => {
    if (loadedFromDraft) return;
    const latest = getLatestDraftForShipment(header.shipmentId);
    if (latest) {
      setDraftId(latest.id);
      setHeader(latest.header);
      setLines(latest.lines);
      setLoadedFromDraft(true);
      toast.message('Loaded saved draft for this shipment');
    }
  }, [header.shipmentId, loadedFromDraft]);

  return (
    <div
      className="im-table-shell mx-auto w-full max-w-7xl"
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="im-btn im-btn--primary"
              onClick={saveDraft}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              Draft
            </button>
            {header.shipmentId && (
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => {
                  const d = getLatestDraftForShipment(header.shipmentId);
                  if (!d) {
                    toast.info('No saved draft for this shipment');
                    return;
                  }
                  setDraftId(d.id);
                  setHeader(d.header);
                  setLines(d.lines);
                  setLoadedFromDraft(true);
                  toast.success('Loaded saved draft');
                }}
              >
                View Saved Draft
              </button>
            )}
            <button
              type="button"
              className="im-btn"
              onClick={deleteCurrentDraft}
            >
              Delete Draft
            </button>
          </div>
        </div>
        <div
          style={{
            height: 4,
            background: 'var(--color-im-rule)',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${currentProgress}%`,
              background: 'var(--color-im-accent)',
              transition: 'width 0.3s',
            }}
          />
        </div>
        {loadedFromDraft && (
          <div style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
            Draft loaded
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
          Step {step} of {stepsCount}:{' '}
          {step === 1
            ? 'Invoice Header'
            : step === 2
              ? 'Invoice Lines'
              : 'Review & Save'}
        </div>
      </div>

      {/* Step 1: Header */}
      {step === 1 && (
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// HEADER INFO</span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-im-faint)',
                marginLeft: 12,
              }}
            >
              Invoice number/date, supplier, currency, and shipment.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 24,
            }}
          >
            <div>
              <p className="im-field-label">SHIPMENT</p>
              <Combobox
                options={shipmentOptions}
                value={header.shipmentId || ''}
                onChange={v =>
                  setHeader(h => ({ ...h, shipmentId: v || undefined }))
                }
                placeholder={
                  availableShipments.length > 0
                    ? 'Select shipment (optional)'
                    : 'No available shipments'
                }
                disabled={availableShipments.length === 0}
                emptyText={
                  shipments.length === 0
                    ? 'No unfinalized shipments found in database.'
                    : 'No available shipments (already invoiced or terminal status).'
                }
              />
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--color-im-muted)',
                  marginTop: 4,
                }}
              >
                Select from shipments without existing invoices.
              </p>
            </div>
            <div>
              <p className="im-field-label">SUPPLIER</p>
              <Combobox
                options={supplierOptions}
                value={header.supplierId}
                onChange={v => setHeader(h => ({ ...h, supplierId: v }))}
                placeholder="Select supplier"
                disabled={!!header.shipmentId}
              />
            </div>
            <div>
              <p className="im-field-label">INVOICE NUMBER</p>
              <input
                className="im-input"
                value={header.invoiceNumber}
                onChange={e =>
                  setHeader(h => ({ ...h, invoiceNumber: e.target.value }))
                }
                readOnly={!!header.shipmentId}
              />
            </div>
            <div>
              <p className="im-field-label">INVOICE DATE</p>
              <input
                className="im-input"
                type="date"
                value={formatDateForInput(header.invoiceDate)}
                onChange={e =>
                  setHeader(h => ({
                    ...h,
                    invoiceDate: formatDateForDisplay(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <p className="im-field-label">CURRENCY</p>
              <input
                className="im-input"
                value={currency}
                onChange={e =>
                  setHeader(h => ({ ...h, currency: e.target.value }))
                }
                readOnly={!!header.shipmentId}
              />
            </div>
            {selectedShipment && (
              <div>
                <p className="im-field-label">SHIPMENT DATE</p>
                <input
                  className="im-input"
                  type="date"
                  value={formatDateForInput(selectedShipment.invoiceDate)}
                  readOnly
                  style={{ background: 'var(--color-im-panel)' }}
                />
              </div>
            )}
            {selectedShipment && (
              <div style={{ gridColumn: '1 / -1' }}>
                <p className="im-field-label">SHIPMENT INVOICE TOTAL</p>
                <div
                  style={{
                    background: 'var(--color-im-panel)',
                    border: '1px solid var(--color-im-rule)',
                    padding: '8px 12px',
                    fontFamily: 'var(--font-im-mono)',
                    fontSize: 13,
                    color: 'var(--color-im-text)',
                  }}
                >
                  {new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency:
                      normalizeCurrencyCode(selectedShipment.invoiceCurrency) ||
                      'INR',
                  }).format(selectedShipment.invoiceValue || 0)}
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--color-im-muted)',
                    marginTop: 4,
                  }}
                >
                  Total invoice value linked to this shipment
                </p>
              </div>
            )}
            {/* Debug info - remove in production */}
            {process.env.NODE_ENV === 'development' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <p className="im-field-label">DEBUG INFO</p>
                <div
                  style={{
                    background: 'var(--color-im-panel)',
                    border: '1px solid var(--color-im-rule)',
                    padding: '8px 12px',
                    fontSize: 11,
                    color: 'var(--color-im-muted)',
                  }}
                >
                  <div>Selected Shipment ID: {header.shipmentId || 'None'}</div>
                  <div>Available Shipments: {availableShipments.length}</div>
                  <div>
                    Selected Shipment Found: {selectedShipment ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <p className="im-field-label">NOTES</p>
              <textarea
                className="im-textarea"
                value={header.notes || ''}
                onChange={e =>
                  setHeader(h => ({ ...h, notes: e.target.value }))
                }
                placeholder="Optional notes"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Lines with Multi-line Paste */}
      {step === 2 && (
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// INVOICE LINES</span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-im-faint)',
                marginLeft: 12,
              }}
            >
              Paste multiple lines or add manually. Only items of the selected
              supplier are allowed.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <p className="im-field-label" style={{ margin: 0 }}>
                    MULTI-LINE PASTE
                  </p>
                  {itemsLoading && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        color: 'var(--color-im-muted)',
                      }}
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
                      Item Master...
                    </div>
                  )}
                </div>
                <textarea
                  className="im-textarea"
                  placeholder="Paste lines here: partNumber, quantity, unitPrice, description, unit, hsn, bcd, igst"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  style={{ height: 144 }}
                  disabled={itemsLoading}
                />
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="im-btn im-btn--primary"
                    onClick={handlePasteParse}
                    disabled={itemsLoading}
                  >
                    Parse
                  </button>
                  <button
                    type="button"
                    className="im-btn im-btn--primary"
                    onClick={acceptParsedPreview}
                    disabled={!parsedPreview.length || itemsLoading}
                  >
                    Add Parsed Lines
                  </button>
                </div>
              </div>
              <div>
                <p className="im-field-label">PARSE PREVIEW</p>
                <div className="im-table-scroll" style={{ maxHeight: 160 }}>
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">PART NO</th>
                        <th className="im-th">QTY</th>
                        <th className="im-th">UNIT PRICE</th>
                        <th className="im-th">ERRORS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedPreview.map((p, idx) => (
                        <tr
                          key={idx}
                          className="im-tr"
                          style={
                            p.errors?.length
                              ? { background: 'rgba(220,38,38,0.08)' }
                              : p.matched === false
                                ? { background: 'rgba(234,179,8,0.08)' }
                                : undefined
                          }
                        >
                          <td className="im-td">
                            {p.matched === false ? (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{ color: 'var(--color-im-accent)' }}
                                >
                                  {p.partNumber || '-'}
                                </span>
                                <span style={{ fontSize: 11 }}>⚠️</span>
                              </div>
                            ) : (
                              p.partNumber || '-'
                            )}
                          </td>
                          <td className="im-td">{p.quantity ?? '-'}</td>
                          <td className="im-td">
                            {p.priceWarning ? (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{ color: 'var(--color-im-accent)' }}
                                >
                                  {p.unitPrice}
                                </span>
                                <span style={{ fontSize: 11 }}>⚠️</span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: 'var(--color-im-muted)',
                                  }}
                                >
                                  (master: {p.priceWarning.itemMasterPrice},
                                  diff:{' '}
                                  {p.priceWarning.difference > 0 ? '+' : ''}
                                  {p.priceWarning.difference})
                                </span>
                              </div>
                            ) : (
                              (p.unitPrice ?? '-')
                            )}
                          </td>
                          <td
                            className="im-td"
                            style={{
                              color: 'var(--color-im-bad)',
                              fontSize: 11,
                            }}
                          >
                            {p.errors?.join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div
              className="im-table-scroll"
              style={{ maxHeight: 'min(22rem, 45vh)' }}
            >
              <table
                className="im-table"
                style={{ minWidth: 1180, tableLayout: 'fixed' }}
              >
                <thead>
                  <tr>
                    <th
                      className="im-th"
                      style={{ width: 168, minWidth: 168, padding: '0 8px' }}
                    >
                      PART NO
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 220, minWidth: 220, padding: '0 8px' }}
                    >
                      DESCRIPTION
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 72, minWidth: 72, padding: '0 8px' }}
                    >
                      UNIT
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 112, minWidth: 112, padding: '0 8px' }}
                    >
                      QTY
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 128, minWidth: 128, padding: '0 8px' }}
                    >
                      UNIT PRICE
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 96, minWidth: 96, padding: '0 8px' }}
                    >
                      DUTY %
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 96, minWidth: 96, padding: '0 8px' }}
                    >
                      SWS %
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 96, minWidth: 96, padding: '0 8px' }}
                    >
                      IGST %
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 140, minWidth: 140, padding: '0 8px' }}
                    >
                      TOTAL
                    </th>
                    <th
                      className="im-th"
                      style={{ width: 52, minWidth: 52, padding: '0 4px' }}
                    >
                      ACT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => {
                    const item = items.find(i => i.id === line.itemId);
                    return (
                      <tr key={line.id} className="im-tr">
                        <td
                          className="im-td"
                          style={{ padding: '4px 8px', verticalAlign: 'top' }}
                        >
                          <Combobox
                            options={itemIdOptions}
                            value={line.itemId}
                            onChange={v => handleLineItemIdChange(line.id, v)}
                            placeholder="Select part"
                            disabled={!header.supplierId}
                          />
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            padding: '4px 8px',
                            verticalAlign: 'top',
                            fontSize: 12,
                          }}
                          title={item?.itemDescription || undefined}
                        >
                          {item?.itemDescription || '-'}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            whiteSpace: 'nowrap',
                            padding: '4px 8px',
                            verticalAlign: 'top',
                            fontSize: 12,
                          }}
                        >
                          {item?.unit || '-'}
                        </td>
                        <td
                          className="im-td"
                          style={{ padding: '4px 8px', verticalAlign: 'top' }}
                        >
                          <input
                            className="im-input"
                            type="number"
                            value={line.quantity}
                            onChange={e =>
                              updateLine(
                                line.id,
                                'quantity',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            style={{
                              minWidth: 88,
                              height: 36,
                              fontFamily: 'var(--font-im-mono)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        </td>
                        <td
                          className="im-td"
                          style={{ padding: '4px 8px', verticalAlign: 'top' }}
                        >
                          {(() => {
                            const item = items.find(i => i.id === line.itemId);
                            const hasPriceDifference =
                              item && line.unitPrice !== item.unitPrice;

                            return (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  minWidth: 0,
                                }}
                              >
                                <input
                                  className="im-input"
                                  type="number"
                                  value={line.unitPrice}
                                  onChange={e =>
                                    updateLine(
                                      line.id,
                                      'unitPrice',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  style={{
                                    minWidth: 96,
                                    height: 36,
                                    flexShrink: 0,
                                    fontFamily: 'var(--font-im-mono)',
                                    fontVariantNumeric: 'tabular-nums',
                                    ...(hasPriceDifference
                                      ? {
                                          borderColor: 'var(--color-im-accent)',
                                        }
                                      : {}),
                                  }}
                                />
                                {hasPriceDifference && (
                                  <span
                                    style={{
                                      color: 'var(--color-im-accent)',
                                      fontSize: 11,
                                      cursor: 'help',
                                    }}
                                    title={`Item Master: ${item?.unitPrice} | Current: ${line.unitPrice} | Diff: ${line.unitPrice - (item?.unitPrice || 0) > 0 ? '+' : ''}${line.unitPrice - (item?.unitPrice || 0)}`}
                                  >
                                    ⚠️
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td
                          className="im-td"
                          style={{ padding: '4px 8px', verticalAlign: 'top' }}
                        >
                          <input
                            className="im-input"
                            type="number"
                            step="0.01"
                            value={line.dutyPercent ?? 0}
                            onChange={e =>
                              updateLine(
                                line.id,
                                'dutyPercent',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            style={{
                              minWidth: 72,
                              height: 36,
                              fontFamily: 'var(--font-im-mono)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        </td>
                        <td
                          className="im-td"
                          style={{ padding: '4px 8px', verticalAlign: 'top' }}
                        >
                          <input
                            className="im-input"
                            type="number"
                            step="0.01"
                            value={line.swsPercent ?? 0}
                            onChange={e =>
                              updateLine(
                                line.id,
                                'swsPercent',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            style={{
                              minWidth: 72,
                              height: 36,
                              fontFamily: 'var(--font-im-mono)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        </td>
                        <td
                          className="im-td"
                          style={{ padding: '4px 8px', verticalAlign: 'top' }}
                        >
                          <input
                            className="im-input"
                            type="number"
                            step="0.01"
                            value={line.igstPercent ?? 0}
                            onChange={e =>
                              updateLine(
                                line.id,
                                'igstPercent',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            style={{
                              minWidth: 72,
                              height: 36,
                              fontFamily: 'var(--font-im-mono)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        </td>
                        <td
                          className="im-td"
                          style={{ padding: '4px 8px', verticalAlign: 'top' }}
                        >
                          <input
                            className="im-input"
                            value={(
                              (line.quantity || 0) * (line.unitPrice || 0)
                            ).toFixed(2)}
                            readOnly
                            style={{
                              minWidth: 112,
                              height: 36,
                              fontFamily: 'var(--font-im-mono)',
                              fontSize: 12,
                              fontVariantNumeric: 'tabular-nums',
                              background: 'var(--color-im-panel)',
                            }}
                          />
                        </td>
                        <td
                          className="im-td"
                          style={{ padding: '4px 4px', verticalAlign: 'top' }}
                        >
                          <button
                            type="button"
                            className="im-btn"
                            onClick={() => removeLine(line.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Currency:
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-im-mono)',
                    fontWeight: 700,
                    color: 'var(--color-im-text)',
                  }}
                >
                  {currency}
                </span>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Calculated Total:
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-im-mono)',
                    fontWeight: 700,
                    color: 'var(--color-im-text)',
                  }}
                >
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: normalizeCurrencyCode(currency),
                  }).format(totalCalculated)}
                </span>
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
                {invoiceFinalized
                  ? 'Invoice finalized'
                  : 'Invoice not finalized'}{' '}
                • {shipmentFrozen ? 'Shipment frozen' : 'Shipment not frozen'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="im-btn im-btn--primary"
                  disabled={
                    finalizing ||
                    invoiceFinalized ||
                    !header.shipmentId ||
                    Math.round(totalCalculated * 100) !==
                      Math.round(
                        (availableShipments.find(
                          s => s.id === header.shipmentId
                        )?.invoiceValue || 0) * 100
                      )
                  }
                  onClick={async () => {
                    const sh = header.shipmentId
                      ? availableShipments.find(s => s.id === header.shipmentId)
                      : undefined;
                    if (!sh) return toast.error('Select a shipment first');
                    const shipmentTotal = sh.invoiceValue || 0;
                    if (
                      Math.round(totalCalculated * 100) !==
                      Math.round(shipmentTotal * 100)
                    ) {
                      return toast.error(
                        'Cannot finalize. Calculated total must match shipment value.'
                      );
                    }
                    setFinalizing(true);
                    try {
                      // Persist a draft invoice as Finalized via existing page logic command
                      await invoke('add_invoice', {
                        payload: {
                          shipmentId: sh.id,
                          status: 'Finalized',
                          lineItems: lines.map(l => ({
                            itemId: l.itemId,
                            quantity: l.quantity,
                            unitPrice: l.unitPrice,
                            dutyPercent: l.dutyPercent,
                            swsPercent: l.swsPercent,
                            igstPercent: l.igstPercent,
                          })),
                        },
                      });
                      setInvoiceFinalized(true);
                      toast.success('Invoice finalized');
                    } catch (e) {
                      console.error(e);
                      toast.error('Failed to finalize invoice');
                    } finally {
                      setFinalizing(false);
                    }
                  }}
                >
                  {finalizing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}{' '}
                  Finalize Invoice
                </button>
                <button
                  type="button"
                  className="im-btn im-btn--primary"
                  disabled={finalizing || shipmentFrozen || !header.shipmentId}
                  onClick={async () => {
                    const sh = header.shipmentId
                      ? availableShipments.find(s => s.id === header.shipmentId)
                      : undefined;
                    if (!sh) return toast.error('Select a shipment first');
                    setFinalizing(true);
                    try {
                      await invoke('freeze_shipment', {
                        shipmentId: sh.id,
                        frozen: true,
                      });
                      setShipmentFrozen(true);
                      toast.success('Shipment frozen');
                    } catch (e) {
                      console.error(e);
                      toast.error('Failed to freeze shipment');
                    } finally {
                      setFinalizing(false);
                    }
                  }}
                >
                  {finalizing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}{' '}
                  Finalize Shipment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// REVIEW &amp; SAVE</span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-im-faint)',
                marginLeft: 12,
              }}
            >
              Confirm details before submit.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: 24,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">SUPPLIER</p>
                <p
                  style={{
                    fontFamily: 'var(--font-im-mono)',
                    fontSize: 12,
                    color: 'var(--color-im-text)',
                  }}
                >
                  {suppliers.find(s => s.id === header.supplierId)
                    ?.supplierName || '-'}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">INVOICE NUMBER</p>
                <p
                  style={{
                    fontFamily: 'var(--font-im-mono)',
                    fontSize: 12,
                    color: 'var(--color-im-text)',
                  }}
                >
                  {header.invoiceNumber}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">INVOICE DATE</p>
                <p
                  style={{
                    fontFamily: 'var(--font-im-mono)',
                    fontSize: 12,
                    color: 'var(--color-im-text)',
                  }}
                >
                  {header.invoiceDate}
                </p>
              </div>
            </div>
            <div
              className="im-table-scroll"
              style={{ border: '1px solid var(--color-im-rule)' }}
            >
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th">PART NO</th>
                    <th className="im-th">DESCRIPTION</th>
                    <th className="im-th">QTY</th>
                    <th className="im-th">UNIT PRICE</th>
                    <th className="im-th">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => {
                    const item = items.find(i => i.id === l.itemId);
                    const lineTotal = (l.quantity || 0) * (l.unitPrice || 0);
                    return (
                      <tr key={l.id} className="im-tr">
                        <td className="im-td">{item?.partNumber}</td>
                        <td className="im-td">{item?.itemDescription}</td>
                        <td className="im-td">{l.quantity}</td>
                        <td className="im-td">{l.unitPrice.toFixed(2)}</td>
                        <td className="im-td">{lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                Currency: {currency}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
                  Calculated Total
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-im-mono)',
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--color-im-text)',
                  }}
                >
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: normalizeCurrencyCode(currency),
                  }).format(totalCalculated)}
                </div>
              </div>
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}
            >
              <button
                type="button"
                className="im-btn"
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}{' '}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Nav */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
          }}
        >
          <span style={{ color: 'var(--color-im-muted)' }}>Recent Drafts:</span>
          {draftList.slice(0, 3).map(d => (
            <button
              key={d.id}
              type="button"
              className="im-btn"
              onClick={() => restoreDraft(d.id)}
              style={{ fontSize: 11 }}
            >
              {new Date(d.updatedAt).toLocaleString()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="im-btn"
            onClick={() => setStep(s => (s > 1 ? ((s - 1) as WizardStep) : s))}
            disabled={step === 1}
          >
            Previous
          </button>
          <button
            type="button"
            className="im-btn im-btn--primary"
            onClick={() => {
              if (step === 1 && !validateHeader()) {
                toast.error('Please complete header fields');
                return;
              }
              if (step === 2) {
                if (lines.length === 0) {
                  toast.error(
                    'Add at least one invoice line before continuing'
                  );
                  return;
                }
              }
              const maxStep = 3;
              setStep(s => (s < maxStep ? ((s + 1) as WizardStep) : s));
            }}
            disabled={
              (step === 1 && !validateHeader()) ||
              (step === 2 && lines.length === 0)
            }
          >
            {step < 3 ? 'Next' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  );
}
