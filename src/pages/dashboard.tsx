// src/pages/dashboard.tsx
import { invoke } from '@tauri-apps/api/core';
import {
  format,
  formatDistanceToNowStrict,
  parse,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  DollarSign,
  Factory,
  Inbox,
  Package,
  RefreshCw,
  Ship,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
import {
  fetchDashboardActivityLog,
  hasLoggedDashboardViewThisSession,
  logDashboardActivity,
  markDashboardViewLoggedThisSession,
  type DashboardActivityRow,
} from '@/lib/dashboard-activity';
import { ExceptionOperationsPanel } from '@/components/dashboard/ExceptionOperationsPanel';
import { WorkflowHealthPanel } from '@/components/dashboard/WorkflowHealthPanel';
import { WorkflowAlertSignalsPanel } from '@/components/dashboard/WorkflowAlertSignalsPanel';
import { WorkflowObservabilityAdminCard } from '@/components/dashboard/WorkflowObservabilityAdminCard';
import { getExceptionNavigationTarget } from '@/lib/exception-navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { KPICard } from '@/components/ui/kpi-card';
import {
  LayoutControls,
  ResizableLayout,
} from '@/components/ui/resizable-layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateForDisplay } from '@/lib/date-format';
import { useUser } from '@/lib/user-context';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import type {
  DashboardMetricsFilters,
  DashboardMetricsResponse,
  KpiHistoryDayPoint,
  KpiMetadataRow,
  KpiSnapshotHistoryRow,
} from '@/types/dashboard-metrics';
import type { Item } from '@/types/item';
import type { Shipment as ShipmentTs } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

const LoadingSkeleton = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-5" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
    <div className="grid gap-6 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

type Timeframe = 'weekly' | 'monthly' | '3-month' | '6-month' | 'yearly';
type ModuleFilter = 'all' | 'shipment-invoice' | 'items' | 'expenses';

type KpiHistoryTimeRange = '7d' | '30d' | '90d' | '12m' | 'all';

type KpiTrendLinePoint = {
  dateLabel: string;
  dateRaw: string;
  shipments: number;
  duty: number;
  expenses: number;
};

type ChartRow = {
  name: string;
  shipments: number;
  value: number;
  dutySavings: number;
};

function currencySymbol(code: string): string {
  switch (code) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return '₹';
  }
}

function freshnessFromSnapshot(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return `Last refreshed ${formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}`;
  } catch {
    return '';
  }
}

function filterChartRows(
  rows: DashboardMetricsResponse['monthlySummary'],
  timeframe: Timeframe
): ChartRow[] {
  const now = new Date();
  let start: Date;
  switch (timeframe) {
    case 'weekly':
      start = startOfWeek(now);
      break;
    case 'monthly':
      start = startOfMonth(now);
      break;
    case '3-month':
      start = subDays(now, 90);
      break;
    case '6-month':
      start = subDays(now, 180);
      break;
    case 'yearly':
      start = subDays(now, 365);
      break;
  }

  const sorted = [...rows]
    .map(r => {
      const d = parse(`${r.period}-01`, 'yyyy-MM-dd', new Date());
      return { r, d };
    })
    .filter(
      ({ d }) =>
        !Number.isNaN(d.getTime()) && d >= start && d.getTime() <= now.getTime()
    )
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  return sorted.map(({ r, d }) => ({
    name: format(d, timeframe === 'yearly' ? 'MMM yyyy' : 'MMM yy'),
    shipments: r.shipments,
    value: r.value,
    dutySavings: Math.round(r.dutySavings),
  }));
}

function scopeShipmentsForCharts(
  list: ShipmentTs[],
  f: DashboardMetricsFilters,
  chartCurrency: string
): ShipmentTs[] {
  return list.filter(s => {
    if (f.currency?.trim() && (s.invoiceCurrency || 'INR') !== f.currency) {
      return false;
    }
    if (f.supplierId?.trim() && s.supplierId !== f.supplierId) return false;
    if (f.startDate?.trim() && s.invoiceDate && s.invoiceDate < f.startDate) {
      return false;
    }
    if (f.endDate?.trim() && s.invoiceDate && s.invoiceDate > f.endDate) {
      return false;
    }
    if (!chartCurrency.trim()) return true;
    return (s.invoiceCurrency || 'INR') === chartCurrency;
  });
}

function historyRangeStart(range: KpiHistoryTimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case '7d':
      return subDays(now, 7);
    case '30d':
      return subDays(now, 30);
    case '90d':
      return subDays(now, 90);
    case '12m':
      return subMonths(now, 12);
    case 'all':
      return null;
    default:
      return null;
  }
}

