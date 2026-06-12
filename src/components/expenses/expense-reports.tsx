import { safeInvoke as invoke } from '@/lib/ipc-safe';
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
import Papa from 'papaparse';
import * as ExcelJS from 'exceljs';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';

import { Combobox } from '@/components/ui/combobox';
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
  const notifications = useUnifiedNotifications();
  const { isSmallScreen, getTableClass, getSpacingClass } =
    useResponsiveContext();
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
        notifications.error('Load Error', 'Failed to load filter options');
      }
    };
    loadOptions();
  }, [notifications]);

  // Generate report based on type
  const generateReport = useCallback(
    async (showNotification = true) => {
      setLoading(true);
      try {
        const cleanFilters = Object.fromEntries(
          Object.entries(filters).filter(([, value]) => value !== undefined)
        );

        switch (reportType) {
          case 'detailed': {
            const detailed = await invoke<ExpenseReportResponse>(
              'generate_detailed_expense_report',
              {
                filters: cleanFilters,
              }
            );
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
        if (showNotification) {
          notifications.success(
            'Report Generated',
            'Report generated successfully'
          );
        }
      } catch (error) {
        console.error('Failed to generate report:', error);
        notifications.error('Report Error', 'Failed to generate report');
      } finally {
        setLoading(false);
      }
    },
    [filters, reportType, notifications]
  );

  // Auto-generate report when filters change (silent)
  useEffect(() => {
    if (filters.dateFrom && filters.dateTo) {
      generateReport(false); // Silent generation - no notification
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
        notifications.error('Export Error', 'No data available for export');
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

      notifications.success(
        'Export Complete',
        `Report exported successfully as ${format.toUpperCase()}`
      );
    } catch (error) {
      notifications.error(
        'Export Error',
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

    notifications.info(
      'PDF Export',
      'PDF export is available as HTML file. For better PDF support, consider using jsPDF library.'
    );
  };

  return (
    <div className={getSpacingClass('lg')}>
      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            className="im-btn im-btn--sm"
            onClick={() => generateReport(true)}
            disabled={loading}
          >
            <RefreshCw
              style={{
                marginRight: 8,
                width: 14,
                height: 14,
                display: 'inline',
                animation: loading ? 'spin 1s linear infinite' : 'none',
              }}
            />
            Refresh
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="im-btn im-btn--sm im-btn--primary"
              onClick={() => exportReport('csv')}
              disabled={loading}
            >
              <Download
                style={{
                  marginRight: 8,
                  width: 14,
                  height: 14,
                  display: 'inline',
                }}
              />
              CSV
            </button>
            <button
              className="im-btn im-btn--sm im-btn--primary"
              onClick={() => exportReport('excel')}
              disabled={loading}
            >
              <FileText
                style={{
                  marginRight: 8,
                  width: 14,
                  height: 14,
                  display: 'inline',
                }}
              />
              Excel
            </button>
            <button
              className="im-btn im-btn--sm im-btn--primary"
              onClick={() => exportReport('pdf')}
              disabled={loading}
            >
              <BarChart3
                style={{
                  marginRight: 8,
                  width: 14,
                  height: 14,
                  display: 'inline',
                }}
              />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="im-section">
        <div className="im-section__header">
          <span className="im-section__label">
            <Filter
              style={{
                display: 'inline',
                width: 14,
                height: 14,
                marginRight: 6,
              }}
            />
            // Filters
          </span>
        </div>
        <div className="im-section__body">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
            }}
          >
            {/* Date Range */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Date From</p>
              <input
                className="im-input"
                id="dateFrom"
                type="date"
                value={filters.dateFrom || ''}
                onChange={e =>
                  setFilters(prev => ({ ...prev, dateFrom: e.target.value }))
                }
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Date To</p>
              <input
                className="im-input"
                id="dateTo"
                type="date"
                value={filters.dateTo || ''}
                onChange={e =>
                  setFilters(prev => ({ ...prev, dateTo: e.target.value }))
                }
              />
            </div>

            {/* Shipment */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Shipment</p>
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={filters.shipmentId || 'all'}
                  onChange={e =>
                    setFilters(prev => ({
                      ...prev,
                      shipmentId:
                        e.target.value === 'all' ? undefined : e.target.value,
                    }))
                  }
                >
                  <option value="all">All Shipments</option>
                  {shipments.map(shipment => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.invoiceNumber || shipment.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Service Provider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Service Provider</p>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Expense Type</p>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Currency</p>
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={filters.currency || 'all'}
                  onChange={e =>
                    setFilters(prev => ({
                      ...prev,
                      currency:
                        e.target.value === 'all' ? undefined : e.target.value,
                    }))
                  }
                >
                  <option value="all">All Currencies</option>
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Amount Range */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Min Amount (₹)</p>
              <input
                className="im-input"
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Max Amount (₹)</p>
              <input
                className="im-input"
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
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              className="im-btn im-btn--sm"
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
            </button>
          </div>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="im-section">
        <div className="im-section__body" style={{ paddingTop: 24 }}>
          <Tabs
            value={reportType}
            onValueChange={value => setReportType(value as ExpenseReportType)}
          >
            <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
              <TabsTrigger
                value="detailed"
                className="text-foreground data-[state=active]:bg-accent! data-[state=active]:text-accent-foreground! flex items-center gap-2 bg-transparent"
              >
                <FileText className="h-4 w-4" />
                Detailed
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-type"
                className="text-foreground data-[state=active]:bg-accent! data-[state=active]:text-accent-foreground! flex items-center gap-2 bg-transparent"
              >
                <Tag className="h-4 w-4" />
                By Type
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-provider"
                className="text-foreground data-[state=active]:bg-accent! data-[state=active]:text-accent-foreground! flex items-center gap-2 bg-transparent"
              >
                <Building2 className="h-4 w-4" />
                By Provider
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-shipment"
                className="text-foreground data-[state=active]:bg-accent! data-[state=active]:text-accent-foreground! flex items-center gap-2 bg-transparent"
              >
                <BarChart3 className="h-4 w-4" />
                By Shipment
              </TabsTrigger>
              <TabsTrigger
                value="summary-by-month"
                className="text-foreground data-[state=active]:bg-accent! data-[state=active]:text-accent-foreground! flex items-center gap-2 bg-transparent"
              >
                <Calendar className="h-4 w-4" />
                By Month
              </TabsTrigger>
            </TabsList>

            {/* Detailed Report */}
            <TabsContent
              value="detailed"
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              {detailedReport && detailedReport.rows.length > 0 ? (
                <>
                  {/* Summary Cards */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 16,
                    }}
                  >
                    <div className="im-section">
                      <div
                        className="im-section__header"
                        style={{ justifyContent: 'space-between' }}
                      >
                        <span className="im-section__label">Total Amount</span>
                        <span className="im-badge">
                          {detailedReport.totals.invoice_count} invoices
                        </span>
                      </div>
                      <div className="im-section__body">
                        <div style={{ fontSize: 22, fontWeight: 700 }}>
                          {formatCurrency(
                            (detailedReport.totals.total_amount_paise || 0) /
                              100
                          )}
                        </div>
                        <p
                          style={{
                            color: 'var(--color-im-muted)',
                            fontSize: 12,
                            margin: 0,
                          }}
                        >
                          {detailedReport.totals.expense_line_count || 0}{' '}
                          expense lines
                        </p>
                      </div>
                    </div>
                    <div className="im-section">
                      <div className="im-section__header">
                        <span className="im-section__label">Total CGST</span>
                      </div>
                      <div className="im-section__body">
                        <div style={{ fontSize: 22, fontWeight: 700 }}>
                          {formatCurrency(
                            (detailedReport.totals.total_cgst_amount_paise ||
                              0) / 100
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="im-section">
                      <div className="im-section__header">
                        <span className="im-section__label">Total SGST</span>
                      </div>
                      <div className="im-section__body">
                        <div style={{ fontSize: 22, fontWeight: 700 }}>
                          {formatCurrency(
                            (detailedReport.totals.total_sgst_amount_paise ||
                              0) / 100
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="im-section">
                      <div className="im-section__header">
                        <span className="im-section__label">Total IGST</span>
                      </div>
                      <div className="im-section__body">
                        <div style={{ fontSize: 22, fontWeight: 700 }}>
                          {formatCurrency(
                            (detailedReport.totals.total_igst_amount_paise ||
                              0) / 100
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Table */}
                  <div className="im-section">
                    <div className="im-section__header">
                      <span className="im-section__label">
                        // Detailed Expense Report
                      </span>
                      <span
                        style={{
                          color: 'var(--color-im-muted)',
                          fontSize: 12,
                          marginLeft: 8,
                        }}
                      >
                        {detailedReport.rows.length} expense lines found
                      </span>
                    </div>
                    <div className="im-section__body">
                      <div className="im-table-scroll">
                        <table className={`im-table ${getTableClass('auto')}`}>
                          <thead>
                            <tr>
                              <th className="im-th">Invoice</th>
                              <th className="im-th">Date</th>
                              {!isSmallScreen && (
                                <th className="im-th">Shipment</th>
                              )}
                              <th className="im-th">Provider</th>
                              <th className="im-th">Type</th>
                              <th
                                className="im-th"
                                style={{ textAlign: 'right' }}
                              >
                                Amount
                              </th>
                              {!isSmallScreen && (
                                <>
                                  <th
                                    className="im-th"
                                    style={{ textAlign: 'right' }}
                                  >
                                    CGST
                                  </th>
                                  <th
                                    className="im-th"
                                    style={{ textAlign: 'right' }}
                                  >
                                    SGST
                                  </th>
                                  <th
                                    className="im-th"
                                    style={{ textAlign: 'right' }}
                                  >
                                    IGST
                                  </th>
                                </>
                              )}
                              <th
                                className="im-th"
                                style={{ textAlign: 'right' }}
                              >
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailedReport.rows.map(row => (
                              <tr
                                className="im-tr"
                                key={`${row.invoice_id}-${row.expense_type_id}`}
                              >
                                <td
                                  className="im-td"
                                  style={{ fontWeight: 500 }}
                                >
                                  {row.invoice_number || 'N/A'}
                                </td>
                                <td className="im-td">
                                  {formatDate(row.invoice_date)}
                                </td>
                                {!isSmallScreen && (
                                  <td className="im-td">
                                    {row.shipment_number ||
                                      row.shipment_id ||
                                      'N/A'}
                                  </td>
                                )}
                                <td className="im-td">
                                  {row.service_provider_name || 'N/A'}
                                </td>
                                <td className="im-td">
                                  {row.expense_type_name || 'N/A'}
                                </td>
                                <td
                                  className="im-td"
                                  style={{ textAlign: 'right' }}
                                >
                                  {formatCurrency(
                                    (row.amount_paise || 0) / 100
                                  )}
                                </td>
                                {!isSmallScreen && (
                                  <>
                                    <td
                                      className="im-td"
                                      style={{ textAlign: 'right' }}
                                    >
                                      {formatCurrency(
                                        (row.cgst_amount_paise || 0) / 100
                                      )}
                                    </td>
                                    <td
                                      className="im-td"
                                      style={{ textAlign: 'right' }}
                                    >
                                      {formatCurrency(
                                        (row.sgst_amount_paise || 0) / 100
                                      )}
                                    </td>
                                    <td
                                      className="im-td"
                                      style={{ textAlign: 'right' }}
                                    >
                                      {formatCurrency(
                                        (row.igst_amount_paise || 0) / 100
                                      )}
                                    </td>
                                  </>
                                )}
                                <td
                                  className="im-td"
                                  style={{
                                    textAlign: 'right',
                                    fontWeight: 500,
                                  }}
                                >
                                  {formatCurrency(
                                    (row.total_amount_paise || 0) / 100
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : detailedReport ? (
                <div className="im-section">
                  <div
                    className="im-section__body"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '32px 0',
                    }}
                  >
                    <p style={{ color: 'var(--color-im-muted)', margin: 0 }}>
                      No expense data found for the selected filters.
                    </p>
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        fontSize: 13,
                        marginTop: 8,
                      }}
                    >
                      Try adjusting your filters or add some expense data.
                    </p>
                  </div>
                </div>
              ) : null}
            </TabsContent>

            {/* Summary Reports */}
            {[
              'summary-by-type',
              'summary-by-provider',
              'summary-by-shipment',
              'summary-by-month',
            ].map(type => (
              <TabsContent
                key={type}
                value={type}
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                {/* Charts */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 24,
                  }}
                >
                  <div className="im-section">
                    <div className="im-section__header">
                      <span className="im-section__label">// Bar Chart</span>
                    </div>
                    <div className="im-section__body">
                      <ResponsiveContainer
                        width="100%"
                        height={300}
                        minWidth={0}
                      >
                        <BarChart
                          data={
                            chartData as {
                              name: string;
                              amount: number;
                              [key: string]: string | number;
                            }[]
                          }
                        >
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
                    </div>
                  </div>

                  {type === 'summary-by-type' && (
                    <div className="im-section">
                      <div className="im-section__header">
                        <span className="im-section__label">// Pie Chart</span>
                      </div>
                      <div className="im-section__body">
                        <ResponsiveContainer
                          width="100%"
                          height={300}
                          minWidth={0}
                        >
                          <PieChart>
                            <Pie
                              data={pieChartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) =>
                                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
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
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary Table */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span className="im-section__label">
                      {type === 'summary-by-type' &&
                        '// Summary by Expense Type'}
                      {type === 'summary-by-provider' &&
                        '// Summary by Service Provider'}
                      {type === 'summary-by-shipment' &&
                        '// Summary by Shipment'}
                      {type === 'summary-by-month' && '// Summary by Month'}
                    </span>
                  </div>
                  <div className="im-section__body">
                    <div className="im-table-scroll">
                      <table className={`im-table ${getTableClass('auto')}`}>
                        <thead>
                          <tr>
                            <th className="im-th">Name</th>
                            <th
                              className="im-th"
                              style={{ textAlign: 'right' }}
                            >
                              Amount
                            </th>
                            {!isSmallScreen && (
                              <>
                                <th
                                  className="im-th"
                                  style={{ textAlign: 'right' }}
                                >
                                  CGST
                                </th>
                                <th
                                  className="im-th"
                                  style={{ textAlign: 'right' }}
                                >
                                  SGST
                                </th>
                                <th
                                  className="im-th"
                                  style={{ textAlign: 'right' }}
                                >
                                  IGST
                                </th>
                              </>
                            )}
                            <th
                              className="im-th"
                              style={{ textAlign: 'right' }}
                            >
                              Total
                            </th>
                            {type !== 'summary-by-type' && !isSmallScreen && (
                              <th
                                className="im-th"
                                style={{ textAlign: 'right' }}
                              >
                                Invoices
                              </th>
                            )}
                            <th
                              className="im-th"
                              style={{ textAlign: 'right' }}
                            >
                              Lines
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            if (type === 'summary-by-type') {
                              return summaryByType.map(item => (
                                <tr
                                  className="im-tr"
                                  key={item.expense_type_id}
                                >
                                  <td
                                    className="im-td"
                                    style={{ fontWeight: 500 }}
                                  >
                                    {item.expense_type_name}
                                  </td>
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </td>
                                  {!isSmallScreen && (
                                    <>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_cgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_sgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_igst_amount_paise / 100
                                        )}
                                      </td>
                                    </>
                                  )}
                                  <td
                                    className="im-td"
                                    style={{
                                      textAlign: 'right',
                                      fontWeight: 500,
                                    }}
                                  >
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </td>
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {item.line_count}
                                  </td>
                                </tr>
                              ));
                            } else if (type === 'summary-by-provider') {
                              return summaryByProvider.map(item => (
                                <tr
                                  className="im-tr"
                                  key={item.service_provider_id}
                                >
                                  <td
                                    className="im-td"
                                    style={{ fontWeight: 500 }}
                                  >
                                    {item.service_provider_name}
                                  </td>
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </td>
                                  {!isSmallScreen && (
                                    <>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_cgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_sgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_igst_amount_paise / 100
                                        )}
                                      </td>
                                    </>
                                  )}
                                  <td
                                    className="im-td"
                                    style={{
                                      textAlign: 'right',
                                      fontWeight: 500,
                                    }}
                                  >
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </td>
                                  {!isSmallScreen && (
                                    <td
                                      className="im-td"
                                      style={{ textAlign: 'right' }}
                                    >
                                      {item.invoice_count}
                                    </td>
                                  )}
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {item.line_count}
                                  </td>
                                </tr>
                              ));
                            } else if (type === 'summary-by-shipment') {
                              return summaryByShipment.map(item => (
                                <tr className="im-tr" key={item.shipment_id}>
                                  <td
                                    className="im-td"
                                    style={{ fontWeight: 500 }}
                                  >
                                    {item.shipment_number || item.shipment_id}
                                  </td>
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </td>
                                  {!isSmallScreen && (
                                    <>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_cgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_sgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_igst_amount_paise / 100
                                        )}
                                      </td>
                                    </>
                                  )}
                                  <td
                                    className="im-td"
                                    style={{
                                      textAlign: 'right',
                                      fontWeight: 500,
                                    }}
                                  >
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </td>
                                  {!isSmallScreen && (
                                    <td
                                      className="im-td"
                                      style={{ textAlign: 'right' }}
                                    >
                                      {item.invoice_count}
                                    </td>
                                  )}
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {item.line_count}
                                  </td>
                                </tr>
                              ));
                            } else {
                              return summaryByMonth.map(item => (
                                <tr
                                  className="im-tr"
                                  key={`${item.year}-${item.month}`}
                                >
                                  <td
                                    className="im-td"
                                    style={{ fontWeight: 500 }}
                                  >
                                    {item.month_name}
                                  </td>
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {formatCurrency(
                                      item.total_amount_paise / 100
                                    )}
                                  </td>
                                  {!isSmallScreen && (
                                    <>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_cgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_sgst_amount_paise / 100
                                        )}
                                      </td>
                                      <td
                                        className="im-td"
                                        style={{ textAlign: 'right' }}
                                      >
                                        {formatCurrency(
                                          item.total_igst_amount_paise / 100
                                        )}
                                      </td>
                                    </>
                                  )}
                                  <td
                                    className="im-td"
                                    style={{
                                      textAlign: 'right',
                                      fontWeight: 500,
                                    }}
                                  >
                                    {formatCurrency(
                                      item.total_net_amount_paise / 100
                                    )}
                                  </td>
                                  {!isSmallScreen && (
                                    <td
                                      className="im-td"
                                      style={{ textAlign: 'right' }}
                                    >
                                      {item.invoice_count}
                                    </td>
                                  )}
                                  <td
                                    className="im-td"
                                    style={{ textAlign: 'right' }}
                                  >
                                    {item.line_count}
                                  </td>
                                </tr>
                              ));
                            }
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ExpenseReports;
