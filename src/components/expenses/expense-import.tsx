'use client';

import * as ExcelJS from 'exceljs';
import { useCallback, useState } from 'react';
import { safeInvoke as invoke } from '@/lib/ipc-safe';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import { Combobox } from '@/components/ui/combobox';
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import type { ExpenseType, ServiceProvider } from '@/types/expense';
import type { Shipment } from '@/types/shipment';

interface ImportExpenseRow {
  expenseTypeName: string;
  serviceProviderName: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  tdsAmount: number;
  totalAmount: number;
  remarks?: string;
}

// This interface is for future backend integration
// interface ImportExpenseData {
//   shipmentId: string
//   expenses: ImportExpenseRow[]
// }

interface ExpenseImportProps {
  shipments: Shipment[];
  expenseTypes: ExpenseType[];
  serviceProviders: ServiceProvider[];
  onImportSuccess: () => void;
}

export default function ExpenseImport({
  shipments,
  expenseTypes,
  serviceProviders,
  onImportSuccess,
}: ExpenseImportProps) {
  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [selectedShipment, setSelectedShipment] = useState<string>('');
  const [importData, setImportData] = useState<ImportExpenseRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  void onImportSuccess;

  // Validation function
  const validateImportData = useCallback(
    (data: ImportExpenseRow[]): string[] => {
      const errors: string[] = [];

      if (data.length === 0) {
        errors.push('No data found in the file');
        return errors;
      }

      data.forEach((row, index) => {
        const rowNumber = index + 1;

        // Required fields validation
        if (!row.expenseTypeName?.trim()) {
          errors.push(`Row ${rowNumber}: Expense Type is required`);
        }
        if (!row.serviceProviderName?.trim()) {
          errors.push(`Row ${rowNumber}: Service Provider is required`);
        }
        if (!row.invoiceNo?.trim()) {
          errors.push(`Row ${rowNumber}: Invoice No is required`);
        }
        if (!row.invoiceDate?.trim()) {
          errors.push(`Row ${rowNumber}: Invoice Date is required`);
        }

        // Date validation
        if (row.invoiceDate && isNaN(Date.parse(row.invoiceDate))) {
          errors.push(
            `Row ${rowNumber}: Invalid Invoice Date format (use YYYY-MM-DD)`
          );
        }

        // Amount validation
        if (isNaN(row.amount) || row.amount <= 0) {
          errors.push(`Row ${rowNumber}: Amount must be a positive number`);
        }
        if (isNaN(row.cgstAmount) || row.cgstAmount < 0) {
          errors.push(
            `Row ${rowNumber}: CGST Amount must be a non-negative number`
          );
        }
        if (isNaN(row.sgstAmount) || row.sgstAmount < 0) {
          errors.push(
            `Row ${rowNumber}: SGST Amount must be a non-negative number`
          );
        }
        if (isNaN(row.igstAmount) || row.igstAmount < 0) {
          errors.push(
            `Row ${rowNumber}: IGST Amount must be a non-negative number`
          );
        }
        if (isNaN(row.tdsAmount) || row.tdsAmount < 0) {
          errors.push(
            `Row ${rowNumber}: TDS Amount must be a non-negative number`
          );
        }
        if (isNaN(row.totalAmount) || row.totalAmount <= 0) {
          errors.push(
            `Row ${rowNumber}: Total Amount must be a positive number`
          );
        }

        // Cross-reference validation
        const expenseType = expenseTypes.find(
          et => et.name.toLowerCase() === row.expenseTypeName?.toLowerCase()
        );
        if (!expenseType) {
          errors.push(
            `Row ${rowNumber}: Expense Type "${row.expenseTypeName}" not found`
          );
        }

        const serviceProvider = serviceProviders.find(
          sp => sp.name.toLowerCase() === row.serviceProviderName?.toLowerCase()
        );
        if (!serviceProvider) {
          errors.push(
            `Row ${rowNumber}: Service Provider "${row.serviceProviderName}" not found`
          );
        }
      });

      return errors;
    },
    [expenseTypes, serviceProviders]
  );

  // Parse file (CSV or Excel)
  const parseFile = useCallback(
    async (file: File): Promise<ImportExpenseRow[]> => {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (fileExtension === 'csv') {
        return parseCSV(file);
      } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
        return parseExcel(file);
      } else {
        throw new Error(
          'Unsupported file format. Please use CSV or Excel files.'
        );
      }
    },
    []
  );

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      setProgress(10);
      setValidationErrors([]);
      setImportData([]);

      try {
        const data = await parseFile(file);
        setProgress(50);

        const errors = validateImportData(data);
        setValidationErrors(errors);

        if (errors.length === 0) {
          setImportData(data);
        } else {
          notifications.warning(
            'Expense import validation',
            errors.length === 1
              ? errors[0]
              : `${errors.length} issues found. Review the list below.`
          );
        }

        setProgress(100);
      } catch (error) {
        console.error('Error parsing file:', error);
        const msg =
          error instanceof Error
            ? error.message
            : 'Failed to parse file. Please ensure it matches the template format.';
        setValidationErrors([msg]);
        notifications.warning('Expense import validation', msg);
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    },
    [validateImportData, parseFile, notifications]
  );

  // Parse CSV file
  const parseCSV = async (file: File): Promise<ImportExpenseRow[]> => {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error(
        'File must contain at least a header row and one data row'
      );
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data: ImportExpenseRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length < headers.length) continue;

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      data.push({
        expenseTypeName: row['Expense Type'] || row['expenseTypeName'] || '',
        serviceProviderName:
          row['Service Provider'] || row['serviceProviderName'] || '',
        invoiceNo: row['Invoice No'] || row['invoiceNo'] || '',
        invoiceDate: row['Invoice Date'] || row['invoiceDate'] || '',
        amount: parseFloat(row['Amount'] || row['amount'] || '0'),
        cgstAmount: parseFloat(row['CGST Amount'] || row['cgstAmount'] || '0'),
        sgstAmount: parseFloat(row['SGST Amount'] || row['sgstAmount'] || '0'),
        igstAmount: parseFloat(row['IGST Amount'] || row['igstAmount'] || '0'),
        tdsAmount: parseFloat(row['TDS Amount'] || row['tdsAmount'] || '0'),
        totalAmount: parseFloat(
          row['Total Amount'] || row['totalAmount'] || '0'
        ),
        remarks: row['Remarks'] || row['remarks'] || '',
      });
    }

    return data;
  };

  // Parse Excel file
  const parseExcel = async (file: File): Promise<ImportExpenseRow[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new Error('No worksheet found in the Excel file');
    }

    const data: ImportExpenseRow[] = [];
    let headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        headers = row.values as string[];
        return;
      }

      const values = row.values as string[];
      if (values.length < headers.length) return;

      const rowData: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header && values[index] !== undefined) {
          rowData[header] = values[index];
        }
      });

      data.push({
        expenseTypeName:
          rowData['Expense Type'] || rowData['expenseTypeName'] || '',
        serviceProviderName:
          rowData['Service Provider'] || rowData['serviceProviderName'] || '',
        invoiceNo: rowData['Invoice No'] || rowData['invoiceNo'] || '',
        invoiceDate: rowData['Invoice Date'] || rowData['invoiceDate'] || '',
        amount: parseFloat(rowData['Amount'] || rowData['amount'] || '0'),
        cgstAmount: parseFloat(
          rowData['CGST Amount'] || rowData['cgstAmount'] || '0'
        ),
        sgstAmount: parseFloat(
          rowData['SGST Amount'] || rowData['sgstAmount'] || '0'
        ),
        igstAmount: parseFloat(
          rowData['IGST Amount'] || rowData['igstAmount'] || '0'
        ),
        tdsAmount: parseFloat(
          rowData['TDS Amount'] || rowData['tdsAmount'] || '0'
        ),
        totalAmount: parseFloat(
          rowData['Total Amount'] || rowData['totalAmount'] || '0'
        ),
        remarks: rowData['Remarks'] || rowData['remarks'] || '',
      });
    });

    return data;
  };

  // Download template
  const downloadTemplate = () => {
    const headers = [
      'Expense Type',
      'Service Provider',
      'Invoice No',
      'Invoice Date',
      'Amount',
      'CGST Amount',
      'SGST Amount',
      'IGST Amount',
      'TDS Amount',
      'Total Amount',
      'Remarks',
    ];

    const sampleData = [
      'Customs Clearance',
      'ABC Logistics Ltd',
      'INV-001',
      '2024-01-15',
      '5000.00',
      '450.00',
      '450.00',
      '0.00',
      '250.00',
      '5250.00',
      'Customs clearance charges',
    ];

    const csvContent = [headers.join(','), sampleData.join(',')].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expense-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    notifications.success(
      'Template Downloaded',
      'Expense import template downloaded successfully!'
    );
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedShipment) {
      notifications.error('Validation Error', 'Please select a shipment first');
      return;
    }

    if (importData.length === 0) {
      notifications.error('Validation Error', 'No data to import');
      return;
    }

    if (validationErrors.length > 0) {
      notifications.error(
        'Validation Error',
        'Please fix validation errors before importing'
      );
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const selectedShipmentData = shipments.find(
        s => s.id === selectedShipment
      );
      if (!selectedShipmentData) {
        throw new Error('Selected shipment not found');
      }

      // Prepare bulk expense payload with individual invoice details for each row
      const bulkPayload = {
        shipmentId: selectedShipment,
        currency: selectedShipmentData.invoiceCurrency || 'INR',
        expenses: await Promise.all(
          importData.map(async row => {
            // Find service provider for this specific row
            const serviceProvider = serviceProviders.find(
              sp =>
                sp.name.toLowerCase() === row.serviceProviderName?.toLowerCase()
            );

            if (!serviceProvider) {
              throw new Error(
                `Service provider "${row.serviceProviderName}" not found`
              );
            }

            return {
              expenseTypeName: row.expenseTypeName,
              serviceProviderId: serviceProvider.id,
              invoiceNo: row.invoiceNo,
              invoiceDate: row.invoiceDate,
              amount: row.amount,
              cgstAmount: row.cgstAmount,
              sgstAmount: row.sgstAmount,
              igstAmount: row.igstAmount,
              tdsAmount: row.tdsAmount,
              totalAmount: row.totalAmount,
              remarks: row.remarks || null,
            };
          })
        ),
      };

      setProgress(50);

      await invoke('add_expenses_bulk', {
        payload: bulkPayload,
      });

      setProgress(100);
      notifications.expense.imported(importData.length);
      setImportData([]);
      setSelectedShipment('');
      onImportSuccess();
    } catch (error) {
      console.error('Import error:', error);
      notifications.expense.error('import expenses', String(error));
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedShipment('');
    setImportData([]);
    setValidationErrors([]);
    setPreviewMode(false);
  };

  const selectedShipmentData = shipments.find(s => s.id === selectedShipment);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="im-section">
        <div className="im-section__header">
          <span className="im-section__label">// Import Expenses</span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="im-btn im-btn--sm" onClick={downloadTemplate}>
              Download Template
            </button>
            <button className="im-btn im-btn--sm" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>
        <div
          className="im-section__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {/* Shipment Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="im-field-label">Select Shipment *</p>
            <div style={{ maxWidth: 480 }}>
              <Combobox
                options={shipments.map(shipment => ({
                  value: shipment.id,
                  label: `${formatText(shipment.invoiceNumber, settings.textFormat)} - ${formatText(shipment.blAwbNumber, settings.textFormat)}`,
                }))}
                value={selectedShipment}
                onChange={setSelectedShipment}
                placeholder="Choose a shipment to import expenses for"
                searchPlaceholder="Search by invoice number or BL/AWB..."
                emptyText="No shipments found."
                size="xs"
              />
            </div>
            {selectedShipmentData && (
              <div style={{ marginTop: 4 }}>
                <span className="im-badge">
                  Selected:{' '}
                  {formatText(
                    selectedShipmentData.invoiceNumber,
                    settings.textFormat
                  )}
                </span>
              </div>
            )}
          </div>

          {/* File Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="im-field-label">Upload File *</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isProcessing}
                style={{ flex: 1 }}
              />
              <div style={{ color: 'var(--color-im-muted)', fontSize: 13 }}>
                Supports CSV, Excel (.xlsx, .xls)
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Processing...</p>
              <div style={{ height: 4, background: 'var(--color-im-rule)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: 'var(--color-im-accent)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div
              style={{
                padding: '8px 12px',
                border: '1px solid var(--color-im-rule)',
                fontSize: 12,
                color: 'var(--color-im-muted)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Validation Errors ({validationErrors.length}):
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {validationErrors.slice(0, 10).map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
                {validationErrors.length > 10 && (
                  <li>... and {validationErrors.length - 10} more errors</li>
                )}
              </ul>
            </div>
          )}

          {/* Import Button */}
          {importData.length > 0 && validationErrors.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                className="im-btn im-btn--primary"
                onClick={handleImport}
                disabled={isProcessing || !selectedShipment}
                style={{ flex: 1 }}
              >
                {isProcessing
                  ? 'Importing...'
                  : `Import ${importData.length} Expenses`}
              </button>
              <button
                className="im-btn"
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? 'Hide Preview' : 'Show Preview'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Data Preview */}
      {previewMode && importData.length > 0 && (
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Import Preview ({importData.length} records)
            </span>
          </div>
          <div className="im-section__body">
            <div className="im-table-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th">Expense Type</th>
                    <th className="im-th">Service Provider</th>
                    <th className="im-th">Invoice No</th>
                    <th className="im-th">Invoice Date</th>
                    <th className="im-th" style={{ textAlign: 'right' }}>
                      Amount
                    </th>
                    <th className="im-th" style={{ textAlign: 'right' }}>
                      CGST
                    </th>
                    <th className="im-th" style={{ textAlign: 'right' }}>
                      SGST
                    </th>
                    <th className="im-th" style={{ textAlign: 'right' }}>
                      IGST
                    </th>
                    <th className="im-th" style={{ textAlign: 'right' }}>
                      TDS
                    </th>
                    <th className="im-th" style={{ textAlign: 'right' }}>
                      Total Amount
                    </th>
                    <th className="im-th">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.slice(0, 10).map((row, index) => (
                    <tr className="im-tr" key={index}>
                      <td className="im-td" style={{ fontWeight: 500 }}>
                        {row.expenseTypeName}
                      </td>
                      <td className="im-td">{row.serviceProviderName}</td>
                      <td className="im-td">{row.invoiceNo}</td>
                      <td className="im-td">{row.invoiceDate}</td>
                      <td className="im-td" style={{ textAlign: 'right' }}>
                        ₹
                        {row.amount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="im-td" style={{ textAlign: 'right' }}>
                        ₹
                        {row.cgstAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="im-td" style={{ textAlign: 'right' }}>
                        ₹
                        {row.sgstAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="im-td" style={{ textAlign: 'right' }}>
                        ₹
                        {row.igstAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="im-td" style={{ textAlign: 'right' }}>
                        ₹
                        {row.tdsAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="im-td" style={{ textAlign: 'right' }}>
                        ₹
                        {row.totalAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className="im-td"
                        style={{
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={row.remarks}
                      >
                        {row.remarks}
                      </td>
                    </tr>
                  ))}
                  {importData.length > 10 && (
                    <tr className="im-tr">
                      <td
                        colSpan={11}
                        className="im-td"
                        style={{
                          textAlign: 'center',
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        ... and {importData.length - 10} more records
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="im-section">
        <div className="im-section__header">
          <span className="im-section__label">// Import Instructions</span>
        </div>
        <div
          className="im-section__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ fontWeight: 500, margin: 0 }}>
                File Format Requirements:
              </h4>
              <ul
                style={{
                  color: 'var(--color-im-muted)',
                  fontSize: 13,
                  margin: 0,
                  paddingLeft: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <li>First row must contain headers</li>
                <li>Use CSV or Excel format</li>
                <li>Date format: YYYY-MM-DD</li>
                <li>Amounts should be numbers only</li>
                <li>
                  Expense Type and Service Provider names must match existing
                  records
                </li>
              </ul>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ fontWeight: 500, margin: 0 }}>Required Fields:</h4>
              <ul
                style={{
                  color: 'var(--color-im-muted)',
                  fontSize: 13,
                  margin: 0,
                  paddingLeft: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <li>Expense Type (must exist in system)</li>
                <li>Service Provider (must exist in system)</li>
                <li>Invoice No</li>
                <li>Invoice Date</li>
                <li>Amount</li>
                <li>Total Amount</li>
              </ul>
            </div>
          </div>
          <hr
            style={{
              border: 'none',
              borderTop: '1px solid var(--color-im-rule)',
              margin: '8px 0',
            }}
          />
          <div style={{ color: 'var(--color-im-muted)', fontSize: 13 }}>
            <strong>Tip:</strong> Download the template first to see the exact
            format and sample data structure.
          </div>
        </div>
      </div>
    </div>
  );
}
