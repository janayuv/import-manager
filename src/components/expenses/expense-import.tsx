'use client';

import * as ExcelJS from 'exceljs';
import { toast } from 'sonner';

import { useCallback, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
          toast.success(`Successfully parsed ${data.length} expense records`);
        } else {
          toast.error(`Found ${errors.length} validation errors`);
        }

        setProgress(100);
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error('Error parsing file. Please check the file format.');
        setValidationErrors([
          'Failed to parse file. Please ensure it matches the template format.',
        ]);
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    },
    [validateImportData, parseFile]
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

    toast.success('Template downloaded successfully');
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedShipment) {
      toast.error('Please select a shipment first');
      return;
    }

    if (importData.length === 0) {
      toast.error('No data to import');
      return;
    }

    if (validationErrors.length > 0) {
      toast.error('Please fix validation errors before importing');
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
              remarks: row.remarks || null,
            };
          })
        ),
      };

      setProgress(50);

      // Call the backend bulk import function
      const { invoke } = await import('@tauri-apps/api/core');
      const invoiceId = await invoke('add_expenses_bulk', {
        payload: bulkPayload,
      });

      setProgress(100);
      toast.success(
        `Successfully imported ${importData.length} expenses (Invoice ID: ${invoiceId})`
      );
      setImportData([]);
      setSelectedShipment('');
      onImportSuccess();
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`Failed to import expenses: ${error}`);
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Import Expenses</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                📥 Download Template
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                🔄 Reset
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Shipment Selection */}
          <div className="space-y-2">
            <Label htmlFor="shipment-select">Select Shipment *</Label>
            <div className="max-w-md">
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
              <div className="mt-2">
                <Badge variant="outline">
                  Selected:{' '}
                  {formatText(
                    selectedShipmentData.invoiceNumber,
                    settings.textFormat
                  )}
                </Badge>
              </div>
            )}
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file-upload">Upload File *</Label>
            <div className="flex items-center gap-4">
              <input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="flex-1"
              />
              <div className="text-muted-foreground text-sm">
                Supports CSV, Excel (.xlsx, .xls)
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="space-y-2">
              <Label>Processing...</Label>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-medium">
                    Validation Errors ({validationErrors.length}):
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {validationErrors.slice(0, 10).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                    {validationErrors.length > 10 && (
                      <li>
                        ... and {validationErrors.length - 10} more errors
                      </li>
                    )}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Import Button */}
          {importData.length > 0 && validationErrors.length === 0 && (
            <div className="flex items-center gap-4">
              <Button
                onClick={handleImport}
                disabled={isProcessing || !selectedShipment}
                className="flex-1"
              >
                {isProcessing
                  ? 'Importing...'
                  : `Import ${importData.length} Expenses`}
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? 'Hide Preview' : 'Show Preview'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Preview */}
      {previewMode && importData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Import Preview ({importData.length} records)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense Type</TableHead>
                    <TableHead>Service Provider</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead className="text-right">TDS</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importData.slice(0, 10).map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {row.expenseTypeName}
                      </TableCell>
                      <TableCell>{row.serviceProviderName}</TableCell>
                      <TableCell>{row.invoiceNo}</TableCell>
                      <TableCell>{row.invoiceDate}</TableCell>
                      <TableCell className="text-right">
                        ₹
                        {row.amount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹
                        {row.cgstAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹
                        {row.sgstAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹
                        {row.igstAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹
                        {row.tdsAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹
                        {row.totalAmount.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell
                        className="max-w-xs truncate"
                        title={row.remarks}
                      >
                        {row.remarks}
                      </TableCell>
                    </TableRow>
                  ))}
                  {importData.length > 10 && (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        className="text-muted-foreground text-center"
                      >
                        ... and {importData.length - 10} more records
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Import Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium">📋 File Format Requirements:</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• First row must contain headers</li>
                <li>• Use CSV or Excel format</li>
                <li>• Date format: YYYY-MM-DD</li>
                <li>• Amounts should be numbers only</li>
                <li>
                  • Expense Type and Service Provider names must match existing
                  records
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">✅ Required Fields:</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Expense Type (must exist in system)</li>
                <li>• Service Provider (must exist in system)</li>
                <li>• Invoice No</li>
                <li>• Invoice Date</li>
                <li>• Amount</li>
                <li>• Total Amount</li>
              </ul>
            </div>
          </div>
          <Separator />
          <div className="text-muted-foreground text-sm">
            <strong>💡 Tip:</strong> Download the template first to see the
            exact format and sample data structure.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
