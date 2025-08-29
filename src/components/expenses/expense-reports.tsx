import { invoke } from '@tauri-apps/api/core';
import {
  BarChart3,
  Building2,
  Calendar,
  Download,
  FileText,
  Filter,
  RefreshCw,
  Tag,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as ExcelJS from 'exceljs';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  ExpenseReportFilters,
  ExpenseReportResponse,
  ExpenseReportType,
  ExpenseSummaryByMonth,
  ExpenseSummaryByProvider,
  ExpenseSummaryByShipment,
  ExpenseSummaryByType,
  ExpenseType,
  ServiceProvider,
} from '@/types/expense';
import type { Shipment as ShipmentTs } from '@/types/shipment';

interface ExpenseReportsProps {
  shipmentId?: string;
}

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
];

const ExpenseReports: React.FC<ExpenseReportsProps> = ({ shipmentId }) => {
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<ExpenseReportType>('detailed');
  const [filters, setFilters] = useState<ExpenseReportFilters>(() => {
    const today = new Date();
    const startOfYear = new Date(2024, 0, 1); // January 1st of 2024 to include test data

    return {
      shipmentId,
      dateFrom: startOfYear.toISOString().split('T')[0],
      dateTo: today.toISOString().split('T')[0],
    };
  });

  // Data states
  const [detailedReport, setDetailedReport] =
    useState<ExpenseReportResponse | null>(null);
  const [summaryByType, setSummaryByType] = useState<ExpenseSummaryByType[]>(
    []
  );
  const [summaryByProvider, setSummaryByProvider] = useState<
    ExpenseSummaryByProvider[]
  >([]);
  const [summaryByShipment, setSummaryByShipment] = useState<
    ExpenseSummaryByShipment[]
  >([]);
  const [summaryByMonth, setSummaryByMonth] = useState<ExpenseSummaryByMonth[]>(
    []
  );

  // Options for filters
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>(
    []
  );
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [shipments, setShipments] = useState<ShipmentTs[]>([]);

  // Load filter options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [providers, types, shipmentsData] = await Promise.all([
          invoke<ServiceProvider[]>('get_service_providers'),
          invoke<ExpenseType[]>('get_expense_types'),
          invoke<ShipmentTs[]>('get_shipments'),
        ]);
        setServiceProviders(providers);
        setExpenseTypes(types);
        setShipments(shipmentsData);
      } catch (error) {
        console.error('Failed to load filter options:', error);
        toast.error('Failed to load filter options');
      }
    };
    loadOptions();
  }, []);

  // Generate report based on type
  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      // First, debug the data counts
      console.log('🔍 [DEBUG] Getting expense data counts...');
      const debugInfo = await invoke<string>('debug_expense_data_counts');
      console.log('🔍 [DEBUG] Data counts:', debugInfo);

      console.log(
        '🔍 [DEBUG] Generating report with filters:',
        JSON.stringify(filters, null, 2)
      );
      console.log('🔍 [DEBUG] Filter values breakdown:');
      console.log(
        '  - shipmentId:',
        filters.shipmentId,
        typeof filters.shipmentId
      );
      console.log(
        '  - serviceProviderId:',
        filters.serviceProviderId,
        typeof filters.serviceProviderId
      );
      console.log(
        '  - expenseTypeId:',
        filters.expenseTypeId,
        typeof filters.expenseTypeId
      );
      console.log('  - dateFrom:', filters.dateFrom, typeof filters.dateFrom);
      console.log('  - dateTo:', filters.dateTo, typeof filters.dateTo);
      console.log('  - currency:', filters.currency, typeof filters.currency);
      console.log(
        '  - minAmount:',
        filters.minAmount,
        typeof filters.minAmount
      );
      console.log(
        '  - maxAmount:',
        filters.maxAmount,
        typeof filters.maxAmount
      );

      // Clean filters object - remove undefined values
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== undefined)
      );
      console.log(
        '🔍 [DEBUG] Clean filters being sent:',
        JSON.stringify(cleanFilters, null, 2)
      );
      console.log(
        '🔍 [DEBUG] Date range check: dateFrom =',
        cleanFilters.dateFrom,
        'dateTo =',
        cleanFilters.dateTo
      );

      // Test with specific date range
      const testFilters = {
        dateFrom: '2025-05-01',
        dateTo: '2025-05-01',
      };
      console.log(
        '🔍 [DEBUG] Testing with specific date range:',
        JSON.stringify(testFilters, null, 2)
      );

      switch (reportType) {
        case 'detailed': {
          const detailed = await invoke<ExpenseReportResponse>(
            'generate_detailed_expense_report',
            {
              filters: cleanFilters,
            }
          );
          console.log('🔍 [FRONTEND] Detailed report data:', detailed); // Debug log
          if (detailed && detailed.rows) {
            console.log('🔍 [FRONTEND] First row sample:', detailed.rows[0]); // Debug log
            console.log('🔍 [FRONTEND] Totals:', detailed.totals); // Debug log
          }
          setDetailedReport(detailed);
          break;
        }
        case 'summary-by-type': {
          const byType = await invoke<ExpenseSummaryByType[]>(
            'generate_expense_summary_by_type',
            {
              filters: cleanFilters,
            }
          );
          setSummaryByType(byType);
          break;
        }
        case 'summary-by-provider': {
          const byProvider = await invoke<ExpenseSummaryByProvider[]>(
            'generate_expense_summary_by_provider',
            {
              filters: cleanFilters,
            }
          );
          setSummaryByProvider(byProvider);
          break;
        }
        case 'summary-by-shipment': {
          const byShipment = await invoke<ExpenseSummaryByShipment[]>(
            'generate_expense_summary_by_shipment',
            {
              filters: cleanFilters,
            }
          );
          setSummaryByShipment(byShipment);
          break;
        }
        case 'summary-by-month': {
          const byMonth = await invoke<ExpenseSummaryByMonth[]>(
            'generate_expense_summary_by_month',
            {
              filters: cleanFilters,
            }
          );
          setSummaryByMonth(byMonth);
          break;
        }
      }
      toast.success('Report generated successfully');
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [filters, reportType]);

  // Auto-generate report when filters change
  useEffect(() => {
    if (filters.dateFrom && filters.dateTo) {
      generateReport();
    }
  }, [filters, reportType, generateReport]);

  // Chart data for summaries
  const chartData = useMemo(() => {
    switch (reportType) {
      case 'summary-by-type':
        return summaryByType.map(item => ({
          name: item.expense_type_name,
          amount: item.total_amount_paise / 100,
          cgst: item.total_cgst_amount_paise / 100,
          sgst: item.total_sgst_amount_paise / 100,
          igst: item.total_igst_amount_paise / 100,
        }));
      case 'summary-by-provider':
        return summaryByProvider.map(item => ({
          name: item.service_provider_name,
          amount: item.total_amount_paise / 100,
          invoices: item.invoice_count,
        }));
      case 'summary-by-shipment':
        return summaryByShipment.map(item => ({
          name: item.shipment_number || item.shipment_id,
          amount: item.total_amount_paise / 100,
          invoices: item.invoice_count,
        }));
      case 'summary-by-month':
        return summaryByMonth.map(item => ({
          name: item.month_name,
          amount: item.total_amount_paise / 100,
          invoices: item.invoice_count,
        }));
      default:
        return [];
    }
  }, [
    reportType,
    summaryByType,
    summaryByProvider,
    summaryByShipment,
    summaryByMonth,
  ]);

  // Pie chart data
  const pieChartData = useMemo(() => {
    if (reportType === 'summary-by-type') {
      return summaryByType.map((item, index) => ({
        name: item.expense_type_name,
        value: item.total_amount_paise / 100,
        color: COLORS[index % COLORS.length],
      }));
    }
    return [];
  }, [reportType, summaryByType]);

  // Export functionality
  const exportReport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      setLoading(true);

      // Get the current report data based on the active report type
      let data: Record<string, string | number>[] = [];
      let filename = `expense-report-${new Date().toISOString().split('T')[0]}`;

      switch (reportType) {
        case 'detailed':
          if (detailedReport) {
            data = detailedReport.rows.map(row => ({
              'Invoice Number': row.invoice_number,
              'Invoice Date': formatDate(row.invoice_date),
              'Shipment Number': row.shipment_number || 'N/A',
              'Service Provider': row.service_provider_name,
              'Expense Type': row.expense_type_name,
              'Amount (₹)': formatCurrency(row.amount_paise / 100),
              'CGST (₹)': formatCurrency(row.cgst_amount_paise / 100),
              'SGST (₹)': formatCurrency(row.sgst_amount_paise / 100),
              'IGST (₹)': formatCurrency(row.igst_amount_paise / 100),
              'TDS (₹)': formatCurrency(row.tds_amount_paise / 100),
              'Total (₹)': formatCurrency(row.total_amount_paise / 100),
              'Net Amount (₹)': formatCurrency(row.net_amount_paise / 100),
              Remarks: row.remarks || '',
              'Created At': formatDate(row.created_at),
            }));
            filename = `expense-detailed-report-${new Date().toISOString().split('T')[0]}`;
          }
          break;

        case 'summary-by-type':
          data = summaryByType.map(item => ({
            'Expense Type': item.expense_type_name,
            'Total Amount (₹)': formatCurrency(item.total_amount_paise / 100),
            'CGST (₹)': formatCurrency(item.total_cgst_amount_paise / 100),
            'SGST (₹)': formatCurrency(item.total_sgst_amount_paise / 100),
            'IGST (₹)': formatCurrency(item.total_igst_amount_paise / 100),
            'TDS (₹)': formatCurrency(item.total_tds_amount_paise / 100),
            'Net Amount (₹)': formatCurrency(item.total_net_amount_paise / 100),
            'Line Count': item.line_count,
          }));
          filename = `expense-summary-by-type-${new Date().toISOString().split('T')[0]}`;
          break;

        case 'summary-by-provider':
          data = summaryByProvider.map(item => ({
            'Service Provider': item.service_provider_name,
            'Total Amount (₹)': formatCurrency(item.total_amount_paise / 100),
            'CGST (₹)': formatCurrency(item.total_cgst_amount_paise / 100),
            'SGST (₹)': formatCurrency(item.total_sgst_amount_paise / 100),
            'IGST (₹)': formatCurrency(item.total_igst_amount_paise / 100),
            'TDS (₹)': formatCurrency(item.total_tds_amount_paise / 100),
            'Net Amount (₹)': formatCurrency(item.total_net_amount_paise / 100),
            'Invoice Count': item.invoice_count,
            'Line Count': item.line_count,
          }));
          filename = `expense-summary-by-provider-${new Date().toISOString().split('T')[0]}`;
          break;

        case 'summary-by-shipment':
          data = summaryByShipment.map(item => ({
            'Shipment Number': item.shipment_number || 'N/A',
            'Total Amount (₹)': formatCurrency(item.total_amount_paise / 100),
            'CGST (₹)': formatCurrency(item.total_cgst_amount_paise / 100),
            'SGST (₹)': formatCurrency(item.total_sgst_amount_paise / 100),
            'IGST (₹)': formatCurrency(item.total_igst_amount_paise / 100),
            'TDS (₹)': formatCurrency(item.total_tds_amount_paise / 100),
            'Net Amount (₹)': formatCurrency(item.total_net_amount_paise / 100),
            'Invoice Count': item.invoice_count,
            'Line Count': item.line_count,
          }));
          filename = `expense-summary-by-shipment-${new Date().toISOString().split('T')[0]}`;
          break;

        case 'summary-by-month':
          data = summaryByMonth.map(item => ({
            Month: item.month_name,
            'Total Amount (₹)': formatCurrency(item.total_amount_paise / 100),
            'CGST (₹)': formatCurrency(item.total_cgst_amount_paise / 100),
            'SGST (₹)': formatCurrency(item.total_sgst_amount_paise / 100),
            'IGST (₹)': formatCurrency(item.total_igst_amount_paise / 100),
            'TDS (₹)': formatCurrency(item.total_tds_amount_paise / 100),
            'Net Amount (₹)': formatCurrency(item.total_net_amount_paise / 100),
            'Invoice Count': item.invoice_count,
            'Line Count': item.line_count,
          }));
          filename = `expense-summary-by-month-${new Date().toISOString().split('T')[0]}`;
          break;
      }

      if (data.length === 0) {
        toast.error('No data available for export');
        return;
      }

      switch (format) {
        case 'csv':
          await exportToCsv(data, filename);
          break;
        case 'excel':
          await exportToExcel(data, filename);
          break;
        case 'pdf':
          await exportToPdf(data, filename);
          break;
      }

      toast.success(`Report exported successfully as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(
        `Failed to export report: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  // CSV Export function
  const exportToCsv = async (
    data: Record<string, string | number>[],
    filename: string
  ) => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Excel Export function
  const exportToExcel = async (
    data: Record<string, string | number>[],
    filename: string
  ) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expense Report');

    // Add headers
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);

      // Style headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
    }

    // Add data rows
    data.forEach(row => {
      worksheet.addRow(Object.values(row));
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.values) {
        const maxLength = Math.max(
          ...column.values.map((v: unknown) => (v ? v.toString().length : 0))
        );
        column.width = Math.min(maxLength + 2, 50);
      }
    });

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Export function
  const exportToPdf = async (
    data: Record<string, string | number>[],
    filename: string
  ) => {
    // For now, we'll create a simple HTML-based PDF
    // In a production environment, you might want to use a proper PDF library like jsPDF
    const htmlContent = `
      <html>
        <head>
          <title>${filename}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <h1>${filename.replace(/-/g, ' ').toUpperCase()}</h1>
          <p>Generated on: ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                ${Object.keys(data[0] || {})
                  .map(key => `<th>${key}</th>`)
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  row =>
                    `<tr>${Object.values(row)
                      .map(value => `<td>${value}</td>`)
                      .join('')}</tr>`
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.html`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.info(
      'PDF export is available as HTML file. For better PDF support, consider using jsPDF library.'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expense Reports</h2>
          <p className="text-muted-foreground">
            Generate detailed expense reports and summaries
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generateReport}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const result = await invoke<string>('create_test_expense_data');
                console.log('Test data creation result:', result);
                toast.success('Test data created successfully');
                // Reload filter options after creating test data
                const [providers, types] = await Promise.all([
                  invoke<ServiceProvider[]>('get_service_providers'),
                  invoke<ExpenseType[]>('get_expense_types'),
                ]);
                setServiceProviders(providers);
                setExpenseTypes(types);
              } catch (error) {
                console.error('Failed to create test data:', error);
                toast.error('Failed to create test data');
              }
            }}
            disabled={loading}
          >
            Create Test Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const result = await invoke<string>(
                  'debug_expense_data_counts'
                );
                console.log('Data counts:', result);
                toast.success('Check console for data counts');
              } catch (error) {
                console.error('Failed to get data counts:', error);
                toast.error('Failed to get data counts');
              }
            }}
            disabled={loading}
          >
            Debug Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const result = await invoke<string>('debug_expense_dates');
                console.log('Date debug result:', result);
                toast.success('Check console for date debug info');
              } catch (error) {
                console.error('Failed to debug dates:', error);
                toast.error('Failed to debug dates');
              }
            }}
            disabled={loading}
          >
            Debug Dates
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                // Test filtering with specific criteria
                const testFilters = {
                  dateFrom: '2024-01-01',
                  dateTo: '2025-12-31',
                  // Add other filters as needed
                };
                console.log('🔍 [TEST] Testing filters:', testFilters);
                const result = await invoke<string>(
                  'debug_expense_report_filters',
                  {
                    filters: testFilters,
                  }
                );
                console.log('🔍 [TEST] Test result:', result);

                // Also test without date filters
                console.log('🔍 [TEST] Testing without date filters...');
                const resultNoDate = await invoke<string>(
                  'debug_expense_report_filters',
                  {
                    filters: {},
                  }
                );
                console.log(
                  '🔍 [TEST] Test result (no date filters):',
                  resultNoDate
                );

                toast.success('Test completed - check console');
              } catch (error) {
                console.error('Test failed:', error);
                toast.error('Test failed');
              }
            }}
            disabled={loading}
          >
            Test Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                // Test the exact date range from the image (2025-05-01 to 2025-05-01)
                const testFilters = {
                  dateFrom: '2025-05-01',
                  dateTo: '2025-05-01',
                };
                console.log(
                  '🔍 [TEST] Testing exact date range from image:',
                  testFilters
                );
                const result = await invoke<string>(
                  'debug_expense_report_filters',
                  {
                    filters: testFilters,
                  }
                );
                console.log('🔍 [TEST] Exact date range test result:', result);

                toast.success(
                  'Exact date range test completed - check console'
                );
              } catch (error) {
                console.error('Exact date range test failed:', error);
                toast.error('Exact date range test failed');
              }
            }}
            disabled={loading}
          >
            Test Exact Date
          </Button>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportReport('csv')}
              disabled={loading}
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportReport('excel')}
              disabled={loading}
            >
              <FileText className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportReport('pdf')}
              disabled={loading}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom || ''}
                onChange={e =>
                  setFilters(prev => ({ ...prev, dateFrom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo || ''}
                onChange={e =>
                  setFilters(prev => ({ ...prev, dateTo: e.target.value }))
                }
              />
            </div>

            {/* Shipment */}
            <div className="space-y-2">
              <Label htmlFor="shipment">Shipment</Label>
              <Select
                value={filters.shipmentId || 'all'}
                onValueChange={value =>
                  setFilters(prev => ({
                    ...prev,
                    shipmentId: value === 'all' ? undefined : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Shipments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shipments</SelectItem>
                  {shipments.map(shipment => (
                    <SelectItem key={shipment.id} value={shipment.id}>
                      {shipment.invoiceNumber || shipment.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Service Provider */}
            <div className="space-y-2">
              <Label htmlFor="provider">Service Provider</Label>
              <Combobox
                options={[
                  { value: '', label: 'All Providers' },
                  ...serviceProviders.map(provider => ({
                    value: provider.id,
                    label: provider.name,
                  })),
                ]}
                value={filters.serviceProviderId || ''}
                onChange={(value: string) =>
                  setFilters(prev => ({
                    ...prev,
                    serviceProviderId: value || undefined,
                  }))
                }
                placeholder="All Providers"
                searchPlaceholder="Search providers..."
                emptyText="No providers found."
              />
            </div>

            {/* Expense Type */}
            <div className="space-y-2">
              <Label htmlFor="expenseType">Expense Type</Label>
              <Combobox
                options={[
                  { value: '', label: 'All Types' },
                  ...expenseTypes.map(type => ({
                    value: type.id,
                    label: type.name,
                  })),
                ]}
                value={filters.expenseTypeId || ''}
                onChange={(value: string) =>
                  setFilters(prev => ({
                    ...prev,
                    expenseTypeId: value || undefined,
                  }))
                }
                placeholder="All Types"
                searchPlaceholder="Search expense types..."
                emptyText="No expense types found."
              />
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={filters.currency || 'all'}
                onValueChange={value =>
                  setFilters(prev => ({
                    ...prev,
                    currency: value === 'all' ? undefined : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Currencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Currencies</SelectItem>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount Range */}
            <div className="space-y-2">
              <Label htmlFor="minAmount">Min Amount (₹)</Label>
              <Input
                id="minAmount"
                type="number"
                placeholder="0"
                value={filters.minAmount ? filters.minAmount / 100 : ''}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    minAmount: e.target.value
                      ? Math.round(parseFloat(e.target.value) * 100)
                      : undefined,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAmount">Max Amount (₹)</Label>
              <Input
                id="maxAmount"
                type="number"
                placeholder="∞"
                value={filters.maxAmount ? filters.maxAmount / 100 : ''}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    maxAmount: e.target.value
                      ? Math.round(parseFloat(e.target.value) * 100)
                      : undefined,
                  }))
                }
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date();
                const startOfYear = new Date(2024, 0, 1); // January 1st of 2024 to include test data
                setFilters({
                  shipmentId,
                  dateFrom: startOfYear.toISOString().split('T')[0],
                  dateTo: today.toISOString().split('T')[0],
                });
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Type Selector */}
      <Card>
        <CardContent className="pt-6">
          <Tabs
            value={reportType}
            onValueChange={value => setReportType(value as ExpenseReportType)}
          >
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="detailed" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Detailed
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-type"
                className="flex items-center gap-2"
              >
                <Tag className="h-4 w-4" />
                By Type
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-provider"
                className="flex items-center gap-2"
              >
                <Building2 className="h-4 w-4" />
                By Provider
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-shipment"
                className="flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                By Shipment
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-month"
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                By Month
              </TabsTrigger>
            </TabsList>

            {/* Detailed Report */}
            <TabsContent value="detailed" className="space-y-4">
              {detailedReport && detailedReport.rows.length > 0 ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total Amount
                        </CardTitle>
                        <Badge variant="secondary">
                          {detailedReport.totals.invoice_count} invoices
                        </Badge>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {(() => {
                            const amount =
                              (detailedReport.totals.total_amount_paise || 0) /
                              100;
                            console.log(
                              '🔍 [FRONTEND] Total amount calculation:',
                              {
                                total_amount_paise:
                                  detailedReport.totals.total_amount_paise,
                                dividedBy100: amount,
                                formatted: formatCurrency(amount),
                              }
                            );
                            return formatCurrency(amount);
                          })()}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {detailedReport.totals.expense_line_count || 0}{' '}
                          expense lines
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total CGST
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatCurrency(
                            (detailedReport.totals.total_cgst_amount_paise ||
                              0) / 100
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total SGST
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatCurrency(
                            (detailedReport.totals.total_sgst_amount_paise ||
                              0) / 100
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total IGST
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatCurrency(
                            (detailedReport.totals.total_igst_amount_paise ||
                              0) / 100
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Detailed Expense Report</CardTitle>
                      <CardDescription>
                        {detailedReport.rows.length} expense lines found
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Shipment</TableHead>
                              <TableHead>Provider</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">
                                Amount
                              </TableHead>
                              <TableHead className="text-right">CGST</TableHead>
                              <TableHead className="text-right">SGST</TableHead>
                              <TableHead className="text-right">IGST</TableHead>
                              <TableHead className="text-right">
                                Total
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailedReport.rows.map(row => (
                              <TableRow
                                key={`${row.invoice_id}-${row.expense_type_id}`}
                              >
                                <TableCell className="font-medium">
                                  {row.invoice_number || 'N/A'}
                                </TableCell>
                                <TableCell>
                                  {formatDate(row.invoice_date)}
                                </TableCell>
                                <TableCell>
                                  {row.shipment_number ||
                                    row.shipment_id ||
                                    'N/A'}
                                </TableCell>
                                <TableCell>
                                  {row.service_provider_name || 'N/A'}
                                </TableCell>
                                <TableCell>
                                  {row.expense_type_name || 'N/A'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(
                                    (row.amount_paise || 0) / 100
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(
                                    (row.cgst_amount_paise || 0) / 100
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(
                                    (row.sgst_amount_paise || 0) / 100
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(
                                    (row.igst_amount_paise || 0) / 100
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(
                                    (row.total_amount_paise || 0) / 100
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : detailedReport ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <p className="text-muted-foreground">
                      No expense data found for the selected filters.
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Try adjusting your filters or add some expense data.
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            {/* Summary Reports */}
            {[
              'summary-by-type',
              'summary-by-provider',
              'summary-by-shipment',
              'summary-by-month',
            ].map(type => (
              <TabsContent key={type} value={type} className="space-y-4">
                {/* Charts */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Bar Chart</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip
                            formatter={value => formatCurrency(value as number)}
                          />
                          <Legend />
                          <Bar
                            dataKey="amount"
                            fill="#8884d8"
                            name="Amount (₹)"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {type === 'summary-by-type' && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Pie Chart</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={pieChartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {pieChartData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={value =>
                                formatCurrency(value as number)
                              }
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Summary Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {type === 'summary-by-type' && 'Summary by Expense Type'}
                      {type === 'summary-by-provider' &&
                        'Summary by Service Provider'}
                      {type === 'summary-by-shipment' && 'Summary by Shipment'}
                      {type === 'summary-by-month' && 'Summary by Month'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">IGST</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            {type !== 'summary-by-type' && (
                              <TableHead className="text-right">
                                Invoices
                              </TableHead>
                            )}
                            <TableHead className="text-right">Lines</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            if (type === 'summary-by-type') {
                              return summaryByType.map(item => (
                                <TableRow key={item.expense_type_id}>
                                  <TableCell className="font-medium">
                                    {item.expense_type_name}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_cgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_sgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_igst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.line_count}
                                  </TableCell>
                                </TableRow>
                              ));
                            } else if (type === 'summary-by-provider') {
                              return summaryByProvider.map(item => (
                                <TableRow key={item.service_provider_id}>
                                  <TableCell className="font-medium">
                                    {item.service_provider_name}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_cgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_sgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_igst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.invoice_count}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.line_count}
                                  </TableCell>
                                </TableRow>
                              ));
                            } else if (type === 'summary-by-shipment') {
                              return summaryByShipment.map(item => (
                                <TableRow key={item.shipment_id}>
                                  <TableCell className="font-medium">
                                    {item.shipment_number || item.shipment_id}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_cgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_sgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_igst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.invoice_count}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.line_count}
                                  </TableCell>
                                </TableRow>
                              ));
                            } else {
                              return summaryByMonth.map(item => (
                                <TableRow key={`${item.year}-${item.month}`}>
                                  <TableCell className="font-medium">
                                    {item.month_name}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_cgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_sgst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      item.total_igst_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.invoice_count}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.line_count}
                                  </TableCell>
                                </TableRow>
                              ));
                            }
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpenseReports;
