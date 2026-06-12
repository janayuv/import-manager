import type { Row } from '@tanstack/react-table';
import { format } from 'date-fns';

import { useMemo, useState } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import { DataTable } from '@/components/shared/data-table';
import { useReport } from '@/hooks/useReport';

export default function ReportsPage() {
  const { data, totals, loading, error, updateFilters } = useReport();
  const notifications = useUnifiedNotifications();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [partNo, setPartNo] = useState('');

  const handleSearch = () => {
    updateFilters({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      supplier: supplier || undefined,
      invoiceNo: invoiceNo || undefined,
      partNo: partNo || undefined,
    });
  };

  const handleClear = () => {
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
    window.print();
  };

  const columns = useMemo(
    () => [
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
    ],
    []
  );

  return (
    <div className="im-table-shell">
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>CONSOLIDATED REPORT</h1>
        </div>
        <div className="im-page-header__actions">
          <button type="button" className="im-hdr-btn" onClick={exportCsv}>
            Export CSV
          </button>
          <button type="button" className="im-btn-primary" onClick={exportPdf}>
            Export PDF
          </button>
        </div>
      </div>

      <div className="im-dashboard-body flex flex-col gap-6">
        {/* Filters */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">Filters</span>
          </div>
          <div className="im-section__body">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div>
                <label className="im-field-label" htmlFor="startDate">
                  Start Date
                </label>
                <input
                  className="im-input"
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="im-field-label" htmlFor="endDate">
                  End Date
                </label>
                <input
                  className="im-input"
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="im-field-label" htmlFor="supplier">
                  Supplier
                </label>
                <input
                  className="im-input"
                  id="supplier"
                  placeholder="Supplier name"
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                />
              </div>
              <div>
                <label className="im-field-label" htmlFor="invoiceNo">
                  Invoice No
                </label>
                <input
                  className="im-input"
                  id="invoiceNo"
                  placeholder="Invoice number"
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                />
              </div>
              <div>
                <label className="im-field-label" htmlFor="partNo">
                  Part No
                </label>
                <input
                  className="im-input"
                  id="partNo"
                  placeholder="Part number"
                  value={partNo}
                  onChange={e => setPartNo(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={handleSearch}
              >
                Search
              </button>
              <button type="button" className="im-btn" onClick={handleClear}>
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">Report Data</span>
            {loading && (
              <p style={{ color: 'var(--color-im-muted)', fontSize: 13 }}>
                Loading...
              </p>
            )}
            {error && (
              <p style={{ color: 'var(--color-im-bad)', fontSize: 13 }}>
                Error: {error}
              </p>
            )}
          </div>
          <div className="im-section__body">
            {data.length === 0 && !loading ? (
              <div className="py-8 text-center">
                <p style={{ color: 'var(--color-im-muted)' }}>No data found</p>
                <p
                  style={{
                    color: 'var(--color-im-muted)',
                    marginTop: 8,
                    fontSize: 13,
                  }}
                >
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
          </div>
        </div>

        {/* Totals */}
        {totals && (
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">Totals</span>
            </div>
            <div className="im-section__body">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
                <div>
                  <span className="im-field-label">Total Qty</span>
                  <p className="text-2xl font-bold">
                    {totals.qty?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <span className="im-field-label">Total Assessable Value</span>
                  <p className="text-2xl font-bold">
                    {totals.assessable_value?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <span className="im-field-label">Total BCD</span>
                  <p className="text-2xl font-bold">
                    {totals.bcd_amount?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <span className="im-field-label">Total SWS</span>
                  <p className="text-2xl font-bold">
                    {totals.sws_amount?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <span className="im-field-label">Total IGST</span>
                  <p className="text-2xl font-bold">
                    {totals.igst_amount?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <span className="im-field-label">Total Expenses (Basic)</span>
                  <p className="text-2xl font-bold">
                    {totals.expenses_total?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
