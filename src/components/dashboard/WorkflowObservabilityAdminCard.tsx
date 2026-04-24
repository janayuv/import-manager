import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getAuditVerificationSummary,
  getPredictiveWorkflowRisk,
  getReliabilityDiagnostics,
  reconstructExceptionLifecycle,
  runRecoveryReadinessCheck,
} from '@/lib/workflow-observability';
import type {
  AuditVerificationSummary,
  PredictiveRisk,
  RecoveryReadinessReport,
  ReliabilityDiagnostics,
} from '@/types/dashboard-metrics';
import { toast } from 'sonner';

type Props = {
  refreshKey?: string;
};

function statusPill(label: string, value: string) {
  const v = value.toUpperCase();
  const cls =
    v === 'OK'
      ? 'border-emerald-600/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
      : v === 'WARN'
        ? 'border-amber-600/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
        : 'border-destructive/40 bg-destructive/10 text-destructive';
  return (
    <div className={`rounded-md border px-2 py-1 text-xs font-medium ${cls}`}>
      {label}: {value}
    </div>
  );
}

export function WorkflowObservabilityAdminCard({ refreshKey }: Props) {
  const [audit, setAudit] = useState<AuditVerificationSummary | null>(null);
  const [recovery, setRecovery] = useState<RecoveryReadinessReport | null>(
    null
  );
  const [diag, setDiag] = useState<ReliabilityDiagnostics | null>(null);
  const [risk, setRisk] = useState<PredictiveRisk | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [a, r, d, rk] = await Promise.all([
          getAuditVerificationSummary(),
          runRecoveryReadinessCheck(),
          getReliabilityDiagnostics(),
          getPredictiveWorkflowRisk(),
        ]);
        if (!cancelled) {
          setAudit(a);
          setRecovery(r);
          setDiag(d);
          setRisk(rk);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const tamper = audit && audit.checksumMismatches > 0;

  return (
    <Card className={tamper ? 'border-destructive/60' : ''}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        {tamper ? (
          <ShieldAlert className="text-destructive h-5 w-5" />
        ) : (
          <ShieldCheck className="text-muted-foreground h-5 w-5" />
        )}
        <CardTitle className="text-base">
          Reliability and audit observability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading && !audit && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {audit && (
          <div>
            <div className="mb-1 font-medium">Audit log verification</div>
            <div className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-3">
              <div>Checksum mismatches: {audit.checksumMismatches}</div>
              <div>Integrity warnings (7d): {audit.integrityWarnings}</div>
              <div>Missing checksum rows: {audit.missingChecksumEntries}</div>
            </div>
            {tamper && (
              <p className="text-destructive mt-2 text-xs">
                Checksum mismatches detected — review activity log for possible
                tampering.
              </p>
            )}
          </div>
        )}
        {recovery && (
          <div>
            <div className="mb-1 font-medium">Recovery readiness</div>
            <div className="flex flex-wrap gap-2">
              {statusPill('Backup', recovery.backupStatus)}
              {statusPill('Snapshots', recovery.snapshotStatus)}
              {statusPill('Integrity', recovery.integrityStatus)}
              {statusPill('Audit', recovery.auditStatus)}
            </div>
          </div>
        )}
        {risk && (
          <div className="text-muted-foreground text-xs">
            Predictive risk (30d trend):{' '}
            <span className="text-foreground font-medium">
              {risk.riskLevel}
            </span>
          </div>
        )}
        {diag && (
          <div className="text-muted-foreground space-y-1 text-xs">
            <div className="text-foreground font-medium">
              Reliability diagnostics
            </div>
            <div>Most common type: {diag.mostCommonExceptionType || '—'}</div>
            <div>Highest recurrence: {diag.highestRecurrenceEntity || '—'}</div>
            <div>Longest open case: {diag.longestUnresolvedCaseId || '—'}</div>
            <div>
              Top SLA-breach type: {diag.mostFrequentSlaBreachType || '—'}
            </div>
            <div>
              Slowest workflow (resolved):{' '}
              {diag.slowestResolutionWorkflowType || '—'}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  const n = await reconstructExceptionLifecycle();
                  toast.success(`Reconstructed ${n} lifecycle event(s).`);
                } catch (e) {
                  toast.error(String(e));
                }
              })();
            }}
          >
            Reconstruct lifecycle
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
