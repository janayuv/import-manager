import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';

import * as React from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formStateToSavePayload,
  validateAiExtractionForm,
  type EditableLineItem,
  type ExtractionFormState,
} from '@/lib/ai-invoice-extraction-validate';
import { cn } from '@/lib/utils';
import type {
  ExtractInvoiceResponse,
  SaveAiExtractedResult,
} from '@/types/ai-invoice-extraction';

function newLineKey(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function responseToFormState(
  data: ExtractInvoiceResponse
): ExtractionFormState {
  const lines: EditableLineItem[] = (data.invoice?.lineItems ?? []).map(li => ({
    key: newLineKey(),
    partNumber: li.partNumber ?? '',
    itemName: li.itemName ?? '',
    quantity: String(li.quantity ?? ''),
    unitPrice: String(li.unitPrice ?? ''),
  }));
  if (lines.length === 0) {
    lines.push({
      key: newLineKey(),
      partNumber: '',
      itemName: '',
      quantity: '1',
      unitPrice: '1',
    });
  }
  return {
    supplierName: data.supplier?.supplierName ?? '',
    invoiceNumber: data.shipment?.invoiceNumber ?? '',
    invoiceDate: data.shipment?.invoiceDate ?? '',
    invoiceValue: String(data.shipment?.invoiceValue ?? ''),
    invoiceCurrency: data.shipment?.invoiceCurrency ?? '',
    shipmentTotal: String(data.invoice?.shipmentTotal ?? ''),
    lines,
  };
}

type AIExtractionPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExtractInvoiceResponse | null;
  onSaveSuccess?: () => void;
};

