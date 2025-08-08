// src/pages/dashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { Supplier } from '@/types/supplier';
import type { Item } from '@/types/item';
import type { SavedBoe, Shipment } from '@/types/boe-entry';
import { subDays, startOfWeek, startOfMonth, format } from 'date-fns';

// --- Helper Functions ---
const StatCard = ({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

type ChartData = {
  name: string;
  shipments: number;
  value: number;
  dutySavings: number;
};

const aggregateData = (
  shipments: Shipment[], 
  boes: SavedBoe[], 
  timeframe: 'weekly' | 'monthly' | '3-month' | '6-month' | 'yearly'
): ChartData[] => {
  const now = new Date();
  let startDate: Date;

  switch (timeframe) {
    case 'weekly': startDate = startOfWeek(now); break;
    case 'monthly': startDate = startOfMonth(now); break;
    case '3-month': startDate = subDays(now, 90); break;
    case '6-month': startDate = subDays(now, 180); break;
    case 'yearly': startDate = subDays(now, 365); break;
  }

  const dataMap: { [key: string]: ChartData } = {};

  const getFormat = (date: Date) => {
    if (timeframe === 'weekly' || timeframe === 'monthly' || timeframe === '3-month') return format(date, 'MMM dd');
    return format(date, 'MMM yyyy');
  }

  shipments.forEach(s => {
    const date = new Date(s.invoice_date);
    if (date < startDate) return;
    const key = getFormat(date);
    if (!dataMap[key]) dataMap[key] = { name: key, shipments: 0, value: 0, dutySavings: 0 };
    dataMap[key].shipments += 1;
    dataMap[key].value += s.invoice_value;
  });
  
  // Note: Duty savings aggregation is a placeholder, as it requires more complex reconciliation logic per BOE
  // For now, we'll just add dummy data for demonstration
  Object.keys(dataMap).forEach(key => {
    dataMap[key].dutySavings = Math.random() * 1000;
  });

  return Object.values(dataMap).sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());
};


// --- Main Component ---
const DashboardPage = () => {
  const [stats, setStats] = useState({ suppliers: 0, items: 0, shipments: 0, reconciledBoes: 0 });
  const [recentItems, setRecentItems] = useState<Item[]>([]);
  const [upcomingShipments, setUpcomingShipments] = useState<Shipment[]>([]);
  const [allShipments, setAllShipments] = useState<Shipment[]>([]);
  const [allBoes, setAllBoes] = useState<SavedBoe[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly' | '3-month' | '6-month' | 'yearly'>('monthly');
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [suppliers, items, boes, shipments] = await Promise.all([
          invoke<Supplier[]>('get_suppliers'),
          invoke<Item[]>('get_items'),
          invoke<SavedBoe[]>('get_boe_calculations'),
          invoke<Shipment[]>('get_shipments'),
        ]);

        setStats({
          suppliers: suppliers.length,
          items: items.length,
          shipments: shipments.length,
          reconciledBoes: boes.filter(b => b.status === 'Reconciled').length,
        });

        const sortedItems = [...items].sort((a, b) => (a.id < b.id ? 1 : -1));
        setRecentItems(sortedItems.slice(0, 5));
        
        const now = new Date();
        const futureShipments = [...shipments]
            .filter(s => s.eta && new Date(s.eta) > now)
            .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime());
        setUpcomingShipments(futureShipments.slice(0, 5));

        setAllShipments(shipments);
        setAllBoes(boes);

      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const chartData = useMemo(() => {
    const filteredShipments = allShipments.filter(s => s.invoice_currency === currency);
    return aggregateData(filteredShipments, allBoes, timeframe);
  }, [allShipments, allBoes, timeframe, currency]);

  if (loading) {
    return <div className="p-4 text-center">Loading dashboard...</div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Suppliers" value={stats.suppliers} icon={<span>👥</span>} />
        <StatCard title="Total Items" value={stats.items} icon={<span>📦</span>} />
        <StatCard title="Total Shipments" value={stats.shipments} icon={<span>🚚</span>} />
        <StatCard title="Reconciled BOEs" value={stats.reconciledBoes} icon={<span>✅</span>} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>Analytics</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {['USD', 'EUR', 'GBP', 'INR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant={timeframe === 'weekly' ? 'default' : 'outline'} size="sm" onClick={() => setTimeframe('weekly')}>Weekly</Button>
              <Button variant={timeframe === 'monthly' ? 'default' : 'outline'} size="sm" onClick={() => setTimeframe('monthly')}>Monthly</Button>
              <Button variant={timeframe === '3-month' ? 'default' : 'outline'} size="sm" onClick={() => setTimeframe('3-month')}>3M</Button>
              <Button variant={timeframe === '6-month' ? 'default' : 'outline'} size="sm" onClick={() => setTimeframe('6-month')}>6M</Button>
              <Button variant={timeframe === 'yearly' ? 'default' : 'outline'} size="sm" onClick={() => setTimeframe('yearly')}>1Y</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
              <Tooltip />
              <Legend />
              <Bar dataKey="shipments" fill="#8884d8" name="No. of Shipments" />
              <Bar dataKey="value" fill="#82ca9d" name={`Total Value (${currency})`} />
              <Bar dataKey="dutySavings" fill="#ffc658" name="Duty Savings" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Upcoming Shipments</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>ETA</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {upcomingShipments.length > 0 ? upcomingShipments.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{s.invoice_number}</TableCell>
                    <TableCell>{s.eta ? format(new Date(s.eta), 'PP') : 'N/A'}</TableCell>
                    <TableCell><Badge>{s.status}</Badge></TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={3} className="text-center">No upcoming shipments.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Items</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Part Number</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
              <TableBody>
                {recentItems.length > 0 ? recentItems.map(item => (
                  <TableRow key={item.id}><TableCell>{item.part_number}</TableCell><TableCell>{item.item_description}</TableCell></TableRow>
                )) : <TableRow><TableCell colSpan={2} className="text-center">No items found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
