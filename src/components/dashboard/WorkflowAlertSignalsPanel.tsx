import { useCallback, useEffect, useState } from 'react';
import { Bell, Download, FlaskConical } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  exportMetricsSnapshotCsv,
  getSystemHealth,
  getSystemMetrics,
  getWorkflowAlertSignalDashboard,
  simulateAlertEvent,
  type AlertSignalDashboard,
  type SystemHealthExport,
  type SystemMetricsExport,
} from '@/lib/production-observability';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

type Props = {
  callerRole: string;
  refreshKey?: string;
};

function severityBadge(sev: string) {
  const u = sev.toUpperCase();
  const cls =
    u === 'FATAL' || u === 'CRITICAL'
      ? 'border-destructive/60 bg-destructive/10 text-destructive'
      : u === 'WARNING'
        ? 'border-amber-600/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
        : 'border-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cls}`}>
      {sev}
    </Badge>
  );
}

export function WorkflowAlertSignalsPanel({ callerRole, refreshKey }: Props) {
  const [dash, setDash] = useState<AlertSignalDashboard | null>(null);
  const [metrics, setMetrics] = useState<SystemMetricsExport | null>(null);
  const [health, setHealth] = useState<SystemHealthExport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, m, h] = await Promise.all([
        getWorkflowAlertSignalDashboard(callerRole),
        getSystemMetrics(callerRole),
        getSystemHealth(callerRole),
      ]);
      setDash(d);
      setMetrics(m);
      setHealth(h);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [callerRole]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onExportCsv = async () => {
    try {
      const csv = await exportMetricsSnapshotCsv(callerRole);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import-manager-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Metrics snapshot exported');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSim = async (
    scenario: 'JOB_FAILURE' | 'DEPLOYMENT_BLOCK' | 'RECOVERY_FAILURE'
  ) => {
    try {
      await simulateAlertEvent(scenario, callerRole);
      toast.success(`Simulated: ${scenario}`);
      void load();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Bell className="text-muted-foreground h-5 w-5" />
          <CardTitle className="text-base">
            Alert signals &amp; observability
          </CardTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onExportCsv()}
            disabled={loading}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Export metrics CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {loading && !dash ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {health && (
              <div className="bg-muted/40 flex flex-wrap gap-3 rounded-lg border p-3">
                <div>
                  <span className="text-muted-foreground">System status</span>
                  <div className="font-semibold">{health.status}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Failed jobs (24h)
                  </span>
                  <div className="font-semibold">{health.failed_jobs}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Pending recovery
                  </span>
                  <div className="font-semibold">{health.pending_recovery}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Deploy risk (7d avg)
                  </span>
                  <div className="font-semibold">{health.risk_level}</div>
                </div>
              </div>
            )}

            {metrics && (
              <div className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  Jobs executed (counter):{' '}
                  <span className="text-foreground font-medium">
                    {String(
                      (metrics.jobs as { executed?: number })?.executed ?? '—'
                    )}
                  </span>
                </div>
                <div>
                  Jobs failed (counter):{' '}
                  <span className="text-foreground font-medium">
                    {String(
                      (metrics.jobs as { failed?: number })?.failed ?? '—'
                    )}
                  </span>
                </div>
                <div>
                  Reliability score:{' '}
                  <span className="text-foreground font-medium">
                    {Number(metrics.system_health?.reliabilityScore).toFixed(3)}
                  </span>
                </div>
                <div>
                  Deploy blocked / ok:{' '}
                  <span className="text-foreground font-medium">
                    {(metrics.deployments as { blocked?: number })?.blocked ??
                      0}{' '}
                    /{' '}
                    {(metrics.deployments as { succeeded?: number })
                      ?.succeeded ?? 0}
                  </span>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 font-medium">
                  Severity distribution (14d)
                </h4>
                <div className="h-48 w-full min-w-0">
                  {dash && dash.severityDistribution14d.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dash.severityDistribution14d}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-muted"
                        />
                        <XAxis dataKey="severity" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground">
                      No alert signals in this window.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h4 className="mb-2 font-medium">Alert trends (14d)</h4>
                <div className="h-48 w-full min-w-0">
                  {dash && dash.alertTrends14d.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dash.alertTrends14d}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-muted"
                        />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground">No trend data yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-medium">Recent signals</h4>
              <div className="max-h-56 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="w-[140px]">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dash?.recentSignals ?? []).map(row => (
                      <TableRow key={row.id}>
                        <TableCell>{severityBadge(row.severity)}</TableCell>
                        <TableCell className="max-w-[140px] truncate font-mono text-xs">
                          {row.signalType}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate">
                          {row.message}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                          {row.createdAt}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-medium">Failure clusters (7d)</h4>
              <div className="max-h-40 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="w-[72px]">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dash?.failureClusters ?? []).map((c, i) => (
                      <TableRow key={`${c.jobId}-${i}`}>
                        <TableCell className="font-mono text-xs">
                          {c.jobId}
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate text-xs">
                          {c.errorMessage || '—'}
                        </TableCell>
                        <TableCell>{c.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
                <FlaskConical className="h-4 w-4" />
                Admin: simulate alert (tests routing to{' '}
                <code className="text-foreground">
                  workflow_alert_signal_log
                </code>
                )
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onSim('JOB_FAILURE')}
                >
                  Sim job failure
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onSim('DEPLOYMENT_BLOCK')}
                >
                  Sim deploy block
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onSim('RECOVERY_FAILURE')}
                >
                  Sim recovery failure
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
