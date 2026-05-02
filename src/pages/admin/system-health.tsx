import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatAppDateTime } from '@/lib/app-timezone';
import {
  getSystemHealthMetrics,
  type SystemHealthMetrics,
} from '@/lib/system-health';
import { useUser } from '@/lib/user-context';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KiB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MiB`;
  return `${(mb / 1024).toFixed(2)} GiB`;
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${ms} ms`;
}

function formatUnixMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  try {
    return formatAppDateTime(new Date(ms).toISOString());
  } catch {
    return String(ms);
  }
}

function schemaStateLabel(state: string): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'migration_pending':
      return 'Migration pending';
    case 'version_mismatch':
      return 'Version mismatch';
    case 'migration_failed':
      return 'Migration failed';
    default:
      return state;
  }
}

function schemaStateBadgeVariant(
  state: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'ok') return 'default';
  if (state === 'migration_pending') return 'secondary';
  return 'destructive';
}

export default function AdminSystemHealthPage() {
  const { user } = useUser();
  const isAdmin = user?.role?.toLowerCase().includes('admin') ?? false;

  const [data, setData] = useState<SystemHealthMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await getSystemHealthMetrics();
      setData(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const bg = data?.backgroundTaskDurations;
  const healthy = data?.healthSummary.overall === 'healthy';
  const sh = data?.schemaHealth;
  const schemaOk = sh?.state === 'ok';

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            System health
          </h1>
          <p className="text-muted-foreground text-sm">
            Database footprint, backup and snapshot recency, background task
            timings, and active exception workflows. Refreshes every 30 seconds
            and when you return to this tab.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={schemaOk ? 'outline' : 'destructive'}
            className="text-sm"
            data-testid="schema-health-badge"
          >
            Schema: {sh ? schemaStateLabel(sh.state) : '—'}
          </Badge>
          <Badge
            variant={healthy ? 'default' : 'destructive'}
            className="text-sm"
          >
            {healthy ? 'Healthy' : 'Warning'}
          </Badge>
        </div>
      </div>

      {sh && !schemaOk ? (
        <Card
          className="border-destructive/80 bg-destructive/5"
          data-testid="schema-health-alert"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive text-base">
              Database schema: {schemaStateLabel(sh.state)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Applied version: </span>
              {sh.appliedVersion}
              <span className="text-muted-foreground"> — expected: </span>
              {sh.expectedVersion}
              {sh.pendingMigrationRows > 0 ? (
                <>
                  <span className="text-muted-foreground">
                    {' '}
                    — pending rows:{' '}
                  </span>
                  {sh.pendingMigrationRows}
                </>
              ) : null}
            </p>
            {sh.integrityError ? (
              <p className="text-destructive break-words" role="alert">
                {sh.integrityError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : null}

      {data?.healthSummary.warnings.length ? (
        <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc text-sm">
              {data.healthSummary.warnings.map(w => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card data-testid="operational-visibility-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Release & operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">
                Application version:{' '}
              </span>
              <span
                className="font-mono"
                data-testid="system-health-app-version"
              >
                v{data?.appVersion ?? '—'}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">
                Last manual snapshot rebuild:{' '}
              </span>
              {data?.lastDashboardSnapshotRebuildAt
                ? formatAppDateTime(data.lastDashboardSnapshotRebuildAt)
                : '—'}
            </p>
            <p className="text-muted-foreground text-xs">
              Diagnostics export (Help menu → Export diagnostics) requires audit
              permission; the bundle records native app version and optional
              client-reported version for parity checks.
            </p>
          </CardContent>
        </Card>
        <Card data-testid="schema-health-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Schema & migrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <Badge
                variant={sh ? schemaStateBadgeVariant(sh.state) : 'outline'}
              >
                {sh ? schemaStateLabel(sh.state) : '—'}
              </Badge>
            </p>
            <p>
              <span className="text-muted-foreground">Applied version: </span>
              {sh?.appliedVersion ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Expected version: </span>
              {sh?.expectedVersion ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">
                Pending migration rows:{' '}
              </span>
              {sh?.pendingMigrationRows ?? '—'}
            </p>
            {sh?.integrityError ? (
              <p className="text-destructive break-words text-xs">
                {sh.integrityError}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Integrity check: no blocking issues reported.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Database</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Size: </span>
              {formatBytes(data?.databaseSizeBytes ?? 0)}
            </p>
            <p>
              <span className="text-muted-foreground">Pages: </span>
              {data?.databasePageCount ?? '—'} × {data?.databasePageSize ?? '—'}{' '}
              bytes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Backup & snapshots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Last backup: </span>
              {data?.lastBackupTime
                ? formatAppDateTime(data.lastBackupTime)
                : '—'}
            </p>
            <p>
              <span className="text-muted-foreground">
                Latest snapshot row:{' '}
              </span>
              {data?.lastSnapshotTime ?? '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Workflows</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              <span className="text-muted-foreground">
                Active (in progress):{' '}
              </span>
              {data?.activeWorkflowCount ?? '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Background task durations</CardTitle>
          <p className="text-muted-foreground text-sm font-normal">
            Last recorded timings from the in-app maintenance thread (aligned
            with background logs).
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Fast tick (total)</TableCell>
                <TableCell>
                  {formatUnixMs(bg?.lastFastTickUnixMs ?? null)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMs(bg?.fastTickTotalMs ?? null)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Backup schedules tick</TableCell>
                <TableCell>—</TableCell>
                <TableCell className="text-right">
                  {formatMs(bg?.backupSchedulesMs ?? null)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Dashboard maintenance</TableCell>
                <TableCell>—</TableCell>
                <TableCell className="text-right">
                  {formatMs(bg?.dashboardMaintenanceMs ?? null)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Governance tick</TableCell>
                <TableCell>—</TableCell>
                <TableCell className="text-right">
                  {formatMs(bg?.governanceMs ?? null)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Heavy tick (total)</TableCell>
                <TableCell>
                  {formatUnixMs(bg?.lastHeavyTickUnixMs ?? null)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMs(bg?.heavyTickTotalMs ?? null)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>BOE maintenance</TableCell>
                <TableCell>
                  {bg?.lastBoeMaintenanceError ? (
                    <span className="text-destructive text-xs">
                      {bg.lastBoeMaintenanceError}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {formatMs(bg?.boeMaintenanceMs ?? null)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Integrity check</TableCell>
                <TableCell>
                  {bg?.lastIntegrityError ? (
                    <span className="text-destructive text-xs">
                      {bg.lastIntegrityError}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {formatMs(bg?.integrityCheckMs ?? null)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
