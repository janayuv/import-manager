import { invoke } from '@tauri-apps/api/core';
import {
  BarChart3,
  CircleAlert,
  Loader2,
  Sparkles,
  Target,
} from 'lucide-react';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AiExtractionSummary,
  ProviderUsageRow,
} from '@/types/ai-analytics';
import { formatAvgConfidencePercent } from '@/lib/ai-analytics-format';
import { cn } from '@/lib/utils';

const STATUS_CHART_COLORS = ['#10b981', '#f43f5e', '#f59e0b'] as const;

const CHART_H = 300;
const R_CONTAINER_STYLE: React.CSSProperties = {
  width: '100%',
  height: CHART_H,
};

export default function AIAnalyticsDashboard() {
  const [mounted, setMounted] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<AiExtractionSummary | null>(
    null
  );
  const [providers, setProviders] = React.useState<ProviderUsageRow[] | null>(
    null
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const statusChartData = React.useMemo(
    () =>
      summary
        ? [
            { name: 'Success', value: summary.successCount },
            { name: 'Failed', value: summary.failureCount },
            { name: 'OCR fallback', value: summary.ocrCount },
          ]
        : [],
    [summary]
  );

  const providerChartData = React.useMemo(
    () =>
      (providers ?? []).map(p => ({ name: p.providerUsed, value: p.count })),
    [providers]
  );

  const hasStatusChartData = (summary?.total ?? 0) > 0;
  const hasProviderChartData = providerChartData.length > 0;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, p] = await Promise.all([
          invoke<AiExtractionSummary>('get_ai_extraction_summary'),
          invoke<ProviderUsageRow[]>('get_provider_usage_summary'),
        ]);
        if (!cancelled) {
          setSummary(s);
          setProviders(p);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            typeof e === 'string'
              ? e
              : e && typeof e === 'object' && 'message' in e
                ? String((e as { message?: string }).message)
                : 'Failed to load analytics.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container mx-auto max-w-5xl space-y-8 py-10">
      <div>
        <h1 className="text-xl font-semibold text-blue-600">AI Analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Extraction activity from <code>ai_extraction_log</code> (V0.2.3).
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Could not load metrics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading analytics data…
        </div>
      )}

      {!loading && summary && !error && summary.total === 0 && (
        <Alert className="border-dashed">
          <AlertTitle>No extraction data yet</AlertTitle>
          <AlertDescription>
            Run AI invoice extraction to populate metrics. Counts below are
            zero.
          </AlertDescription>
        </Alert>
      )}

      {!loading && summary && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard
              title="Total extractions"
              value={String(summary.total)}
              icon={BarChart3}
              className="border-slate-200/80"
            />
            <SummaryCard
              title="Successful"
              value={String(summary.successCount)}
              sub="status = success"
              icon={Target}
              className="border-emerald-200/80"
            />
            <SummaryCard
              title="Failed"
              value={String(summary.failureCount)}
              sub="status = failed"
              icon={CircleAlert}
              className="border-rose-200/80"
            />
            <SummaryCard
              title="OCR used"
              value={String(summary.ocrCount)}
              sub="ocr-fallback"
              icon={Sparkles}
              className="border-amber-200/80"
            />
            <SummaryCard
              title="Average confidence"
              value={formatAvgConfidencePercent(summary.avgConfidence)}
              sub="non-null confidence_score"
              icon={BarChart3}
              className="border-blue-200/80"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Extraction outcomes</CardTitle>
                <CardDescription>
                  Counts by outcome (success, failed, OCR-fallback)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="min-h-[300px] w-full"
                  data-testid="outcomes-chart-region"
                >
                  {!hasStatusChartData ? (
                    <p className="text-muted-foreground flex min-h-[300px] items-center justify-center text-center text-sm">
                      Chart data unavailable
                    </p>
                  ) : !mounted ? (
                    <div className="min-h-[300px] w-full" aria-hidden />
                  ) : (
                    <div
                      className="min-h-[300px] w-full"
                      style={{ minHeight: CHART_H }}
                    >
                      <ResponsiveContainer
                        width="100%"
                        height={CHART_H}
                        style={R_CONTAINER_STYLE}
                      >
                        <BarChart
                          data={statusChartData}
                          margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            strokeOpacity={0.35}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12 }}
                            interval={0}
                          />
                          <YAxis
                            allowDecimals={false}
                            width={40}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 12 }}
                            formatter={v => [v, 'Count']}
                            labelFormatter={label => String(label)}
                          />
                          <Bar
                            name="Count"
                            dataKey="value"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={56}
                          >
                            {statusChartData.map((entry, i) => (
                              <Cell
                                key={entry.name}
                                fill={
                                  STATUS_CHART_COLORS[
                                    i % STATUS_CHART_COLORS.length
                                  ]
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By provider</CardTitle>
                <CardDescription>
                  Volume from <code>provider_used</code> (bar chart)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="min-h-[300px] w-full"
                  data-testid="provider-chart-region"
                >
                  {!hasProviderChartData ? (
                    <p className="text-muted-foreground flex min-h-[300px] items-center justify-center text-center text-sm">
                      Chart data unavailable
                    </p>
                  ) : !mounted ? (
                    <div className="min-h-[300px] w-full" aria-hidden />
                  ) : (
                    <div
                      className="min-h-[300px] w-full"
                      style={{ minHeight: CHART_H }}
                    >
                      <ResponsiveContainer
                        width="100%"
                        height={CHART_H}
                        style={R_CONTAINER_STYLE}
                      >
                        <BarChart
                          data={providerChartData}
                          layout="vertical"
                          margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            strokeOpacity={0.35}
                          />
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={120}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 12 }}
                            formatter={v => [v, 'Count']}
                            labelFormatter={l => `Provider: ${l}`}
                          />
                          <Bar
                            name="Count"
                            dataKey="value"
                            fill="hsl(221.2 83.2% 53.3%)"
                            radius={[0, 4, 4, 0]}
                            maxBarSize={36}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Provider usage</CardTitle>
              <CardDescription>
                Row counts by <code>provider_used</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providers && providers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="w-32 text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.map(row => (
                      <TableRow key={row.providerUsed}>
                        <TableCell className="font-medium">
                          {row.providerUsed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.count}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No provider breakdown (empty or single pass).
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  icon: Icon,
  className,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Card className={cn(className, 'shadow-sm')}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>
        {sub && (
          <p className="text-muted-foreground mt-1 text-xs leading-snug">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
