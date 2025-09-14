import type { Row } from '@tanstack/react-table';
import { format } from 'date-fns';

import { useState } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useReport } from '@/hooks/useReport';

export default function ReportsPage() {
  const { data, totals, loading, error, updateFilters } = useReport();
  const notifications = useUnifiedNotifications();

  console.log('=== ReportsPage: Component rendered ===');
  console.log('Data:', data);
  console.log('Totals:', totals);
  console.log('Loading:', loading);
  console.log('Error:', error);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [partNo, setPartNo] = useState('');

  const handleSearch = () => {
    console.log('=== ReportsPage: Search triggered ===');
    console.log('Search filters:', {
      startDate,
      endDate,
      supplier,
      invoiceNo,
      partNo,
    });

    updateFilters({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      supplier: supplier || undefined,
      invoiceNo: invoiceNo || undefined,
      partNo: partNo || undefined,
    });
  };

  const handleClear = () => {
    console.log('=== ReportsPage: Clear filters ===');
    setStartDate('');
    setEndDate('');
    setSupplier('');
    setInvoiceNo('');
    setPartNo('');
    updateFilters({
      startDate: undefined,
      endDate: undefined,
      supplier: undefined,
      invoiceNo: undefined,
      partNo: undefined,
    });
  };

  const exportCsv = () => {
    console.log('=== ReportsPage: CSV export triggered ===');
    console.log('Exporting data:', data);

    const header = [
      'Supplier',
      'Invoice No',
      'Date',
      'Part No',
      'Description',
      'Unit',
      'Qty',
      'Unit Price',
      'Assessable Value',
      'BCD',
      'SWS',
      'IGST',
      'Expenses (Basic)',
      'LDC per qty',
    ];
    const csvRows = [header.join(',')];

    for (const r of data) {
      const vals = [
        r.supplier,
        r.invoice_no,
        r.invoice_date,
        r.part_no,
        r.description,
        r.unit,
        r.qty,
        r.unit_price,
        r.assessable_value,
        r.bcd_amount,
        r.sws_amount,
        r.igst_amount,
        r.expenses_total,
        r.ldc_per_qty,
      ];
      csvRows.push(vals.map(v => `"${String(v ?? '')}"`).join(','));
    }

    const blob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notifications.success(
      'Report Downloaded',
      'Consolidated report downloaded successfully!'
    );
  };

  const exportPdf = () => {
    console.log('=== ReportsPage: PDF export triggered ===');
    window.print();
  };

  const columns = [
    { accessorKey: 'supplier', header: 'Supplier' },
    { accessorKey: 'invoice_no', header: 'Invoice No' },
    {
      accessorKey: 'invoice_date',
      header: 'Date',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const date = row.getValue('invoice_date');
        if (!date) return '';
        try {
          return format(new Date(date as string), 'dd/MM/yyyy');
        } catch {
          console.warn('Invalid date value:', date);
          return String(date);
        }
      },
    },
    { accessorKey: 'part_no', header: 'Part No' },
    { accessorKey: 'description', header: 'Description' },
    { accessorKey: 'unit', header: 'Unit' },
    {
      accessorKey: 'qty',
      header: 'Qty',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const qty = row.getValue('qty');
        return qty ? Number(qty).toFixed(2) : '0.00';
      },
    },
    {
      accessorKey: 'unit_price',
      header: 'Unit Price',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const price = row.getValue('unit_price');
        return price ? Number(price).toFixed(4) : '0.0000';
      },
    },
    {
      accessorKey: 'assessable_value',
      header: 'Assessable Value',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const value = row.getValue('assessable_value');
        return value ? Number(value).toFixed(2) : '0.00';
      },
    },
    {
      accessorKey: 'bcd_amount',
      header: 'BCD',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const amount = row.getValue('bcd_amount');
        return amount ? Number(amount).toFixed(2) : '0.00';
      },
    },
    {
      accessorKey: 'sws_amount',
      header: 'SWS',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const amount = row.getValue('sws_amount');
        return amount ? Number(amount).toFixed(2) : '0.00';
      },
    },
    {
      accessorKey: 'igst_amount',
      header: 'IGST',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const amount = row.getValue('igst_amount');
        return amount ? Number(amount).toFixed(2) : '0.00';
      },
    },
    {
      accessorKey: 'expenses_total',
      header: 'Expenses (Basic)',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const amount = row.getValue('expenses_total');
        return amount ? Number(amount).toFixed(2) : '0.00';
      },
    },
    {
      accessorKey: 'ldc_per_qty',
      header: 'LDC per qty',
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const amount = row.getValue('ldc_per_qty');
        return amount ? Number(amount).toFixed(2) : '0.00';
      },
    },
  ];

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Consolidated Report</h1>
        <div className="space-x-2">
          <Button onClick={exportCsv} variant="outline">
            Export CSV
          </Button>
          <Button onClick={exportPdf} variant="outline">
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                placeholder="Supplier name"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoiceNo">Invoice No</Label>
              <Input
                id="invoiceNo"
                placeholder="Invoice number"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="partNo">Part No</Label>
              <Input
                id="partNo"
                placeholder="Part number"
                value={partNo}
                onChange={e => setPartNo(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex space-x-2">
            <Button onClick={handleSearch}>Search</Button>
            <Button onClick={handleClear} variant="outline">
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Report Data</CardTitle>
          {loading && (
            <p className="text-muted-foreground text-sm">Loading...</p>
          )}
          {error && <p className="text-destructive text-sm">Error: {error}</p>}
        </CardHeader>
        <CardContent>
          {data.length === 0 && !loading ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No data found</p>
              <p className="text-muted-foreground mt-2 text-sm">
                Try adjusting your filters or check if there's data in the
                database
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data as unknown as Record<string, unknown>[]}
              storageKey="report-table"
            />
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      {totals && (
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
              <div>
                <Label className="text-sm font-medium">Total Qty</Label>
                <p className="text-2xl font-bold">
                  {totals.qty?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Total Assessable Value
                </Label>
                <p className="text-2xl font-bold">
                  {totals.assessable_value?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Total BCD</Label>
                <p className="text-2xl font-bold">
                  {totals.bcd_amount?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Total SWS</Label>
                <p className="text-2xl font-bold">
                  {totals.sws_amount?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Total IGST</Label>
                <p className="text-2xl font-bold">
                  {totals.igst_amount?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Total Expenses (Basic)
                </Label>
                <p className="text-2xl font-bold">
                  {totals.expenses_total?.toFixed(2) || '0.00'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