/** Pivot long-format `kpi_daily_snapshots` rows into one object per calendar day. */
function pivotKpiSnapshotHistory(
  rows: KpiSnapshotHistoryRow[]
): KpiHistoryDayPoint[] {
  const byDate = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let inner = byDate.get(r.snapshotDate);
    if (!inner) {
      inner = new Map();
      byDate.set(r.snapshotDate, inner);
    }
    inner.set(r.kpiName, r.value);
  }

  return [...byDate.entries()]
    .map(([dateRaw, kv]) => {
      const read = (k: string): number | null => {
        const v = kv.get(k);
        return v === undefined ? null : v;
      };
      const dateSort = new Date(`${dateRaw}T12:00:00`).getTime();
      return {
        dateRaw,
        dateSort,
        dateLabel: format(new Date(`${dateRaw}T12:00:00`), 'MMM d, yyyy'),
        totalShipments: read('total_shipments'),
        pendingShipments: read('pending_shipments'),
        deliveredShipments: read('delivered_shipments'),
        dutyTotal: read('duty_total'),
        expenseTotal: read('expense_total'),
      };
    })
    .sort((a, b) => a.dateSort - b.dateSort);
}

function filterKpiHistoryByRange(
  points: KpiHistoryDayPoint[],
  range: KpiHistoryTimeRange
): KpiHistoryDayPoint[] {
  const start = historyRangeStart(range);
  if (!start) return points;
  const t0 = start.getTime();
  return points.filter(p => p.dateSort >= t0);
}

function toTrendLinePoints(points: KpiHistoryDayPoint[]): KpiTrendLinePoint[] {
  return points.map(p => ({
    dateLabel: p.dateLabel,
    dateRaw: p.dateRaw,
    shipments: p.totalShipments ?? 0,
    duty: p.dutyTotal ?? 0,
    expenses: p.expenseTotal ?? 0,
  }));
}

function snapshotDirection(
  values: number[],
  eps: number
): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat';
  const latest = values[values.length - 1];
  const prev = values[values.length - 2];
  if (latest > prev + eps) return 'up';
  if (latest < prev - eps) return 'down';
  return 'flat';
}

function trendLabel(dir: 'up' | 'down' | 'flat'): string {
  switch (dir) {
    case 'up':
      return 'Increasing vs prior snapshot';
    case 'down':
      return 'Decreasing vs prior snapshot';
    default:
      return 'Stable vs prior snapshot';
  }
}

function KpiHistoryChartTooltip({
  active,
  payload,
  sym,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: KpiTrendLinePoint }>;
  sym: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border p-3 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDateForDisplay(d.dateRaw)}</p>
      <p>Shipments: {d.shipments.toLocaleString()}</p>
      <p>
        Duty: {sym}
        {Math.round(d.duty).toLocaleString()}
      </p>
      <p>
        Expenses: {sym}
        {Math.round(d.expenses).toLocaleString()}
      </p>
    </div>
  );
}

const DASHBOARD_EXPORT_ROW_CAP = 50_000;
const DASHBOARD_FILTER_STORAGE_KEY = 'im.dashboard.filters.v1';

