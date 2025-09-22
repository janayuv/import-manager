// src/pages/dashboard.tsx
import { invoke } from '@tauri-apps/api/core';
import { format, parse, startOfMonth, startOfWeek, subDays } from 'date-fns';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  DollarSign,
  Factory,
  Package,
  Ship,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Cell, Line, LineChart, Pie, PieChart } from 'recharts';

import { useEffect, useMemo, useState } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import type { SavedBoe } from '@/types/boe-entry';
import type { Expense } from '@/types/expense';
import type { Item } from '@/types/item';
import type { Shipment as ShipmentTs } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

// --- Helper UI ---
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

// --- Types ---
type Timeframe = 'weekly' | 'monthly' | '3-month' | '6-month' | 'yearly';
type ModuleFilter = 'all' | 'shipment-invoice' | 'items' | 'expenses';

type ChartData = {
  name: string;
  shipments: number;
  value: number;
  dutySavings: number;
};

// --- Aggregation ---
const aggregateData = (
  shipments: ShipmentTs[],
  boes: SavedBoe[],
  timeframe: Timeframe
): ChartData[] => {
  const now = new Date();
  let startDate: Date;
  switch (timeframe) {
    case 'weekly':
      startDate = startOfWeek(now);
      break;
    case 'monthly':
      startDate = startOfMonth(now);
      break;
    case '3-month':
      startDate = subDays(now, 90);
      break;
    case '6-month':
      startDate = subDays(now, 180);
      break;
    case 'yearly':
      startDate = subDays(now, 365);
      break;
  }

  const bucket: Record<string, ChartData> = {};
  const fmt = (d: Date) =>
    timeframe === 'yearly' ? format(d, 'MMM yyyy') : format(d, 'MMM dd');

  shipments.forEach(s => {
    const date = new Date(s.invoiceDate);
    if (isNaN(date.getTime()) || date < startDate) return;
    const key = fmt(date);

    if (!bucket[key]) {
      bucket[key] = { name: key, shipments: 0, value: 0, dutySavings: 0 };
    }

    bucket[key].shipments += 1;

    bucket[key].value += s.invoiceValue;
  });

  // Calculate real duty savings based on BOE data
  Object.values(bucket).forEach(d => {
    // Get shipments for this time period
    const periodShipments = shipments.filter(s => {
      const date = new Date(s.invoiceDate);
      if (isNaN(date.getTime())) return false;
      const key = fmt(date);
      return key === d.name;
    });

    // Calculate total duty savings from BOE reconciliations
    const totalSavings = periodShipments.reduce((sum, shipment) => {
      // Find BOE data for this shipment
      const boeData = boes.find(b => b.shipmentId === shipment.id);
      if (!boeData || boeData.status !== 'Reconciled') return sum;

      // For now, use a simplified calculation based on BOE results
      // In a full implementation, we would compare with potential duty rates
      const actualDuty = boeData.calculationResult.customsDutyTotal;
      const invoiceValue = shipment.invoiceValue;

      // Estimate potential duty as 20% of invoice value (typical duty rate)
      const estimatedPotentialDuty = invoiceValue * 0.2;
      const savings = Math.max(estimatedPotentialDuty - actualDuty, 0);

      return sum + savings;
    }, 0);

    d.dutySavings = Math.round(totalSavings);
  });

  return Object.values(bucket).sort(
    (a, b) => new Date(a.name).getTime() - new Date(b.name).getTime()
  );
};

