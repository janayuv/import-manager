// src/pages/dashboard.tsx
import { format, startOfMonth, startOfWeek, subDays } from 'date-fns'
import { Factory, Package, Ship, TrendingUp } from 'lucide-react'
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Cell, Line, LineChart, Pie, PieChart } from 'recharts'

import React, { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SavedBoe } from '@/types/boe-entry'
import type { Expense } from '@/types/expense'
import type { Item } from '@/types/item'
import type { Shipment as ShipmentTs } from '@/types/shipment'
import type { Supplier } from '@/types/supplier'
import { invoke } from '@tauri-apps/api/core'

// --- Helper UI ---
const StatCard = ({
  title,
  value,
  icon,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
)

// --- Types ---
type Timeframe = 'weekly' | 'monthly' | '3-month' | '6-month' | 'yearly'
type ModuleFilter = 'all' | 'shipment-invoice' | 'items' | 'expenses'

type ChartData = { name: string; shipments: number; value: number; dutySavings: number }

// --- Aggregation ---
const aggregateData = (shipments: ShipmentTs[], timeframe: Timeframe): ChartData[] => {
  const now = new Date()
  let startDate: Date
  switch (timeframe) {
    case 'weekly':
      startDate = startOfWeek(now)
      break
    case 'monthly':
      startDate = startOfMonth(now)
      break
    case '3-month':
      startDate = subDays(now, 90)
      break
    case '6-month':
      startDate = subDays(now, 180)
      break
    case 'yearly':
      startDate = subDays(now, 365)
      break
  }

  const bucket: Record<string, ChartData> = {}
  const fmt = (d: Date) => (timeframe === 'yearly' ? format(d, 'MMM yyyy') : format(d, 'MMM dd'))

  shipments.forEach((s) => {
    const date = new Date(s.invoiceDate)
    if (isNaN(date.getTime()) || date < startDate) return
    const key = fmt(date)
    if (!bucket[key]) bucket[key] = { name: key, shipments: 0, value: 0, dutySavings: 0 }
    bucket[key].shipments += 1
    bucket[key].value += s.invoiceValue
  })

  // Placeholder for duty savings demo
  Object.values(bucket).forEach((d) => {
    d.dutySavings = Math.round(Math.random() * 1000)
  })

  return Object.values(bucket).sort(
    (a, b) => new Date(a.name).getTime() - new Date(b.name).getTime()
  )
}

// --- Main Component ---
const DashboardPage = () => {
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all')
  const [timeframe, setTimeframe] = useState<Timeframe>('monthly')
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(true)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [shipments, setShipments] = useState<ShipmentTs[]>([])
  const [boes, setBoes] = useState<SavedBoe[]>([])

  // Derived
  const stats = useMemo(
    () => ({
      suppliers: suppliers.length,
      items: items.length,
      shipments: shipments.length,
      reconciledBoes: boes.filter((b) => b.status === 'Reconciled').length,
    }),
    [suppliers, items, shipments, boes]
  )

  const recentItems = useMemo(() => {
    return [...items].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 5)
  }, [items])

  const upcomingShipments = useMemo(() => {
    const now = new Date()
    return [...shipments]
      .filter((s) => s.eta && !isNaN(new Date(s.eta).getTime()) && new Date(s.eta) > now)
      .sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime())
      .slice(0, 5)
  }, [shipments])

  const chartData = useMemo(() => {
    const filtered = shipments.filter((s) => (s.invoiceCurrency || 'INR') === currency)
    return aggregateData(filtered, timeframe)
  }, [shipments, timeframe, currency])

  // Extra charts data
  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>()
    shipments.forEach((s) => map.set(s.status, (map.get(s.status) || 0) + 1))
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [shipments])

  const invoiceTrend = useMemo(() => {
    return [...shipments]
      .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
      .map((s) => ({ date: s.invoiceDate, value: s.invoiceValue }))
  }, [shipments])

  const topSuppliers = useMemo(() => {
    const map = new Map<string, number>()
    shipments.forEach((s) => map.set(s.supplierId, (map.get(s.supplierId) || 0) + s.invoiceValue))
    return Array.from(map.entries())
      .map(([supplierId, total]) => ({ supplierId, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [shipments])

  // Expenses overview (quick aggregation)
  const [expenseSummary, setExpenseSummary] = useState<{ total: number; count: number } | null>(
    null
  )

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true)
        const [sup, it, boe, shp] = await Promise.all([
          invoke<Supplier[]>('get_suppliers'),
          invoke<Item[]>('get_items'),
          invoke<SavedBoe[]>('get_boe_calculations'),
          invoke<ShipmentTs[]>('get_shipments'),
        ])
        setSuppliers(sup)
        setItems(it)
        setBoes(boe)
        setShipments(shp)

        // Compute quick expense summary (sum totals for latest 10 shipments)
        const latest = shp.slice(0, 10)
        const expArrays = await Promise.all(
          latest.map((s) => invoke<Expense[]>('get_expenses_for_shipment', { shipmentId: s.id }))
        )
        const all = expArrays.flat()
        const total = all.reduce(
          (sum, e) =>
            sum +
            (Number(e.totalAmount) ||
              Number(e.amount) +
                Number(e.cgstAmount || 0) +
                Number(e.sgstAmount || 0) +
                Number(e.igstAmount || 0)),
          0
        )
        setExpenseSummary({ total, count: all.length })
      } catch (e) {
        console.error('Failed to load dashboard data', e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  if (loading) {
    return <div className="p-6 text-center">Loading dashboard...</div>
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Operational overview across modules</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={moduleFilter} onValueChange={(v: ModuleFilter) => setModuleFilter(v)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Include all modules</SelectItem>
              <SelectItem value="shipment-invoice">Shipment & Invoice</SelectItem>
              <SelectItem value="items">Items</SelectItem>
              <SelectItem value="expenses">Expenses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(moduleFilter === 'all' || moduleFilter === 'shipment-invoice') && (
          <StatCard
            title="Total Shipments"
            value={stats.shipments}
            icon={<Ship className="text-muted-foreground h-5 w-5" />}
          />
        )}
        {(moduleFilter === 'all' || moduleFilter === 'items') && (
          <StatCard
            title="Total Items"
            value={stats.items}
            icon={<Package className="text-muted-foreground h-5 w-5" />}
          />
        )}
        <StatCard
          title="Suppliers"
          value={stats.suppliers}
          icon={<Factory className="text-muted-foreground h-5 w-5" />}
        />
        <StatCard
          title="Reconciled BOEs"
          value={stats.reconciledBoes}
          icon={<TrendingUp className="text-muted-foreground h-5 w-5" />}
        />
      </div>

      {/* Analytics */}
      {(moduleFilter === 'all' || moduleFilter === 'shipment-invoice') && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle>Shipment Analytics</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {['INR', 'USD', 'EUR', 'GBP'].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant={timeframe === 'weekly' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeframe('weekly')}
                >
                  Weekly
                </Button>
                <Button
                  variant={timeframe === 'monthly' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeframe('monthly')}
                >
                  Monthly
                </Button>
                <Button
                  variant={timeframe === '3-month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeframe('3-month')}
                >
                  3M
                </Button>
                <Button
                  variant={timeframe === '6-month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeframe('6-month')}
                >
                  6M
                </Button>
                <Button
                  variant={timeframe === 'yearly' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeframe('yearly')}
                >
                  1Y
                </Button>
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
                  tickFormatter={(v) => `${v >= 100000 ? '₹' : ''}${v}`}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="shipments" fill="#8884d8" name="# Shipments" />
                <Bar dataKey="value" fill="#82ca9d" name={`Total Value (${currency})`} />
                <Bar dataKey="dutySavings" fill="#ffc658" name="Duty Savings" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
                    upcomingShipments.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.invoiceNumber}</TableCell>
                        <TableCell>{s.eta ? format(new Date(s.eta), 'PP') : 'N/A'}</TableCell>
                        <TableCell>
                          <Badge>{s.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center">
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
                    recentItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.partNumber}</TableCell>
                        <TableCell>{item.itemDescription}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center">
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

      {(moduleFilter === 'all' || moduleFilter === 'expenses') && (
        <Card>
          <CardHeader>
            <CardTitle>Expenses Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseSummary ? (
              <div className="flex items-center gap-6">
                <div className="text-2xl font-semibold">
                  Total: ₹{expenseSummary.total.toFixed(2)}
                </div>
                <Badge variant="secondary">Entries: {expenseSummary.count}</Badge>
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

      {/* Extra Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Shipment Status</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusDistribution} dataKey="value" nameKey="name" outerRadius={90}>
                  {statusDistribution.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={['#8884d8', '#82ca9d', '#ffc658', '#FF8042', '#00C49F'][idx % 5]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Invoice Value Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
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
        <Card>
          <CardHeader>
            <CardTitle>Top Suppliers by Value</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSuppliers}>
                <XAxis dataKey="supplierId" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
