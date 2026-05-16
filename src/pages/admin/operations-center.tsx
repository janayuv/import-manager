import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  Download,
  FlaskConical,
  Flame,
  OctagonAlert,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

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
import {
  getPhase3TrendHistory,
  getRuntimeAnomalyReport,
  runAiConsistencyAuditor,
  runSelfHealingRecoveryFlow,
  savePhase3TrendHistory,
} from '@/lib/workflow-observability';
import type {
  AiConsistencyAuditReport,
  Phase3TrendPoint,
  RuntimeAnomalyReport,
} from '@/types/dashboard-metrics';
import { useUser, useHasPermission } from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';

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

function incidentSeveritySummary(dash: OperationsCenterDashboard): string {
  if (dash.openFatal > 0) {
    return `${dash.openFatal} fatal incident${dash.openFatal === 1 ? '' : 's'} open`;
  }
  if (dash.openCritical > 0) {
    return `${dash.openCritical} critical incident${dash.openCritical === 1 ? '' : 's'} open`;
  }
  if (dash.activeIncidentCount > 0) {
    return `${dash.activeIncidentCount} open incident${dash.activeIncidentCount === 1 ? '' : 's'} pending`;
  }
  return 'No open incidents';
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
    <div
      style={{
        marginTop: 12,
        borderTop: '1px solid var(--color-im-rule)',
        paddingTop: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--color-im-text)',
          }}
        >
          Recommended actions:
        </p>
        {banner.actionPriority ? (
          <span
            className="im-badge is-warn"
            style={{ textTransform: 'uppercase', fontSize: 11 }}
          >
            {banner.actionPriority}
          </span>
        ) : null}
      </div>
      <ul
        style={{
          margin: '6px 0 0',
          paddingLeft: 18,
          fontSize: 12.5,
          color: 'var(--color-im-muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
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
  const viewOk = useHasPermission('automation.ops_center');
  const isAdmin = useHasPermission('admin.activity_log');

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
  const [consistencyAudit, setConsistencyAudit] =
    useState<AiConsistencyAuditReport | null>(null);
  const [anomalyReport, setAnomalyReport] =
    useState<RuntimeAnomalyReport | null>(null);
  const [phase3Loading, setPhase3Loading] = useState(false);
  const [selfHealingBusy, setSelfHealingBusy] = useState(false);
  const [phase3Trend, setPhase3Trend] = useState<Phase3TrendPoint[]>([]);

  const activeIncidentsAnchorRef = useRef<HTMLDivElement | null>(null);

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

  const loadPhase3Safety = useCallback(async () => {
    setPhase3Loading(true);
    try {
      const [audit, anomaly] = await Promise.all([
        runAiConsistencyAuditor(),
        getRuntimeAnomalyReport(),
      ]);
      setConsistencyAudit(audit);
      setAnomalyReport(anomaly);
      setPhase3Trend(prev => {
        const next = [
          ...prev,
          {
            ts: new Date().toISOString(),
            anomalyScore: anomaly.anomalyScore,
            severity: anomaly.severity,
          },
        ];
        return next.slice(-12);
      });
    } catch (e) {
      toast.error(
        `Phase 3 safety load failed: ${e instanceof Error ? e.message : String(e)}`
      );
      setConsistencyAudit(null);
      setAnomalyReport(null);
    } finally {
      setPhase3Loading(false);
    }
  }, []);

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
    if (!viewOk) return;
    void loadPhase3Safety();
  }, [viewOk, loadPhase3Safety]);

  useEffect(() => {
    if (!viewOk) return;
    void (async () => {
      try {
        const rows = await getPhase3TrendHistory();
        setPhase3Trend(Array.isArray(rows) ? rows.slice(-12) : []);
      } catch {
        setPhase3Trend([]);
      }
    })();
  }, [viewOk]);

  useEffect(() => {
    if (!viewOk) return;
    void savePhase3TrendHistory(phase3Trend).catch(() => {
      // Non-blocking persistence for local trend UX.
    });
  }, [phase3Trend, viewOk]);

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
      await loadPhase3Safety();
      toast.success('Incident metrics refreshed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onRunSelfHealing = async () => {
    setSelfHealingBusy(true);
    try {
      const out = await runSelfHealingRecoveryFlow();
      toast.message('Self-healing flow completed', {
        description: `${out.message} (before=${out.anomalyScoreBefore}, after=${out.anomalyScoreAfter})`,
      });
      await loadPhase3Safety();
      await loadDash();
      setPhase3Trend(prev => {
        const next = [...prev];
        if (next.length > 0) {
          next[next.length - 1] = {
            ...next[next.length - 1],
            healed: out.healed,
          };
        }
        return next.slice(-12);
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSelfHealingBusy(false);
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
    const pendingResolutionNote = resolutionNote.trim();
    if (pendingResolutionNote.length > 0 && pendingResolutionNote.length < 10) {
      toast.error('Resolution note must be at least 10 characters');
      return;
    }
    try {
      // Auto-persist a typed note before resolving so users do not need to
      // click "Append note" as a separate mandatory step.
      if (pendingResolutionNote.length >= 10) {
        await appendWorkflowIncidentResolutionNote(
          selectedId,
          pendingResolutionNote,
          role || 'Admin'
        );
      }
      await resolveWorkflowIncident(selectedId, s, role || 'Admin');
      setResolutionNote('');
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

  const copyToClipboard = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
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
    <div className="im-page">
      <AppBar
        crumbs={['Import Manager', 'Administration', 'Operations Center']}
      />
      <div className="im-dashboard-body space-y-6">
        <div
          style={{
            padding: '14px 24px 12px',
            borderBottom: '1px solid var(--color-im-rule)',
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-im-text)',
                fontFamily: 'var(--font-im-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
            >
              Operations Center
            </h1>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: 11.5,
                color: 'var(--color-im-faint)',
              }}
            >
              Single-operator incident lifecycle: detection, diagnosis,
              resolution, and post-mortem audit trail.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              className="im-btn im-btn--sm"
              onClick={() => {
                void loadDash();
                void loadPhase3Safety();
              }}
            >
              <RefreshCw
                style={{
                  display: 'inline',
                  width: 14,
                  height: 14,
                  marginRight: 4,
                }}
              />
              Refresh
            </button>
            <button
              className="im-btn im-btn--sm"
              onClick={() => void onRefreshMetrics()}
            >
              <Activity
                style={{
                  display: 'inline',
                  width: 14,
                  height: 14,
                  marginRight: 4,
                }}
              />
              Sync metrics
            </button>
            <button
              className="im-btn im-btn--sm"
              onClick={() => void onScanBursts()}
            >
              <ShieldAlert
                style={{
                  display: 'inline',
                  width: 14,
                  height: 14,
                  marginRight: 4,
                }}
              />
              Scan bursts
            </button>
            <button
              className="im-btn im-btn--sm"
              onClick={() => void onExport()}
            >
              <Download
                style={{
                  display: 'inline',
                  width: 14,
                  height: 14,
                  marginRight: 4,
                }}
              />
              Export CSV
            </button>
          </div>
        </div>

        {isAdmin ? (
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Platform maintenance</span>
              <span className="im-section__sub">
                Snapshot rebuild, diagnostics export, and health — centralized
                entry points for admins.
              </span>
            </div>
            <div
              className="im-section__body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Link to="/admin/system-tools" className="im-btn im-btn--sm">
                  <Wrench
                    style={{
                      display: 'inline',
                      width: 14,
                      height: 14,
                      marginRight: 4,
                    }}
                  />
                  System tools
                </Link>
                <Link to="/admin/system-health" className="im-btn im-btn--sm">
                  System health
                </Link>
                <Link
                  to="/admin/automation-center"
                  className="im-btn im-btn--sm"
                >
                  Automation center
                </Link>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: 'var(--color-im-faint)',
                }}
              >
                Diagnostics bundle: Help → Export diagnostics (audit
                permission). Rebuilds and exports are recorded in User activity
                with correlation IDs.
              </p>
            </div>
          </div>
        ) : null}

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Phase 3 production safety (single-user)
            </span>
            <span className="im-section__sub">
              AI consistency auditor, runtime anomaly score, and deterministic
              self-healing recovery.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {phase3Loading ? (
              <div
                style={{
                  height: 96,
                  background: 'var(--color-im-rule)',
                  borderRadius: 4,
                  opacity: 0.5,
                }}
              />
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      border: '1px solid var(--color-im-rule)',
                      borderRadius: 4,
                      padding: 12,
                      fontSize: 12.5,
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>AI consistency</span>
                      <span
                        className={
                          (consistencyAudit?.checksFailed ?? 0) > 0
                            ? 'im-status-pill is-inactive'
                            : 'im-status-pill is-neutral'
                        }
                      >
                        {consistencyAudit?.checksFailed ?? 0} failed
                      </span>
                    </div>
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        fontSize: 11.5,
                        margin: 0,
                      }}
                    >
                      {consistencyAudit?.summary ?? 'No data yet'}
                    </p>
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        fontSize: 11.5,
                        marginTop: 4,
                        marginBottom: 0,
                      }}
                    >
                      Checks run: {consistencyAudit?.checksRun ?? 0} · Trace
                      violations (7d):{' '}
                      {consistencyAudit?.rootCauseTraceViolations7d ?? 0}
                    </p>
                  </div>
                  <div
                    style={{
                      border: '1px solid var(--color-im-rule)',
                      borderRadius: 4,
                      padding: 12,
                      fontSize: 12.5,
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>Runtime anomaly</span>
                      <span className="im-status-pill is-neutral">
                        {anomalyReport?.severity?.toUpperCase() ?? 'UNKNOWN'}
                      </span>
                    </div>
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        fontSize: 11.5,
                        margin: 0,
                      }}
                    >
                      Score: {anomalyReport?.anomalyScore ?? 0} · Failed jobs
                      1h: {anomalyReport?.failedJobs1h ?? 0} · Timeouts 1h:{' '}
                      {anomalyReport?.timeoutJobs1h ?? 0}
                    </p>
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        fontSize: 11.5,
                        marginTop: 4,
                        marginBottom: 0,
                      }}
                    >
                      Stuck recovery ops:{' '}
                      {anomalyReport?.recoveryJournalStuck ?? 0} · Integrity
                      issues 24h: {anomalyReport?.integrityIssues24h ?? 0}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    className="im-btn im-btn--sm"
                    onClick={() => void loadPhase3Safety()}
                    disabled={phase3Loading || selfHealingBusy}
                  >
                    <RefreshCw
                      style={{
                        display: 'inline',
                        width: 14,
                        height: 14,
                        marginRight: 4,
                      }}
                    />
                    Refresh safety checks
                  </button>
                  <button
                    className="im-btn im-btn--sm"
                    onClick={() => void onRunSelfHealing()}
                    disabled={phase3Loading || selfHealingBusy}
                  >
                    <Wrench
                      style={{
                        display: 'inline',
                        width: 14,
                        height: 14,
                        marginRight: 4,
                      }}
                    />
                    {selfHealingBusy
                      ? 'Running self-heal...'
                      : 'Run self-healing'}
                  </button>
                </div>
                <div
                  style={{
                    border: '1px solid var(--color-im-rule)',
                    borderRadius: 4,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                      Safety trend (recent)
                    </span>
                    <span
                      style={{ color: 'var(--color-im-muted)', fontSize: 11.5 }}
                    >
                      last {phase3Trend.length || 0} samples
                    </span>
                  </div>
                  {phase3Trend.length === 0 ? (
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        fontSize: 11.5,
                        margin: 0,
                      }}
                    >
                      No samples yet. Refresh safety checks to start collecting.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
                      >
                        {phase3Trend.map((p, idx) => (
                          <div
                            key={`${p.ts}-${idx}`}
                            title={`${new Date(p.ts).toLocaleTimeString()} | score=${p.anomalyScore} | ${p.severity}${p.healed != null ? ` | healed=${p.healed}` : ''}`}
                            className={`h-8 min-w-[22px] rounded border px-1 text-center text-[10px] tabular-nums leading-7 ${
                              p.anomalyScore >= 20
                                ? 'border-red-300 bg-red-50 text-red-900'
                                : p.anomalyScore >= 10
                                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                                  : p.anomalyScore >= 5
                                    ? 'border-yellow-300 bg-yellow-50 text-yellow-900'
                                    : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                            }`}
                          >
                            {p.anomalyScore}
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 12,
                          color: 'var(--color-im-muted)',
                          fontSize: 11,
                        }}
                      >
                        <span>
                          High/critical:{' '}
                          {phase3Trend.filter(p => p.anomalyScore >= 10).length}
                        </span>
                        <span>
                          Self-heal improved:{' '}
                          {phase3Trend.filter(p => p.healed === true).length}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 96,
                  background: 'var(--color-im-rule)',
                  borderRadius: 4,
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            className="im-section"
            style={{ borderColor: 'var(--color-im-bad)' }}
          >
            <div className="im-section__header">
              <span
                className="im-section__label"
                style={{ color: 'var(--color-im-bad)' }}
              >
                <ShieldAlert
                  style={{
                    display: 'inline',
                    width: 14,
                    height: 14,
                    marginRight: 4,
                  }}
                />
                // Failed to load dashboard
              </span>
            </div>
            <div
              className="im-section__body"
              style={{ fontSize: 12.5, color: 'var(--color-im-muted)' }}
            >
              {error}
            </div>
          </div>
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
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="im-btn im-btn--primary im-btn--sm"
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
                </button>
                <button
                  type="button"
                  className="im-btn im-btn--sm"
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
                </button>
                <button
                  type="button"
                  className="im-btn im-btn--sm"
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
                </button>
              </div>
            ) : null}
          </div>
        )}

        {dash && !loading && recentSystemicBursts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                <div
                  key={b.burstId}
                  className="im-section"
                  style={{ borderColor: 'var(--color-im-accent)' }}
                >
                  <div className="im-section__header">
                    <span className="im-section__label">
                      <AlertTriangle
                        style={{
                          display: 'inline',
                          width: 13,
                          height: 13,
                          marginRight: 4,
                        }}
                      />
                      // Burst detected
                    </span>
                    <span className="im-section__sub">
                      Module:{' '}
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {b.sourceModule}
                      </span>
                      {' · '}Events: <strong>{b.eventCount}</strong>
                      {' · '}Duration: {durMin.toFixed(1)} min
                      {' · '}Severity: <strong>{b.severity}</strong>
                      {classification ? (
                        <>
                          {' · '}Class:{' '}
                          <span
                            style={{ fontFamily: 'monospace', fontSize: 11 }}
                          >
                            {classification}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <div className="im-section__body" style={{ fontSize: 12.5 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      Hint: {b.rootCauseHint}
                    </p>
                    {conf != null ? (
                      <p
                        style={{
                          margin: '4px 0 0',
                          color: 'var(--color-im-muted)',
                          fontSize: 11.5,
                        }}
                      >
                        Confidence: {(conf * 100).toFixed(0)}%
                      </p>
                    ) : null}
                    <p
                      style={{
                        margin: '8px 0 0',
                        color: 'var(--color-im-muted)',
                        fontSize: 11.5,
                      }}
                    >
                      Baseline rate ~{b.baselineRate.toFixed(3)} / 10m vs
                      current rate {b.currentRate.toFixed(1)} / 10m
                      {' · '}Event:{' '}
                      <span style={{ fontFamily: 'monospace' }}>
                        {b.eventType}
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {dash && !loading && (dash.activeSuppressions?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(dash.activeSuppressions ?? []).map(s => (
              <div
                key={s.suppressionId}
                className="im-section"
                style={{ borderColor: 'var(--color-im-good)' }}
              >
                <div className="im-section__header">
                  <span className="im-section__label">
                    <ShieldAlert
                      style={{
                        display: 'inline',
                        width: 13,
                        height: 13,
                        marginRight: 4,
                      }}
                    />
                    // Incident suppression active
                  </span>
                  <span className="im-section__sub">
                    Module:{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {s.sourceModule}
                    </span>
                    {' · '}Signal:{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {s.eventType}
                    </span>
                    {' · '}Suppressed: <strong>{s.suppressedEventCount}</strong>{' '}
                    events
                    {' · '}Window: {s.windowMinutes.toFixed(0)} min
                    {' · '}Confidence: {(s.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  className="im-section__body"
                  style={{ fontSize: 11.5, color: 'var(--color-im-muted)' }}
                >
                  <p style={{ margin: 0 }}>{s.reason}</p>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontFamily: 'monospace',
                      fontSize: 11,
                    }}
                  >
                    Until {s.suppressionEnd} (UTC)
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {dash && !loading && (dash.stabilizationSignals?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(dash.stabilizationSignals ?? []).map(sig => {
              const confirmed =
                sig.phase === 'confirmed' || sig.tone === 'green';
              return (
                <div
                  key={sig.stabilizationId}
                  className="im-section"
                  style={{
                    borderColor: confirmed
                      ? 'var(--color-im-good)'
                      : 'var(--color-im-accent)',
                  }}
                >
                  <div className="im-section__header">
                    <span className="im-section__label">
                      {confirmed ? (
                        <CheckCircle2
                          style={{
                            display: 'inline',
                            width: 13,
                            height: 13,
                            marginRight: 4,
                          }}
                        />
                      ) : (
                        <Activity
                          style={{
                            display: 'inline',
                            width: 13,
                            height: 13,
                            marginRight: 4,
                          }}
                        />
                      )}
                      //{' '}
                      {confirmed ? 'System stabilized' : 'System stabilizing'}
                    </span>
                    <span className="im-section__sub">
                      Module:{' '}
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {sig.sourceModule}
                      </span>
                      {' · '}Signal:{' '}
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {sig.eventType}
                      </span>
                      {' · '}Quiet time:{' '}
                      <strong>{sig.quietMinutes.toFixed(0)}</strong> min
                      {' · '}Confidence: {sig.confidenceScore.toFixed(2)}
                      {confirmed && sig.stabilityDurationMinutes > 0 ? (
                        <>
                          {' · '}Stability window:{' '}
                          {sig.stabilityDurationMinutes} min
                        </>
                      ) : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {dash && !loading && (dash.regressionSignals?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(dash.regressionSignals ?? []).map(r => {
              const src = r.triggerSource ?? 'alert';
              const isStructured = src === 'structured_log';
              return (
                <div
                  key={r.regressionId}
                  className="im-section"
                  style={{ borderColor: 'var(--color-im-bad)' }}
                >
                  <div className="im-section__header">
                    <span className="im-section__label">
                      <OctagonAlert
                        style={{
                          display: 'inline',
                          width: 13,
                          height: 13,
                          marginRight: 4,
                          color: 'var(--color-im-bad)',
                        }}
                      />
                      // Regression detected
                    </span>
                    <span
                      className="im-section__sub"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span
                        className="im-badge is-neutral"
                        style={{ fontSize: 11 }}
                      >
                        {isStructured ? (
                          <>
                            <Settings2
                              style={{
                                display: 'inline',
                                width: 11,
                                height: 11,
                                marginRight: 3,
                              }}
                            />
                            Structured event
                          </>
                        ) : (
                          <>
                            <Bell
                              style={{
                                display: 'inline',
                                width: 11,
                                height: 11,
                                marginRight: 3,
                              }}
                            />
                            Alert event
                          </>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        Trigger source: {isStructured ? 'STRUCTURED' : 'ALERT'}
                      </span>
                      <span>
                        Module:{' '}
                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {r.sourceModule}
                        </span>
                        {' · '}Event:{' '}
                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {r.eventType}
                        </span>
                        {' · '}Time since stabilization:{' '}
                        <strong>{r.timeSinceStabilizationMinutes}</strong> min
                        {' · '}Confidence: {r.confidenceScore.toFixed(2)}
                        {' · '}
                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {r.regressionDetectedAt}
                        </span>
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {dash && !loading && (dash.persistenceSignals?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(dash.persistenceSignals ?? []).map(p => (
              <div
                key={p.persistenceId}
                className="im-section"
                style={{ borderColor: 'var(--color-im-accent)' }}
              >
                <div className="im-section__header">
                  <span className="im-section__label">
                    <Flame
                      style={{
                        display: 'inline',
                        width: 13,
                        height: 13,
                        marginRight: 4,
                      }}
                    />
                    // Persistent failure detected
                  </span>
                  <span className="im-section__sub">
                    Module:{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {p.sourceModule}
                    </span>
                    {' · '}Event:{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {p.eventType}
                    </span>
                    {' · '}Failure rate:{' '}
                    <strong>{p.failureRate.toFixed(3)}</strong>/min
                    {' · '}Expected: {p.expectedRate.toFixed(3)}/min
                    {' · '}Confidence: {p.confidenceScore.toFixed(2)}
                    {' · '}
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {p.persistenceDetectedAt}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {dash && !loading && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
              }}
            >
              <div
                className="im-section"
                style={{
                  border: `1px solid ${dash.healthStatus === 'green' ? 'var(--color-im-good)' : dash.healthStatus === 'amber' ? 'var(--color-im-accent)' : 'var(--color-im-bad)'}`,
                }}
              >
                <div className="im-section__header">
                  <span className="im-section__label">
                    {dash.healthStatus === 'green' ? (
                      <CheckCircle2
                        style={{
                          display: 'inline',
                          width: 13,
                          height: 13,
                          marginRight: 4,
                        }}
                      />
                    ) : (
                      <AlertTriangle
                        style={{
                          display: 'inline',
                          width: 13,
                          height: 13,
                          marginRight: 4,
                        }}
                      />
                    )}
                    // Incident health
                  </span>
                  <span className="im-section__sub">
                    {healthLabel(dash.healthStatus)}
                  </span>
                </div>
                <div
                  className="im-section__body"
                  style={{
                    fontSize: 12.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px 16px',
                    }}
                  >
                    <span>Open: {dash.activeIncidentCount}</span>
                    <span>Critical: {dash.openCritical}</span>
                    <span>Fatal: {dash.openFatal}</span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11.5,
                      color: 'var(--color-im-muted)',
                    }}
                  >
                    {incidentSeveritySummary(dash)}. See{' '}
                    <Link
                      to="/admin/system-health"
                      style={{ color: 'var(--color-im-accent)' }}
                    >
                      System health
                    </Link>
                    .
                  </p>
                  <div>
                    <button
                      className="im-btn im-btn--sm"
                      type="button"
                      onClick={() => {
                        activeIncidentsAnchorRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }}
                      disabled={!dash.activeIncidentCount}
                      style={{ width: '100%' }}
                    >
                      Jump to active incidents
                    </button>
                  </div>
                </div>
              </div>
              <div className="im-section">
                <div className="im-section__header">
                  <span className="im-section__label">// Recovery (30d)</span>
                  <span className="im-section__sub">
                    Automatic recovery success ratio
                  </span>
                </div>
                <div className="im-section__body">
                  <p style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
                    {(dash.recoverySuccessRate30d * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="im-section">
                <div className="im-section__header">
                  <span className="im-section__label">
                    // Reliability score
                  </span>
                  <span className="im-section__sub">
                    Platform reliability index
                  </span>
                </div>
                <div className="im-section__body">
                  <p style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
                    {(dash.systemReliabilityScore * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="im-section">
                <div className="im-section__header">
                  <span className="im-section__label">// Today (metrics)</span>
                  <span className="im-section__sub">
                    Rolled incident counters
                  </span>
                </div>
                <div
                  className="im-section__body"
                  style={{
                    fontSize: 12.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
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
                    <span style={{ color: 'var(--color-im-muted)' }}>
                      No row for today yet
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">
                  // Incident correlation
                </span>
                <span className="im-section__sub">
                  Alerts merged into existing OPEN incidents (same module,
                  signal, entity, 10-minute sliding window)
                </span>
              </div>
              <div
                className="im-section__body"
                style={{
                  fontSize: 12.5,
                  color: 'var(--color-im-muted)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px 32px',
                }}
              >
                {dash.correlationMetricsToday ? (
                  <>
                    <div>
                      <span
                        style={{
                          color: 'var(--color-im-text)',
                          fontWeight: 500,
                        }}
                      >
                        {dash.correlationMetricsToday.alertsGrouped}
                      </span>{' '}
                      alerts grouped
                    </div>
                    <div>
                      <span
                        style={{
                          color: 'var(--color-im-text)',
                          fontWeight: 500,
                        }}
                      >
                        {dash.correlationMetricsToday.incidentsCreated}
                      </span>{' '}
                      incidents created
                    </div>
                    <div>
                      Noise reduction:{' '}
                      <span
                        style={{
                          color: 'var(--color-im-text)',
                          fontWeight: 500,
                        }}
                      >
                        {(
                          dash.correlationMetricsToday.noiseReductionRatio * 100
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                    <div>
                      Burst signals:{' '}
                      <span
                        style={{
                          color: 'var(--color-im-text)',
                          fontWeight: 500,
                        }}
                      >
                        {dash.correlationMetricsToday.burstSignalsEmitted}
                      </span>
                    </div>
                    <div>
                      Systemic bursts logged:{' '}
                      <span
                        style={{
                          color: 'var(--color-im-text)',
                          fontWeight: 500,
                        }}
                      >
                        {dash.correlationMetricsToday.burstsDetected ?? 0}
                      </span>
                    </div>
                  </>
                ) : (
                  <span>No correlation KPI row for today yet</span>
                )}
                {dash.incidentNoiseScoreToday ? (
                  <div
                    style={{
                      width: '100%',
                      borderTop: '1px solid var(--color-im-rule)',
                      paddingTop: 8,
                      marginTop: 4,
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                    >
                      Correlation efficiency (noise score)
                    </span>
                    :{' '}
                    <span>
                      {(dash.incidentNoiseScoreToday.noiseScore * 100).toFixed(
                        1
                      )}
                      %
                    </span>
                    <span>
                      {' '}
                      (grouped {dash.incidentNoiseScoreToday.alertsGrouped} /
                      alerts {dash.incidentNoiseScoreToday.totalAlerts})
                    </span>
                  </div>
                ) : null}
                {dash.suppressionMetricsToday ? (
                  <div
                    style={{
                      width: '100%',
                      borderTop: '1px solid var(--color-im-rule)',
                      paddingTop: 8,
                      marginTop: 4,
                      fontSize: 11.5,
                    }}
                  >
                    <div
                      style={{
                        color: 'var(--color-im-text)',
                        fontWeight: 500,
                        marginBottom: 4,
                      }}
                    >
                      Suppression (today)
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px 16px',
                      }}
                    >
                      <span>
                        Alerts suppressed:{' '}
                        <span style={{ fontWeight: 500 }}>
                          {dash.suppressionMetricsToday.alertsSuppressed}
                        </span>
                      </span>
                      <span>
                        Windows:{' '}
                        <span style={{ fontWeight: 500 }}>
                          {dash.suppressionMetricsToday.suppressionWindows}
                        </span>
                      </span>
                      <span>
                        Noise gain:{' '}
                        <span style={{ fontWeight: 500 }}>
                          {(
                            dash.suppressionMetricsToday.noiseReductionGain *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </span>
                      <span>
                        Confidence:{' '}
                        <span style={{ fontWeight: 500 }}>
                          {(
                            dash.suppressionMetricsToday.confidenceScore * 100
                          ).toFixed(0)}
                          %
                        </span>
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {(dash.activeSystemicBursts?.length ?? 0) > 0 && (
              <div className="im-section">
                <div className="im-section__header">
                  <span className="im-section__label">
                    // Systemic bursts (24h)
                  </span>
                  <span className="im-section__sub">
                    Rate-based bursts vs 24h baseline; CRITICAL incidents
                    promoted when thresholds pass
                  </span>
                </div>
                <div
                  className="im-section__body"
                  style={{ padding: 0, maxHeight: 280, overflow: 'auto' }}
                >
                  <div className="im-table-scroll">
                    <table className="im-table">
                      <thead>
                        <tr>
                          <th className="im-th">Started</th>
                          <th className="im-th">Module</th>
                          <th className="im-th">Event</th>
                          <th className="im-th" style={{ textAlign: 'right' }}>
                            Count
                          </th>
                          <th className="im-th" style={{ textAlign: 'right' }}>
                            Duration (min)
                          </th>
                          <th className="im-th">Conf.</th>
                          <th className="im-th">Hint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dash.activeSystemicBursts ?? []).map((b, i) => (
                          <tr
                            key={b.burstId}
                            className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                          >
                            <td
                              className="im-td"
                              style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}
                            >
                              {b.burstStartTime}
                            </td>
                            <td
                              className="im-td"
                              style={{
                                fontFamily:
                                  'Consolas, "Courier New", monospace',
                                fontSize: 11.5,
                              }}
                            >
                              {b.sourceModule}
                            </td>
                            <td
                              className="im-td"
                              style={{
                                maxWidth: 140,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily:
                                  'Consolas, "Courier New", monospace',
                                fontSize: 11.5,
                              }}
                            >
                              {b.eventType}
                            </td>
                            <td
                              className="im-td"
                              style={{ textAlign: 'right' }}
                            >
                              {b.eventCount}
                            </td>
                            <td
                              className="im-td"
                              style={{ textAlign: 'right', fontSize: 11.5 }}
                            >
                              {b.durationMinutes.toFixed(1)}
                            </td>
                            <td
                              className="im-td"
                              style={{ textAlign: 'right', fontSize: 11.5 }}
                            >
                              {typeof b.confidenceScore === 'number'
                                ? `${(b.confidenceScore * 100).toFixed(0)}%`
                                : '—'}
                            </td>
                            <td
                              className="im-td"
                              style={{ maxWidth: 280, fontSize: 11.5 }}
                            >
                              {b.rootCauseHint}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="im-section">
                <div className="im-section__header">
                  <span className="im-section__label">
                    // Manual incident suppression
                  </span>
                  <span className="im-section__sub">
                    Block new CRITICAL/FATAL incident promotion for a module +
                    signal type (e.g. known outage). Optional incident link logs
                    SUPPRESSION_STARTED on that row.
                  </span>
                </div>
                <div
                  className="im-section__body"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">Source module</label>
                    <input
                      className="im-input"
                      value={supMod}
                      onChange={e => setSupMod(e.target.value)}
                      style={{ width: 180 }}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">
                      Signal / event type
                    </label>
                    <input
                      className="im-input"
                      value={supEvt}
                      onChange={e => setSupEvt(e.target.value)}
                      style={{
                        width: 220,
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: 11.5,
                      }}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">Window (minutes)</label>
                    <input
                      className="im-input"
                      value={supWin}
                      onChange={e => setSupWin(e.target.value)}
                      style={{ width: 100 }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      flex: '1 1 200px',
                    }}
                  >
                    <label className="im-field-label">Reason</label>
                    <input
                      className="im-input"
                      value={supReason}
                      onChange={e => setSupReason(e.target.value)}
                      placeholder="Known infrastructure outage"
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">
                      Incident ID (optional)
                    </label>
                    <input
                      className="im-input"
                      value={supIncident}
                      onChange={e => setSupIncident(e.target.value)}
                      style={{
                        width: 260,
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: 11,
                      }}
                      placeholder="uuid…"
                    />
                  </div>
                  <button
                    className="im-btn im-btn--sm"
                    onClick={() => void onManualSuppression()}
                  >
                    Start suppression
                  </button>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="im-section">
                <div className="im-section__header">
                  <span className="im-section__label">
                    <FlaskConical
                      style={{
                        display: 'inline',
                        width: 13,
                        height: 13,
                        marginRight: 4,
                      }}
                    />
                    // Controlled failure simulation
                  </span>
                  <span className="im-section__sub">
                    Admin-only. Emits structured signal, alert, and incident
                    (CRITICAL / FATAL) for drill and integration tests.
                  </span>
                </div>
                <div
                  className="im-section__body"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">Mode</label>
                    <div className="im-select-wrap" style={{ width: 220 }}>
                      <select
                        className="im-select"
                        value={debugMode}
                        onChange={e => setDebugMode(e.target.value)}
                      >
                        {DEBUG_MODES.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    className="im-btn im-btn--sm"
                    onClick={() => void onDebugTrigger()}
                  >
                    Trigger simulated failure
                  </button>
                </div>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '3fr 2fr',
                gap: 16,
              }}
            >
              <div>
                <div ref={activeIncidentsAnchorRef} />
                <div className="im-section">
                  <div className="im-section__header">
                    <span className="im-section__label">
                      // Active incidents
                    </span>
                    <span className="im-section__sub">
                      OPEN items from critical alert promotion and correlation
                    </span>
                  </div>
                  <div
                    className="im-section__body"
                    style={{ padding: 0, maxHeight: 420, overflow: 'auto' }}
                  >
                    <div className="im-table-scroll">
                      <table className="im-table">
                        <thead>
                          <tr>
                            <th className="im-th">Created</th>
                            <th className="im-th">Severity</th>
                            <th className="im-th">Module</th>
                            <th className="im-th">Summary</th>
                            <th
                              className="im-th"
                              style={{ textAlign: 'right' }}
                            >
                              Related
                            </th>
                            <th
                              className="im-th"
                              style={{ textAlign: 'right' }}
                            >
                              Spread (min)
                            </th>
                            <th className="im-th">Correlation</th>
                            <th className="im-th">Stability</th>
                            <th
                              className="im-th"
                              style={{ textAlign: 'right' }}
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dash.activeIncidents.length === 0 ? (
                            <tr className="im-tr">
                              <td
                                className="im-td"
                                colSpan={9}
                                style={{
                                  textAlign: 'center',
                                  color: 'var(--color-im-muted)',
                                  padding: 32,
                                }}
                              >
                                No open incidents
                              </td>
                            </tr>
                          ) : (
                            dash.activeIncidents.map((row, i) => (
                              <tr
                                key={row.incidentId}
                                className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}${selectedId === row.incidentId ? 'is-selected' : ''}`}
                              >
                                <td
                                  className="im-td"
                                  style={{
                                    whiteSpace: 'nowrap',
                                    fontSize: 11.5,
                                  }}
                                >
                                  {row.createdAt}
                                </td>
                                <td className="im-td">
                                  <span className="im-badge is-neutral">
                                    {row.severity}
                                  </span>
                                </td>
                                <td
                                  className="im-td"
                                  style={{
                                    fontFamily:
                                      'Consolas, "Courier New", monospace',
                                    fontSize: 11.5,
                                  }}
                                >
                                  {row.sourceModule}
                                </td>
                                <td
                                  className="im-td"
                                  style={{
                                    maxWidth: 200,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontSize: 11.5,
                                  }}
                                >
                                  {row.summaryPreview || '—'}
                                </td>
                                <td
                                  className="im-td"
                                  style={{ textAlign: 'right', fontSize: 11.5 }}
                                >
                                  {row.relatedEventCount ?? '—'}
                                </td>
                                <td
                                  className="im-td"
                                  style={{ textAlign: 'right', fontSize: 11.5 }}
                                >
                                  {typeof row.timeSpreadMinutes === 'number'
                                    ? row.timeSpreadMinutes.toFixed(1)
                                    : '—'}
                                </td>
                                <td
                                  className="im-td"
                                  style={{
                                    maxWidth: 220,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontSize: 11.5,
                                  }}
                                >
                                  {row.aggregationSummary ?? '—'}
                                </td>
                                <td
                                  className="im-td"
                                  style={{ fontSize: 11.5 }}
                                >
                                  {row.resolutionRecommended ? (
                                    <span className="im-status-pill is-active">
                                      RESOLVE REC.
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td
                                  className="im-td"
                                  style={{ textAlign: 'right' }}
                                >
                                  <button
                                    className="im-btn im-btn--sm"
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
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div className="im-section">
                <div className="im-section__header">
                  <span className="im-section__label">// Incident detail</span>
                  <span className="im-section__sub">
                    Error context, related alert, and resolution workflow
                  </span>
                </div>
                <div
                  className="im-section__body"
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  {!selectedId && (
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        fontSize: 12.5,
                        margin: 0,
                      }}
                    >
                      Select an active incident to inspect context and history.
                    </p>
                  )}
                  {selectedId && detailLoading && (
                    <div
                      style={{
                        height: 160,
                        background: 'var(--color-im-rule)',
                        borderRadius: 4,
                        opacity: 0.5,
                      }}
                    />
                  )}
                  {selectedId && !detailLoading && detail && (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          fontSize: 11.5,
                        }}
                      >
                        <div
                          style={{
                            wordBreak: 'break-all',
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11,
                          }}
                        >
                          {detail.incidentId}
                        </div>
                        <div style={{ color: 'var(--color-im-muted)' }}>
                          {detail.status} · {detail.severity} ·{' '}
                          {detail.sourceModule}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <label className="im-field-label">
                            Error context (JSON)
                          </label>
                          <button
                            className="im-btn im-btn--sm"
                            type="button"
                            onClick={() =>
                              void copyToClipboard(
                                'Error context',
                                errorContextPretty || '{}'
                              )
                            }
                          >
                            <Copy
                              style={{
                                display: 'inline',
                                width: 12,
                                height: 12,
                                marginRight: 4,
                              }}
                            />
                            Copy
                          </button>
                        </div>
                        <pre
                          style={{
                            background: 'var(--color-im-panel)',
                            border: '1px solid var(--color-im-rule)',
                            borderRadius: 4,
                            padding: 8,
                            fontSize: 11,
                            maxHeight: 160,
                            overflow: 'auto',
                            margin: 0,
                          }}
                        >
                          {errorContextPretty || '{}'}
                        </pre>
                      </div>
                      {detail.relatedAlert && (
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              marginBottom: 4,
                            }}
                          >
                            <label className="im-field-label">
                              Related alert
                            </label>
                            <button
                              className="im-btn im-btn--sm"
                              type="button"
                              onClick={() =>
                                void copyToClipboard(
                                  'Related alert',
                                  JSON.stringify(detail.relatedAlert, null, 2)
                                )
                              }
                            >
                              <Copy
                                style={{
                                  display: 'inline',
                                  width: 12,
                                  height: 12,
                                  marginRight: 4,
                                }}
                              />
                              Copy
                            </button>
                          </div>
                          <pre
                            style={{
                              background: 'var(--color-im-panel)',
                              border: '1px solid var(--color-im-rule)',
                              borderRadius: 4,
                              padding: 8,
                              fontSize: 11,
                              maxHeight: 128,
                              overflow: 'auto',
                              margin: 0,
                            }}
                          >
                            {JSON.stringify(detail.relatedAlert, null, 2)}
                          </pre>
                        </div>
                      )}
                      {(detail.correlatedEventCount != null ||
                        detail.lastCorrelatedAt) && (
                        <div
                          style={{
                            border: '1px solid var(--color-im-rule)',
                            borderRadius: 4,
                            padding: '8px 12px',
                            fontSize: 11.5,
                          }}
                        >
                          <label className="im-field-label">
                            Amplification
                          </label>
                          <div
                            style={{
                              marginTop: 4,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                          >
                            <div>
                              Correlated events (counter):{' '}
                              <span style={{ fontWeight: 500 }}>
                                {detail.correlatedEventCount ?? '—'}
                              </span>
                            </div>
                            {detail.lastCorrelatedAt ? (
                              <div style={{ color: 'var(--color-im-muted)' }}>
                                Last correlated: {detail.lastCorrelatedAt}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                      {correlTimeline.length > 0 && (
                        <div>
                          <label className="im-field-label">
                            Correlated timeline replay
                          </label>
                          <ul
                            style={{
                              background: 'var(--color-im-panel)',
                              border: '1px solid var(--color-im-rule)',
                              borderRadius: 4,
                              padding: 8,
                              marginTop: 4,
                              maxHeight: 160,
                              overflow: 'auto',
                              fontSize: 11,
                              listStyle: 'none',
                            }}
                          >
                            {correlTimeline.map((e, idx) => (
                              <li
                                key={`${e.timestamp}-${idx}`}
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '0 8px',
                                  borderBottom:
                                    '1px solid var(--color-im-rule)',
                                  paddingBottom: 4,
                                  marginBottom: 4,
                                }}
                              >
                                <span
                                  style={{
                                    color: 'var(--color-im-muted)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {e.timestamp}
                                </span>
                                <span
                                  style={{
                                    fontFamily:
                                      'Consolas, "Courier New", monospace',
                                  }}
                                >
                                  {e.eventType}
                                </span>
                                <span
                                  style={{ color: 'var(--color-im-muted)' }}
                                >
                                  correlates: {e.correlationCount}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {detail.correlation && (
                        <div
                          style={{
                            border: '1px solid var(--color-im-rule)',
                            borderRadius: 4,
                            padding: '8px 12px',
                          }}
                        >
                          <label className="im-field-label">
                            Correlation intelligence
                          </label>
                          <div
                            style={{
                              marginTop: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              fontSize: 11.5,
                            }}
                          >
                            <div
                              style={{
                                wordBreak: 'break-all',
                                fontFamily:
                                  'Consolas, "Courier New", monospace',
                                fontSize: 11,
                              }}
                            >
                              Key: {detail.correlationKey}
                            </div>
                            <div>
                              Cluster size:{' '}
                              <span style={{ fontWeight: 500 }}>
                                {detail.correlation.correlationClusterSize}
                              </span>{' '}
                              · Related in window:{' '}
                              <span style={{ fontWeight: 500 }}>
                                {detail.correlation.relatedEventCount}
                              </span>{' '}
                              · Time spread:{' '}
                              <span style={{ fontWeight: 500 }}>
                                {detail.correlation.timeSpreadMinutes.toFixed(
                                  1
                                )}{' '}
                                min
                              </span>
                            </div>
                            <p
                              style={{
                                color: 'var(--color-im-muted)',
                                margin: 0,
                              }}
                            >
                              {detail.correlation.aggregationSummary}
                            </p>
                            {detail.correlation.correlationStreamActive ? (
                              <p
                                style={{
                                  display: 'flex',
                                  gap: 8,
                                  border: '1px solid var(--color-im-accent)',
                                  background: 'rgba(232,162,58,0.08)',
                                  borderRadius: 4,
                                  padding: '6px 10px',
                                  color: 'var(--color-im-accent)',
                                  margin: 0,
                                }}
                              >
                                <AlertTriangle
                                  style={{
                                    width: 14,
                                    height: 14,
                                    flexShrink: 0,
                                    marginTop: 2,
                                  }}
                                />
                                <span>
                                  Correlated alert stream is still active inside
                                  the 10-minute window. Manual resolution is
                                  blocked until events go quiet.
                                </span>
                              </p>
                            ) : (
                              <p
                                style={{
                                  display: 'flex',
                                  gap: 8,
                                  border: '1px solid var(--color-im-good)',
                                  background: 'rgba(74,222,128,0.08)',
                                  borderRadius: 4,
                                  padding: '6px 10px',
                                  color: 'var(--color-im-good)',
                                  fontSize: 11,
                                  margin: 0,
                                }}
                              >
                                <CheckCircle2
                                  style={{
                                    width: 14,
                                    height: 14,
                                    flexShrink: 0,
                                    marginTop: 2,
                                  }}
                                />
                                Correlation window is quiet — you may resolve
                                once root cause and notes meet policy.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      <hr
                        style={{
                          border: 'none',
                          borderTop: '1px solid var(--color-im-rule)',
                          margin: '4px 0',
                        }}
                      />
                      <div>
                        <label className="im-field-label">
                          Resolution history
                        </label>
                        <ul
                          style={{
                            marginTop: 8,
                            maxHeight: 144,
                            overflow: 'auto',
                            fontSize: 11.5,
                            listStyle: 'none',
                            padding: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                          }}
                        >
                          {detail.history.map(h => (
                            <li
                              key={h.historyId}
                              style={{
                                borderLeft: '2px solid var(--color-im-rule)',
                                paddingLeft: 8,
                              }}
                            >
                              <span style={{ color: 'var(--color-im-muted)' }}>
                                {h.eventTimestamp}
                              </span>{' '}
                              <span
                                className="im-badge is-neutral"
                                style={{ marginLeft: 4 }}
                              >
                                {h.eventType}
                              </span>
                              {h.notes ? (
                                <div style={{ marginTop: 2 }}>{h.notes}</div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {detail.status === 'OPEN' && (
                        <>
                          <div>
                            <label
                              htmlFor="res-note"
                              className="im-field-label"
                            >
                              Add resolution note
                            </label>
                            <textarea
                              id="res-note"
                              className="im-textarea"
                              style={{ marginTop: 4, minHeight: 72 }}
                              placeholder="Minimum 10 characters — what you changed or verified"
                              value={resolutionNote}
                              onChange={e => setResolutionNote(e.target.value)}
                            />
                            <button
                              className="im-btn im-btn--sm"
                              style={{ marginTop: 8 }}
                              onClick={() => void onAppendNote()}
                            >
                              Append note
                            </button>
                          </div>
                          <div>
                            <label
                              htmlFor="root-cause"
                              className="im-field-label"
                            >
                              Root cause summary (resolve, ≥50 chars)
                            </label>
                            <textarea
                              id="root-cause"
                              className="im-textarea"
                              style={{ marginTop: 4, minHeight: 96 }}
                              placeholder="Document technical root cause before closing"
                              value={rootCauseDraft}
                              onChange={e => setRootCauseDraft(e.target.value)}
                            />
                            <button
                              className="im-btn im-btn--primary im-btn--sm"
                              style={{ marginTop: 8 }}
                              onClick={() => void onResolve()}
                            >
                              Resolve incident
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">
                  // Post-mortem timeline
                </span>
                <span className="im-section__sub">
                  Lifecycle on resolved incidents; OPEN rows include burst,
                  suppression, and stabilization transitions (newest first)
                </span>
              </div>
              <div
                className="im-section__body"
                style={{ padding: 0, maxHeight: 360, overflow: 'auto' }}
              >
                <div className="im-table-scroll">
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">Time</th>
                        <th className="im-th">Incident</th>
                        <th className="im-th">Status</th>
                        <th className="im-th">Event</th>
                        <th className="im-th">Notes</th>
                        <th className="im-th">Root cause (incident)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.postMortemTimeline.length === 0 ? (
                        <tr className="im-tr">
                          <td
                            className="im-td"
                            colSpan={6}
                            style={{
                              textAlign: 'center',
                              color: 'var(--color-im-muted)',
                              padding: 32,
                            }}
                          >
                            No timeline rows yet (resolve incidents or generate
                            burst / suppression / stabilization events)
                          </td>
                        </tr>
                      ) : (
                        dash.postMortemTimeline.map((row, i) => (
                          <tr
                            key={row.historyId}
                            className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                          >
                            <td
                              className="im-td"
                              style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}
                            >
                              {row.eventTimestamp}
                            </td>
                            <td
                              className="im-td"
                              style={{
                                fontFamily:
                                  'Consolas, "Courier New", monospace',
                                fontSize: 11,
                              }}
                            >
                              {row.incidentId.slice(0, 8)}…
                            </td>
                            <td className="im-td">
                              <span className="im-badge is-neutral">
                                {row.incidentStatus ?? '—'}
                              </span>
                            </td>
                            <td className="im-td">
                              <span className="im-badge is-neutral">
                                {row.eventType}
                              </span>
                            </td>
                            <td
                              className="im-td"
                              style={{
                                maxWidth: 220,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: 11.5,
                              }}
                            >
                              {row.notes || '—'}
                            </td>
                            <td
                              className="im-td"
                              style={{
                                maxWidth: 240,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: 11.5,
                              }}
                            >
                              {row.rootCauseSummary || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="im-section">
              <div className="im-section__header">
                <span className="im-section__label">// Resolved incidents</span>
                <span className="im-section__sub">
                  Newest first — audit trail summary
                </span>
              </div>
              <div
                className="im-section__body"
                style={{ padding: 0, maxHeight: 280, overflow: 'auto' }}
              >
                <div className="im-table-scroll">
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">Resolved</th>
                        <th className="im-th">Severity</th>
                        <th className="im-th">Module</th>
                        <th className="im-th">Root cause</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.postMortemIncidents.length === 0 ? (
                        <tr className="im-tr">
                          <td
                            className="im-td"
                            colSpan={4}
                            style={{
                              textAlign: 'center',
                              color: 'var(--color-im-muted)',
                              padding: 32,
                            }}
                          >
                            No resolved incidents
                          </td>
                        </tr>
                      ) : (
                        dash.postMortemIncidents.map((row, i) => (
                          <tr
                            key={row.incidentId}
                            className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                          >
                            <td
                              className="im-td"
                              style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}
                            >
                              {row.resolvedAt ?? '—'}
                            </td>
                            <td className="im-td">
                              <span className="im-badge is-neutral">
                                {row.severity}
                              </span>
                            </td>
                            <td
                              className="im-td"
                              style={{
                                fontFamily:
                                  'Consolas, "Courier New", monospace',
                                fontSize: 11.5,
                              }}
                            >
                              {row.sourceModule}
                            </td>
                            <td
                              className="im-td"
                              style={{
                                maxWidth: 'min(50vw, 400px)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: 11.5,
                              }}
                            >
                              {row.rootCauseSummary || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
