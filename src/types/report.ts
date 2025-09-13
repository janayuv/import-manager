export interface ReportRow {
  supplier: string;
  invoice_no: string;
  invoice_date: string;
  part_no: string;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
  assessable_value: number;
  bcd_amount: number;
  sws_amount: number;
  igst_amount: number;
  expenses_total: number;
  ldc_per_qty: number;
}

export interface ReportTotals {
  qty: number;
  assessable_value: number;
  bcd_amount: number;
  sws_amount: number;
  igst_amount: number;
  expenses_total: number;
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  supplierId?: string;
  supplier?: string;
  invoiceNo?: string;
  partNo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  includeTotals?: boolean;
}

export interface ReportResponse {
  rows: ReportRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totals?: ReportTotals;
}