// --- Main Component ---
const DashboardPage = () => {
  const { getTextClass, getSpacingClass, getGridColumns } =
    useResponsiveContext();
  const notifications = useUnifiedNotifications();
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('monthly');
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [layoutDirection, setLayoutDirection] = useState<
    'horizontal' | 'vertical'
  >('horizontal');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [shipments, setShipments] = useState<ShipmentTs[]>([]);
  const [boes, setBoes] = useState<SavedBoe[]>([]);

  // Derived
  const stats = useMemo(
    () => ({
      suppliers: suppliers.length,
      items: items.length,
      shipments: shipments.length,
      reconciledBoes: boes.filter(b => b.status === 'Reconciled').length,
      totalValue: shipments.reduce((sum, s) => sum + s.invoiceValue, 0),
      pendingShipments: shipments.filter(s => s.status === 'docu-received')
        .length,
      deliveredShipments: shipments.filter(s => s.status === 'delivered')
        .length,
    }),
    [suppliers, items, shipments, boes]
  );

  const recentItems = useMemo(() => {
    return [...items].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 5);
  }, [items]);

  const upcomingShipments = useMemo(() => {
    const now = new Date();

    const parseDate = (value?: string) => {
      if (!value) return null;
      // Try common formats we use across the app
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
      return isNaN(d.getTime()) ? null : d;
    };

    return [...shipments]
      .map(s => ({ ...s, _etaDate: parseDate(s.eta) }))
      .filter(s => s._etaDate && s._etaDate > now)
      .sort((a, b) => a._etaDate!.getTime() - b._etaDate!.getTime())
      .slice(0, 5)
      .map(s => {
        // strip helper field without unused var binding
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _etaDate: _ignore, ...rest } = s;
        return rest;
      });
  }, [shipments]);

  const chartData = useMemo(() => {
    const filtered = shipments.filter(
      s => (s.invoiceCurrency || 'INR') === currency
    );
    return aggregateData(filtered, boes, timeframe);
  }, [shipments, boes, timeframe, currency]);

  // Extra charts data
  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>();
    shipments.forEach(s => {
      const status = s.status || 'Unknown';
      map.set(status, (map.get(status) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [shipments]);

  const invoiceTrend = useMemo(() => {
    return [...shipments]
      .sort(
        (a, b) =>
          new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
      )
      .map(s => ({ date: s.invoiceDate, value: s.invoiceValue }));
  }, [shipments]);

  // Expenses overview (quick aggregation)
  const [expenseSummary, setExpenseSummary] = useState<{
    total: number;
    count: number;
  } | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [sup, it, boe, shp] = await Promise.all([
          invoke<Supplier[]>('get_suppliers'),
          invoke<Item[]>('get_items'),
          invoke<SavedBoe[]>('get_boe_calculations'),
          invoke<ShipmentTs[]>('get_shipments'),
        ]);
        setSuppliers(sup);
        setItems(it);
        setBoes(boe);
        setShipments(shp);

        // Compute quick expense summary (sum totals for latest 10 shipments)
        const latest = shp.slice(0, 10);
        const expArrays = await Promise.all(
          latest.map(s =>
            invoke<Expense[]>('get_expenses_for_shipment', { shipmentId: s.id })
          )
        );
        const all = expArrays.flat();
        const total = all.reduce(
          (sum, e) =>
            sum +
            (Number(e.totalAmount) ||
              Number(e.amount) +
                Number(e.cgstAmount || 0) +
                Number(e.sgstAmount || 0) +
                Number(e.igstAmount || 0)),
          0
        );
        setExpenseSummary({ total, count: all.length });
      } catch (e) {
        console.error('Failed to load dashboard data', e);
        notifications.system.error('load dashboard data', String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [notifications.system]);

  const handleRefresh = async () => {
    notifications.loading('Refreshing dashboard data...');
    try {
      setLoading(true);
      const [sup, it, boe, shp] = await Promise.all([
        invoke<Supplier[]>('get_suppliers'),
        invoke<Item[]>('get_items'),
        invoke<SavedBoe[]>('get_boe_calculations'),
        invoke<ShipmentTs[]>('get_shipments'),
      ]);
      setSuppliers(sup);
      setItems(it);
      setBoes(boe);
      setShipments(shp);

      // Compute quick expense summary (sum totals for latest 10 shipments)
      const latest = shp.slice(0, 10);
      const expArrays = await Promise.all(
        latest.map(s =>
          invoke<Expense[]>('get_expenses_for_shipment', { shipmentId: s.id })
        )
      );
      const all = expArrays.flat();
      const total = all.reduce(
        (sum, e) =>
          sum +
          (Number(e.totalAmount) ||
            Number(e.amount) +
              Number(e.cgstAmount || 0) +
              Number(e.sgstAmount || 0) +
              Number(e.igstAmount || 0)),
        0
      );
      setExpenseSummary({ total, count: all.length });
      notifications.success(
        'Refresh Complete',
        'Dashboard data refreshed successfully'
      );
    } catch (e) {
      console.error('Failed to refresh dashboard data', e);
      notifications.system.error('refresh dashboard data', String(e));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className={`container mx-auto space-y-6 p-6 ${getSpacingClass()}`}>
      {/* Header */}
      <div
        className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${getSpacingClass()}`}
      >
        <div>
          <h1 className="text-xl font-semibold text-blue-600">Dashboard</h1>
          <p className={`${getTextClass()} text-muted-foreground`}>
            Operational overview across modules
          </p>
        </div>
        <div className={`flex items-center ${getSpacingClass()}`}>
          <Button
            variant="default"
            size="sm"
            onClick={handleRefresh}
            className="mr-2"
            useAccentColor
          >
            <TrendingUp className="mr-2 h-4 w-4" />
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

      {/* KPI Cards */}
      <div className={`grid gap-4 ${getGridColumns()}`}>
        {(moduleFilter === 'all' || moduleFilter === 'shipment-invoice') && (
          <KPICard
            title="Total Shipments"
            value={stats.shipments}
            icon={Ship}
            trend={{ value: 12, isPositive: true, period: 'last month' }}
            variant="default"
          />
        )}
        {(moduleFilter === 'all' || moduleFilter === 'items') && (
          <KPICard
            title="Total Items"
            value={stats.items}
            icon={Package}
            trend={{ value: 8, isPositive: true, period: 'last month' }}
            variant="default"
          />
        )}
        <KPICard
          title="Suppliers"
          value={stats.suppliers}
          icon={Factory}
          trend={{ value: 5, isPositive: true, period: 'last month' }}
          variant="default"
        />
        <KPICard
          title="Reconciled BOEs"
          value={stats.reconciledBoes}
          icon={TrendingUp}
          trend={{ value: 15, isPositive: true, period: 'last month' }}
          variant="success"
        />
        <KPICard
          title="Total Value"
          value={`₹${stats.totalValue.toLocaleString()}`}
          icon={DollarSign}
          trend={{ value: 22, isPositive: true, period: 'last month' }}
          variant="default"
        />
        <KPICard
          title="Pending Shipments"
          value={stats.pendingShipments}
          icon={AlertTriangle}
          trend={{ value: -3, isPositive: false, period: 'last month' }}
          variant="warning"
        />
        <KPICard
          title="Delivered"
          value={stats.deliveredShipments}
          icon={CheckCircle}
          trend={{ value: 18, isPositive: true, period: 'last month' }}
          variant="success"
        />
        <KPICard
          title="Avg Transit Days"
          value="12"
          icon={Calendar}
          trend={{ value: -2, isPositive: true, period: 'last month' }}
          variant="default"
        />
        <KPICard
          title="Total Duty Savings"
          value={`₹${chartData.reduce((sum, d) => sum + d.dutySavings, 0).toLocaleString()}`}
          icon={TrendingUp}
          trend={{ value: 25, isPositive: true, period: 'last month' }}
          variant="success"
        />
      </div>

      {/* Analytics with Resizable Layout */}
      <ResizableLayout
        storageKey="dashboard-analytics-layout"
        defaultSizes={[60, 40]}
        minSizes={[30, 20]}
        maxSizes={[80, 70]}
        direction={layoutDirection}
      >
        {/* Main Analytics Chart */}
        <Card>
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
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
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
          <CardContent className="h-[360px]">
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
                  tickFormatter={v => `${v >= 100000 ? '₹' : ''}${v}`}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="shipments" fill="#8884d8" name="# Shipments" />
                <Bar
                  dataKey="value"
                  fill="#82ca9d"
                  name={`Total Value (${currency})`}
                />
                <Bar dataKey="dutySavings" fill="#ffc658" name="Duty Savings" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Side Charts */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Shipment Status</CardTitle>
            </CardHeader>
            <CardContent className="h-[160px]">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-[160px]">
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
            </CardContent>
          </Card>
        </div>
      </ResizableLayout>

      {/* Tables Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {(moduleFilter === 'all' || moduleFilter === 'shipment-invoice') && (
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
                          {s.invoiceNumber}
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

        {(moduleFilter === 'all' || moduleFilter === 'items') && (
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

      {/* Expenses Overview */}
      {(moduleFilter === 'all' || moduleFilter === 'expenses') && (
        <Card>
          <CardHeader>
            <CardTitle>Expenses Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseSummary ? (
              <div className="flex items-center gap-6">
                <div className="text-2xl font-semibold">
                  Total: ₹{expenseSummary.total.toLocaleString()}
                </div>
                <Badge variant="secondary">
                  Entries: {expenseSummary.count}
                </Badge>
                <div className="text-muted-foreground text-sm">
                  (Aggregated from latest shipments)
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">No expenses found.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;
