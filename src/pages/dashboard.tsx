// src/pages/dashboard.tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safeInvoke as invoke } from '@/lib/ipc-safe';
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
import { KpiTile } from '@/components/shared/im';
import { formatDateForDisplay } from '@/lib/date-format';
import { ipcErrorMessage } from '@/lib/ipc-error';
import { useUser, useHasPermission } from '@/lib/user-context';
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
  <div
    className="im-dashboard-body"
    style={{ gap: 16, display: 'flex', flexDirection: 'column' }}
  >
    <div className="im-kpi-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="im-kpi" style={{ minHeight: 80 }} />
      ))}
    </div>
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="im-section" style={{ height: 200 }} />
    ))}
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
    <div
      className="border p-3 text-xs"
      style={{
        background: '#101010',
        borderColor: '#1F1E1A',
        borderRadius: 0,
        color: '#EFEDE8',
        fontFamily: '"IBM Plex Sans","Inter",sans-serif',
        fontSize: 12,
      }}
    >
      <p className="mb-1 font-medium" style={{ color: '#8C8A82' }}>
        {formatDateForDisplay(d.dateRaw)}
      </p>
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

/** Recharts + tooltip styling aligned with Industrial Console (MASTER_SPEC §3). */
const IM_CHART = {
  colors: {
    primary: '#E8A23A',
    secondary: '#5FCB7D',
    tertiary: '#F87171',
    info: '#60A5FA',
    barShipments: '#E8A23A',
    barValue: '#5FCB7D',
    barDutySavings: '#FB923C',
    pie: ['#E8A23A', '#5FCB7D', '#F87171', '#60A5FA', '#FB923C'],
  },
  axis: {
    tick: {
      fill: '#56544E',
      fontSize: 11,
      fontFamily: 'Consolas, Courier New, monospace',
    },
  },
} as const;

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
  const notifications = useUnifiedNotifications();
  const { user } = useUser();
  const canViewAdminPanels = useHasPermission('admin.activity_log');

  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('monthly');
  /** Empty = all currencies in client-side charts; metrics API uses the same when unset. */
  const [chartCurrency, setChartCurrency] = useState('');
  const queryClient = useQueryClient();
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

  const dashboardQueryKey = useMemo(
    () =>
      [
        'dashboard-main',
        filtersEpoch,
        chartCurrency,
        filterStart,
        filterEnd,
        filterSupplierId,
        fiscalYear,
        fiscalStartMonth,
        user?.role ?? '',
      ] as const,
    [
      filtersEpoch,
      chartCurrency,
      filterStart,
      filterEnd,
      filterSupplierId,
      fiscalYear,
      fiscalStartMonth,
      user?.role,
    ]
  );

  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: async () => {
      const filters: DashboardMetricsFilters = {
        ...buildFilters(),
        userRole: user?.role?.trim() || undefined,
      };
      try {
        const [sup, it, shp, m, meta] = await Promise.all([
          invoke<Supplier[]>('get_suppliers'),
          invoke<Item[]>('get_items'),
          invoke<ShipmentTs[]>('get_shipments'),
          invoke<DashboardMetricsResponse>('get_dashboard_metrics', {
            filters,
          }),
          invoke<KpiMetadataRow[]>('get_kpi_metadata'),
        ]);
        return {
          suppliers: sup,
          items: it,
          shipments: shp,
          metrics: m,
          kpiByName: Object.fromEntries(
            meta.map(k => [k.kpiName, k])
          ) as Record<string, KpiMetadataRow>,
        };
      } catch (e) {
        console.error('Failed to load dashboard data', e);
        notifications.system.error('load dashboard data', ipcErrorMessage(e));
        throw e;
      }
    },
    staleTime: 45_000,
  });

  const kpiHistoryQuery = useQuery({
    queryKey: ['kpi-snapshot-history'] as const,
    queryFn: async () => {
      try {
        return await invoke<KpiSnapshotHistoryRow[]>(
          'get_kpi_snapshot_history',
          {
            query: { limitDays: 365 },
          }
        );
      } catch (e) {
        console.error('Failed to load KPI snapshot history', e);
        notifications.system.error('load KPI history', ipcErrorMessage(e));
        return [];
      }
    },
    staleTime: 120_000,
  });

  const suppliers = useMemo(
    () => dashboardQuery.data?.suppliers ?? [],
    [dashboardQuery.data?.suppliers]
  );
  const items = useMemo(
    () => dashboardQuery.data?.items ?? [],
    [dashboardQuery.data?.items]
  );
  const shipments = useMemo(
    () => dashboardQuery.data?.shipments ?? [],
    [dashboardQuery.data?.shipments]
  );
  const metrics = dashboardQuery.data?.metrics ?? null;
  const kpiByName = useMemo(
    () => dashboardQuery.data?.kpiByName ?? {},
    [dashboardQuery.data?.kpiByName]
  );
  const kpiHistory = useMemo(
    () => kpiHistoryQuery.data ?? [],
    [kpiHistoryQuery.data]
  );
  const loading = dashboardQuery.isPending;

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
    void fetchDashboardActivityLog(150, user.id).then(rows => {
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-main'] }),
        queryClient.invalidateQueries({ queryKey: ['kpi-snapshot-history'] }),
      ]);
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
    return (
      <div data-testid="dashboard-page" className="im-page">
        <AppBar crumbs={['Import Manager', 'Dashboard']} />
        <PageHeader title="DASHBOARD" subtitle="Operational overview" />
        <div className="im-dashboard-body">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  const fyYears = [2023, 2024, 2025, 2026, 2027];

  return (
    <div data-testid="dashboard-page" className="im-table-shell">
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>DASHBOARD</h1>
          {freshness && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-im-muted)',
                fontFamily: 'monospace',
              }}
            >
              {freshness}
            </span>
          )}
        </div>
        <div className="im-page-header__actions">
          <div className="im-select-wrap" style={{ width: 220 }}>
            <select
              className="im-select"
              value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value as ModuleFilter)}
            >
              <option value="all">Include all modules</option>
              <option value="shipment-invoice">Shipment &amp; Invoice</option>
              <option value="items">Items</option>
              <option value="expenses">Expenses</option>
            </select>
          </div>
          <button
            type="button"
            className="im-hdr-btn"
            onClick={handleExportCsv}
          >
            Export CSV
          </button>
          <button type="button" className="im-hdr-btn" onClick={handleRefresh}>
            ↺ Refresh
          </button>
        </div>
      </div>

      <div
        className="im-dashboard-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Filters</span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px 20px',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <label className="im-field-label">Start date</label>
              <input
                type="date"
                className="im-input"
                value={filterStart}
                onChange={e => setFilterStart(e.target.value)}
              />
            </div>
            <div>
              <label className="im-field-label">End date</label>
              <input
                type="date"
                className="im-input"
                value={filterEnd}
                onChange={e => setFilterEnd(e.target.value)}
              />
            </div>
            <div>
              <label className="im-field-label">Supplier</label>
              <div className="im-select-wrap" style={{ width: 200 }}>
                <select
                  className="im-select"
                  value={filterSupplierId || 'all'}
                  onChange={e =>
                    setFilterSupplierId(
                      e.target.value === 'all' ? '' : e.target.value
                    )
                  }
                >
                  <option value="all">All suppliers</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.supplierName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="im-field-label">Fiscal year</label>
              <div className="im-select-wrap" style={{ width: 140 }}>
                <select
                  className="im-select"
                  value={fiscalYear || 'none'}
                  onChange={e =>
                    setFiscalYear(
                      e.target.value === 'none' ? '' : e.target.value
                    )
                  }
                >
                  <option value="none">Use dates above</option>
                  {fyYears.map(y => (
                    <option key={y} value={String(y)}>
                      FY {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="im-field-label">FY start mo.</label>
              <div className="im-select-wrap" style={{ width: 80 }}>
                <select
                  className="im-select"
                  value={fiscalStartMonth}
                  onChange={e => setFiscalStartMonth(e.target.value)}
                >
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                    m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="im-btn im-btn--sm"
              onClick={handleApplyFilters}
            >
              Apply filters
            </button>
            <p
              style={{
                fontSize: 11.5,
                color: 'var(--color-im-faint)',
                maxWidth: 360,
              }}
            >
              When a fiscal year is selected, leave start/end empty. Chart
              currency scopes SQL metrics and client charts.
            </p>
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Recent activity</span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <div style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}>
              Last dashboard view:{' '}
              <span style={{ color: 'var(--color-im-text)', fontWeight: 500 }}>
                {lastActivitySummary.lastDashboardView
                  ? formatDateForDisplay(
                      lastActivitySummary.lastDashboardView.slice(0, 10)
                    )
                  : '—'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}>
              Last CSV export:{' '}
              <span style={{ color: 'var(--color-im-text)', fontWeight: 500 }}>
                {lastActivitySummary.lastExport
                  ? formatDateForDisplay(
                      lastActivitySummary.lastExport.slice(0, 10)
                    )
                  : '—'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}>
              Last exception opened:{' '}
              <span style={{ color: 'var(--color-im-text)', fontWeight: 500 }}>
                {lastActivitySummary.lastException
                  ? formatDateForDisplay(
                      lastActivitySummary.lastException.slice(0, 10)
                    )
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {(metrics.exceptions.length > 0 ||
          metrics.documentCompliance.shipmentsMissingEta > 0) && (
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
          >
            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">// Exceptions</span>
              </div>
              <div
                className="im-section__body"
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {metrics.exceptions.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--color-im-faint)' }}>
                    No open alerts.
                  </p>
                ) : (
                  metrics.exceptions.map(ex => (
                    <div
                      key={ex.exceptionType || ex.kind}
                      className="im-exception-row is-warning"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 500,
                            color: 'var(--color-im-text)',
                          }}
                        >
                          {ex.message}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-im-faint)',
                          }}
                        >
                          {ex.severity} · {ex.count} shipment(s)
                          {ex.exceptionType ? ` · ${ex.exceptionType}` : ''}
                        </div>
                      </div>
                      <Link
                        to={getExceptionNavigationTarget(ex)}
                        className="im-btn im-btn--sm"
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
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">
                  // Document compliance
                </span>
              </div>
              <div
                className="im-section__body"
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}>
                  Missing ETA:{' '}
                  <span
                    style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                  >
                    {metrics.documentCompliance.shipmentsMissingEta}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}>
                  Missing ETD:{' '}
                  <span
                    style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                  >
                    {metrics.documentCompliance.shipmentsMissingEtd}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}>
                  No BOE row:{' '}
                  <span
                    style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                  >
                    {metrics.documentCompliance.shipmentsWithoutBoeRow}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}>
                  No expenses:{' '}
                  <span
                    style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                  >
                    {metrics.documentCompliance.shipmentsWithoutExpense}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {metrics && (
          <div className="grid gap-4">
            <WorkflowHealthPanel refreshKey={metrics.snapshotAt} />
            <ExceptionOperationsPanel
              workflow={metrics.erp?.exceptionWorkflow}
              entityExceptions={metrics.erp?.entityExceptions ?? []}
              userId={user?.id || 'anonymous'}
              onRefresh={() => void dashboardQuery.refetch()}
            />
          </div>
        )}

        {canViewAdminPanels && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <WorkflowObservabilityAdminCard refreshKey={metrics?.snapshotAt} />
            <WorkflowAlertSignalsPanel
              callerRole={user?.role ?? 'Admin'}
              refreshKey={metrics?.snapshotAt}
            />
            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">// Operations center</span>
              </div>
              <div className="im-section__body" style={{ fontSize: 12.5 }}>
                <p style={{ color: 'var(--color-im-muted)', marginBottom: 8 }}>
                  Incident lifecycle, recovery correlation, and audit export
                  live in the dedicated operations view.
                </p>
                <Link
                  to="/admin/operations-center"
                  className="im-btn im-btn--sm"
                >
                  Open operations center
                </Link>
              </div>
            </div>
            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">// Workflow inbox</span>
              </div>
              <div className="im-section__body" style={{ fontSize: 12.5 }}>
                <p style={{ color: 'var(--color-im-muted)', marginBottom: 8 }}>
                  As an admin, review consolidated duty / landed cost in
                  reports.
                </p>
                <Link to="/report" className="im-btn im-btn--sm">
                  Open consolidated report
                </Link>
              </div>
            </div>
          </div>
        )}

        {overdueCount > 0 && (
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Delay risk</span>
            </div>
            <div className="im-section__body">
              <div className="im-exception-row is-warning">
                {overdueCount} shipment(s) have ETA in the past and are not
                marked delivered. Review ETAs and statuses on the shipment
                board.
              </div>
            </div>
          </div>
        )}

        <div className="im-kpi-grid">
          {showShipment && (
            <KpiTile
              label="TOTAL SHIPMENTS"
              value={metrics.totalShipments}
              sub={kpiDesc('total_shipments')}
              link="/shipment"
            />
          )}
          {showItems && (
            <KpiTile
              label="TOTAL ITEMS"
              value={metrics.totalItems}
              sub={kpiDesc('total_items')}
              link="/invoice"
            />
          )}
          {(moduleFilter === 'all' || moduleFilter === 'shipment-invoice') && (
            <KpiTile
              label="SUPPLIERS"
              value={metrics.totalSuppliers}
              sub={kpiDesc('total_suppliers')}
              link="/supplier"
            />
          )}
          {showShipment && (
            <KpiTile
              label="RECONCILED BOEs"
              value={metrics.reconciledBoes}
              sub={kpiDesc('reconciled_boes')}
              variant="good"
              link="/boe"
            />
          )}
          {showShipment && (
            <KpiTile
              label="TOTAL INVOICE VALUE"
              value={`${sym}${metrics.totalInvoiceValue.toLocaleString()}`}
              sub={kpiDesc('total_invoice_value')}
            />
          )}
          {showShipment && (
            <KpiTile
              label="PENDING SHIPMENTS"
              value={metrics.pendingShipments}
              sub={kpiDesc('pending_shipments')}
              variant="warning"
              link="/shipment?status=docu-received"
            />
          )}
          {showShipment && (
            <KpiTile
              label="DELIVERED"
              value={metrics.deliveredShipments}
              sub={kpiDesc('delivered_shipments')}
              variant="good"
              link="/shipment?status=delivered"
            />
          )}
          {showShipment && (
            <KpiTile
              label="AVG TRANSIT DAYS"
              value={
                metrics.avgTransitDays === null
                  ? '—'
                  : metrics.avgTransitDays.toFixed(1)
              }
              sub={kpiDesc('avg_transit_days')}
            />
          )}
          {showShipment && (
            <KpiTile
              label="DUTY SAVINGS (EST.)"
              value={`${sym}${Math.round(metrics.totalDutySavingsEstimate).toLocaleString()}`}
              sub={kpiDesc('total_duty_savings_estimate')}
              variant="good"
            />
          )}
          {showShipment && (
            <KpiTile
              label="DUTY (REPORT SCOPE)"
              value={`${sym}${Math.round(metrics.dutyTotal).toLocaleString()}`}
              sub={kpiDesc('duty_total')}
            />
          )}
          {showExpenses && (
            <KpiTile
              label="EXPENSE TOTAL"
              value={`${sym}${Math.round(metrics.expenseTotal).toLocaleString()}`}
              sub={kpiDesc('expense_total')}
              link="/expenses"
            />
          )}
          {showShipment && (
            <KpiTile
              label="LANDED COST (NAIVE)"
              value={`${sym}${Math.round(metrics.landedCostTotal).toLocaleString()}`}
              sub={kpiDesc('landed_cost_total')}
            />
          )}
        </div>

        {showShipment && (
          <div className="im-chart-card">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <div className="im-chart-card__title">KPI TRENDS</div>
                <p
                  style={{
                    fontSize: 11.5,
                    color: 'var(--color-im-faint)',
                    marginTop: 2,
                  }}
                >
                  Daily snapshot history — executive view of shipments, duty,
                  and expenses.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--color-im-faint)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Range
                </span>
                <div className="im-select-wrap" style={{ width: 160 }}>
                  <select
                    className="im-select"
                    value={historyTimeRange}
                    onChange={e =>
                      setHistoryTimeRange(e.target.value as KpiHistoryTimeRange)
                    }
                  >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="12m">Last 12 months</option>
                    <option value="all">All</option>
                  </select>
                </div>
              </div>
            </div>
            {kpiHistory.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-im-faint)' }}>
                No historical KPI data available yet. Snapshots will appear
                automatically over time.
              </p>
            ) : trendLinePoints.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-im-faint)' }}>
                No snapshot rows in this time range. Try "All" or a wider
                window.
              </p>
            ) : (
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
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-im-muted)',
                      fontFamily: 'Consolas, monospace',
                      textTransform: 'uppercase',
                    }}
                  >
                    Total shipments trend
                  </div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                    >
                      <LineChart data={trendLinePoints}>
                        <XAxis
                          dataKey="dateLabel"
                          tick={IM_CHART.axis.tick}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={IM_CHART.axis.tick} width={40} />
                        <Tooltip
                          content={props => (
                            <KpiHistoryChartTooltip {...props} sym={sym} />
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="shipments"
                          name="Shipments"
                          stroke={IM_CHART.colors.primary}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-im-muted)',
                      fontFamily: 'Consolas, monospace',
                      textTransform: 'uppercase',
                    }}
                  >
                    Duty trend
                  </div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                    >
                      <LineChart data={trendLinePoints}>
                        <XAxis
                          dataKey="dateLabel"
                          tick={IM_CHART.axis.tick}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={IM_CHART.axis.tick} width={44} />
                        <Tooltip
                          content={props => (
                            <KpiHistoryChartTooltip {...props} sym={sym} />
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="duty"
                          name="Duty"
                          stroke={IM_CHART.colors.secondary}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-im-muted)',
                      fontFamily: 'Consolas, monospace',
                      textTransform: 'uppercase',
                    }}
                  >
                    Expense trend
                  </div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                    >
                      <LineChart data={trendLinePoints}>
                        <XAxis
                          dataKey="dateLabel"
                          tick={IM_CHART.axis.tick}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={IM_CHART.axis.tick} width={44} />
                        <Tooltip
                          content={props => (
                            <KpiHistoryChartTooltip {...props} sym={sym} />
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="expenses"
                          name="Expenses"
                          stroke={IM_CHART.colors.tertiary}
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
          </div>
        )}

        {showShipment && (
          <div
            style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}
          >
            <div className="im-chart-card">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div className="im-chart-card__title">SHIPMENT ANALYTICS</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div className="im-select-wrap" style={{ width: 120 }}>
                    <select
                      className="im-select"
                      value={chartCurrency || 'ALL'}
                      onChange={e =>
                        setChartCurrency(
                          e.target.value === 'ALL' ? '' : e.target.value
                        )
                      }
                    >
                      <option value="ALL">All</option>
                      {['INR', 'USD', 'EUR', 'GBP'].map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="im-filter-group">
                    {(
                      [
                        'weekly',
                        'monthly',
                        '3-month',
                        '6-month',
                        'yearly',
                      ] as const
                    ).map(tf => (
                      <button
                        key={tf}
                        className={`im-filter-btn${timeframe === tf ? 'is-active' : ''}`}
                        onClick={() => setTimeframe(tf)}
                      >
                        {tf === '3-month'
                          ? '3M'
                          : tf === '6-month'
                            ? '6M'
                            : tf === 'yearly'
                              ? '1Y'
                              : tf.charAt(0).toUpperCase() + tf.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={chartData}>
                    <XAxis
                      dataKey="name"
                      stroke="#1F1E1A"
                      tick={IM_CHART.axis.tick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#1F1E1A"
                      tick={IM_CHART.axis.tick}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v >= 100000 ? sym : ''}${v}`}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="shipments"
                      fill={IM_CHART.colors.barShipments}
                      name="# Shipments"
                    />
                    <Bar
                      dataKey="value"
                      fill={IM_CHART.colors.barValue}
                      name={`Total value (${chartCurrency})`}
                    />
                    <Bar
                      dataKey="dutySavings"
                      fill={IM_CHART.colors.barDutySavings}
                      name="Duty savings (est.)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="im-chart-card">
                <div
                  className="im-chart-card__title"
                  style={{ marginBottom: 8 }}
                >
                  SHIPMENT STATUS
                </div>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                              IM_CHART.colors.pie[
                                idx % IM_CHART.colors.pie.length
                              ]!
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="im-chart-card">
                <div
                  className="im-chart-card__title"
                  style={{ marginBottom: 8 }}
                >
                  INVOICE TREND
                </div>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={invoiceTrend}>
                      <XAxis dataKey="date" hide />
                      <YAxis tick={IM_CHART.axis.tick} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={IM_CHART.colors.primary}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
        >
          {showShipment && (
            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">// Upcoming shipments</span>
              </div>
              <div className="im-section__body" style={{ padding: 0 }}>
                <div className="im-table-scroll">
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">Invoice #</th>
                        <th className="im-th">ETA</th>
                        <th className="im-th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingShipments.length > 0 ? (
                        upcomingShipments.map((s, i) => (
                          <tr
                            key={s.id}
                            className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                          >
                            <td className="im-td">
                              <Link
                                to={`/shipment/${encodeURIComponent(s.id)}/view`}
                                style={{
                                  color: 'var(--color-im-accent)',
                                  textDecoration: 'none',
                                }}
                              >
                                {s.invoiceNumber}
                              </Link>
                            </td>
                            <td className="im-td">
                              {s.eta ? formatDateForDisplay(s.eta) : 'N/A'}
                            </td>
                            <td className="im-td">
                              <span
                                className={`im-status-pill${s.status === 'delivered' ? 'is-active' : 'is-neutral'}`}
                              >
                                {s.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={3}
                            className="im-td"
                            style={{
                              textAlign: 'center',
                              color: 'var(--color-im-faint)',
                              fontSize: 12,
                            }}
                          >
                            No upcoming shipments.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {showItems && (
            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">// Recent items</span>
              </div>
              <div className="im-section__body" style={{ padding: 0 }}>
                <div className="im-table-scroll">
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">Part Number</th>
                        <th className="im-th">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentItems.length > 0 ? (
                        recentItems.map((item, i) => (
                          <tr
                            key={item.id}
                            className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                          >
                            <td
                              className="im-td"
                              style={{
                                fontFamily: 'Consolas, monospace',
                                fontWeight: 600,
                              }}
                            >
                              {item.partNumber}
                            </td>
                            <td
                              className="im-td"
                              style={{
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.itemDescription}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={2}
                            className="im-td"
                            style={{
                              textAlign: 'center',
                              color: 'var(--color-im-faint)',
                              fontSize: 12,
                            }}
                          >
                            No items found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {showExpenses && (
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Expenses overview</span>
            </div>
            <div
              className="im-section__body"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--color-im-text)',
                  fontFamily: 'Consolas, monospace',
                }}
              >
                Total: {sym}
                {Math.round(metrics.expenseTotal).toLocaleString()}
              </div>
              <span className="im-status-pill is-neutral">
                SQL scope: filtered shipments
              </span>
              <Link to="/expenses" className="im-btn im-btn--sm">
                Open expenses
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
