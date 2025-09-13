import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Calculator, Plus, Trash2, X } from 'lucide-react';

import React, { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ExpenseInvoicePayload,
  ExpenseInvoicePreview,
  ExpenseLine,
  ExpenseType,
  ServiceProvider,
} from '@/types/expense';

interface ExpenseMultilineFormProps {
  shipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ExpenseMultilineForm({
  shipmentId,
  onSuccess,
  onCancel,
}: ExpenseMultilineFormProps) {
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>(
    []
  );
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<ExpenseInvoicePreview | null>(null);

  // Form state - using the new production-grade structure
  // Tax rates are now stored as percentages (9 = 9%) instead of basis points
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([
    {
      expense_type_id: '',
      amount_paise: 0,
      cgst_rate: 0, // Now stored as percentage (9 = 9%)
      sgst_rate: 0, // Now stored as percentage (9 = 9%)
      igst_rate: 0, // Now stored as percentage (9 = 9%)
      tds_rate: 0, // Now stored as percentage (9 = 9%)
      remarks: '',
    },
  ]);

  // Invoice header state
  const [invoiceHeader, setInvoiceHeader] = useState({
    service_provider_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    currency: 'INR',
  });

  useEffect(() => {
    loadData();
  }, []);

  // Check for duplicate expense types
  useEffect(() => {
    const expenseTypeIds = expenseLines
      .map(line => line.expense_type_id)
      .filter(id => id !== '');

    const uniqueIds = new Set(expenseTypeIds);

    if (expenseTypeIds.length !== uniqueIds.size) {
      const duplicates = expenseTypeIds.filter(
        (id, index) => expenseTypeIds.indexOf(id) !== index
      );
      const duplicateType = expenseTypes.find(
        type => type.id === duplicates[0]
      );
      setDuplicateWarning(
        `Duplicate expense type "${duplicateType?.name}" detected. Consider combining amounts or using different expense types.`
      );
    } else {
      setDuplicateWarning(null);
    }
  }, [expenseLines, expenseTypes]);

  const loadData = async () => {
    try {
      const [providers, types] = await Promise.all([
        invoke<ServiceProvider[]>('get_service_providers'),
        invoke<ExpenseType[]>('get_expense_types'),
      ]);

      setServiceProviders(providers);
      setExpenseTypes(types);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const addExpenseLine = () => {
    setExpenseLines([
      ...expenseLines,
      {
        expense_type_id: '',
        amount_paise: 0,
        cgst_rate: 0, // Now stored as percentage (9 = 9%)
        sgst_rate: 0, // Now stored as percentage (9 = 9%)
        igst_rate: 0, // Now stored as percentage (9 = 9%)
        tds_rate: 0, // Now stored as percentage (9 = 9%)
        remarks: '',
      },
    ]);
  };

  const removeExpenseLine = (index: number) => {
    if (expenseLines.length > 1) {
      setExpenseLines(expenseLines.filter((_, i) => i !== index));
    }
  };

  const combineDuplicateExpenseTypes = () => {
    const expenseTypeGroups = new Map<string, ExpenseLine[]>();

    // Group expense lines by expense type
    expenseLines.forEach(line => {
      if (line.expense_type_id) {
        const existing = expenseTypeGroups.get(line.expense_type_id) || [];
        expenseTypeGroups.set(line.expense_type_id, [...existing, line]);
      }
    });

    // Create new expense lines with combined amounts
    const combinedLines: ExpenseLine[] = [];
    expenseTypeGroups.forEach((lines, expenseTypeId) => {
      if (lines.length === 1) {
        combinedLines.push(lines[0]);
      } else {
        // Combine multiple lines of the same type
        const combinedLine: ExpenseLine = {
          expense_type_id: expenseTypeId,
          amount_paise: lines.reduce((sum, line) => sum + line.amount_paise, 0),
          cgst_rate: lines[0].cgst_rate, // Use first line's rates (now percentages)
          sgst_rate: lines[0].sgst_rate,
          igst_rate: lines[0].igst_rate,
          tds_rate: lines[0].tds_rate,
          remarks:
            lines
              .map(line => line.remarks)
              .filter(Boolean)
              .join('; ') || '',
        };
        combinedLines.push(combinedLine);
      }
    });

    setExpenseLines(combinedLines);
  };

  const updateExpenseLine = (
    index: number,
    field: keyof ExpenseLine,
    value: string | number
  ) => {
    setExpenseLines(prevLines =>
      prevLines.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      )
    );
  };

  const getExpenseTypeDefaults = (expenseTypeId: string) => {
    const expenseType = expenseTypes.find(et => et.id === expenseTypeId);
    if (expenseType) {
      // Normalize incoming rates that may be in basis points (900 => 9) or already in percentage (9 => 9)
      const normalizeToPercent = (raw: number) => (raw > 100 ? raw / 100 : raw);
      return {
        cgst_rate: normalizeToPercent(expenseType.defaultCgstRate),
        sgst_rate: normalizeToPercent(expenseType.defaultSgstRate),
        igst_rate: normalizeToPercent(expenseType.defaultIgstRate),
      };
    }
    return { cgst_rate: 0, sgst_rate: 0, igst_rate: 0 };
  };

  const handleExpenseTypeChange = (index: number, expenseTypeId: string) => {
    const defaults = getExpenseTypeDefaults(expenseTypeId);
    setExpenseLines(prevLines =>
      prevLines.map((line, i) =>
        i === index
          ? {
              ...line,
              expense_type_id: expenseTypeId,
              cgst_rate: defaults.cgst_rate,
              sgst_rate: defaults.sgst_rate,
              igst_rate: defaults.igst_rate,
            }
          : line
      )
    );
  };

  const validateForm = () => {
    // Validate invoice header
    if (
      !invoiceHeader.service_provider_id ||
      !invoiceHeader.invoice_number ||
      !invoiceHeader.invoice_date
    ) {
      return false;
    }

    // Validate expense lines
    for (const line of expenseLines) {
      if (!line.expense_type_id || line.amount_paise <= 0) {
        return false;
      }
    }

    return true;
  };

  const handlePreview = async () => {
    if (!validateForm()) {
      return;
    }

    setPreviewLoading(true);
    try {
      // Convert percentage rates to basis points for backend
      const linesWithBasisPoints = expenseLines.map(line => ({
        ...line,
        cgst_rate: Math.round(line.cgst_rate * 100), // Convert percentage to basis points
        sgst_rate: Math.round(line.sgst_rate * 100),
        igst_rate: Math.round(line.igst_rate * 100),
        tds_rate: Math.round(line.tds_rate * 100),
      }));

      const payload: ExpenseInvoicePayload = {
        shipment_id: shipmentId,
        service_provider_id: invoiceHeader.service_provider_id,
        invoice_number: invoiceHeader.invoice_number,
        invoice_date: invoiceHeader.invoice_date,
        currency: invoiceHeader.currency,
        idempotency_key: undefined, // No idempotency for preview
        lines: linesWithBasisPoints,
      };

      const previewResult = await invoke<ExpenseInvoicePreview>(
        'preview_expense_invoice',
        {
          payload,
        }
      );
      setPreview(previewResult);
      setShowPreview(true);
    } catch (error) {
      console.error('Failed to preview invoice:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Check for duplicate expense types
    const expenseTypeIds = expenseLines.map(line => line.expense_type_id);
    const uniqueIds = new Set(expenseTypeIds);

    if (expenseTypeIds.length !== uniqueIds.size) {
      // Duplicate expense type found - validation will prevent submission
      return;
    }

    setLoading(true);
    try {
      // Convert percentage rates to basis points for backend
      const linesWithBasisPoints = expenseLines.map(line => ({
        ...line,
        cgst_rate: Math.round(line.cgst_rate * 100), // Convert percentage to basis points
        sgst_rate: Math.round(line.sgst_rate * 100),
        igst_rate: Math.round(line.igst_rate * 100),
        tds_rate: Math.round(line.tds_rate * 100),
      }));

      // Create expense invoice using the new production-grade module
      const payload: ExpenseInvoicePayload = {
        shipment_id: shipmentId,
        service_provider_id: invoiceHeader.service_provider_id,
        invoice_number: invoiceHeader.invoice_number,
        invoice_date: invoiceHeader.invoice_date,
        currency: invoiceHeader.currency,
        idempotency_key: crypto.randomUUID(), // Generate unique idempotency key
        lines: linesWithBasisPoints,
      };

      await invoke('create_expense_invoice', { payload });
      onSuccess();
    } catch (error) {
      console.error('Failed to create expense invoice:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (paise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(paise / 100);
  };

  const formatPercentage = (basisPoints: number) => {
    return `${(basisPoints / 100).toFixed(2)}%`;
  };

  return (
    <Card className="mx-auto w-full max-w-7xl">
      <CardHeader className="bg-card/50 border-b">
        <CardTitle className="flex items-center justify-between text-xl">
          <span>Add Multiple Expenses</span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          Create expense invoice with multiple expense lines and automatic tax
          calculations
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Duplicate Warning */}
          {duplicateWarning && (
            <Alert className="bg-warning/10">
              <AlertTriangle className="text-warning h-4 w-4" />
              <AlertDescription className="text-warning-foreground">
                <div className="flex items-center justify-between">
                  <span>{duplicateWarning}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={combineDuplicateExpenseTypes}
                    className="text-warning hover:bg-warning/20 ml-4"
                  >
                    Combine Duplicates
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Invoice Header Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="bg-primary h-6 w-1 rounded-full"></div>
              <h3 className="text-foreground text-lg font-semibold">
                Invoice Details
              </h3>
            </div>
            <div className="bg-card/50 grid grid-cols-1 gap-6 rounded-lg border p-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label
                  htmlFor="service-provider"
                  className="text-sm font-medium"
                >
                  Service Provider *
                </Label>
                <Select
                  value={invoiceHeader.service_provider_id}
                  onValueChange={value =>
                    setInvoiceHeader(prev => ({
                      ...prev,
                      service_provider_id: value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select service provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceProviders.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice-number" className="text-sm font-medium">
                  Invoice Number *
                </Label>
                <Input
                  id="invoice-number"
                  value={invoiceHeader.invoice_number}
                  onChange={e =>
                    setInvoiceHeader(prev => ({
                      ...prev,
                      invoice_number: e.target.value,
                    }))
                  }
                  placeholder="Enter invoice number"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice-date" className="text-sm font-medium">
                  Invoice Date *
                </Label>
                <Input
                  id="invoice-date"
                  type="date"
                  value={invoiceHeader.invoice_date}
                  onChange={e =>
                    setInvoiceHeader(prev => ({
                      ...prev,
                      invoice_date: e.target.value,
                    }))
                  }
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="text-sm font-medium">
                  Currency
                </Label>
                <Select
                  value={invoiceHeader.currency}
                  onValueChange={value =>
                    setInvoiceHeader(prev => ({
                      ...prev,
                      currency: value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Expense Lines Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-success h-6 w-1 rounded-full"></div>
                <h3 className="text-foreground text-lg font-semibold">
                  Expense Lines
                </h3>
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="h-9"
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  {previewLoading ? 'Calculating...' : 'Preview'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addExpenseLine}
                  className="h-9"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Line
                </Button>
              </div>
            </div>

            {expenseLines.map((line, index) => (
              <div
                key={index}
                className="bg-secondary space-y-6 rounded-lg border p-6 shadow-sm"
              >
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold">
                      {index + 1}
                    </div>
                    <h4 className="text-foreground font-semibold">
                      Expense Line {index + 1}
                    </h4>
                  </div>
                  {expenseLines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExpenseLine(index)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Basic Details Row */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Expense Type *
                    </Label>
                    <Select
                      value={line.expense_type_id}
                      onValueChange={value =>
                        handleExpenseTypeChange(index, value)
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select expense type" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseTypes.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Amount (₹) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.amount_paise / 100}
                      onChange={e => {
                        const rupees = parseFloat(e.target.value) || 0;
                        updateExpenseLine(
                          index,
                          'amount_paise',
                          Math.round(rupees * 100)
                        );
                      }}
                      placeholder="0.00"
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Remarks</Label>
                    <Input
                      value={line.remarks || ''}
                      onChange={e =>
                        updateExpenseLine(index, 'remarks', e.target.value)
                      }
                      placeholder="Optional remarks"
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Tax Rates Row */}
                <div className="space-y-3">
                  <Label className="text-foreground text-sm font-medium">
                    Tax Rates (%)
                  </Label>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs font-medium">
                        CGST Rate (%)
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        value={line.cgst_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'cgst_rate', percentage);
                        }}
                        placeholder="9"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs font-medium">
                        SGST Rate (%)
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        value={line.sgst_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'sgst_rate', percentage);
                        }}
                        placeholder="9"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs font-medium">
                        IGST Rate (%)
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        value={line.igst_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'igst_rate', percentage);
                        }}
                        placeholder="0"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs font-medium">
                        TDS Rate (%)
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        value={line.tds_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'tds_rate', percentage);
                        }}
                        placeholder="2"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Preview Section */}
          {showPreview && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-6 w-1 rounded-full bg-purple-600"></div>
                <h3 className="text-foreground text-lg font-semibold">
                  Calculation Preview
                </h3>
              </div>
              <div className="bg-card/50 rounded-lg border p-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-foreground mb-2 font-medium">
                      Line Details
                    </h4>
                    <div className="space-y-2">
                      {preview.lines.map((line, index) => (
                        <div
                          key={index}
                          className="rounded border bg-white p-2"
                        >
                          <div className="text-sm font-medium">
                            {line.expense_type_name}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            Amount: {formatCurrency(line.amount_paise)} | CGST:{' '}
                            {formatCurrency(line.cgst_amount_paise)} (
                            {formatPercentage(line.cgst_rate)}) | SGST:{' '}
                            {formatCurrency(line.sgst_amount_paise)} (
                            {formatPercentage(line.sgst_rate)}) | IGST:{' '}
                            {formatCurrency(line.igst_amount_paise)} (
                            {formatPercentage(line.igst_rate)}) | TDS:{' '}
                            {formatCurrency(line.tds_amount_paise)} (
                            {formatPercentage(line.tds_rate)})
                          </div>
                          <div className="text-success text-xs font-medium">
                            Total: {formatCurrency(line.total_amount_paise)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-foreground mb-2 font-medium">
                      Invoice Summary
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Amount:</span>
                        <span className="font-medium">
                          {formatCurrency(preview.total_amount_paise)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total CGST:</span>
                        <span>
                          {formatCurrency(preview.total_cgst_amount_paise)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total SGST:</span>
                        <span>
                          {formatCurrency(preview.total_sgst_amount_paise)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total IGST:</span>
                        <span>
                          {formatCurrency(preview.total_igst_amount_paise)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total TDS:</span>
                        <span>
                          {formatCurrency(preview.total_tds_amount_paise)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2 font-semibold">
                        <span>Net Amount:</span>
                        <span className="text-success">
                          {formatCurrency(preview.net_amount_paise)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 border-t pt-6">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Invoice'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
