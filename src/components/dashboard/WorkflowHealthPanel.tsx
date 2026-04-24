import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWorkflowHealthSummary } from '@/lib/workflow-observability';
import type { WorkflowHealthSummary } from '@/types/dashboard-metrics';

type Props = {
  /** Bumps when dashboard metrics refresh so health stays aligned. */
  refreshKey?: string;
};

function trafficLight(h: WorkflowHealthSummary): 'red' | 'amber' | 'green' {
  if (h.criticalExceptions > 0) return 'red';
  const warn =
    h.integrityIssues > 0 ||
    h.slaBreachesToday > 0 ||
    h.workflowTimeouts > 0 ||
    h.recurringExceptions > 0;
  if (warn) return 'amber';
  return 'green';
}

export function WorkflowHealthPanel({ refreshKey }: Props) {
  const [h, setH] = useState<WorkflowHealthSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await getWorkflowHealthSummary();
        if (!cancelled) {
          setH(row);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(String(e));
          setH(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const light = useMemo(() => (h ? trafficLight(h) : null), [h]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Workflow health</CardTitle>
        {light === 'green' && (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-600/50 text-emerald-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Healthy
          </Badge>
        )}
        {light === 'amber' && (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Watch
          </Badge>
        )}
        {light === 'red' && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Critical
          </Badge>
        )}
        {!light && !err && (
          <Activity className="text-muted-foreground h-5 w-5" />
        )}
      </CardHeader>
      <CardContent className="text-sm">
        {err && <p className="text-destructive mb-2 text-xs">{err}</p>}
        {!h && !err && (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {h && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex justify-between gap-2 rounded-md border p-2">
              <span className="text-muted-foreground">Open exceptions</span>
              <span className="font-medium tabular-nums">
                {h.openExceptions}
              </span>
            </div>
            <div className="flex justify-between gap-2 rounded-md border p-2">
              <span className="text-muted-foreground">Critical</span>
              <span className="font-medium tabular-nums">
                {h.criticalExceptions}
              </span>
            </div>
            <div className="flex justify-between gap-2 rounded-md border p-2">
              <span className="text-muted-foreground">Integrity (today)</span>
              <span className="font-medium tabular-nums">
                {h.integrityIssues}
              </span>
            </div>
            <div className="flex justify-between gap-2 rounded-md border p-2">
              <span className="text-muted-foreground">
                SLA breaches (today)
              </span>
              <span className="font-medium tabular-nums">
                {h.slaBreachesToday}
              </span>
            </div>
            <div className="flex justify-between gap-2 rounded-md border p-2">
              <span className="text-muted-foreground">Timeout flags</span>
              <span className="font-medium tabular-nums">
                {h.workflowTimeouts}
              </span>
            </div>
            <div className="flex justify-between gap-2 rounded-md border p-2">
              <span className="text-muted-foreground">Recurring</span>
              <span className="font-medium tabular-nums">
                {h.recurringExceptions}
              </span>
            </div>
            <div className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-3">
              Last maintenance: {h.lastMaintenanceRun || '—'} · Last integrity
              check: {h.lastIntegrityCheck || '—'}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