function exportDashboardCsv(
  m: DashboardMetricsResponse,
  meta: Record<string, KpiMetadataRow>
): { rowCount: number; clipped: boolean } {
  const lines: string[] = [];
  lines.push(`snapshot_at,${JSON.stringify(m.snapshotAt)}`);
  const scalarRows: [string, string][] = [
    ['total_suppliers', String(m.totalSuppliers)],
    ['total_items', String(m.totalItems)],
    ['total_shipments', String(m.totalShipments)],
    ['pending_shipments', String(m.pendingShipments)],
    ['delivered_shipments', String(m.deliveredShipments)],
    ['reconciled_boes', String(m.reconciledBoes)],
    ['total_invoice_value', String(m.totalInvoiceValue)],
    ['avg_transit_days', String(m.avgTransitDays ?? '')],
    ['expense_total', String(m.expenseTotal)],
    ['duty_total', String(m.dutyTotal)],
    ['total_duty_savings_estimate', String(m.totalDutySavingsEstimate)],
    ['landed_cost_total', String(m.landedCostTotal)],
  ];
  for (const [k, v] of scalarRows) {
    lines.push(`${k},${v}`);
  }
  lines.push('kpi_key,formula_ref');
  for (const [k] of scalarRows) {
    lines.push(`${k},${JSON.stringify(meta[k]?.formula ?? '')}`);
  }
  lines.push('period,shipments,value,duty_savings');
  const preMonthlyLines = lines.length;
  let monthly = m.monthlySummary;
  let clipped = false;
  const reserved =
    preMonthlyLines +
    5 +
    (m.exceptions?.length ?? 0) +
    Object.keys(meta).length +
    20;
  const maxMonthly = Math.max(0, DASHBOARD_EXPORT_ROW_CAP - reserved);
  if (monthly.length > maxMonthly) {
    monthly = monthly.slice(0, maxMonthly);
    clipped = true;
  }
  for (const row of monthly) {
    lines.push(
      `${row.period},${row.shipments},${row.value},${row.dutySavings}`
    );
  }
  lines.push('exception_kind,severity,message,count');
  for (const ex of m.exceptions) {
    lines.push(
      `${JSON.stringify(ex.kind)},${JSON.stringify(ex.severity)},${JSON.stringify(ex.message)},${ex.count}`
    );
  }
  const blob = new Blob([lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard-export-${m.snapshotAt.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return { rowCount: lines.length, clipped };
}

const DashboardPage = () => {
  const { getTextClass, getSpacingClass, getGridColumns } =
    useResponsiveContext();
  const notifications = useUnifiedNotifications();
  const { user } = useUser();

  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('monthly');
  /** Empty = all currencies in client-side charts; metrics API uses the same when unset. */
  const [chartCurrency, setChartCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [layoutDirection, setLayoutDirection] = useState<
    'horizontal' | 'vertical'
  >('horizontal');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [shipments, setShipments] = useState<ShipmentTs[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetricsResponse | null>(null);
  const [kpiByName, setKpiByName] = useState<Record<string, KpiMetadataRow>>(
    {}
  );
  const [kpiHistory, setKpiHistory] = useState<KpiSnapshotHistoryRow[]>([]);
  const [historyTimeRange, setHistoryTimeRange] =
    useState<KpiHistoryTimeRange>('90d');

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [fiscalStartMonth, setFiscalStartMonth] = useState('4');
  const [filtersEpoch, setFiltersEpoch] = useState(0);
  const [activityRows, setActivityRows] = useState<DashboardActivityRow[]>([]);
  const filterDebounceRef = useRef<number | null>(null);
  const filterDebounceGen = useRef(0);
  const allowFilterDebounceLog = useRef(false);

  const buildFilters = useCallback((): DashboardMetricsFilters => {
    return {
      startDate: filterStart.trim() || undefined,
      endDate: filterEnd.trim() || undefined,
      supplierId: filterSupplierId.trim() || undefined,
      currency: chartCurrency.trim() || undefined,
      fiscalYear: fiscalYear.trim() ? parseInt(fiscalYear, 10) : undefined,
      fiscalYearStartMonth: fiscalStartMonth
        ? parseInt(fiscalStartMonth, 10)
        : undefined,
    };
  }, [
    filterStart,
    filterEnd,
    filterSupplierId,
    chartCurrency,
    fiscalYear,
    fiscalStartMonth,
  ]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const filters: DashboardMetricsFilters = {
        ...buildFilters(),
        userRole: user?.role?.trim() || undefined,
      };
      const [sup, it, shp, m, meta] = await Promise.all([
        invoke<Supplier[]>('get_suppliers'),
        invoke<Item[]>('get_items'),
        invoke<ShipmentTs[]>('get_shipments'),
        invoke<DashboardMetricsResponse>('get_dashboard_metrics', {
          filters,
        }),
        invoke<KpiMetadataRow[]>('get_kpi_metadata'),
      ]);
      setSuppliers(sup);
      setItems(it);
      setShipments(shp);
      setMetrics(m);
      setKpiByName(Object.fromEntries(meta.map(k => [k.kpiName, k])));
    } catch (e) {
      console.error('Failed to load dashboard data', e);
      notifications.system.error('load dashboard data', String(e));
    } finally {
      setLoading(false);
    }
  }, [buildFilters, notifications.system, user?.role]);

  const loadKpiHistory = useCallback(async () => {
    try {
      const rows = await invoke<KpiSnapshotHistoryRow[]>(
        'get_kpi_snapshot_history',
        {
          query: { limitDays: 365 },
        }
      );
      setKpiHistory(rows);
    } catch (e) {
      console.error('Failed to load KPI snapshot history', e);
      notifications.system.error('load KPI history', String(e));
      setKpiHistory([]);
    }
  }, [notifications.system]);

  useEffect(() => {
    void loadDashboard();
    // chartCurrency + filtersEpoch drive reload; filter fields apply on Apply / this effect tick only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartCurrency, filtersEpoch]);

  useEffect(() => {
    void loadKpiHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; refresh via handleRefresh
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_FILTER_STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Record<string, unknown>;
      if (typeof p.filterStart === 'string') setFilterStart(p.filterStart);
      if (typeof p.filterEnd === 'string') setFilterEnd(p.filterEnd);
      if (typeof p.filterSupplierId === 'string')
        setFilterSupplierId(p.filterSupplierId);
      if (typeof p.fiscalYear === 'string') setFiscalYear(p.fiscalYear);
      if (typeof p.fiscalStartMonth === 'string')
        setFiscalStartMonth(p.fiscalStartMonth);
      if (typeof p.chartCurrency === 'string')
        setChartCurrency(p.chartCurrency);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DASHBOARD_FILTER_STORAGE_KEY,
          JSON.stringify({
            filterStart,
            filterEnd,
            filterSupplierId,
            fiscalYear,
            fiscalStartMonth,
            chartCurrency,
          })
        );
      } catch {
        /* ignore */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    filterStart,
    filterEnd,
    filterSupplierId,
    fiscalYear,
    fiscalStartMonth,
    chartCurrency,
  ]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      allowFilterDebounceLog.current = true;
    }, 4000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!user?.id || !allowFilterDebounceLog.current) return;
    filterDebounceGen.current += 1;
    const gen = filterDebounceGen.current;
    if (filterDebounceRef.current)
      window.clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = window.setTimeout(() => {
      if (gen !== filterDebounceGen.current) return;
      void logDashboardActivity({
        userId: user.id,
        actionType: 'filter_changed',
        details: JSON.stringify(buildFilters()),
        moduleName: 'Dashboard',
        actionContext: 'debounced',
      });
    }, 2800);
    return () => {
      if (filterDebounceRef.current)
        window.clearTimeout(filterDebounceRef.current);
    };
  }, [
    filterStart,
    filterEnd,
    filterSupplierId,
    fiscalYear,
    fiscalStartMonth,
    chartCurrency,
    user?.id,
    buildFilters,
  ]);

  useEffect(() => {
    if (!metrics || !user?.id) return;
    if (!hasLoggedDashboardViewThisSession()) {
      void logDashboardActivity({
        userId: user.id,
        actionType: 'dashboard_viewed',
        details: JSON.stringify(buildFilters()),
        moduleName: 'Dashboard',
        recordReference: metrics.snapshotAt,
      });
      markDashboardViewLoggedThisSession();
    }
  }, [metrics, user?.id, buildFilters]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchDashboardActivityLog(150).then(rows => {
      setActivityRows(rows.filter(r => r.userId === user.id));
    });
  }, [user?.id, metrics?.snapshotAt]);

  const kpiDesc = useCallback(
    (key: string) => kpiByName[key]?.description ?? '',
    [kpiByName]
  );

  const pivotedHistory = useMemo(
    () => pivotKpiSnapshotHistory(kpiHistory),
    [kpiHistory]
  );

  const filteredHistoryPoints = useMemo(
    () => filterKpiHistoryByRange(pivotedHistory, historyTimeRange),
    [pivotedHistory, historyTimeRange]
  );

  const trendLinePoints = useMemo(
    () => toTrendLinePoints(filteredHistoryPoints),
    [filteredHistoryPoints]
  );

  const historyTrendShipments = useMemo(() => {
    const v = filteredHistoryPoints.map(p => p.totalShipments ?? 0);
    const d = snapshotDirection(v, 0.5);
    return { direction: d, label: trendLabel(d) };
  }, [filteredHistoryPoints]);

  const historyTrendDuty = useMemo(() => {
    const v = filteredHistoryPoints.map(p => p.dutyTotal ?? 0);
    const d = snapshotDirection(v, 1);
    return { direction: d, label: trendLabel(d) };
  }, [filteredHistoryPoints]);

  const historyTrendExpenses = useMemo(() => {
    const v = filteredHistoryPoints.map(p => p.expenseTotal ?? 0);
    const d = snapshotDirection(v, 1);
    return { direction: d, label: trendLabel(d) };
  }, [filteredHistoryPoints]);

  const showHistoryTrend = filteredHistoryPoints.length >= 2;

  const freshness = useMemo(
    () => freshnessFromSnapshot(metrics?.snapshotAt),
    [metrics?.snapshotAt]
  );

  const chartData = useMemo(() => {
    if (!metrics) return [];
    return filterChartRows(metrics.monthlySummary, timeframe);
  }, [metrics, timeframe]);

  const filterPayload = useMemo(() => buildFilters(), [buildFilters]);

  const scopedShipments = useMemo(
    () => scopeShipmentsForCharts(shipments, filterPayload, chartCurrency),
    [shipments, filterPayload, chartCurrency]
  );

  const recentItems = useMemo(() => {
    return [...items].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 5);
  }, [items]);

  const upcomingShipments = useMemo(() => {
    const now = new Date();

    const parseDate = (value?: string) => {
      if (!value) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return parse(value, 'yyyy-MM-dd', new Date());
      }
      if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
        return parse(value, 'dd-MM-yyyy', new Date());
      }
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        return parse(value, 'dd/MM/yyyy', new Date());
      }
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    return [...scopedShipments]
      .map(s => ({ ...s, _etaDate: parseDate(s.eta) }))
      .filter(s => s._etaDate && s._etaDate > now)
      .sort((a, b) => a._etaDate!.getTime() - b._etaDate!.getTime())
      .slice(0, 5)
      .map(s => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _etaDate: _ignore, ...rest } = s;
        return rest;
      });
  }, [scopedShipments]);

  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>();
    scopedShipments.forEach(s => {
      const status = s.status || 'Unknown';
      map.set(status, (map.get(status) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [scopedShipments]);

  const invoiceTrend = useMemo(() => {
    return [...scopedShipments]
      .sort(
        (a, b) =>
          new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
      )
      .map(s => ({ date: s.invoiceDate, value: s.invoiceValue }));
  }, [scopedShipments]);

  const handleRefresh = async () => {
    notifications.loading('Refreshing dashboard data...');
    try {
      await Promise.all([loadDashboard(), loadKpiHistory()]);
      notifications.success(
        'Refresh Complete',
        'Dashboard data refreshed successfully'
      );
    } catch (e) {
      console.error('Failed to refresh dashboard data', e);
      notifications.system.error('refresh dashboard data', String(e));
    }
  };

  const handleApplyFilters = () => {
    setFiltersEpoch(e => e + 1);
    void logDashboardActivity({
      userId: user?.id || 'anonymous',
      actionType: 'filters_applied',
      details: JSON.stringify(buildFilters()),
      moduleName: 'Dashboard',
    });
  };

  const handleExportCsv = () => {
    if (!metrics) return;
    const { rowCount, clipped } = exportDashboardCsv(metrics, kpiByName);
    void logDashboardActivity({
      userId: user?.id || 'anonymous',
      actionType: 'csv_exported',
      details: JSON.stringify({ rowCount, clipped }),
      moduleName: 'Dashboard',
    });
    if (clipped) {
      notifications.warning(
        'Export row cap',
        `CSV includes up to ${DASHBOARD_EXPORT_ROW_CAP} data rows. Narrow filters or export from reports for full history.`
      );
    } else {
      notifications.success('Export', 'CSV downloaded');
    }
  };

  const logShipmentDrilldown = (target: string, label: string) => {
    void logDashboardActivity({
      userId: user?.id || 'anonymous',
      actionType: 'shipment_drilldown_opened',
      details: JSON.stringify({ label }),
      moduleName: 'Dashboard',
      navigationTarget: target,
      recordReference: label,
    });
  };

  const lastActivitySummary = useMemo(() => {
    const byType = (t: string) =>
      activityRows.find(r => r.actionType === t)?.timestamp;
    return {
      lastDashboardView: byType('dashboard_viewed'),
      lastExport: byType('csv_exported'),
      lastException: byType('exception_clicked'),
    };
  }, [activityRows]);

  const sym = currencySymbol(chartCurrency || 'INR');
  const overdueCount =
    metrics?.exceptions.find(e => e.kind === 'overdue_eta')?.count ?? 0;

  const showShipment =
    moduleFilter === 'all' || moduleFilter === 'shipment-invoice';
  const showItems = moduleFilter === 'all' || moduleFilter === 'items';
  const showExpenses = moduleFilter === 'all' || moduleFilter === 'expenses';

  if (loading || !metrics) {
    return <LoadingSkeleton />;
  }

  const fyYears = [2023, 2024, 2025, 2026, 2027];

  return (
    <div className={`container mx-auto space-y-6 p-6 ${getSpacingClass()}`}>
      <div
        className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ${getSpacingClass()}`}
      >
        <div>
          <h1 className="text-xl font-semibold text-blue-600">Dashboard</h1>
          <p className={`${getTextClass()} text-muted-foreground`}>
            Operational overview across modules — aggregates match filtered
            scope; duty totals align with the consolidated report view.
          </p>
          {freshness && (
            <p className="text-muted-foreground mt-1 text-sm">{freshness}</p>
          )}
        </div>
        <div
          className={`flex flex-wrap items-center gap-2 ${getSpacingClass()}`}
        >
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            Export CSV
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleRefresh}
            useAccentColor
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Select
            value={moduleFilter}
            onValueChange={(v: ModuleFilter) => setModuleFilter(v)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Include all modules</SelectItem>
              <SelectItem value="shipment-invoice">
                Shipment & Invoice
              </SelectItem>
              <SelectItem value="items">Items</SelectItem>
              <SelectItem value="expenses">Expenses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Start date</label>
            <Input
              type="date"
              value={filterStart}
              onChange={e => setFilterStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">End date</label>
            <Input
              type="date"
              value={filterEnd}
              onChange={e => setFilterEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Supplier</label>
            <Select
              value={filterSupplierId || 'all'}
              onValueChange={v => setFilterSupplierId(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.supplierName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Fiscal year</label>
            <Select
              value={fiscalYear || 'none'}
              onValueChange={v => setFiscalYear(v === 'none' ? '' : v)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Calendar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Use dates above</SelectItem>
                {fyYears.map(y => (
                  <SelectItem key={y} value={String(y)}>
                    FY {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">
              FY start mo.
            </label>
            <Select
              value={fiscalStartMonth}
              onValueChange={setFiscalStartMonth}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(m => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="secondary" onClick={handleApplyFilters}>
            Apply filters
          </Button>
          <p className="text-muted-foreground max-w-md text-xs">
            When a fiscal year is selected, leave start/end empty so the FY
            window applies. Chart currency (above) scopes SQL metrics and client
            charts.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Your recent dashboard activity
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <div>
            Last dashboard view:{' '}
            <span className="text-foreground font-medium">
              {lastActivitySummary.lastDashboardView
                ? formatDateForDisplay(
                    lastActivitySummary.lastDashboardView.slice(0, 10)
                  )
                : '—'}
            </span>
          </div>
          <div>
            Last CSV export:{' '}
            <span className="text-foreground font-medium">
              {lastActivitySummary.lastExport
                ? formatDateForDisplay(
                    lastActivitySummary.lastExport.slice(0, 10)
                  )
                : '—'}
            </span>
          </div>
          <div>
            Last exception opened:{' '}
            <span className="text-foreground font-medium">
              {lastActivitySummary.lastException
                ? formatDateForDisplay(
                    lastActivitySummary.lastException.slice(0, 10)
                  )
                : '—'}
            </span>
          </div>
        </CardContent>
      </Card>

      {(metrics.exceptions.length > 0 ||
        metrics.documentCompliance.shipmentsMissingEta > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exceptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {metrics.exceptions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No open alerts.</p>
              ) : (
                metrics.exceptions.map(ex => (
                  <div
                    key={ex.exceptionType || ex.kind}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{ex.message}</div>
                      <div className="text-muted-foreground text-xs">
                        {ex.severity} · {ex.count} shipment(s)
                        {ex.exceptionType ? ` · ${ex.exceptionType}` : ''}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to={getExceptionNavigationTarget(ex)}
                        onClick={() => {
                          void logDashboardActivity({
                            userId: user?.id || 'anonymous',
                            actionType: 'exception_clicked',
                            details: JSON.stringify({
                              kind: ex.kind,
                              exceptionType: ex.exceptionType,
                              count: ex.count,
                            }),
                            moduleName: 'Dashboard',
                            recordReference: ex.exceptionType || ex.kind,
                            navigationTarget: getExceptionNavigationTarget(ex),
                          });
                        }}
                      >
                        Open
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Document compliance (preview)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-1 text-sm">
              <div>
                Missing ETA:{' '}
                <span className="text-foreground font-medium">
                  {metrics.documentCompliance.shipmentsMissingEta}
                </span>
              </div>
              <div>
                Missing ETD:{' '}
                <span className="text-foreground font-medium">
                  {metrics.documentCompliance.shipmentsMissingEtd}
                </span>
              </div>
              <div>
                No BOE row:{' '}
                <span className="text-foreground font-medium">
                  {metrics.documentCompliance.shipmentsWithoutBoeRow}
                </span>
              </div>
              <div>
                No expenses:{' '}
                <span className="text-foreground font-medium">
                  {metrics.documentCompliance.shipmentsWithoutExpense}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {metrics && (
        <div className="grid gap-4">
          <WorkflowHealthPanel refreshKey={metrics.snapshotAt} />
          <ExceptionOperationsPanel
            workflow={metrics.erp?.exceptionWorkflow}
            entityExceptions={metrics.erp?.entityExceptions ?? []}
            userId={user?.id || 'anonymous'}
            onRefresh={() => void loadDashboard()}
          />
        </div>
      )}

      {user?.role?.toLowerCase().includes('admin') && (
        <div className="grid gap-4">
          <WorkflowObservabilityAdminCard refreshKey={metrics?.snapshotAt} />
          <WorkflowAlertSignalsPanel
            callerRole={user?.role ?? 'Admin'}
            refreshKey={metrics?.snapshotAt}
          />
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <AlertTriangle className="text-muted-foreground h-5 w-5" />
              <CardTitle className="text-base">Operations center</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="text-muted-foreground mb-2">
                Incident lifecycle, recovery correlation, and audit export live
                in the dedicated operations view.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/operations-center">
                  Open operations center
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Inbox className="text-muted-foreground h-5 w-5" />
              <CardTitle className="text-base">Workflow inbox</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="text-muted-foreground mb-2">
                As an admin, review consolidated duty / landed cost in reports.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/report">Open consolidated report</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {overdueCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base">Delay risk (preview)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {overdueCount} shipment(s) have ETA in the past and are not marked
            delivered. Review ETAs and statuses on the shipment board.
          </CardContent>
        </Card>
      )}

      <div className={`grid gap-4 ${getGridColumns()}`}>
        {showShipment && (
          <Link to="/shipment" className="block">
            <KPICard
              title="Total Shipments"
              value={metrics.totalShipments}
              description={kpiDesc('total_shipments')}
              freshnessLabel={freshness}
              historyTrend={
                showHistoryTrend ? historyTrendShipments : undefined
              }
              icon={Ship}
              variant="default"
            />
          </Link>
        )}
        {showItems && (
          <Link to="/invoice" className="block">
            <KPICard
              title="Total Items"
              value={metrics.totalItems}
              description={kpiDesc('total_items')}
              freshnessLabel={freshness}
              icon={Package}
              variant="default"
            />
          </Link>
        )}
        {(moduleFilter === 'all' || moduleFilter === 'shipment-invoice') && (
          <Link to="/supplier" className="block">
            <KPICard
              title="Suppliers"
              value={metrics.totalSuppliers}
              description={kpiDesc('total_suppliers')}
              freshnessLabel={freshness}
              icon={Factory}
              variant="default"
            />
          </Link>
        )}
        {showShipment && (
          <Link to="/boe" className="block">
            <KPICard
              title="Reconciled BOEs"
              value={metrics.reconciledBoes}
              description={kpiDesc('reconciled_boes')}
              freshnessLabel={freshness}
              icon={TrendingUp}
              variant="success"
            />
          </Link>
        )}
        {showShipment && (
          <KPICard
            title="Total invoice value"
            value={`${sym}${metrics.totalInvoiceValue.toLocaleString()}`}
            description={kpiDesc('total_invoice_value')}
            freshnessLabel={freshness}
            icon={DollarSign}
            variant="default"
          />
        )}
        {showShipment && (
          <Link
            to="/shipment?status=docu-received"
            className="block"
            onClick={() =>
              logShipmentDrilldown(
                '/shipment?status=docu-received',
                'pending_shipments'
              )
            }
          >
            <KPICard
              title="Pending Shipments"
              value={metrics.pendingShipments}
              description={kpiDesc('pending_shipments')}
              freshnessLabel={freshness}
              icon={AlertTriangle}
              variant="warning"
            />
          </Link>
        )}
        {showShipment && (
          <Link
            to="/shipment?status=delivered"
            className="block"
            onClick={() =>
              logShipmentDrilldown('/shipment?status=delivered', 'delivered')
            }
          >
            <KPICard
              title="Delivered"
              value={metrics.deliveredShipments}
              description={kpiDesc('delivered_shipments')}
              freshnessLabel={freshness}
              icon={CheckCircle}
              variant="success"
            />
          </Link>
        )}
        {showShipment && (
          <KPICard
            title="Avg transit days"
            value={
              metrics.avgTransitDays === null
                ? '—'
                : metrics.avgTransitDays.toFixed(1)
            }
            description={kpiDesc('avg_transit_days')}
            freshnessLabel={freshness}
            icon={Calendar}
            variant="default"
          />
        )}
        {showShipment && (
          <KPICard
            title="Duty savings (estimate)"
            value={`${sym}${Math.round(metrics.totalDutySavingsEstimate).toLocaleString()}`}
            description={kpiDesc('total_duty_savings_estimate')}
            freshnessLabel={freshness}
            icon={TrendingUp}
            variant="success"
          />
        )}
        {showShipment && (
          <KPICard
            title="Duty (report scope)"
            value={`${sym}${Math.round(metrics.dutyTotal).toLocaleString()}`}
            description={kpiDesc('duty_total')}
            freshnessLabel={freshness}
            historyTrend={showHistoryTrend ? historyTrendDuty : undefined}
            icon={DollarSign}
            variant="default"
          />
        )}
        {showExpenses && (
          <Link to="/expenses" className="block">
            <KPICard
              title="Expense total (scope)"
              value={`${sym}${Math.round(metrics.expenseTotal).toLocaleString()}`}
              description={kpiDesc('expense_total')}
              freshnessLabel={freshness}
              historyTrend={showHistoryTrend ? historyTrendExpenses : undefined}
              icon={DollarSign}
              variant="default"
            />
          </Link>
        )}
        {showShipment && (
          <KPICard
            title="Landed cost (naive)"
            value={`${sym}${Math.round(metrics.landedCostTotal).toLocaleString()}`}
            description={kpiDesc('landed_cost_total')}
            freshnessLabel={freshness}
            icon={TrendingUp}
            variant="default"
          />
        )}
      </div>

      {showShipment && (
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>KPI trends</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Daily snapshot history — executive view of shipments, duty, and
                expenses.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground whitespace-nowrap text-xs">
                Range
              </span>
              <Select
                value={historyTimeRange}
                onValueChange={v =>
                  setHistoryTimeRange(v as KpiHistoryTimeRange)
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="12m">Last 12 months</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 space-y-6">
            {kpiHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No historical KPI data available yet. Snapshots will appear
                automatically over time.
              </p>
            ) : trendLinePoints.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No snapshot rows in this time range. Try &quot;All&quot; or a
                wider window.
              </p>
            ) : (
              <div className="grid min-h-0 gap-6 lg:grid-cols-3">
                <div className="flex min-h-0 flex-col space-y-2">
                  <h3 className="text-sm font-medium">Total shipments trend</h3>
                  <div className="h-[220px] min-h-0 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendLinePoints}>
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 11 }} width={40} />
                        <Tooltip
                          content={props => (
                            <KpiHistoryChartTooltip {...props} sym={sym} />
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="shipments"
                          name="Shipments"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="flex min-h-0 flex-col space-y-2">
                  <h3 className="text-sm font-medium">Duty trend</h3>
                  <div className="h-[220px] min-h-0 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendLinePoints}>
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 11 }} width={44} />
                        <Tooltip
                          content={props => (
                            <KpiHistoryChartTooltip {...props} sym={sym} />
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="duty"
                          name="Duty"
                          stroke="#0d9488"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="flex min-h-0 flex-col space-y-2">
                  <h3 className="text-sm font-medium">Expense trend</h3>
                  <div className="h-[220px] min-h-0 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendLinePoints}>
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 11 }} width={44} />
                        <Tooltip
                          content={props => (
                            <KpiHistoryChartTooltip {...props} sym={sym} />
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="expenses"
                          name="Expenses"
                          stroke="#c2410c"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showShipment && (
        <ResizableLayout
          storageKey="dashboard-analytics-layout"
          defaultSizes={[60, 40]}
          minSizes={[30, 20]}
          maxSizes={[80, 70]}
          direction={layoutDirection}
        >
          <Card className="flex min-h-0 flex-col">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CardTitle>Shipment Analytics</CardTitle>
                <div className="flex items-center gap-2">
                  <LayoutControls
                    onReset={() => {}}
                    onToggleDirection={() =>
                      setLayoutDirection(prev =>
                        prev === 'horizontal' ? 'vertical' : 'horizontal'
                      )
                    }
                    direction={layoutDirection}
                  />
                  <Select
                    value={chartCurrency || 'ALL'}
                    onValueChange={v => setChartCurrency(v === 'ALL' ? '' : v)}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      {['INR', 'USD', 'EUR', 'GBP'].map(c => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex rounded-md border">
                    {(
                      [
                        'weekly',
                        'monthly',
                        '3-month',
                        '6-month',
                        'yearly',
                      ] as const
                    ).map(tf => (
                      <Button
                        key={tf}
                        variant={timeframe === tf ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setTimeframe(tf)}
                        className="rounded-none first:rounded-l-md last:rounded-r-md"
                      >
                        {tf === '3-month'
                          ? '3M'
                          : tf === '6-month'
                            ? '6M'
                            : tf === 'yearly'
                              ? '1Y'
                              : tf.charAt(0).toUpperCase() + tf.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-4 pt-0">
              <div className="h-[360px] min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis
                      dataKey="name"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v >= 100000 ? sym : ''}${v}`}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="shipments"
                      fill="#8884d8"
                      name="# Shipments"
                    />
                    <Bar
                      dataKey="value"
                      fill="#82ca9d"
                      name={`Total value (${chartCurrency})`}
                    />
                    <Bar
                      dataKey="dutySavings"
                      fill="#ffc658"
                      name="Duty savings (est.)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="flex min-h-0 flex-col space-y-4">
            <Card className="flex min-h-0 flex-col">
              <CardHeader>
                <CardTitle>Shipment Status</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 p-4 pt-0">
                <div className="h-[160px] min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={60}
                      >
                        {statusDistribution.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              [
                                '#8884d8',
                                '#82ca9d',
                                '#ffc658',
                                '#FF8042',
                                '#00C49F',
                              ][idx % 5]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-col">
              <CardHeader>
                <CardTitle>Invoice Trend</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 p-4 pt-0">
                <div className="h-[160px] min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={invoiceTrend}>
                      <XAxis dataKey="date" hide />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#8884d8"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </ResizableLayout>
      )}

      {showItems && (
        <div className="text-muted-foreground text-center text-sm lg:hidden">
          Module filter: charts above follow shipment scope; tables below follow
          the same currency filter where applicable.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {showShipment && (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Shipments</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingShipments.length > 0 ? (
                    upcomingShipments.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/shipment/${encodeURIComponent(s.id)}/view`}
                            className="text-primary hover:underline"
                          >
                            {s.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {s.eta ? formatDateForDisplay(s.eta) : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              s.status === 'delivered' ? 'default' : 'secondary'
                            }
                          >
                            {s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-muted-foreground text-center"
                      >
                        No upcoming shipments.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {showItems && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentItems.length > 0 ? (
                    recentItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.partNumber}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {item.itemDescription}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="text-muted-foreground text-center"
                      >
                        No items found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {showExpenses && (
        <Card>
          <CardHeader>
            <CardTitle>Expenses Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-2xl font-semibold">
                Total: {sym}
                {Math.round(metrics.expenseTotal).toLocaleString()}
              </div>
              <Badge variant="secondary">SQL scope: filtered shipments</Badge>
              <Button variant="link" asChild className="h-auto p-0">
                <Link to="/expenses">Open expenses</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;
