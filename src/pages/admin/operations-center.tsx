import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  FlaskConical,
  Flame,
  OctagonAlert,
  RefreshCw,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { canViewAutomationConsole } from '@/lib/automation-console';
import {
  acknowledgeWorkflowForecastActions,
  appendWorkflowIncidentResolutionNote,
  debugTriggerFailure,
  exportWorkflowIncidentsReportCsv,
  fetchOperationsCenterDashboard,
  getCorrelatedIncidentTimeline,
  getWorkflowIncidentDetail,
  refreshWorkflowIncidentMetrics,
  resolveWorkflowIncident,
  scanSystemicFailureBursts,
  startManualIncidentSuppression,
  submitWorkflowForecastFeedback,
  type CorrelatedTimelineEntry,
  type FailureForecastBanner,
  type IncidentDetail,
  type OperationsCenterDashboard,
} from '@/lib/incident-management';
import { useUser } from '@/lib/user-context';

const DEBUG_MODES = [
  { id: 'api_timeout', label: 'API timeout' },
  { id: 'database_lock', label: 'Database lock' },
  { id: 'job_failure', label: 'Job failure' },
  { id: 'deployment_failure', label: 'Deployment failure' },
  { id: 'recovery_failure', label: 'Recovery failure' },
  { id: 'trigger_burst_failure', label: 'Correlation burst (10×)' },
  { id: 'trigger_suppressed_burst', label: 'Suppression drill (burst + 8×)' },
  {
    id: 'trigger_recovery_stabilization',
    label: 'Recovery stabilization (burst → quiet → confirm)',
  },
  {
    id: 'trigger_regression_failure',
    label: 'Regression drill (stabilized resolved → new failure)',
  },
  {
    id: 'trigger_structured_regression',
    label: 'Structured regression (log event after stabilization)',
  },
  {
    id: 'trigger_persistent_failure',
    label: 'Persistent failure (elevated rate after stabilization)',
  },
  {
    id: 'trigger_failure_forecast',
    label: 'Failure forecast (rising job failures + regressions)',
  },
  {
    id: 'trigger_explainable_forecast',
    label: 'Explainable forecast (OPEN incident + banner + history)',
  },
  {
    id: 'trigger_actionable_forecast',
    label: 'Actionable forecast (actions + banner + drill)',
  },
] as const;

function healthLabel(status: string): string {
  if (status === 'green') return 'Healthy';
  if (status === 'amber') return 'Degraded';
  if (status === 'red') return 'Critical';
  return status;
}

function healthBadgeClass(status: string): string {
  if (status === 'green')
    return 'border-green-600/30 bg-green-50 text-green-800';
  if (status === 'amber')
    return 'border-amber-600/30 bg-amber-50 text-amber-900';
  if (status === 'red') return 'border-red-600/30 bg-red-50 text-red-900';
  return 'border-muted';
}

function parseSqliteUtc(ts: string): number {
  return new Date(ts.replace(' ', 'T') + 'Z').getTime();
}

function burstStartedWithinMins(ts: string, mins: number): boolean {
  const t = parseSqliteUtc(ts);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < mins * 60_000;
}

function recommendedActionsList(banner: FailureForecastBanner): string[] {
  if (!Array.isArray(banner.recommendedActions)) return [];
  return banner.recommendedActions.filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );
}

