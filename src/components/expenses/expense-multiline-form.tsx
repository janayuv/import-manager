import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { AlertTriangle, Calculator, Plus, Trash2, X } from 'lucide-react';

import React, { useEffect, useState } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
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
  const notifications = useUnifiedNotifications();
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
      notifications.success(
        'Expense Invoice Created',
        'Expense invoice created successfully.'
      );
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
    <div
      className="im-section"
      style={{ maxWidth: 1280, margin: '0 auto', width: '100%' }}
    >
      <div
        className="im-section__header"
        style={{ justifyContent: 'space-between' }}
      >
        <span className="im-section__label">// Add Multiple Expenses</span>
        <button className="im-btn im-btn--sm" onClick={onCancel}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div className="im-section__body">
        <p
          style={{
            color: 'var(--color-im-muted)',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Create expense invoice with multiple expense lines and automatic tax
          calculations
        </p>
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 32 }}
        >
          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div
              style={{
                padding: '8px 12px',
                border: '1px solid var(--color-im-rule)',
                fontSize: 12,
                color: 'var(--color-im-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle
                  style={{ width: 14, height: 14, flexShrink: 0 }}
                />
                <span>{duplicateWarning}</span>
              </div>
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={combineDuplicateExpenseTypes}
                style={{ marginLeft: 16 }}
              >
                Combine Duplicates
              </button>
            </div>
          )}

          {/* Invoice Header Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  background: 'var(--color-im-accent)',
                  height: 24,
                  width: 4,
                }}
              ></div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                Invoice Details
              </h3>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 24,
                background: 'var(--color-im-panel)',
                border: '1px solid var(--color-im-rule)',
                padding: 24,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Service Provider *</p>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Invoice Number *</p>
                <input
                  className="im-input"
                  id="invoice-number"
                  value={invoiceHeader.invoice_number}
                  onChange={e =>
                    setInvoiceHeader(prev => ({
                      ...prev,
                      invoice_number: e.target.value,
                    }))
                  }
                  placeholder="Enter invoice number"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Invoice Date *</p>
                <input
                  className="im-input"
                  id="invoice-date"
                  type="date"
                  value={invoiceHeader.invoice_date}
                  onChange={e =>
                    setInvoiceHeader(prev => ({
                      ...prev,
                      invoice_date: e.target.value,
                    }))
                  }
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Currency</p>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    background: 'var(--color-im-good)',
                    height: 24,
                    width: 4,
                  }}
                ></div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                  Expense Lines
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className="im-btn im-btn--sm"
                  onClick={handlePreview}
                  disabled={previewLoading}
                >
                  <Calculator
                    style={{
                      marginRight: 8,
                      width: 14,
                      height: 14,
                      display: 'inline',
                    }}
                  />
                  {previewLoading ? 'Calculating...' : 'Preview'}
                </button>
                <button
                  type="button"
                  className="im-btn im-btn--sm im-btn--primary"
                  onClick={addExpenseLine}
                >
                  <Plus
                    style={{
                      marginRight: 8,
                      width: 14,
                      height: 14,
                      display: 'inline',
                    }}
                  />
                  Add Line
                </button>
              </div>
            </div>

            {expenseLines.map((line, index) => (
              <div
                key={index}
                style={{
                  background: 'var(--color-im-panel)',
                  border: '1px solid var(--color-im-rule)',
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 24,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--color-im-rule)',
                    paddingBottom: 16,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div
                      style={{
                        background: 'rgba(232,162,58,0.10)',
                        color: 'var(--color-im-accent)',
                        width: 32,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {index + 1}
                    </div>
                    <h4 style={{ margin: 0, fontWeight: 600 }}>
                      Expense Line {index + 1}
                    </h4>
                  </div>
                  {expenseLines.length > 1 && (
                    <button
                      type="button"
                      className="im-btn im-btn--sm im-btn--danger"
                      onClick={() => removeExpenseLine(index)}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                </div>

                {/* Basic Details Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 24,
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <p className="im-field-label">Expense Type *</p>
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

                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <p className="im-field-label">Amount (₹) *</p>
                    <input
                      className="im-input"
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
                    />
                  </div>

                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <p className="im-field-label">Remarks</p>
                    <input
                      className="im-input"
                      value={line.remarks || ''}
                      onChange={e =>
                        updateExpenseLine(index, 'remarks', e.target.value)
                      }
                      placeholder="Optional remarks"
                    />
                  </div>
                </div>

                {/* Tax Rates Row */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <p className="im-field-label">Tax Rates (%)</p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{ color: 'var(--color-im-muted)', fontSize: 11 }}
                      >
                        CGST Rate (%)
                      </p>
                      <input
                        className="im-input"
                        type="number"
                        step="1"
                        value={line.cgst_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'cgst_rate', percentage);
                        }}
                        placeholder="9"
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{ color: 'var(--color-im-muted)', fontSize: 11 }}
                      >
                        SGST Rate (%)
                      </p>
                      <input
                        className="im-input"
                        type="number"
                        step="1"
                        value={line.sgst_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'sgst_rate', percentage);
                        }}
                        placeholder="9"
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{ color: 'var(--color-im-muted)', fontSize: 11 }}
                      >
                        IGST Rate (%)
                      </p>
                      <input
                        className="im-input"
                        type="number"
                        step="1"
                        value={line.igst_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'igst_rate', percentage);
                        }}
                        placeholder="0"
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{ color: 'var(--color-im-muted)', fontSize: 11 }}
                      >
                        TDS Rate (%)
                      </p>
                      <input
                        className="im-input"
                        type="number"
                        step="1"
                        value={line.tds_rate}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          updateExpenseLine(index, 'tds_rate', percentage);
                        }}
                        placeholder="2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Preview Section */}
          {showPreview && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{ height: 24, width: 4, background: '#7c3aed' }}
                ></div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                  Calculation Preview
                </h3>
              </div>
              <div
                style={{
                  background: 'var(--color-im-panel)',
                  border: '1px solid var(--color-im-rule)',
                  padding: 24,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 24,
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontWeight: 500 }}>
                      Line Details
                    </h4>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {preview.lines.map((line, index) => (
                        <div
                          key={index}
                          style={{
                            background: '#fff',
                            border: '1px solid var(--color-im-rule)',
                            padding: 8,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {line.expense_type_name}
                          </div>
                          <div
                            style={{
                              color: 'var(--color-im-muted)',
                              fontSize: 12,
                            }}
                          >
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
                          <div
                            style={{
                              color: 'var(--color-im-good)',
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          >
                            Total: {formatCurrency(line.total_amount_paise)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontWeight: 500 }}>
                      Invoice Summary
                    </h4>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Total Amount:</span>
                        <span style={{ fontWeight: 500 }}>
                          {formatCurrency(preview.total_amount_paise)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Total CGST:</span>
                        <span>
                          {formatCurrency(preview.total_cgst_amount_paise)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Total SGST:</span>
                        <span>
                          {formatCurrency(preview.total_sgst_amount_paise)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Total IGST:</span>
                        <span>
                          {formatCurrency(preview.total_igst_amount_paise)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Total TDS:</span>
                        <span>
                          {formatCurrency(preview.total_tds_amount_paise)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderTop: '1px solid var(--color-im-rule)',
                          paddingTop: 8,
                          fontWeight: 600,
                        }}
                      >
                        <span>Net Amount:</span>
                        <span style={{ color: 'var(--color-im-good)' }}>
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 16,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            <button type="button" className="im-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="im-btn im-btn--primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