export function AIExtractionPreviewDialog({
  open,
  onOpenChange,
  data,
  onSaveSuccess,
}: AIExtractionPreviewDialogProps) {
  const [form, setForm] = React.useState<ExtractionFormState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && data) {
      setForm(responseToFormState(data));
      setServerError(null);
    }
  }, [open, data]);

  const { ok, errors: vErrors } = React.useMemo(
    () => (form ? validateAiExtractionForm(form) : { ok: false, errors: {} }),
    [form]
  );

  const canSave = ok && !saving;

  const setField = (patch: Partial<ExtractionFormState>) => {
    setForm(f => (f ? { ...f, ...patch } : f));
  };

  const setLine = (key: string, patch: Partial<EditableLineItem>) => {
    setForm(f => {
      if (!f) return f;
      return {
        ...f,
        lines: f.lines.map(li => (li.key === key ? { ...li, ...patch } : li)),
      };
    });
  };

  const addLine = () => {
    setForm(f => {
      if (!f) return f;
      return {
        ...f,
        lines: [
          ...f.lines,
          {
            key: newLineKey(),
            partNumber: '',
            itemName: '',
            quantity: '1',
            unitPrice: '1',
          },
        ],
      };
    });
  };

  const removeLine = (key: string) => {
    setForm(f => {
      if (!f || f.lines.length <= 1) return f;
      return { ...f, lines: f.lines.filter(li => li.key !== key) };
    });
  };

  const handleSave = async () => {
    if (!form) return;
    setServerError(null);
    const v = validateAiExtractionForm(form);
    if (!v.ok) return;
    setSaving(true);
    try {
      const payload = formStateToSavePayload(form);
      const res = await invoke<SaveAiExtractedResult>(
        'save_ai_extracted_invoice',
        {
          payload,
        }
      );
      if (res.warnings?.length) {
        toast.success('Invoice created successfully.', {
          description: res.warnings.join(' '),
          duration: 14_000,
        });
      } else {
        toast.success('Invoice created successfully.');
      }
      onOpenChange(false);
      onSaveSuccess?.();
    } catch (e) {
      const msg =
        typeof e === 'string'
          ? e
          : e && typeof e === 'object' && 'message' in e
            ? String((e as { message?: string }).message)
            : 'Failed to save invoice.';
      setServerError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!form) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl" showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>Review extracted invoice</DialogTitle>
            <DialogDescription>Loading…</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => !saving && onOpenChange(o)}>
      <DialogContent
        className="flex max-h-[90vh] max-w-[calc(100%-2rem)] flex-col overflow-hidden sm:max-w-3xl"
        showCloseButton={!saving}
        onPointerDownOutside={e => {
          if (saving) e.preventDefault();
        }}
        onEscapeKeyDown={e => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Review &amp; save invoice</DialogTitle>
          <DialogDescription>
            Edit the extracted data, then save to create supplier, shipment, and
            draft invoice. Line items require a matching part number in Item
            Master.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'min-h-0 flex-1 space-y-4 overflow-y-auto pr-1',
            saving && 'pointer-events-none opacity-60'
          )}
        >
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Save failed</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ai-supplier">Supplier name</Label>
              <Input
                id="ai-supplier"
                value={form.supplierName}
                onChange={e => setField({ supplierName: e.target.value })}
                autoComplete="off"
              />
              {vErrors.supplierName && (
                <p className="text-destructive text-sm">
                  {vErrors.supplierName}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-inv-no">Invoice number</Label>
              <Input
                id="ai-inv-no"
                value={form.invoiceNumber}
                onChange={e => setField({ invoiceNumber: e.target.value })}
              />
              {vErrors.invoiceNumber && (
                <p className="text-destructive text-sm">
                  {vErrors.invoiceNumber}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-inv-date">Invoice date</Label>
              <Input
                id="ai-inv-date"
                value={form.invoiceDate}
                onChange={e => setField({ invoiceDate: e.target.value })}
              />
              {vErrors.invoiceDate && (
                <p className="text-destructive text-sm">
                  {vErrors.invoiceDate}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-inv-val">Invoice value</Label>
              <Input
                id="ai-inv-val"
                type="number"
                step="any"
                value={form.invoiceValue}
                onChange={e => setField({ invoiceValue: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-cur">Currency</Label>
              <Input
                id="ai-cur"
                value={form.invoiceCurrency}
                onChange={e => setField({ invoiceCurrency: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ai-ship-tot">Shipment total</Label>
              <Input
                id="ai-ship-tot"
                type="number"
                step="any"
                value={form.shipmentTotal}
                onChange={e => setField({ shipmentTotal: e.target.value })}
              />
              {vErrors.shipmentTotal && (
                <p className="text-destructive text-sm">
                  {vErrors.shipmentTotal}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Line items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add row
              </Button>
            </div>
            <div className="space-y-3">
              {form.lines.map((li, idx) => {
                const le = vErrors.lines?.[li.key];
                return (
                  <div
                    key={li.key}
                    className="grid gap-2 rounded-md border p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <div className="space-y-1 sm:col-span-2">
                      <span className="text-muted-foreground text-xs">
                        Part #
                      </span>
                      <Input
                        value={li.partNumber}
                        onChange={e =>
                          setLine(li.key, { partNumber: e.target.value })
                        }
                        placeholder="Part number"
                      />
                      {le?.partNumber && (
                        <p className="text-destructive text-xs">
                          {le.partNumber}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <span className="text-muted-foreground text-xs">
                        Item name
                      </span>
                      <Input
                        value={li.itemName}
                        onChange={e =>
                          setLine(li.key, { itemName: e.target.value })
                        }
                        placeholder="Description"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <span className="text-muted-foreground text-xs">Qty</span>
                      <Input
                        type="number"
                        step="any"
                        value={li.quantity}
                        onChange={e =>
                          setLine(li.key, { quantity: e.target.value })
                        }
                      />
                      {le?.quantity && (
                        <p className="text-destructive text-xs">
                          {le.quantity}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <span className="text-muted-foreground text-xs">
                        Unit price
                      </span>
                      <Input
                        type="number"
                        step="any"
                        value={li.unitPrice}
                        onChange={e =>
                          setLine(li.key, { unitPrice: e.target.value })
                        }
                      />
                      {le?.unitPrice && (
                        <p className="text-destructive text-xs">
                          {le.unitPrice}
                        </p>
                      )}
                    </div>
                    <div className="flex sm:col-span-3 sm:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={form.lines.length <= 1}
                        onClick={() => removeLine(li.key)}
                        aria-label={`Remove line ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save Invoice'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