function ForecastRecommendedActionsBlock({
  banner,
}: {
  banner: FailureForecastBanner;
}) {
  const raw = banner?.recommendedActions;
  const acts =
    Array.isArray(raw) && raw.length > 0 ? recommendedActionsList(banner) : [];
  if (!acts.length) return null;
  return (
    <div className="mt-3 border-t border-purple-300/50 pt-3 dark:border-purple-700/50">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-purple-950 dark:text-purple-50">
          Recommended actions:
        </p>
        {banner.actionPriority ? (
          <Badge
            variant="outline"
            className="border-purple-700/50 text-xs font-semibold uppercase text-purple-900 dark:text-purple-100"
          >
            {banner.actionPriority}
          </Badge>
        ) : null}
      </div>
      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-purple-900/95 dark:text-purple-100/95">
        {acts.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function forecastBannerBullets(dash: OperationsCenterDashboard): string[] {
  const b = dash.failureForecastBanner;
  if (!b) return [];
  const raw = b.explanationBullets;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter(
      (x): x is string => typeof x === 'string' && x.length > 0
    );
  }
  const out: string[] = [];
  const pt = (b.primaryTrigger ?? '').trim();
  if (pt === 'slope_weight' || (b.trendSummary ?? '').length > 0) {
    out.push('Rising failure trend');
  }
  const sec = b.secondaryTriggers ?? {};
  const reg = Number(sec.recent_regressions ?? 0);
  const pers = Number(sec.recent_persistence ?? 0);
  if (reg > 0) out.push('Recent regressions detected');
  if (pers > 0) out.push('Persistence windows active');
  if (out.length === 0 && pt === 'regression_weight') {
    out.push('Recent regressions detected');
  }
  if (out.length === 0 && pt === 'persistence_weight') {
    out.push('Persistence windows active');
  }
  if (out.length === 0) {
    out.push('Elevated composite failure risk vs baseline');
  }
  return out;
}

export default function OperationsCenterPage() {
  const { user } = useUser();
  const role = user?.role ?? '';
  const viewOk = canViewAutomationConsole(role);
  const isAdmin = role.toLowerCase().replace(/\s+/g, '').includes('admin');

  const [dash, setDash] = useState<OperationsCenterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [correlTimeline, setCorrelTimeline] = useState<
    CorrelatedTimelineEntry[]
  >([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [rootCauseDraft, setRootCauseDraft] = useState('');
  const [debugMode, setDebugMode] = useState<string>('api_timeout');
  const [supMod, setSupMod] = useState('job_monitor');
  const [supEvt, setSupEvt] = useState('BACKGROUND_JOB_FAILURE');
  const [supWin, setSupWin] = useState('30');
  const [supReason, setSupReason] = useState('Known infrastructure outage');
  const [supIncident, setSupIncident] = useState('');
  const [forecastFeedbackBusy, setForecastFeedbackBusy] = useState(false);
  const [forecastAckBusy, setForecastAckBusy] = useState(false);

  const loadDash = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchOperationsCenterDashboard(role || 'Admin');
      setDash(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDash(null);
    } finally {
      setLoading(false);
    }
  }, [role]);

  const loadDetail = useCallback(
    async (incidentId: string) => {
      setDetailLoading(true);
      try {
        const [d, tl] = await Promise.all([
          getWorkflowIncidentDetail(incidentId, role || 'Admin'),
          getCorrelatedIncidentTimeline(incidentId, role || 'Admin'),
        ]);
        setDetail(d);
        setCorrelTimeline(Array.isArray(tl) ? tl : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        setDetail(null);
        setCorrelTimeline([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [role]
  );

  useEffect(() => {
    if (!viewOk) return;
    void loadDash();
  }, [viewOk, loadDash]);

  useEffect(() => {
    if (!selectedId || !viewOk) {
      setDetail(null);
      setCorrelTimeline([]);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, viewOk, loadDetail]);

  const onExport = async () => {
    try {
      const csv = await exportWorkflowIncidentsReportCsv(role || 'Admin');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import-manager-incident-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Incident report exported');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onRefreshMetrics = async () => {
    try {
      await refreshWorkflowIncidentMetrics(role || 'Admin');
      await loadDash();
      toast.success('Incident metrics refreshed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onScanBursts = async () => {
    try {
      const n = await scanSystemicFailureBursts(role || 'Admin');
      await loadDash();
      toast.message('Systemic burst scan complete', {
        description: `Bursts detected this run: ${n}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onManualSuppression = async () => {
    const wm = Number.parseInt(supWin, 10);
    if (!Number.isFinite(wm) || wm < 5) {
      toast.error('Window must be at least 5 minutes');
      return;
    }
    try {
      const sid = await startManualIncidentSuppression(
        supMod.trim(),
        supEvt.trim(),
        wm,
        supReason.trim(),
        supIncident.trim() || undefined,
        role || 'Admin'
      );
      toast.success('Suppression window started', { description: sid });
      await loadDash();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onAppendNote = async () => {
    if (!selectedId) return;
    const t = resolutionNote.trim();
    if (t.length < 10) {
      toast.error('Resolution note must be at least 10 characters');
      return;
    }
    try {
      await appendWorkflowIncidentResolutionNote(
        selectedId,
        t,
        role || 'Admin'
      );
      setResolutionNote('');
      toast.success('Resolution note recorded');
      await loadDetail(selectedId);
      await loadDash();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onResolve = async () => {
    if (!selectedId) return;
    const s = rootCauseDraft.trim();
    if (s.length < 50) {
      toast.error('Root cause summary must be at least 50 characters');
      return;
    }
    try {
      await resolveWorkflowIncident(selectedId, s, role || 'Admin');
      setRootCauseDraft('');
      toast.success('Incident resolved');
      setSelectedId(null);
      setDetail(null);
      await loadDash();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onDebugTrigger = async () => {
    try {
      const r = await debugTriggerFailure(debugMode, role || 'Admin');
      const aid = typeof r.alertId === 'string' ? r.alertId : undefined;
      const iid = typeof r.incidentId === 'string' ? r.incidentId : undefined;
      const tr =
        typeof r.stabilizationTransitions === 'number'
          ? r.stabilizationTransitions
          : undefined;
      const parts = [
        aid ? `Alert ${aid}` : null,
        iid ? `Incident ${iid.slice(0, 8)}…` : null,
        tr != null ? `Stabilization transitions: ${tr}` : null,
      ].filter(Boolean);
      toast.message('Debug simulation run', {
        description: parts.length ? parts.join(' · ') : undefined,
      });
      await loadDash();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const errorContextPretty = useMemo(() => {
    if (!detail?.errorContext) return '';
    try {
      return JSON.stringify(detail.errorContext, null, 2);
    } catch {
      return String(detail.errorContext);
    }
  }, [detail]);

  const recentSystemicBursts = useMemo(() => {
    const rows = dash?.activeSystemicBursts ?? [];
    return rows.filter(b => burstStartedWithinMins(b.burstStartTime, 60));
  }, [dash]);

  if (!viewOk) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Operations center
          </h1>
          <p className="text-muted-foreground text-sm">
            Single-operator incident lifecycle: detection, diagnosis,
            resolution, and post-mortem audit trail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadDash()}>
            <RefreshCw className="mr-1 size-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefreshMetrics()}
          >
            <Activity className="mr-1 size-4" />
            Sync metrics
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onScanBursts()}
          >
            <ShieldAlert className="mr-1 size-4" />
            Scan bursts
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onExport()}>
            <Download className="mr-1 size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <ShieldAlert className="size-4" />
              Failed to load dashboard
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {dash && !loading && dash.failureForecastBanner && (
        <div
          role="status"
          className="rounded-lg border border-purple-600/35 bg-purple-50 px-4 py-3 text-purple-950 shadow-sm dark:border-purple-500/40 dark:bg-purple-950/40 dark:text-purple-50"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-lg" aria-hidden>
              🔮
            </span>
            <span className="font-semibold tracking-tight">
              Failure Risk Predicted
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            <span className="font-medium">Module:</span>{' '}
            <span className="font-mono">
              {dash.failureForecastBanner.sourceModule}
            </span>
            <span className="mx-2 text-purple-700/80 dark:text-purple-200/80">
              ·
            </span>
            <span className="font-medium">Probability:</span>{' '}
            <span className="tabular-nums">
              {dash.failureForecastBanner.predictedFailureProbability.toFixed(
                2
              )}
            </span>
            <span className="mx-2 text-purple-700/80 dark:text-purple-200/80">
              ·
            </span>
            <span className="font-medium">Window:</span> Next{' '}
            {dash.failureForecastBanner.forecastHorizonMinutes} minutes
          </p>
          <p className="mt-2 text-sm">
            <span className="font-medium">Confidence:</span>{' '}
            <span className="tabular-nums">
              {dash.failureForecastBanner.confidenceScore.toFixed(2)}
            </span>
            {typeof dash.failureForecastBanner.dataPointsUsed === 'number' ? (
              <>
                {' '}
                <span className="text-purple-800/85 dark:text-purple-100/85">
                  — Based on {dash.failureForecastBanner.dataPointsUsed} data
                  points
                </span>
              </>
            ) : null}
          </p>
          {dash.failureForecastBanner.trendSummary ? (
            <p className="mt-2 text-sm leading-snug text-purple-900/95 dark:text-purple-50/95">
              {dash.failureForecastBanner.trendSummary}
            </p>
          ) : null}
          <div className="mt-3 border-t border-purple-300/50 pt-3 dark:border-purple-700/50">
            <p className="text-sm font-medium text-purple-950 dark:text-purple-50">
              Why this forecast exists:
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-purple-900/95 dark:text-purple-100/95">
              {forecastBannerBullets(dash).map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <ForecastRecommendedActionsBlock
            banner={dash.failureForecastBanner}
          />
          {viewOk ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="bg-purple-800 text-white hover:bg-purple-900 dark:bg-purple-700 dark:hover:bg-purple-600"
                disabled={forecastAckBusy || forecastFeedbackBusy}
                onClick={() => {
                  const id = dash.failureForecastBanner?.forecastId;
                  if (!id) return;
                  const acts = recommendedActionsList(
                    dash.failureForecastBanner!
                  );
                  const summary =
                    acts.length > 0
                      ? `Acknowledged checklist: ${acts.join('; ')}`
                      : 'Acknowledged recommended preventive checklist';
                  setForecastAckBusy(true);
                  void (async () => {
                    try {
                      await acknowledgeWorkflowForecastActions(
                        id,
                        summary,
                        role || 'Admin'
                      );
                      toast.success('ACKNOWLEDGE_ACTION recorded');
                      await loadDash();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e));
                    } finally {
                      setForecastAckBusy(false);
                    }
                  })();
                }}
              >
                Acknowledge recommended actions
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-purple-700/40 bg-white/80 text-purple-950 hover:bg-purple-100 dark:border-purple-400/40 dark:bg-purple-900/50 dark:text-purple-50 dark:hover:bg-purple-800/60"
                disabled={forecastFeedbackBusy || forecastAckBusy}
                onClick={() => {
                  const id = dash.failureForecastBanner?.forecastId;
                  if (!id) return;
                  setForecastFeedbackBusy(true);
                  void (async () => {
                    try {
                      await submitWorkflowForecastFeedback(
                        id,
                        'accurate',
                        role || 'Admin',
                        null
                      );
                      toast.success('Recorded: prediction was accurate');
                      await loadDash();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e));
                    } finally {
                      setForecastFeedbackBusy(false);
                    }
                  })();
                }}
              >
                Prediction was accurate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-purple-700/40 bg-white/80 text-purple-950 hover:bg-purple-100 dark:border-purple-400/40 dark:bg-purple-900/50 dark:text-purple-50 dark:hover:bg-purple-800/60"
                disabled={forecastFeedbackBusy || forecastAckBusy}
                onClick={() => {
                  const id = dash.failureForecastBanner?.forecastId;
                  if (!id) return;
                  setForecastFeedbackBusy(true);
                  void (async () => {
                    try {
                      await submitWorkflowForecastFeedback(
                        id,
                        'misleading',
                        role || 'Admin',
                        null
                      );
                      toast.success('Recorded: prediction was misleading');
                      await loadDash();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e));
                    } finally {
                      setForecastFeedbackBusy(false);
                    }
                  })();
                }}
              >
                Prediction was misleading
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {dash && !loading && recentSystemicBursts.length > 0 && (
        <div className="space-y-3">
          {recentSystemicBursts.map(b => {
            const det = (b.details ?? {}) as Record<string, unknown>;
            const classification = String(
              det.rootCauseClassification ?? ''
            ).replace(/_/g, ' ');
            const durSec = Number(det.burstDurationSeconds);
            const durMin = Number.isFinite(durSec)
              ? Math.max(0.1, durSec / 60)
              : Math.max(0.1, b.durationMinutes);
            const conf =
              typeof b.confidenceScore === 'number'
                ? b.confidenceScore
                : typeof det.confidenceScore === 'number'
                  ? (det.confidenceScore as number)
                  : null;
            return (
              <Card
                key={b.burstId}
                className="border-amber-500/40 bg-amber-50/90 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="size-5 shrink-0" />
                    BURST DETECTED
                  </CardTitle>
                  <CardDescription className="text-amber-900/90 dark:text-amber-100/90">
                    Module:{' '}
                    <span className="font-mono text-xs">{b.sourceModule}</span>
                    {' · '}
                    Events:{' '}
                    <span className="font-medium tabular-nums">
                      {b.eventCount}
                    </span>
                    {' · '}
                    Duration:{' '}
                    <span className="tabular-nums">
                      {durMin.toFixed(1)}
                    </span>{' '}
                    min
                    {' · '}
                    Severity:{' '}
                    <span className="font-semibold">{b.severity}</span>
                    {classification ? (
                      <>
                        {' · '}
                        Class:{' '}
                        <span className="font-mono text-[11px]">
                          {classification}
                        </span>
                      </>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="font-medium leading-snug">
                    Hint: {b.rootCauseHint}
                  </p>
                  {conf != null ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Confidence: {(conf * 100).toFixed(0)}%
                    </p>
                  ) : null}
                  <p className="text-muted-foreground mt-2 text-xs">
                    Baseline rate ~{b.baselineRate.toFixed(3)} / 10m vs current
                    rate {b.currentRate.toFixed(1)} / 10m · Event:{' '}
                    <span className="font-mono">{b.eventType}</span>
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {dash && !loading && (dash.activeSuppressions?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {(dash.activeSuppressions ?? []).map(s => (
            <Card
              key={s.suppressionId}
              className="border-sky-600/30 bg-sky-50/95 text-sky-950 dark:bg-sky-950/35 dark:text-sky-50"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="size-5 shrink-0" />
                  Incident suppression active
                </CardTitle>
                <CardDescription className="text-sky-900/90 dark:text-sky-100/90">
                  Module:{' '}
                  <span className="font-mono text-xs">{s.sourceModule}</span>
                  {' · '}
                  Signal:{' '}
                  <span className="font-mono text-xs">{s.eventType}</span>
                  {' · '}
                  Suppressed:{' '}
                  <span className="font-medium tabular-nums">
                    {s.suppressedEventCount}
                  </span>{' '}
                  events · Window:{' '}
                  <span className="tabular-nums">
                    {s.windowMinutes.toFixed(0)}
                  </span>{' '}
                  min · Confidence:{' '}
                  <span className="tabular-nums">
                    {(s.confidenceScore * 100).toFixed(0)}%
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-sky-900/85 dark:text-sky-100/85">
                <p className="leading-snug">{s.reason}</p>
                <p className="text-muted-foreground mt-2 font-mono text-[11px]">
                  Until {s.suppressionEnd} (UTC)
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dash && !loading && (dash.stabilizationSignals?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {(dash.stabilizationSignals ?? []).map(sig => {
            const confirmed = sig.phase === 'confirmed' || sig.tone === 'green';
            return (
              <Card
                key={sig.stabilizationId}
                className={
                  confirmed
                    ? 'border-emerald-600/35 bg-emerald-50/95 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50'
                    : 'border-amber-600/35 bg-amber-50/95 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50'
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {confirmed ? (
                      <CheckCircle2 className="size-5 shrink-0" />
                    ) : (
                      <Activity className="size-5 shrink-0 animate-pulse" />
                    )}
                    {confirmed ? 'System stabilized' : 'System stabilizing'}
                  </CardTitle>
                  <CardDescription
                    className={
                      confirmed
                        ? 'text-emerald-900/90 dark:text-emerald-100/90'
                        : 'text-amber-900/90 dark:text-amber-100/90'
                    }
                  >
                    Module:{' '}
                    <span className="font-mono text-xs">
                      {sig.sourceModule}
                    </span>
                    {' · '}
                    Signal:{' '}
                    <span className="font-mono text-xs">{sig.eventType}</span>
                    {' · '}
                    Quiet time:{' '}
                    <span className="font-medium tabular-nums">
                      {sig.quietMinutes.toFixed(0)}
                    </span>{' '}
                    min · Confidence:{' '}
                    <span className="tabular-nums">
                      {sig.confidenceScore.toFixed(2)}
                    </span>
                    {confirmed && sig.stabilityDurationMinutes > 0 ? (
                      <>
                        {' · '}
                        Stability window:{' '}
                        <span className="tabular-nums">
                          {sig.stabilityDurationMinutes}
                        </span>{' '}
                        min
                      </>
                    ) : null}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {dash && !loading && (dash.regressionSignals?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {(dash.regressionSignals ?? []).map(r => {
            const src = r.triggerSource ?? 'alert';
            const isStructured = src === 'structured_log';
            return (
              <Card
                key={r.regressionId}
                className="border-red-700/45 bg-red-50/95 text-red-950 dark:bg-red-950/45 dark:text-red-50"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <OctagonAlert className="size-5 shrink-0 text-red-700 dark:text-red-200" />
                    Regression detected
                  </CardTitle>
                  <CardDescription className="text-red-900/90 dark:text-red-100/90">
                    <span className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-red-800/40 bg-white/80 text-red-950 dark:bg-red-900/40 dark:text-red-50"
                      >
                        {isStructured ? (
                          <>
                            <Settings2 className="mr-1 inline size-3.5" />
                            Structured event
                          </>
                        ) : (
                          <>
                            <Bell className="mr-1 inline size-3.5" />
                            Alert event
                          </>
                        )}
                      </Badge>
                      <span className="text-[11px] font-normal uppercase tracking-wide text-red-900/80 dark:text-red-100/80">
                        Trigger source: {isStructured ? 'STRUCTURED' : 'ALERT'}
                      </span>
                    </span>
                    Module:{' '}
                    <span className="font-mono text-xs">{r.sourceModule}</span>
                    {' · '}
                    Event:{' '}
                    <span className="font-mono text-xs">{r.eventType}</span>
                    {' · '}
                    Time since stabilization:{' '}
                    <span className="font-medium tabular-nums">
                      {r.timeSinceStabilizationMinutes}
                    </span>{' '}
                    min · Confidence:{' '}
                    <span className="tabular-nums">
                      {r.confidenceScore.toFixed(2)}
                    </span>
                    {' · '}
                    <span className="font-mono text-[11px]">
                      {r.regressionDetectedAt}
                    </span>
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {dash && !loading && (dash.persistenceSignals?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {(dash.persistenceSignals ?? []).map(p => (
            <Card
              key={p.persistenceId}
              className="border-orange-600/45 bg-orange-50/95 text-orange-950 dark:bg-orange-950/40 dark:text-orange-50"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Flame className="size-5 shrink-0 text-orange-700 dark:text-orange-200" />
                  Persistent failure detected
                </CardTitle>
                <CardDescription className="text-orange-900/90 dark:text-orange-100/90">
                  Module:{' '}
                  <span className="font-mono text-xs">{p.sourceModule}</span>
                  {' · '}
                  Event:{' '}
                  <span className="font-mono text-xs">{p.eventType}</span>
                  {' · '}
                  Failure rate:{' '}
                  <span className="font-medium tabular-nums">
                    {p.failureRate.toFixed(3)}
                  </span>
                  /min · Expected:{' '}
                  <span className="tabular-nums">
                    {p.expectedRate.toFixed(3)}
                  </span>
                  /min · Confidence:{' '}
                  <span className="tabular-nums">
                    {p.confidenceScore.toFixed(2)}
                  </span>
                  {' · '}
                  <span className="font-mono text-[11px]">
                    {p.persistenceDetectedAt}
                  </span>
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {dash && !loading && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className={healthBadgeClass(dash.healthStatus)}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {dash.healthStatus === 'green' ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <AlertTriangle className="size-4" />
                  )}
                  System health
                </CardTitle>
                <CardDescription className="text-current/80">
                  {healthLabel(dash.healthStatus)}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>Open: {dash.activeIncidentCount}</span>
                  <span>Critical: {dash.openCritical}</span>
                  <span>Fatal: {dash.openFatal}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recovery (30d)</CardTitle>
                <CardDescription>
                  Automatic recovery success ratio
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {(dash.recoverySuccessRate30d * 100).toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Reliability score</CardTitle>
                <CardDescription>Platform reliability index</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {(dash.systemReliabilityScore * 100).toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today (metrics)</CardTitle>
                <CardDescription>Rolled incident counters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {dash.metricsToday ? (
                  <>
                    <div>
                      Created: {dash.metricsToday.incidentsCreatedToday} ·
                      Resolved: {dash.metricsToday.incidentsResolvedToday}
                    </div>
                    <div>
                      Critical/Fatal opened:{' '}
                      {dash.metricsToday.criticalIncidentCount}
                    </div>
                    <div>
                      Avg resolution (min):{' '}
                      {dash.metricsToday.avgResolutionTime.toFixed(1)}
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    No row for today yet
                  </span>
                )}
                {dash.stabilizationMetricsToday ? (
                  <div className="text-muted-foreground mt-3 border-t pt-2 text-xs">
                    <span className="text-foreground font-medium">
                      Stabilization (today)
                    </span>
                    : detected{' '}
                    {dash.stabilizationMetricsToday.stabilizationsDetected} ·
                    avg{' '}
                    {dash.stabilizationMetricsToday.avgStabilizationTime.toFixed(
                      1
                    )}{' '}
                    min · conf avg{' '}
                    {dash.stabilizationMetricsToday.stabilityConfidenceAvg.toFixed(
                      2
                    )}
                  </div>
                ) : null}
                {dash.systemStabilityScore ? (
                  <div className="text-muted-foreground mt-1 text-xs">
                    <span className="text-foreground font-medium">
                      System stability score
                    </span>
                    :{' '}
                    {(dash.systemStabilityScore.stabilityScore * 100).toFixed(
                      1
                    )}
                    %
                    <span className="ml-1">
                      ({dash.systemStabilityScore.successfulStabilizations} /{' '}
                      {dash.systemStabilityScore.totalIncidents} incidents)
                    </span>
                  </div>
                ) : null}
                {dash.regressionMetricsToday ? (
                  <div className="text-muted-foreground mt-2 border-t pt-2 text-xs">
                    <span className="text-foreground font-medium">
                      Regression (today)
                    </span>
                    : {dash.regressionMetricsToday.regressionsDetected} · avg
                    gap{' '}
                    {dash.regressionMetricsToday.avgRegressionTimeMinutes.toFixed(
                      1
                    )}{' '}
                    min · freq vs stabilizations{' '}
                    {dash.regressionMetricsToday.regressionFrequency.toFixed(2)}
                  </div>
                ) : null}
                {dash.regressionRiskScore ? (
                  <div className="text-muted-foreground mt-1 text-xs">
                    <span className="text-foreground font-medium">
                      Regression risk
                    </span>
                    :{' '}
                    {(dash.regressionRiskScore.regressionRisk * 100).toFixed(1)}
                    %
                    <span className="ml-1">
                      (regs {dash.regressionRiskScore.regressionsDetected} /
                      stab {dash.regressionRiskScore.stabilizationsDetected})
                    </span>
                  </div>
                ) : null}
                {dash.structuredRegressionMetricsToday ? (
                  <div className="text-muted-foreground mt-2 border-t pt-2 text-xs">
                    <span className="text-foreground font-medium">
                      Structured regression (today)
                    </span>
                    :{' '}
                    {
                      dash.structuredRegressionMetricsToday
                        .structuredRegressionsDetected
                    }{' '}
                    · avg gap{' '}
                    {dash.structuredRegressionMetricsToday.avgStructuredRegressionTime.toFixed(
                      1
                    )}{' '}
                    min · ratio{' '}
                    {dash.structuredRegressionMetricsToday.structuredRegressionRatio.toFixed(
                      2
                    )}
                  </div>
                ) : null}
                {dash.persistenceMetricsToday ? (
                  <div className="text-muted-foreground mt-2 border-t pt-2 text-xs">
                    <span className="text-foreground font-medium">
                      Persistent failure (today)
                    </span>
                    : {dash.persistenceMetricsToday.persistentFailuresDetected}{' '}
                    · avg duration{' '}
                    {dash.persistenceMetricsToday.avgPersistenceDuration.toFixed(
                      1
                    )}{' '}
                    · freq{' '}
                    {dash.persistenceMetricsToday.persistenceFrequency.toFixed(
                      2
                    )}
                  </div>
                ) : null}
                {dash.persistenceRiskScore ? (
                  <div className="text-muted-foreground mt-1 text-xs">
                    <span className="text-foreground font-medium">
                      Persistence risk
                    </span>
                    :{' '}
                    {(dash.persistenceRiskScore.persistenceRisk * 100).toFixed(
                      2
                    )}
                    %
                    <span className="ml-1">
                      (persistent{' '}
                      {dash.persistenceRiskScore.persistentFailuresDetected} /
                      incidents {dash.persistenceRiskScore.totalIncidents})
                    </span>
                  </div>
                ) : null}
                {dash.forecastMetricsToday ? (
                  <div className="text-muted-foreground mt-2 border-t border-purple-200/60 pt-2 text-xs dark:border-purple-800/50">
                    <span className="font-medium text-purple-950 dark:text-purple-100">
                      Failure forecast (today)
                    </span>
                    : generated {dash.forecastMetricsToday.forecastsGenerated} ·
                    accuracy{' '}
                    {(dash.forecastMetricsToday.forecastAccuracy * 100).toFixed(
                      1
                    )}
                    % · FP rate{' '}
                    {(
                      dash.forecastMetricsToday.forecastFalsePositiveRate * 100
                    ).toFixed(1)}
                    % · prediction score{' '}
                    {(
                      dash.forecastMetricsToday.predictionAccuracyScore * 100
                    ).toFixed(1)}
                    %
                  </div>
                ) : null}
                {dash.forecastRiskScore ? (
                  <div className="text-muted-foreground mt-1 text-xs">
                    <span className="font-medium text-purple-950 dark:text-purple-100">
                      Forecast risk (high / total)
                    </span>
                    :{' '}
                    {(dash.forecastRiskScore.forecastRiskScore * 100).toFixed(
                      1
                    )}
                    %
                    <span className="ml-1">
                      ({dash.forecastRiskScore.highRiskForecasts} /{' '}
                      {dash.forecastRiskScore.totalForecasts})
                    </span>
                  </div>
                ) : null}
                {dash.forecastExplanationMetricsToday ? (
                  <div className="text-muted-foreground mt-2 border-t border-purple-200/60 pt-2 text-xs dark:border-purple-800/50">
                    <span className="font-medium text-purple-950 dark:text-purple-100">
                      Forecast explanations (today)
                    </span>
                    : generated{' '}
                    {dash.forecastExplanationMetricsToday.explanationsGenerated}{' '}
                    · accurate{' '}
                    {dash.forecastExplanationMetricsToday.accurateExplanations}{' '}
                    · misleading{' '}
                    {
                      dash.forecastExplanationMetricsToday
                        .misleadingExplanations
                    }
                  </div>
                ) : null}
                {dash.forecastExplanationScore ? (
                  <div className="text-muted-foreground mt-1 text-xs">
                    <span className="font-medium text-purple-950 dark:text-purple-100">
                      Explanation accuracy (feedback)
                    </span>
                    :{' '}
                    {(
                      dash.forecastExplanationScore.explanationAccuracyScore *
                      100
                    ).toFixed(1)}
                    %
                    <span className="ml-1">
                      (accurate{' '}
                      {dash.forecastExplanationScore.accurateExplanations} /
                      total {dash.forecastExplanationScore.totalExplanations})
                    </span>
                  </div>
                ) : null}
                {dash.forecastActionMetricsToday ? (
                  <div className="text-muted-foreground mt-2 border-t border-purple-200/60 pt-2 text-xs dark:border-purple-800/50">
                    <span className="font-medium text-purple-950 dark:text-purple-100">
                      Preventive actions (today)
                    </span>
                    : generated{' '}
                    {dash.forecastActionMetricsToday.actionsGenerated} ·
                    acknowledged{' '}
                    {dash.forecastActionMetricsToday.actionsAcknowledged} ·
                    effective {dash.forecastActionMetricsToday.actionsEffective}
                  </div>
                ) : null}
                {dash.preventiveReliabilityScore ? (
                  <div className="text-muted-foreground mt-1 text-xs">
                    <span className="font-medium text-purple-950 dark:text-purple-100">
                      Preventive reliability
                    </span>
                    :{' '}
                    {(
                      dash.preventiveReliabilityScore
                        .preventiveReliabilityScore * 100
                    ).toFixed(1)}
                    %
                    <span className="ml-1">
                      (prevented{' '}
                      {dash.preventiveReliabilityScore.preventedFailures} /
                      evaluated{' '}
                      {dash.preventiveReliabilityScore.totalForecastsEvaluated})
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Incident correlation</CardTitle>
              <CardDescription>
                Alerts merged into existing OPEN incidents (same module, signal,
                entity, 10-minute sliding window)
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {dash.correlationMetricsToday ? (
                <>
                  <div>
                    <span className="text-foreground font-medium tabular-nums">
                      {dash.correlationMetricsToday.alertsGrouped}
                    </span>{' '}
                    alerts grouped
                  </div>
                  <div>
                    <span className="text-foreground font-medium tabular-nums">
                      {dash.correlationMetricsToday.incidentsCreated}
                    </span>{' '}
                    incidents created
                  </div>
                  <div>
                    Noise reduction:{' '}
                    <span className="text-foreground font-medium tabular-nums">
                      {(
                        dash.correlationMetricsToday.noiseReductionRatio * 100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div>
                    Burst signals:{' '}
                    <span className="text-foreground font-medium tabular-nums">
                      {dash.correlationMetricsToday.burstSignalsEmitted}
                    </span>
                  </div>
                  <div>
                    Systemic bursts logged:{' '}
                    <span className="text-foreground font-medium tabular-nums">
                      {dash.correlationMetricsToday.burstsDetected ?? 0}
                    </span>
                  </div>
                </>
              ) : (
                <span>No correlation KPI row for today yet</span>
              )}
              {dash.incidentNoiseScoreToday ? (
                <div className="mt-3 w-full border-t pt-3 text-xs">
                  <span className="text-foreground font-medium">
                    Correlation efficiency (noise score)
                  </span>
                  :{' '}
                  <span className="tabular-nums">
                    {(dash.incidentNoiseScoreToday.noiseScore * 100).toFixed(1)}
                    %
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    (grouped {dash.incidentNoiseScoreToday.alertsGrouped} /
                    alerts {dash.incidentNoiseScoreToday.totalAlerts})
                  </span>
                </div>
              ) : null}
              {dash.suppressionMetricsToday ? (
                <div className="mt-3 w-full border-t pt-3 text-xs">
                  <div className="text-foreground font-medium">
                    Suppression (today)
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Alerts suppressed:{' '}
                      <span className="font-medium tabular-nums">
                        {dash.suppressionMetricsToday.alertsSuppressed}
                      </span>
                    </span>
                    <span>
                      Windows:{' '}
                      <span className="font-medium tabular-nums">
                        {dash.suppressionMetricsToday.suppressionWindows}
                      </span>
                    </span>
                    <span>
                      Noise gain:{' '}
                      <span className="font-medium tabular-nums">
                        {(
                          dash.suppressionMetricsToday.noiseReductionGain * 100
                        ).toFixed(1)}
                        %
                      </span>
                    </span>
                    <span>
                      Confidence:{' '}
                      <span className="font-medium tabular-nums">
                        {(
                          dash.suppressionMetricsToday.confidenceScore * 100
                        ).toFixed(0)}
                        %
                      </span>
                    </span>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {(dash.activeSystemicBursts?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Systemic bursts (24h)
                </CardTitle>
                <CardDescription>
                  Rate-based bursts vs 24h baseline; CRITICAL incidents promoted
                  when thresholds pass
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:px-6">
                <div className="max-h-[280px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Started</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">
                          Duration (min)
                        </TableHead>
                        <TableHead>Conf.</TableHead>
                        <TableHead>Hint</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dash.activeSystemicBursts ?? []).map(b => (
                        <TableRow key={b.burstId}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {b.burstStartTime}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {b.sourceModule}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate font-mono text-xs">
                            {b.eventType}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.eventCount}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {b.durationMinutes.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {typeof b.confidenceScore === 'number'
                              ? `${(b.confidenceScore * 100).toFixed(0)}%`
                              : '—'}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-xs">
                            {b.rootCauseHint}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Manual incident suppression
                </CardTitle>
                <CardDescription>
                  Block new CRITICAL/FATAL incident promotion for a module +
                  signal type (e.g. known outage). Optional incident link logs
                  SUPPRESSION_STARTED on that row.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="space-y-2">
                  <Label className="text-xs">Source module</Label>
                  <Input
                    value={supMod}
                    onChange={e => setSupMod(e.target.value)}
                    className="w-[180px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Signal / event type</Label>
                  <Input
                    value={supEvt}
                    onChange={e => setSupEvt(e.target.value)}
                    className="w-[220px] font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Window (minutes)</Label>
                  <Input
                    value={supWin}
                    onChange={e => setSupWin(e.target.value)}
                    className="w-[100px] tabular-nums"
                  />
                </div>
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label className="text-xs">Reason</Label>
                  <Input
                    value={supReason}
                    onChange={e => setSupReason(e.target.value)}
                    placeholder="Known infrastructure outage"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Incident ID (optional)</Label>
                  <Input
                    value={supIncident}
                    onChange={e => setSupIncident(e.target.value)}
                    className="w-[260px] font-mono text-[11px]"
                    placeholder="uuid…"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void onManualSuppression()}
                >
                  Start suppression
                </Button>
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FlaskConical className="size-4" />
                  Controlled failure simulation
                </CardTitle>
                <CardDescription>
                  Admin-only. Emits structured signal, alert, and incident
                  (CRITICAL / FATAL) for drill and integration tests.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={debugMode} onValueChange={setDebugMode}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEBUG_MODES.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void onDebugTrigger()}
                >
                  Trigger simulated failure
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Active incidents</CardTitle>
                <CardDescription>
                  OPEN items from critical alert promotion and correlation
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:px-6">
                <div className="max-h-[420px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead className="text-right tabular-nums">
                          Related
                        </TableHead>
                        <TableHead className="text-right tabular-nums">
                          Spread (min)
                        </TableHead>
                        <TableHead>Correlation</TableHead>
                        <TableHead>Stability</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dash.activeIncidents.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="text-muted-foreground py-8 text-center"
                          >
                            No open incidents
                          </TableCell>
                        </TableRow>
                      ) : (
                        dash.activeIncidents.map(row => (
                          <TableRow
                            key={row.incidentId}
                            data-state={
                              selectedId === row.incidentId
                                ? 'selected'
                                : undefined
                            }
                            className={
                              selectedId === row.incidentId ? 'bg-muted/60' : ''
                            }
                          >
                            <TableCell className="whitespace-nowrap text-xs">
                              {row.createdAt}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.severity}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.sourceModule}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs">
                              {row.summaryPreview || '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {row.relatedEventCount ?? '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {typeof row.timeSpreadMinutes === 'number'
                                ? row.timeSpreadMinutes.toFixed(1)
                                : '—'}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-xs">
                              {row.aggregationSummary ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.resolutionRecommended ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-600/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                                >
                                  Resolve recommended
                                </Badge>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setSelectedId(
                                    selectedId === row.incidentId
                                      ? null
                                      : row.incidentId
                                  )
                                }
                              >
                                {selectedId === row.incidentId
                                  ? 'Hide'
                                  : 'Details'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Incident detail</CardTitle>
                <CardDescription>
                  Error context, related alert, and resolution workflow
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedId && (
                  <p className="text-muted-foreground text-sm">
                    Select an active incident to inspect context and history.
                  </p>
                )}
                {selectedId && detailLoading && (
                  <Skeleton className="h-40 w-full rounded-md" />
                )}
                {selectedId && !detailLoading && detail && (
                  <>
                    <div className="space-y-1 text-xs">
                      <div className="break-all font-mono text-[11px]">
                        {detail.incidentId}
                      </div>
                      <div className="text-muted-foreground">
                        {detail.status} · {detail.severity} ·{' '}
                        {detail.sourceModule}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Error context (JSON)</Label>
                      <pre className="bg-muted mt-1 max-h-40 overflow-auto rounded-md p-2 text-[11px] leading-snug">
                        {errorContextPretty || '{}'}
                      </pre>
                    </div>
                    {detail.relatedAlert && (
                      <div>
                        <Label className="text-xs">Related alert</Label>
                        <pre className="bg-muted mt-1 max-h-32 overflow-auto rounded-md p-2 text-[11px]">
                          {JSON.stringify(detail.relatedAlert, null, 2)}
                        </pre>
                      </div>
                    )}
                    {(detail.correlatedEventCount != null ||
                      detail.lastCorrelatedAt) && (
                      <div className="bg-background/80 rounded-md border p-3 text-xs">
                        <Label className="text-xs">Amplification</Label>
                        <div className="mt-1 space-y-1">
                          <div>
                            Correlated events (counter):{' '}
                            <span className="font-medium tabular-nums">
                              {detail.correlatedEventCount ?? '—'}
                            </span>
                          </div>
                          {detail.lastCorrelatedAt ? (
                            <div className="text-muted-foreground">
                              Last correlated: {detail.lastCorrelatedAt}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                    {correlTimeline.length > 0 && (
                      <div>
                        <Label className="text-xs">
                          Correlated timeline replay
                        </Label>
                        <ul className="bg-muted/30 mt-2 max-h-40 space-y-1 overflow-auto rounded-md border p-2 text-[11px] leading-snug">
                          {correlTimeline.map((e, idx) => (
                            <li
                              key={`${e.timestamp}-${idx}`}
                              className="border-border/50 flex flex-wrap gap-x-2 border-b py-1 last:border-0"
                            >
                              <span className="text-muted-foreground whitespace-nowrap">
                                {e.timestamp}
                              </span>
                              <span className="font-mono">{e.eventType}</span>
                              <span className="text-muted-foreground tabular-nums">
                                correlates: {e.correlationCount}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {detail.correlation && (
                      <div className="bg-muted/40 rounded-md border p-3">
                        <Label className="text-xs">
                          Correlation intelligence
                        </Label>
                        <div className="mt-2 space-y-1 text-xs">
                          <div className="break-all font-mono text-[11px]">
                            Key: {detail.correlationKey}
                          </div>
                          <div>
                            Cluster size:{' '}
                            <span className="font-medium tabular-nums">
                              {detail.correlation.correlationClusterSize}
                            </span>
                            {' · '}
                            Related in window:{' '}
                            <span className="font-medium tabular-nums">
                              {detail.correlation.relatedEventCount}
                            </span>
                            {' · '}
                            Time spread:{' '}
                            <span className="font-medium tabular-nums">
                              {detail.correlation.timeSpreadMinutes.toFixed(1)}{' '}
                              min
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {detail.correlation.aggregationSummary}
                          </p>
                          {detail.correlation.correlationStreamActive ? (
                            <p className="flex gap-2 rounded border border-amber-200 bg-amber-50/80 px-2 py-1.5 text-amber-900">
                              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                              <span>
                                Correlated alert stream is still active inside
                                the 10-minute window. Manual resolution is
                                blocked until events go quiet, or use automatic
                                recovery to close the incident.
                              </span>
                            </p>
                          ) : (
                            <p className="flex gap-2 rounded border border-green-200 bg-green-50/80 px-2 py-1.5 text-[11px] text-green-800">
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                              Correlation window is quiet — you may resolve once
                              root cause and notes meet policy.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <Separator />
                    <div>
                      <Label>Resolution history</Label>
                      <ul className="mt-2 max-h-36 space-y-2 overflow-auto text-xs">
                        {detail.history.map(h => (
                          <li
                            key={h.historyId}
                            className="border-muted border-l-2 pl-2"
                          >
                            <span className="text-muted-foreground">
                              {h.eventTimestamp}
                            </span>{' '}
                            <Badge variant="secondary" className="ml-1">
                              {h.eventType}
                            </Badge>
                            {h.notes ? (
                              <div className="mt-0.5">{h.notes}</div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {detail.status === 'OPEN' && (
                      <>
                        <div>
                          <Label htmlFor="res-note">Add resolution note</Label>
                          <Textarea
                            id="res-note"
                            className="mt-1 min-h-[72px]"
                            placeholder="Minimum 10 characters — what you changed or verified"
                            value={resolutionNote}
                            onChange={e => setResolutionNote(e.target.value)}
                          />
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="secondary"
                            onClick={() => void onAppendNote()}
                          >
                            Append note
                          </Button>
                        </div>
                        <div>
                          <Label htmlFor="root-cause">
                            Root cause summary (resolve, ≥50 chars)
                          </Label>
                          <Textarea
                            id="root-cause"
                            className="mt-1 min-h-[96px]"
                            placeholder="Document technical root cause before closing"
                            value={rootCauseDraft}
                            onChange={e => setRootCauseDraft(e.target.value)}
                          />
                          <Button
                            className="mt-2"
                            size="sm"
                            onClick={() => void onResolve()}
                          >
                            Resolve incident
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Post-mortem timeline</CardTitle>
              <CardDescription>
                Lifecycle on resolved incidents; OPEN rows include burst,
                suppression, and stabilization transitions (newest first)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:px-6">
              <div className="max-h-[360px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Incident</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Root cause (incident)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dash.postMortemTimeline.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-muted-foreground py-8 text-center"
                        >
                          No timeline rows yet (resolve incidents or generate
                          burst / suppression / stabilization events)
                        </TableCell>
                      </TableRow>
                    ) : (
                      dash.postMortemTimeline.map(row => (
                        <TableRow key={row.historyId}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {row.eventTimestamp}
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            {row.incidentId.slice(0, 8)}…
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="secondary">
                              {row.incidentStatus ?? '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.eventType}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate text-xs">
                            {row.notes || '—'}
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate text-xs">
                            {row.rootCauseSummary || '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resolved incidents</CardTitle>
              <CardDescription>
                Newest first — audit trail summary
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:px-6">
              <div className="max-h-[280px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resolved</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Root cause</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dash.postMortemIncidents.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-muted-foreground py-8 text-center"
                        >
                          No resolved incidents
                        </TableCell>
                      </TableRow>
                    ) : (
                      dash.postMortemIncidents.map(row => (
                        <TableRow key={row.incidentId}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {row.resolvedAt ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.severity}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.sourceModule}
                          </TableCell>
                          <TableCell className="max-w-md truncate text-xs">
                            {row.rootCauseSummary || '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
