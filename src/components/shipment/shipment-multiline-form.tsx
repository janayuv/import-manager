// src/components/shipment/shipment-multiline-form.tsx
// Multi-line paste form for bulk shipment creation
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Loader2,
  Ship,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  parseShipmentMultiLinePaste,
  generateShipmentTemplate,
  type ParsedShipmentLine,
  type ShipmentPasteParseOptions,
} from '@/lib/shipment-multiline-paste';
import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';

interface ShipmentMultilineFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSuccess: () => void;
  suppliers: Option[];
  categories: Option[];
  incoterms: Option[];
  modes: Option[];
  types: Option[];
  statuses: Option[];
  currencies: Option[];
  existingShipments: Shipment[];
}

export function ShipmentMultilineForm({
  isOpen,
  onOpenChange,
  onSuccess,
  suppliers,
  categories,
  incoterms,
  modes,
  types,
  statuses,
  currencies,
  existingShipments,
}: ShipmentMultilineFormProps) {
  const [pasteText, setPasteText] = React.useState('');
  const [parsedPreview, setParsedPreview] = React.useState<
    ParsedShipmentLine[]
  >([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string | null>(
    null
  );

  const parseOptions: ShipmentPasteParseOptions = React.useMemo(
    () => ({
      suppliers: suppliers.map(s => ({ id: s.value, name: s.label })),
      categories: categories.map(c => ({ id: c.value, name: c.label })),
      incoterms: incoterms.map(i => ({ id: i.value, name: i.label })),
      modes: modes.map(m => ({ id: m.value, name: m.label })),
      types: types.map(t => ({ id: t.value, name: t.label })),
      statuses: statuses.map(s => ({ id: s.value, name: s.label })),
      currencies: currencies.map(c => ({ id: c.value, name: c.label })),
    }),
    [suppliers, categories, incoterms, modes, types, statuses, currencies]
  );

  const handlePasteParse = React.useCallback(() => {
    if (!pasteText.trim()) {
      toast.error('Please paste some data first.');
      return;
    }

    setIsPreviewLoading(true);
    try {
      const parsed = parseShipmentMultiLinePaste(pasteText, parseOptions);
      setParsedPreview(parsed);

      // Check for duplicates
      const existingInvoiceNumbers = new Set(
        existingShipments.map(s => s.invoiceNumber.toLowerCase())
      );
      const duplicates = parsed.filter(
        line =>
          line.invoiceNumber &&
          existingInvoiceNumbers.has(line.invoiceNumber.toLowerCase())
      );

      if (duplicates.length > 0) {
        setDuplicateWarning(
          `${duplicates.length} shipment(s) with duplicate invoice numbers will be skipped.`
        );
      } else {
        setDuplicateWarning(null);
      }

      toast.success(`Parsed ${parsed.length} shipment(s) successfully.`);
    } catch (error) {
      console.error('Failed to parse paste data:', error);
      toast.error('Failed to parse the pasted data. Please check the format.');
    } finally {
      setIsPreviewLoading(false);
    }
  }, [pasteText, parseOptions, existingShipments]);

  const handleDownloadTemplate = React.useCallback(async () => {
    try {
      const template = generateShipmentTemplate();
      const suggestedPath = await save({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: 'shipment-import-template.csv',
      });

      if (suggestedPath) {
        await writeTextFile(suggestedPath, template);
        toast.success('Template downloaded successfully!');
      }
    } catch (error) {
      console.error('Failed to download template:', error);
      toast.error('Failed to download template.');
    }
  }, []);

  const handleAcceptParsedPreview = React.useCallback(async () => {
    if (parsedPreview.length === 0) {
      toast.error('No valid shipments to import.');
      return;
    }

    setIsProcessing(true);
    try {
      const existingInvoiceNumbers = new Set(
        existingShipments.map(s => s.invoiceNumber.toLowerCase())
      );

      const validShipments = parsedPreview.filter(
        line =>
          line.invoiceNumber &&
          !existingInvoiceNumbers.has(line.invoiceNumber.toLowerCase()) &&
          !line.errors?.length
      );

      if (validShipments.length === 0) {
        toast.info('No new valid shipments to import.');
        return;
      }

      let maxId = existingShipments.reduce(
        (max, s) => Math.max(max, parseInt(s.id.split('-')[1] || '0')),
        0
      );

      const shipmentsToCreate: Omit<Shipment, 'id'>[] = validShipments.map(
        line => {
          maxId++;
          return {
            supplierId: line.supplierId || '',
            invoiceNumber: line.invoiceNumber || '',
            invoiceDate: line.invoiceDate || '',
            goodsCategory: line.goodsCategory || '',
            invoiceValue: line.invoiceValue || 0,
            invoiceCurrency: line.invoiceCurrency || '',
            incoterm: line.incoterm || '',
            shipmentMode: line.shipmentMode || '',
            shipmentType: line.shipmentType || '',
            blAwbNumber: line.blAwbNumber || '',
            blAwbDate: line.blAwbDate || '',
            vesselName: line.vesselName || '',
            containerNumber: line.containerNumber || '',
            grossWeightKg: line.grossWeightKg || 0,
            etd: line.etd || '',
            eta: line.eta || '',
            status: line.status || 'docs-rcvd',
            dateOfDelivery: line.dateOfDelivery || '',
            isFrozen: false,
          };
        }
      );

      // Create shipments one by one
      for (const shipmentData of shipmentsToCreate) {
        const newId = `SHP-${(maxId++).toString().padStart(3, '0')}`;
        const newShipment: Shipment = { id: newId, ...shipmentData };
        await invoke('add_shipment', { shipment: newShipment });
      }

      toast.success(
        `Successfully imported ${shipmentsToCreate.length} shipment(s)!`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to import shipments:', error);
      toast.error('Failed to import shipments. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [parsedPreview, existingShipments, onSuccess, onOpenChange]);

  const handleClear = React.useCallback(() => {
    setPasteText('');
    setParsedPreview([]);
    setDuplicateWarning(null);
  }, []);

  const getStatusIcon = (line: ParsedShipmentLine) => {
    if (line.errors?.length) {
      return <XCircle className="text-destructive h-4 w-4" />;
    }
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  };

  const getStatusBadge = (line: ParsedShipmentLine) => {
    if (line.errors?.length) {
      return (
        <Badge variant="destructive" className="text-xs">
          {line.errors.length} error(s)
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="text-xs">
        Valid
      </Badge>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-6xl overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Ship className="text-primary h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-semibold">
                  Bulk Shipment Import
                </CardTitle>
                <CardDescription>
                  Paste shipment data from Excel or CSV files
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left Column - Paste Area */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Paste Shipment Data
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  disabled={isProcessing}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              </div>

              <Textarea
                placeholder="Paste shipment data here: Supplier, Invoice Number, Invoice Date, Goods Category, Invoice Value, Currency, Incoterm, Shipment Mode, Shipment Type, BL/AWB Number, BL/AWB Date, Vessel Name, Container Number, Gross Weight (KG), ETD, ETA, Status, Date of Delivery"
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                className="h-64 font-mono text-sm"
                disabled={isProcessing}
              />

              <div className="flex gap-2">
                <Button
                  onClick={handlePasteParse}
                  disabled={
                    !pasteText.trim() || isProcessing || isPreviewLoading
                  }
                >
                  {isPreviewLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    'Parse Data'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={isProcessing}
                >
                  Clear
                </Button>
              </div>

              {duplicateWarning && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm text-yellow-800">
                    {duplicateWarning}
                  </span>
                </div>
              )}
            </div>

            {/* Right Column - Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Parse Preview ({parsedPreview.length} shipments)
                </Label>
                {parsedPreview.length > 0 && (
                  <Button
                    onClick={handleAcceptParsedPreview}
                    disabled={
                      isProcessing ||
                      parsedPreview.some(line => line.errors?.length)
                    }
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      'Import Valid Shipments'
                    )}
                  </Button>
                )}
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto">
                {parsedPreview.length === 0 ? (
                  <div className="text-muted-foreground py-8 text-center">
                    <Ship className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>
                      No data parsed yet. Paste shipment data and click "Parse
                      Data".
                    </p>
                  </div>
                ) : (
                  parsedPreview.map((line, index) => (
                    <Card key={`preview-${index}`} className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            {getStatusIcon(line)}
                            <span className="text-sm font-medium">
                              {line.invoiceNumber || 'No Invoice Number'}
                            </span>
                            {getStatusBadge(line)}
                          </div>

                          <div className="text-muted-foreground space-y-1 text-xs">
                            <div>
                              <strong>Supplier:</strong>{' '}
                              {line.supplierId || 'Not matched'}
                            </div>
                            <div>
                              <strong>Category:</strong>{' '}
                              {line.goodsCategory || 'Not matched'}
                            </div>
                            <div>
                              <strong>Value:</strong>{' '}
                              {line.invoiceValue
                                ? `${line.invoiceCurrency || ''} ${line.invoiceValue}`
                                : 'Invalid'}
                            </div>
                            <div>
                              <strong>Date:</strong>{' '}
                              {line.invoiceDate || 'Invalid'}
                            </div>
                          </div>

                          {line.errors?.length && (
                            <div className="text-destructive mt-2 text-xs">
                              <strong>Errors:</strong> {line.errors.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
