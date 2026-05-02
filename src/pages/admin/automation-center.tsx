import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';

import { Bot, Gauge, HeartPulse, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatAppDateTime } from '@/lib/app-timezone';
import { getSystemHealthMetrics } from '@/lib/system-health';
import { useHasPermission } from '@/lib/user-context';

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${ms} ms`;
}

export default function AdminAutomationCenterPage() {
  const viewOk = useHasPermission('automation.view');

  const healthQ = useQuery({
    queryKey: ['admin-automation-center-health'] as const,
    queryFn: () => getSystemHealthMetrics(),
    enabled: viewOk,
    staleTime: 30_000,
  });

  if (!viewOk) {
    return <Navigate to="/" replace />;
  }

  const bg = healthQ.data?.backgroundTaskDurations;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Automation center
        </h1>
        <p className="text-muted-foreground text-sm">
          Background maintenance visibility, quick links to rule execution and
          the operations console. Scheduled job detail will extend this layout
          over time.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/automation-rules">
            <Bot className="mr-1 size-4" />
            Rule console
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/operations-center">
            <Gauge className="mr-1 size-4" />
            Operations center
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/system-health">
            <HeartPulse className="mr-1 size-4" />
            System health
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/system-tools">
            <Wrench className="mr-1 size-4" />
            System tools
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Background thread (last tick)
          </CardTitle>
          <CardDescription>
            Timings from the in-app maintenance loop (aligned with logs).
            Refreshes with the query.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {healthQ.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : healthQ.isError ? (
            <p className="text-destructive text-sm" role="alert">
              {healthQ.error instanceof Error
                ? healthQ.error.message
                : String(healthQ.error)}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Fast tick (total)</TableCell>
                  <TableCell className="text-right">
                    {formatMs(bg?.fastTickTotalMs ?? null)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Backup schedules</TableCell>
                  <TableCell className="text-right">
                    {formatMs(bg?.backupSchedulesMs ?? null)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Dashboard maintenance</TableCell>
                  <TableCell className="text-right">
                    {formatMs(bg?.dashboardMaintenanceMs ?? null)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Governance</TableCell>
                  <TableCell className="text-right">
                    {formatMs(bg?.governanceMs ?? null)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Heavy tick (total)</TableCell>
                  <TableCell className="text-right">
                    {formatMs(bg?.heavyTickTotalMs ?? null)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>BOE maintenance</TableCell>
                  <TableCell className="text-right">
                    {formatMs(bg?.boeMaintenanceMs ?? null)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Integrity check</TableCell>
                  <TableCell className="text-right">
                    {formatMs(bg?.integrityCheckMs ?? null)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Snapshot & cache snapshot</CardTitle>
          <CardDescription>
            Latest dashboard snapshot timestamps from system health (read-only).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Latest snapshot row: </span>
            {healthQ.data?.lastSnapshotTime ?? '—'}
          </p>
          <p>
            <span className="text-muted-foreground">Last manual rebuild: </span>
            {healthQ.data?.lastDashboardSnapshotRebuildAt
              ? formatAppDateTime(healthQ.data.lastDashboardSnapshotRebuildAt)
              : '—'}
          </p>
          <Badge variant="outline" className="font-normal">
            Native v{healthQ.data?.appVersion ?? '—'}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
