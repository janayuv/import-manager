import { Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import * as React from 'react';

import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDateForInput, formatDateForDisplay } from '@/lib/date-format';
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
}

export interface InvoiceWizardProps {
  shipments: Shipment[];
  items: Item[];
  suppliers: Supplier[];
  invoices: Invoice[];
  onSubmit: (invoiceData: Omit<Invoice, 'id'>) => Promise<void> | void;
}

const DRAFT_STORAGE_KEY = 'invoice_wizard_drafts';

function readDrafts(): InvoiceWizardDraft[] {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: InvoiceWizardDraft[]) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function upsertDraft(draft: InvoiceWizardDraft) {
  const drafts = readDrafts();
  const idx = drafts.findIndex(d => d.id === draft.id);
  if (idx >= 0) drafts[idx] = draft;
  else drafts.push(draft);
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
    // Get shipment IDs that already have invoices (any status)
    const shipmentIdsWithInvoices = new Set(
      invoices.map(inv => inv.shipmentId)
    );

    const filtered = shipments.filter(s => {
      // Filter out shipments with status "Finalized", "Closed", or similar
      const status = s.status?.toLowerCase() || '';
      const isFinalized =
        status.includes('finalized') ||
        status.includes('closed') ||
        status.includes('completed');

      // Filter out shipments that already have invoices
      const hasInvoices = shipmentIdsWithInvoices.has(s.id);

      return !isFinalized && !hasInvoices;
    });

    console.debug(
      'Available shipments:',
      filtered.map(s => ({ id: s.id, invoiceNumber: s.invoiceNumber }))
    );
    return filtered;
  }, [shipments, invoices]);

  const shipmentOptions: ComboboxOption[] = availableShipments.map(s => ({
    value: s.id,
    label: `${s.invoiceNumber} (${s.invoiceCurrency})`,
  }));

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

      // Debug logging for unmatched items
      if (!matchedItem && pn) {
        const keys = Array.from(partNumberToItem.keys());
        console.log(
          `Item lookup failed: raw=${pnRaw}, normalized=${normalizedPn}, itemMasterCount=${items.length}, sample=[${keys.slice(0, 10).join(', ')}]`
        );
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
        const keys = Array.from(partNumberToItem.keys());
        console.log(
          `Failed to add item: raw=${pnRaw}, normalized=${normalizedPn}, itemMasterCount=${items.length}, sample=[${keys.slice(0, 10).join(', ')}]`
        );
        return;
      }
      newLines.push({
        id: `tmp-${crypto.randomUUID()}`,
        itemId: matched.id,
        partNumber: matched.partNumber,
        quantity: p.quantity || 0,
        unitPrice: p.unitPrice ?? matched.unitPrice ?? 0,
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
      console.log('All skipped items:', notFound);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.shipmentId]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Invoice Entry Wizard</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={saveDraft} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              Draft
            </Button>
            {header.shipmentId && (
              <Button
                variant="secondary"
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
              </Button>
            )}
            <Button variant="ghost" onClick={deleteCurrentDraft}>
              Delete Draft
            </Button>
          </div>
        </div>
        <Progress value={currentProgress} />
        {loadedFromDraft && (
          <div className="text-muted-foreground text-xs">Draft loaded</div>
        )}
        <div className="text-muted-foreground text-xs">
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
        <Card>
          <CardHeader>
            <CardTitle>Header Info</CardTitle>
            <CardDescription>
              Invoice number/date, supplier, currency, and shipment.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Shipment</Label>
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
                  availableShipments.length === 0
                    ? 'No available shipments'
                    : 'No shipments found'
                }
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Select from shipments without existing invoices.
              </p>
            </div>
            <div>
              <Label>Supplier</Label>
              <Combobox
                options={supplierOptions}
                value={header.supplierId}
                onChange={v => setHeader(h => ({ ...h, supplierId: v }))}
                placeholder="Select supplier"
                disabled={!!header.shipmentId}
              />
            </div>
            <div>
              <Label>Invoice Number</Label>
              <Input
                value={header.invoiceNumber}
                onChange={e =>
                  setHeader(h => ({ ...h, invoiceNumber: e.target.value }))
                }
                readOnly={!!header.shipmentId}
              />
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input
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
              <Label>Currency</Label>
              <Input
                value={currency}
                onChange={e =>
                  setHeader(h => ({ ...h, currency: e.target.value }))
                }
                readOnly={!!header.shipmentId}
              />
            </div>
            {selectedShipment && (
              <div>
                <Label>Shipment Date</Label>
                <Input
                  type="date"
                  value={formatDateForInput(selectedShipment.invoiceDate)}
                  readOnly
                  className="bg-muted"
                />
              </div>
            )}
            {selectedShipment && (
              <div className="md:col-span-2 lg:col-span-4">
                <Label>Shipment Invoice Total</Label>
                <div className="text-muted-foreground bg-muted rounded p-2 text-sm font-medium">
                  {new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency:
                      normalizeCurrencyCode(selectedShipment.invoiceCurrency) ||
                      'INR',
                  }).format(selectedShipment.invoiceValue || 0)}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Total invoice value linked to this shipment
                </p>
              </div>
            )}
            {/* Debug info - remove in production */}
            {process.env.NODE_ENV === 'development' && (
              <div className="md:col-span-2 lg:col-span-4">
                <Label>Debug Info</Label>
                <div className="text-muted-foreground bg-muted rounded p-2 text-xs">
                  <div>Selected Shipment ID: {header.shipmentId || 'None'}</div>
                  <div>Available Shipments: {availableShipments.length}</div>
                  <div>
                    Selected Shipment Found: {selectedShipment ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            )}
            <div className="md:col-span-2 lg:col-span-4">
              <Label>Notes</Label>
              <Textarea
                value={header.notes || ''}
                onChange={e =>
                  setHeader(h => ({ ...h, notes: e.target.value }))
                }
                placeholder="Optional notes"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Lines with Multi-line Paste */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Invoice Lines</CardTitle>
            <CardDescription>
              Paste multiple lines or add manually. Only items of the selected
              supplier are allowed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <Label>Multi-line Paste</Label>
                  {itemsLoading && (
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
                      Item Master...
                    </div>
                  )}
                </div>
                <Textarea
                  placeholder="Paste lines here: partNumber, quantity, unitPrice, description, unit, hsn, bcd, igst"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  className="h-36"
                  disabled={itemsLoading}
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePasteParse}
                    disabled={itemsLoading}
                  >
                    Parse
                  </Button>
                  <Button
                    type="button"
                    onClick={acceptParsedPreview}
                    disabled={!parsedPreview.length || itemsLoading}
                  >
                    Add Parsed Lines
                  </Button>
                </div>
              </div>
              <div>
                <Label>Parse Preview</Label>
                <div className="max-h-40 overflow-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part No</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedPreview.map((p, idx) => (
                        <TableRow
                          key={idx}
                          className={
                            p.errors?.length
                              ? 'bg-destructive/10'
                              : p.matched === false
                                ? 'bg-warning/10'
                                : ''
                          }
                        >
                          <TableCell>
                            {p.matched === false ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1">
                                    <span className="text-warning-foreground">
                                      {p.partNumber || '-'}
                                    </span>
                                    <span className="text-warning-foreground text-xs">
                                      ⚠️
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    Item not found in Item Master
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              p.partNumber || '-'
                            )}
                          </TableCell>
                          <TableCell>{p.quantity ?? '-'}</TableCell>
                          <TableCell>
                            {p.priceWarning ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1">
                                    <span className="text-warning-foreground">
                                      {p.unitPrice}
                                    </span>
                                    <span className="text-warning-foreground text-xs">
                                      ⚠️
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    <div>
                                      Item Master:{' '}
                                      {p.priceWarning.itemMasterPrice}
                                    </div>
                                    <div>
                                      Pasted: {p.priceWarning.pastedPrice}
                                    </div>
                                    <div
                                      className={
                                        p.priceWarning.difference > 0
                                          ? 'text-destructive'
                                          : 'text-green-600'
                                      }
                                    >
                                      Difference:{' '}
                                      {p.priceWarning.difference > 0 ? '+' : ''}
                                      {p.priceWarning.difference}
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              (p.unitPrice ?? '-')
                            )}
                          </TableCell>
                          <TableCell className="text-destructive text-xs">
                            {p.errors?.join(', ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Part No</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[80px]">Unit</TableHead>
                    <TableHead className="w-[100px]">Qty</TableHead>
                    <TableHead className="w-[120px]">Unit Price</TableHead>
                    <TableHead className="w-[120px]">Total</TableHead>
                    <TableHead className="w-[50px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => {
                    const item = items.find(i => i.id === line.itemId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Combobox
                            options={itemIdOptions}
                            value={line.itemId}
                            onChange={v => updateLine(line.id, 'itemId', v)}
                            placeholder="Select part"
                            disabled={!header.supplierId}
                          />
                        </TableCell>
                        <TableCell>{item?.itemDescription || '-'}</TableCell>
                        <TableCell>{item?.unit || '-'}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={line.quantity}
                            onChange={e =>
                              updateLine(
                                line.id,
                                'quantity',
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const item = items.find(i => i.id === line.itemId);
                            const hasPriceDifference =
                              item && line.unitPrice !== item.unitPrice;

                            return (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  value={line.unitPrice}
                                  onChange={e =>
                                    updateLine(
                                      line.id,
                                      'unitPrice',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className={
                                    hasPriceDifference ? 'border-warning' : ''
                                  }
                                />
                                {hasPriceDifference && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-warning-foreground cursor-help text-xs">
                                        ⚠️
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs">
                                        <div>
                                          Item Master: {item?.unitPrice}
                                        </div>
                                        <div>Current: {line.unitPrice}</div>
                                        <div
                                          className={
                                            line.unitPrice -
                                              (item?.unitPrice || 0) >
                                            0
                                              ? 'text-destructive'
                                              : 'text-green-600'
                                          }
                                        >
                                          Difference:{' '}
                                          {line.unitPrice -
                                            (item?.unitPrice || 0) >
                                          0
                                            ? '+'
                                            : ''}
                                          {line.unitPrice -
                                            (item?.unitPrice || 0)}
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={(
                              (line.quantity || 0) * (line.unitPrice || 0)
                            ).toFixed(2)}
                            readOnly
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            onClick={() => removeLine(line.id)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end text-sm">
              <div className="space-x-6">
                <span className="text-muted-foreground">Currency:</span>
                <span className="font-semibold">{currency}</span>
                <span className="text-muted-foreground ml-6">
                  Calculated Total:
                </span>
                <span className="font-semibold">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: normalizeCurrencyCode(currency),
                  }).format(totalCalculated)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-muted-foreground text-xs">
                {invoiceFinalized
                  ? 'Invoice finalized'
                  : 'Invoice not finalized'}{' '}
                • {shipmentFrozen ? 'Shipment frozen' : 'Shipment not frozen'}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
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
                </Button>
                <Button
                  variant="secondary"
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
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Save</CardTitle>
            <CardDescription>Confirm details before submit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div>
                <Label>Supplier</Label>
                <div className="text-sm font-medium">
                  {suppliers.find(s => s.id === header.supplierId)
                    ?.supplierName || '-'}
                </div>
              </div>
              <div>
                <Label>Invoice Number</Label>
                <div className="text-sm font-medium">
                  {header.invoiceNumber}
                </div>
              </div>
              <div>
                <Label>Invoice Date</Label>
                <div className="text-sm font-medium">{header.invoiceDate}</div>
              </div>
            </div>
            <div className="rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part No</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(l => {
                    const item = items.find(i => i.id === l.itemId);
                    const lineTotal = (l.quantity || 0) * (l.unitPrice || 0);
                    return (
                      <TableRow key={l.id}>
                        <TableCell>{item?.partNumber}</TableCell>
                        <TableCell>{item?.itemDescription}</TableCell>
                        <TableCell>{l.quantity}</TableCell>
                        <TableCell>{l.unitPrice.toFixed(2)}</TableCell>
                        <TableCell>{lineTotal.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-sm">
                Currency: {currency}
              </div>
              <div className="text-right">
                <div className="text-muted-foreground text-sm">
                  Calculated Total
                </div>
                <div className="text-lg font-semibold">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: normalizeCurrencyCode(currency),
                  }).format(totalCalculated)}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}{' '}
                Submit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer Nav */}
      <div className="flex justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Recent Drafts:</span>
          {draftList.slice(0, 3).map(d => (
            <Button
              key={d.id}
              size="sm"
              variant="ghost"
              onClick={() => restoreDraft(d.id)}
            >
              {new Date(d.updatedAt).toLocaleString()}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setStep(s => (s > 1 ? ((s - 1) as WizardStep) : s))}
            disabled={step === 1}
          >
            Previous
          </Button>
          <Button
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
          </Button>
        </div>
      </div>
    </div>
  );
}
