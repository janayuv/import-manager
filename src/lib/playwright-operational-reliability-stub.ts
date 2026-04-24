/**
 * Playwright-only in-memory state for operational / job-governance E2E tests.
 * Loaded from `tauri-core-playwright-stub.ts` when `VITE_PLAYWRIGHT === '1'`.
 * Does not affect production Tauri builds.
 *
 * Types are inlined to avoid importing `automation-console` (circular via `invoke`).
 */

const ISO = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

type StubDecisionRuleRow = {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  conditionExpression: string;
  actionType: string;
  priority: number;
  enabled: number;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

type StubBgJob = {
  jobId: string;
  jobName: string;
  jobType: string;
  scheduleType: string;
  isEnabled: number;
  expectedDurationMs: number;
  maxRetries: number;
  retryDelaySec: number;
  createdAt: string;
  updatedAt: string;
};

type StubExecRow = {
  executionId: string;
  jobId: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  recordsProcessed: number;
  errorMessage: string | null;
  executionTimeMs: number | null;
  retryCount: number;
};

type StubExpectRow = {
  jobId: string;
  expectedIntervalMinutes: number;
  gracePeriodMinutes: number;
  lastExpectedRunAt: string | null;
  maxRecoveryAttempts: number;
  recoveryDelaySec: number;
  createdAt: string;
  updatedAt: string;
};

type StubMissedAlert = {
  alertId: string;
  jobId: string;
  expectedTime: string;
  detectedTime: string;
  recoveryTriggered: number;
  status: string;
};

type StubRecoveryRow = {
  recoveryId: string;
  jobId: string;
  alertId: string;
  recoveryTime: string;
  result: string;
  attemptCount: number;
  errorMessage: string;
};

type StubFailureAlert = {
  alertId: string;
  jobId: string;
  detectedAt: string;
  alertType: string;
  details: Record<string, unknown>;
};

type StubManualOverride = {
  id: string;
  jobId: string;
  action: string;
  reason: string | null;
  callerRole: string;
  createdAt: string;
};

type StubDeployLogRow = {
  deploymentId: string;
  ruleId: string;
  versionId: string;
  deployedBy: string;
  deploymentStatus: string;
  deploymentTime: string;
  rollbackFlag: number;
  detailsJson: string;
};

type StubRiskTimelineRow = {
  eventType: string;
  ruleId: string;
  versionId: string;
  recordedAt: string;
  notes: string;
};

let stubOpsClock: Date = new Date('2026-04-23T14:00:00.000Z');
let stubSeq = 1;
const stubBgJobs: StubBgJob[] = [];
const stubJobExecLog: StubExecRow[] = [];
const stubScheduleExpectations: StubExpectRow[] = [];
const stubMissedAlerts: StubMissedAlert[] = [];
const stubRecoveryLog: StubRecoveryRow[] = [];
const stubFailureAlerts: StubFailureAlert[] = [];
const stubManualOverrides: StubManualOverride[] = [];
const stubJobAlertLog: Array<{
  alertId: string;
  jobId: string;
  message: string;
  severity: string;
  createdAt: string;
}> = [];
const stubRuleDeployLog: StubDeployLogRow[] = [];
const stubRiskTimeline: StubRiskTimelineRow[] = [];

/** In-memory alert signals for production observability Playwright / stub invoke. */
const stubProdObsSignals: Array<{
  id: string;
  createdAt: string;
  signalType: string;
  severity: string;
  entityId: string | null;
  message: string;
  details: Record<string, unknown>;
}> = [];

/** In-memory incident engine for Playwright invoke stub. */
const stubOpsIncidents = new Map<
  string,
  {
    incidentId: string;
    createdAt: string;
    severity: string;
    status: string;
    sourceModule: string;
    summaryPreview: string;
    linkedAlertId: string;
    correlationId: string;
    correlationKey: string;
    errorContext: Record<string, unknown>;
    rootCauseSummary: string | null;
    resolvedAt: string | null;
    history: Array<{
      historyId: string;
      eventType: string;
      eventTimestamp: string;
      notes: string | null;
      details: Record<string, unknown>;
    }>;
  }
>();

function buildStubOperationsCenterDashboard() {
  const rows = [...stubOpsIncidents.values()];
  const open = rows.filter(r => r.status === 'OPEN');
  const openFatal = open.filter(r => r.severity === 'FATAL').length;
  const openCrit = open.filter(r => r.severity === 'CRITICAL').length;
  const health =
    openFatal > 0 || openCrit > 2
      ? 'red'
      : openCrit > 0 || open.length > 3
        ? 'amber'
        : 'green';
  const activeIncidents = open.map(r => {
    const correl = r.history.filter(
      x =>
        x.eventType === 'CORRELATED_EVENT' || x.eventType === 'ALERT_CORRELATED'
    ).length;
    const n = Math.max(1, 1 + correl);
    const resolutionRecommended = r.history.some(
      x => x.eventType === 'STABILIZATION_RESOLUTION_RECOMMENDED'
    );
    return {
      incidentId: r.incidentId,
      createdAt: r.createdAt,
      severity: r.severity,
      status: r.status,
      sourceModule: r.sourceModule,
      summaryPreview: r.summaryPreview,
      linkedAlertId: r.linkedAlertId,
      relatedEventCount: n,
      correlationClusterSize: n,
      timeSpreadMinutes: correl > 0 ? 2.5 : 0,
      aggregationSummary:
        correl > 0
          ? `Occurred ${n} times in last 10 minutes`
          : 'No correlated events in the current window',
      correlationStreamActive: correl > 0,
      correlatedOnlyInWindow: correl,
      resolutionRecommended,
    };
  });
  const resolved = rows
    .filter(r => r.status === 'RESOLVED')
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));
  const postMortemIncidents = resolved.slice(0, 25).map(r => ({
    incidentId: r.incidentId,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    severity: r.severity,
    sourceModule: r.sourceModule,
    rootCauseSummary: r.rootCauseSummary ?? '',
    linkedAlertId: r.linkedAlertId,
  }));
  const postMortemTimeline = resolved
    .flatMap(r =>
      r.history.map(h => ({
        historyId: h.historyId,
        incidentId: r.incidentId,
        eventType: h.eventType,
        eventTimestamp: h.eventTimestamp,
        notes: h.notes ?? '',
        severity: r.severity,
        rootCauseSummary: r.rootCauseSummary ?? '',
        incidentStatus: 'RESOLVED',
      }))
    )
    .sort((a, b) => b.eventTimestamp.localeCompare(a.eventTimestamp))
    .slice(0, 80);
  const stabilizationSignals = [
    {
      stabilizationId: 'stub-stab-1',
      sourceModule: 'job_monitor',
      eventType: 'BACKGROUND_JOB_FAILURE',
      stabilizationStart: ISO(stubOpsClock),
      stabilizationConfirmed: null,
      quietMinutes: 14,
      confidenceScore: 0.82,
      stabilityDurationMinutes: 0,
      phase: 'stabilizing',
      tone: 'amber',
    },
  ];
  return {
    healthStatus: health,
    activeIncidentCount: open.length,
    openFatal,
    openCritical: openCrit,
    recoverySuccessRate30d: 0.92,
    systemReliabilityScore: 0.97,
    activeIncidents,
    postMortemIncidents,
    postMortemTimeline,
    metricsToday: {
      metricDate: '2026-04-24',
      incidentsCreatedToday: rows.length,
      incidentsResolvedToday: resolved.length,
      avgResolutionTime: 12.5,
      criticalIncidentCount: rows.filter(
        r => r.severity === 'CRITICAL' || r.severity === 'FATAL'
      ).length,
    },
    correlationMetricsToday: {
      metricDate: '2026-04-24',
      alertsGrouped: 3,
      incidentsCreated: 2,
      noiseReductionRatio: 0.6,
      burstSignalsEmitted: 0,
      burstsDetected: 0,
    },
    incidentNoiseScoreToday: {
      metricDate: '2026-04-24',
      noiseScore: 0.35,
      totalAlerts: 10,
      alertsGrouped: 3,
    },
    suppressionMetricsToday: {
      metricDate: '2026-04-24',
      alertsSuppressed: 0,
      suppressionWindows: 0,
      noiseReductionGain: 0,
      confidenceScore: 0.55,
    },
    stabilizationMetricsToday: {
      metricDate: '2026-04-24',
      stabilizationsDetected: 1,
      avgStabilizationTime: 22.0,
      falseRecoveryRate: 0,
      stabilityConfidenceAvg: 0.78,
    },
    systemStabilityScore: {
      stabilityScore: 0.42,
      successfulStabilizations: 3,
      totalIncidents: 7,
      updatedAt: ISO(stubOpsClock),
    },
    stabilizationSignals,
    regressionMetricsToday: {
      metricDate: '2026-04-24',
      regressionsDetected: 1,
      avgRegressionTimeMinutes: 18.5,
      regressionFrequency: 0.25,
    },
    regressionRiskScore: {
      regressionRisk: 0.33,
      regressionsDetected: 1,
      stabilizationsDetected: 3,
      updatedAt: ISO(stubOpsClock),
    },
    regressionSignals: [
      {
        regressionId: 'stub-reg-1',
        sourceModule: 'deployment',
        eventType: 'BACKGROUND_JOB_FAILURE',
        regressionDetectedAt: ISO(stubOpsClock),
        timeSinceStabilizationMinutes: 14,
        confidenceScore: 0.71,
        triggerSource: 'structured_log',
        tone: 'red',
      },
    ],
    structuredRegressionMetricsToday: {
      metricDate: '2026-04-24',
      structuredRegressionsDetected: 1,
      avgStructuredRegressionTime: 16.0,
      structuredRegressionRatio: 0.5,
    },
    persistenceMetricsToday: {
      metricDate: '2026-04-24',
      persistentFailuresDetected: 1,
      avgPersistenceDuration: 20,
      persistenceFrequency: 0.12,
    },
    persistenceRiskScore: {
      persistenceRisk: 0.08,
      persistentFailuresDetected: 1,
      totalIncidents: 12,
      updatedAt: ISO(stubOpsClock),
    },
    persistenceSignals: [
      {
        persistenceId: 'stub-pers-1',
        sourceModule: 'job_monitor',
        eventType: 'BACKGROUND_JOB_FAILURE',
        persistenceDetectedAt: ISO(stubOpsClock),
        failureRate: 0.35,
        expectedRate: 0.05,
        confidenceScore: 0.88,
        tone: 'orange',
      },
    ],
    activeSuppressions: [],
    activeSystemicBursts: [],
    failureForecastBanner: null,
    forecastMetricsToday: {
      metricDate: '2026-04-24',
      forecastsGenerated: 0,
      forecastAccuracy: 0,
      forecastFalsePositiveRate: 0,
      predictionAccuracyScore: 0,
    },
    forecastRiskScore: {
      forecastRiskScore: 0,
      highRiskForecasts: 0,
      totalForecasts: 0,
      updatedAt: ISO(stubOpsClock),
    },
    forecastExplanationMetricsToday: {
      metricDate: '2026-04-24',
      explanationsGenerated: 0,
      accurateExplanations: 0,
      misleadingExplanations: 0,
    },
    forecastExplanationScore: {
      explanationAccuracyScore: 0,
      accurateExplanations: 0,
      totalExplanations: 0,
      updatedAt: ISO(stubOpsClock),
    },
    forecastActionMetricsToday: {
      metricDate: '2026-04-24',
      actionsGenerated: 0,
      actionsAcknowledged: 0,
      actionsEffective: 0,
    },
    preventiveReliabilityScore: {
      preventiveReliabilityScore: 0,
      preventedFailures: 0,
      totalForecastsEvaluated: 0,
      updatedAt: ISO(stubOpsClock),
    },
  };
}

let stubDeployHighRisk = false;

function nextId(prefix: string): string {
  stubSeq += 1;
  return `${prefix}-${stubSeq}`;
}

function mkJob(jobId: string, jobName: string, enabled: number): StubBgJob {
  const t = ISO(stubOpsClock);
  return {
    jobId,
    jobName,
    jobType: 'scheduled',
    scheduleType: 'interval',
    isEnabled: enabled,
    expectedDurationMs: 60_000,
    maxRetries: 3,
    retryDelaySec: 30,
    createdAt: t,
    updatedAt: t,
  };
}

function parseStubSqliteTime(s: string): number {
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

function expectStale(exp: StubExpectRow, nowMs: number): boolean {
  if (!exp.lastExpectedRunAt) return false;
  const anchor = parseStubSqliteTime(exp.lastExpectedRunAt);
  const graceMs = exp.gracePeriodMinutes * 60_000;
  const intervalMs = exp.expectedIntervalMinutes * 60_000;
  return nowMs > anchor + intervalMs + graceMs;
}

function jobEnabled(jobId: string): boolean {
  const j = stubBgJobs.find(x => x.jobId === jobId);
  return (j?.isEnabled ?? 0) !== 0;
}

function buildHealthDashboard() {
  const byJob = new Map<string, StubExecRow[]>();
  for (const r of stubJobExecLog) {
    const arr = byJob.get(r.jobId) ?? [];
    arr.push(r);
    byJob.set(r.jobId, arr);
  }
  const jobs = stubBgJobs.map(j => {
    const rows = (byJob.get(j.jobId) ?? []).slice().sort((a, b) => {
      const ta = parseStubSqliteTime(a.startedAt);
      const tb = parseStubSqliteTime(b.startedAt);
      return tb - ta;
    });
    const last = rows[0];
    const failures7d = rows.filter(x => x.status === 'FAILED').length;
    return {
      jobId: j.jobId,
      lastExecution: last
        ? {
            status: last.status,
            startedAt: last.startedAt,
            completedAt: last.completedAt,
            executionTimeMs: last.executionTimeMs,
            recordsProcessed: last.recordsProcessed,
            errorMessage: last.errorMessage,
          }
        : null,
      failures7d,
      avgExecutionMs7d: last?.executionTimeMs ?? 0,
      retryRows: rows.filter(x => x.retryCount > 0).length,
      reliability: {
        score: failures7d === 0 ? 0.95 : 0.5,
        successRate: 0.9,
        failureRate: 0.1,
        retryFrequency: 0.1,
        sampleExecutions: Math.max(1, rows.length),
        updatedAt: ISO(stubOpsClock),
      },
    };
  });
  return { jobs };
}

function buildMissedDashboard() {
  const pending = stubMissedAlerts.filter(a => a.status === 'PENDING').length;
  const recovered7d = stubMissedAlerts.filter(
    a => a.status === 'RECOVERED'
  ).length;
  const missedExec7d = stubJobExecLog.filter(x => x.status === 'MISSED').length;
  const recent = stubMissedAlerts
    .slice()
    .sort(
      (a, b) =>
        parseStubSqliteTime(b.detectedTime) -
        parseStubSqliteTime(a.detectedTime)
    )
    .slice(0, 12)
    .map(a => ({
      alertId: a.alertId,
      jobId: a.jobId,
      expectedTime: a.expectedTime,
      detectedTime: a.detectedTime,
      recoveryTriggered: a.recoveryTriggered,
      status: a.status,
    }));
  return {
    pendingMissed: pending,
    recovered7d,
    missedExecutions7d: missedExec7d,
    recoverySuccessRate30d: 0.92,
    todayMetrics: null,
    recentMissedAlerts: recent,
    recoveryScores: [] as unknown[],
  };
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportRecoveryCsv(): string {
  let out =
    'recovery_id,job_id,alert_id,recovery_time,result,attempt_count,error_message\n';
  for (const r of stubRecoveryLog) {
    out += `${csvEscape(r.recoveryId)},${csvEscape(r.jobId)},${csvEscape(r.alertId)},${csvEscape(r.recoveryTime)},${csvEscape(r.result)},${r.attemptCount},${csvEscape(r.errorMessage)}\n`;
  }
  return out;
}

function isAdminRole(callerRole: string): boolean {
  return callerRole.toLowerCase().replace(/\s/g, '').includes('admin');
}

const PW_RULE: StubDecisionRuleRow = {
  ruleId: 'rule-pw-reliability',
  ruleName: 'PW reliability rule',
  ruleType: 'predicate',
  conditionExpression: 'true',
  actionType: 'log',
  priority: 10,
  enabled: 1,
  tenantId: 'tenant-default',
  createdAt: '2026-01-01 00:00:00',
  updatedAt: '2026-01-01 00:00:00',
};

export function initOperationalReliabilityStub(): void {
  stubOpsClock = new Date('2026-04-23T14:00:00.000Z');
  stubSeq = 1;
  stubBgJobs.length = 0;
  stubBgJobs.push(
    mkJob('maintenance_cleanup', 'Maintenance cleanup', 1),
    mkJob('automation_cycle', 'Automation cycle', 1),
    mkJob('observability_update', 'Observability update', 1)
  );
  stubScheduleExpectations.length = 0;
  const baseT = '2026-01-01 00:00:00';
  stubScheduleExpectations.push(
    {
      jobId: 'maintenance_cleanup',
      expectedIntervalMinutes: 1440,
      gracePeriodMinutes: 30,
      lastExpectedRunAt: '2026-04-22 14:00:00',
      maxRecoveryAttempts: 3,
      recoveryDelaySec: 120,
      createdAt: baseT,
      updatedAt: baseT,
    },
    {
      jobId: 'automation_cycle',
      expectedIntervalMinutes: 60,
      gracePeriodMinutes: 5,
      lastExpectedRunAt: '2026-04-23 12:00:00',
      maxRecoveryAttempts: 3,
      recoveryDelaySec: 60,
      createdAt: baseT,
      updatedAt: baseT,
    },
    {
      jobId: 'observability_update',
      expectedIntervalMinutes: 120,
      gracePeriodMinutes: 10,
      lastExpectedRunAt: '2026-04-23 13:00:00',
      maxRecoveryAttempts: 2,
      recoveryDelaySec: 90,
      createdAt: baseT,
      updatedAt: baseT,
    }
  );
  stubJobExecLog.length = 0;
  stubJobExecLog.push(
    {
      executionId: 'exec-ac-1',
      jobId: 'automation_cycle',
      startedAt: '2026-04-23 10:00:05',
      completedAt: '2026-04-23 10:00:06',
      status: 'MISSED',
      recordsProcessed: 0,
      errorMessage: 'no successful run in window',
      executionTimeMs: 1000,
      retryCount: 0,
    },
    {
      executionId: 'exec-ac-2',
      jobId: 'automation_cycle',
      startedAt: '2026-04-23 11:00:00',
      completedAt: '2026-04-23 11:00:03',
      status: 'FAILED',
      recordsProcessed: 0,
      errorMessage: 'connection reset',
      executionTimeMs: 3000,
      retryCount: 0,
    },
    {
      executionId: 'exec-ac-3',
      jobId: 'automation_cycle',
      startedAt: '2026-04-23 12:30:00',
      completedAt: '2026-04-23 12:30:02',
      status: 'SUCCESS',
      recordsProcessed: 12,
      errorMessage: null,
      executionTimeMs: 2000,
      retryCount: 0,
    },
    {
      executionId: 'exec-failed-pw',
      jobId: 'automation_cycle',
      startedAt: '2026-04-23 13:45:00',
      completedAt: '2026-04-23 13:45:02',
      status: 'FAILED',
      recordsProcessed: 0,
      errorMessage: 'scheduler timeout',
      executionTimeMs: 2000,
      retryCount: 0,
    },
    {
      executionId: 'exec-mc-1',
      jobId: 'maintenance_cleanup',
      startedAt: '2026-04-23 09:00:00',
      completedAt: '2026-04-23 09:00:01',
      status: 'SUCCESS',
      recordsProcessed: 4,
      errorMessage: null,
      executionTimeMs: 800,
      retryCount: 0,
    }
  );
  stubMissedAlerts.length = 0;
  stubRecoveryLog.length = 0;
  stubFailureAlerts.length = 0;
  stubManualOverrides.length = 0;
  stubJobAlertLog.length = 0;
  stubRuleDeployLog.length = 0;
  stubRiskTimeline.length = 0;
  stubDeployHighRisk = false;
}

function findLatestFailed(jobId: string): StubExecRow | undefined {
  const failed = stubJobExecLog.filter(
    r => r.jobId === jobId && r.status === 'FAILED'
  );
  failed.sort(
    (a, b) =>
      parseStubSqliteTime(b.startedAt) - parseStubSqliteTime(a.startedAt)
  );
  return failed[0];
}

function pushRecovery(
  jobId: string,
  alertId: string,
  result: string,
  attempt: number,
  err: string
): void {
  stubRecoveryLog.unshift({
    recoveryId: nextId('rec'),
    jobId,
    alertId,
    recoveryTime: ISO(stubOpsClock),
    result,
    attemptCount: attempt,
    errorMessage: err,
  });
}

export function routeOperationalReliabilityInvoke(
  cmd: string,
  args?: Record<string, unknown>
): unknown | null {
  if (import.meta.env.VITE_PLAYWRIGHT !== '1') return null;

  switch (cmd) {
    case 'playwright_operational_stub_command': {
      const action = String((args as { action?: string })?.action ?? '');
      if (action === 'guard_stop') {
        const jobId = String((args as { jobId?: string })?.jobId ?? '');
        const j = stubBgJobs.find(x => x.jobId === jobId);
        if (j) j.isEnabled = 0;
        stubFailureAlerts.unshift({
          alertId: nextId('fa'),
          jobId,
          detectedAt: ISO(stubOpsClock),
          alertType: 'GUARD_STOP',
          details: { reason: 'max_recovery_attempts' },
        });
        stubJobAlertLog.unshift({
          alertId: nextId('ja'),
          jobId,
          message: 'GUARD_STOP: job disabled by recovery guard',
          severity: 'CRITICAL',
          createdAt: ISO(stubOpsClock),
        });
        return { ok: true };
      }
      if (action === 'set_deploy_high_risk') {
        stubDeployHighRisk = Boolean((args as { value?: boolean })?.value);
        return { ok: true, stubDeployHighRisk };
      }
      if (action === 'snapshot') {
        return {
          jobs: stubBgJobs.map(j => ({ ...j })),
          missed: stubMissedAlerts.map(m => ({ ...m })),
          execLog: stubJobExecLog.map(e => ({ ...e })),
          recoveryLog: stubRecoveryLog.map(r => ({ ...r })),
          failureAlerts: stubFailureAlerts.map(f => ({ ...f })),
          overrides: stubManualOverrides.map(o => ({ ...o })),
          deployLog: stubRuleDeployLog.map(d => ({ ...d })),
          riskTimeline: stubRiskTimeline.map(t => ({ ...t })),
        };
      }
      return { ok: false, error: `unknown action: ${action}` };
    }
    case 'list_workflow_decision_rules':
      return [PW_RULE];
    case 'list_workflow_background_jobs_command':
      return stubBgJobs.map(j => ({ ...j }));
    case 'set_workflow_background_job_enabled_command': {
      const jobId = String(args?.jobId ?? '');
      const enabled = Boolean(args?.enabled);
      const j = stubBgJobs.find(x => x.jobId === jobId);
      if (j) {
        j.isEnabled = enabled ? 1 : 0;
        j.updatedAt = ISO(stubOpsClock);
      }
      return undefined;
    }
    case 'list_workflow_job_execution_log_command': {
      const jobId = (args?.jobId as string | null | undefined) ?? null;
      const limit = Number(args?.limit ?? 120) || 120;
      let rows = stubJobExecLog.slice();
      if (jobId && jobId.trim()) {
        rows = rows.filter(r => r.jobId === jobId.trim());
      }
      rows.sort(
        (a, b) =>
          parseStubSqliteTime(b.startedAt) - parseStubSqliteTime(a.startedAt)
      );
      return rows.slice(0, limit).map(r => ({ ...r }));
    }
    case 'retry_failed_job_command': {
      const executionId = String(args?.executionId ?? '').trim();
      const row = stubJobExecLog.find(r => r.executionId === executionId);
      if (!row) throw new Error(`execution not found: ${executionId}`);
      const newId = nextId('exec-retry');
      stubJobExecLog.unshift({
        executionId: newId,
        jobId: row.jobId,
        startedAt: ISO(stubOpsClock),
        completedAt: ISO(stubOpsClock),
        status: 'SUCCESS',
        recordsProcessed: row.recordsProcessed + 1,
        errorMessage: null,
        executionTimeMs: 500,
        retryCount: row.retryCount + 1,
      });
      return newId;
    }
    case 'retry_latest_failed_job_command': {
      const jobId = String(args?.jobId ?? '').trim();
      const latest = findLatestFailed(jobId);
      if (!latest) throw new Error(`no failed execution for ${jobId}`);
      return routeOperationalReliabilityInvoke('retry_failed_job_command', {
        executionId: latest.executionId,
        callerRole: args?.callerRole,
      });
    }
    case 'reset_job_schedule_anchor_command': {
      const jobId = String(args?.jobId ?? '').trim();
      const exp = stubScheduleExpectations.find(x => x.jobId === jobId);
      if (exp) {
        exp.lastExpectedRunAt = ISO(stubOpsClock);
        exp.updatedAt = ISO(stubOpsClock);
      }
      for (const a of stubMissedAlerts) {
        if (a.jobId === jobId && a.status === 'PENDING') {
          a.status = 'CANCELLED';
        }
      }
      return undefined;
    }
    case 'update_job_schedule_expectations_command': {
      const jobId = String(args?.jobId ?? '').trim();
      const exp = stubScheduleExpectations.find(x => x.jobId === jobId);
      if (!exp) return undefined;
      const g = args?.gracePeriodMinutes;
      const d = args?.recoveryDelaySec;
      const m = args?.maxRecoveryAttempts;
      if (g != null && typeof g === 'number') exp.gracePeriodMinutes = g;
      if (d != null && typeof d === 'number') exp.recoveryDelaySec = d;
      if (m != null && typeof m === 'number') exp.maxRecoveryAttempts = m;
      exp.updatedAt = ISO(stubOpsClock);
      return undefined;
    }
    case 'recovery_guard_override_reenable_command': {
      const jobId = String(args?.jobId ?? '').trim();
      const reason = String(args?.reason ?? '').trim();
      const callerRole = String(args?.callerRole ?? '');
      if (!isAdminRole(callerRole)) {
        throw new Error('admin role required for recovery guard override');
      }
      const j = stubBgJobs.find(x => x.jobId === jobId);
      if (!j) throw new Error('job not found');
      if (j.isEnabled !== 0) {
        throw new Error('job is already enabled');
      }
      j.isEnabled = 1;
      j.updatedAt = ISO(stubOpsClock);
      const id = nextId('ov');
      stubManualOverrides.unshift({
        id,
        jobId,
        action: 'RECOVERY_GUARD_OVERRIDE',
        reason,
        callerRole,
        createdAt: ISO(stubOpsClock),
      });
      stubJobAlertLog.unshift({
        alertId: nextId('ja'),
        jobId,
        message: 'manual_override_event',
        severity: 'INFO',
        createdAt: ISO(stubOpsClock),
      });
      return undefined;
    }
    case 'list_workflow_job_schedule_expectations_command':
      return stubScheduleExpectations.map(e => ({ ...e }));
    case 'list_workflow_job_manual_override_log_command': {
      const lim = Math.min(200, Math.max(1, Number(args?.limit ?? 40) || 40));
      return stubManualOverrides.slice(0, lim).map(o => ({ ...o }));
    }
    case 'get_job_failure_insights_command': {
      const clusters = new Map<string, number>();
      const byStatus = new Map<string, number>();
      for (const r of stubJobExecLog) {
        const k = `${r.jobId}||${r.errorMessage ?? ''}`;
        clusters.set(k, (clusters.get(k) ?? 0) + 1);
        const sk = `${r.jobId}||${r.status}`;
        byStatus.set(sk, (byStatus.get(sk) ?? 0) + 1);
      }
      return {
        failureClusters7d: [...clusters.entries()].map(([key, count]) => {
          const [jobId, errorMessage] = key.split('||');
          return { jobId, errorMessage, count };
        }),
        countsByStatus7d: [...byStatus.entries()].map(([key, count]) => {
          const [jobId, status] = key.split('||');
          return { jobId, status, count };
        }),
        notes: 'Playwright stub insights',
      };
    }
    case 'export_workflow_job_recovery_log_csv_command':
      return exportRecoveryCsv();
    case 'get_workflow_job_dependencies_tree_command':
      return {
        edges: [
          {
            parentJobId: 'maintenance_cleanup',
            dependentJobId: 'automation_cycle',
            dependencyType: 'ORDER',
          },
        ],
        suggestedDailyOrder: [
          'maintenance_cleanup',
          'automation_cycle',
          'observability_update',
        ],
      };
    case 'get_job_execution_timeline_command': {
      const jobId = String(args?.jobId ?? '').trim();
      const hours = Number(args?.hours ?? 48) || 48;
      const cutoff = stubOpsClock.getTime() - hours * 3600_000;
      const events = stubJobExecLog
        .filter(r => r.jobId === jobId)
        .filter(r => parseStubSqliteTime(r.startedAt) >= cutoff)
        .slice()
        .sort(
          (a, b) =>
            parseStubSqliteTime(a.startedAt) - parseStubSqliteTime(b.startedAt)
        )
        .map(r => ({ ...r }));
      return { jobId, hoursWindow: hours, events };
    }
    case 'get_background_job_health_dashboard_command':
      return buildHealthDashboard();
    case 'get_missed_schedule_dashboard_command':
      return buildMissedDashboard();
    case 'detect_missed_job_runs_command': {
      const nowMs = stubOpsClock.getTime();
      let n = 0;
      for (const exp of stubScheduleExpectations) {
        if (!jobEnabled(exp.jobId)) continue;
        if (!expectStale(exp, nowMs)) continue;
        const pendingSame = stubMissedAlerts.some(
          a => a.jobId === exp.jobId && a.status === 'PENDING'
        );
        if (pendingSame) continue;
        const alertId = nextId('miss');
        stubMissedAlerts.unshift({
          alertId,
          jobId: exp.jobId,
          expectedTime: exp.lastExpectedRunAt ?? ISO(stubOpsClock),
          detectedTime: ISO(stubOpsClock),
          recoveryTriggered: 0,
          status: 'PENDING',
        });
        stubJobExecLog.unshift({
          executionId: nextId('exec-missed'),
          jobId: exp.jobId,
          startedAt: ISO(stubOpsClock),
          completedAt: null,
          status: 'MISSED',
          recordsProcessed: 0,
          errorMessage: 'expected run window elapsed',
          executionTimeMs: null,
          retryCount: 0,
        });
        stubJobAlertLog.unshift({
          alertId: nextId('ja'),
          jobId: exp.jobId,
          message: 'MISSED_SCHEDULE detected (stub)',
          severity: 'WARN',
          createdAt: ISO(stubOpsClock),
        });
        n += 1;
      }
      return n;
    }
    case 'recover_missed_job_command': {
      const jobId = String(args?.jobId ?? '').trim();
      const alertId = String(
        (args?.alertId as string | null | undefined) ?? ''
      );
      const alert = stubMissedAlerts.find(
        a => a.jobId === jobId && (!alertId || a.alertId === alertId)
      );
      if (!alert || alert.status !== 'PENDING') {
        throw new Error('no pending missed alert for recovery');
      }
      alert.status = 'RECOVERED';
      alert.recoveryTriggered = 1;
      pushRecovery(jobId, alert.alertId, 'SUCCESS', 1, '');
      stubJobExecLog.unshift({
        executionId: nextId('exec-recovered'),
        jobId,
        startedAt: ISO(stubOpsClock),
        completedAt: ISO(stubOpsClock),
        status: 'RECOVERED',
        recordsProcessed: 1,
        errorMessage: null,
        executionTimeMs: 400,
        retryCount: 0,
      });
      stubJobExecLog.unshift({
        executionId: nextId('exec-success'),
        jobId,
        startedAt: ISO(stubOpsClock),
        completedAt: ISO(stubOpsClock),
        status: 'SUCCESS',
        recordsProcessed: 2,
        errorMessage: null,
        executionTimeMs: 600,
        retryCount: 0,
      });
      return `recovered:${alert.alertId}`;
    }
    case 'list_workflow_job_missed_alerts_command': {
      const lim = Math.min(300, Math.max(1, Number(args?.limit ?? 80) || 80));
      return stubMissedAlerts.slice(0, lim).map(a => ({
        alertId: a.alertId,
        jobId: a.jobId,
        expectedTime: a.expectedTime,
        detectedTime: a.detectedTime,
        recoveryTriggered: a.recoveryTriggered,
        status: a.status,
      }));
    }
    case 'list_workflow_job_failure_alerts_command': {
      const lim = Math.min(300, Math.max(1, Number(args?.limit ?? 80) || 80));
      return stubFailureAlerts.slice(0, lim).map(f => ({
        alertId: f.alertId,
        jobId: f.jobId,
        detectedAt: f.detectedAt,
        alertType: f.alertType,
        details: f.details,
      }));
    }
    case 'list_workflow_job_alert_log_command':
      return stubJobAlertLog.map(a => ({ ...a }));
    case 'validate_deployment_safety_command': {
      const versionId = String(args?.versionId ?? '');
      const high =
        stubDeployHighRisk && versionId.toLowerCase().includes('prod');
      if (high) {
        return {
          safe_to_deploy: false,
          risk_level: 'HIGH',
          risk_score: 91,
          warnings: ['elevated drift (stub)'],
          blocking_issues: ['capacity pressure'],
          governance: { ok: false, checks: [] },
          factors: { drift: 0.8 },
        };
      }
      return {
        safe_to_deploy: true,
        risk_level: 'LOW',
        risk_score: 4,
        warnings: [],
        blocking_issues: [],
        governance: { ok: true, checks: [] },
        factors: {},
      };
    }
    case 'deploy_rule_version_command': {
      const versionId = String(args?.versionId ?? '');
      const ruleId = String(args?.ruleId ?? '');
      const deployedBy = String(args?.deployedBy ?? 'tester');
      const callerRole = String(args?.callerRole ?? '');
      const ack = Boolean(args?.safetyOverrideAcknowledged);
      const high =
        stubDeployHighRisk && versionId.toLowerCase().includes('prod');
      if (high && !(ack && isAdminRole(callerRole))) {
        stubRiskTimeline.unshift({
          eventType: 'REJECTED_SAFETY',
          ruleId,
          versionId,
          recordedAt: ISO(stubOpsClock),
          notes: 'blocked by deployment safety (stub)',
        });
        throw new Error('REJECTED_SAFETY: deployment blocked');
      }
      const status =
        high && ack && isAdminRole(callerRole) ? 'OVERRIDE_ADMIN' : 'SUCCESS';
      stubRuleDeployLog.unshift({
        deploymentId: nextId('dep'),
        ruleId,
        versionId,
        deployedBy,
        deploymentStatus: status,
        deploymentTime: ISO(stubOpsClock),
        rollbackFlag: 0,
        detailsJson: JSON.stringify({ ack, callerRole }),
      });
      return undefined;
    }
    case 'list_workflow_rule_deployment_log': {
      const ruleId = (args?.ruleId as string | null | undefined) ?? null;
      const limit = Number(args?.limit ?? 200) || 200;
      let rows = stubRuleDeployLog.slice();
      if (ruleId && ruleId.trim()) {
        rows = rows.filter(r => r.ruleId === ruleId.trim());
      }
      return rows.slice(0, limit).map(r => ({ ...r }));
    }
    case 'list_deployment_risk_timeline_command':
      return stubRiskTimeline.map(r => ({ ...r }));
    case 'get_system_metrics_command':
      return {
        jobs: {
          executed: 12,
          failed: 1,
          recovered: 3,
          failedOrTimeout24hObserved: 1,
          avgExecutionDurationMs7d: 420,
          countersUpdatedAt: ISO(stubOpsClock),
        },
        deployments: { blocked: 0, succeeded: 2 },
        recovery: {
          attempts: 4,
          pendingMissedAlerts: stubMissedAlerts.filter(
            a => a.status === 'PENDING'
          ).length,
        },
        system_health: {
          reliabilityScore: 0.91,
          successRate30d: 0.94,
          failureRate30d: 0.04,
          recoverySuccessRate30d: 0.88,
          reliabilityUpdatedAt: ISO(stubOpsClock),
          alertSignals24h: stubProdObsSignals.length + 1,
        },
        risk: { evaluations: 6 },
      };
    case 'get_system_health_command':
      return {
        status: 'HEALTHY',
        failed_jobs: 0,
        pending_recovery: stubMissedAlerts.filter(a => a.status === 'PENDING')
          .length,
        risk_level: 'LOW',
        criticalSignals24h: 0,
      };
    case 'list_workflow_alert_signal_log_command': {
      const lim = Math.min(500, Math.max(1, Number(args?.limit ?? 100) || 100));
      return stubProdObsSignals.slice(0, lim).map(s => ({ ...s }));
    }
    case 'get_workflow_alert_signal_dashboard_command': {
      const recent = stubProdObsSignals.slice(0, 80).map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        signalType: s.signalType,
        severity: s.severity,
        entityId: s.entityId,
        message: s.message,
        details: s.details,
      }));
      const sevMap = new Map<string, number>();
      for (const s of stubProdObsSignals) {
        sevMap.set(s.severity, (sevMap.get(s.severity) ?? 0) + 1);
      }
      const severityDistribution14d = [...sevMap.entries()].map(
        ([severity, count]) => ({
          severity,
          count,
        })
      );
      return {
        recentSignals: recent,
        severityDistribution14d,
        failureClusters: stubFailureAlerts.map(f => ({
          jobId: f.jobId,
          errorMessage: String(f.details?.reason ?? f.alertType),
          count: 1,
        })),
        alertTrends14d: [{ day: '2026-04-20', count: 1 }],
      };
    }
    case 'simulate_alert_event_command': {
      const callerRole = String(args?.callerRole ?? '');
      if (!isAdminRole(callerRole)) {
        throw new Error('admin role required for simulate_alert_event');
      }
      const scenario = String(args?.scenario ?? '').toUpperCase();
      const id = nextId('obs');
      stubProdObsSignals.unshift({
        id,
        createdAt: ISO(stubOpsClock),
        signalType: `SIM_${scenario}`,
        severity: scenario.includes('DEPLOY') ? 'CRITICAL' : 'WARNING',
        entityId: 'simulation',
        message: `stub ${scenario}`,
        details: { scenario },
      });
      return { ok: true, scenario };
    }
    case 'export_metrics_snapshot_csv_command':
      return (
        'section,key,value\nstub,signals,' +
        String(stubProdObsSignals.length) +
        '\n'
      );
    case 'get_operations_center_dashboard_command':
      return buildStubOperationsCenterDashboard();
    case 'submit_workflow_forecast_feedback_command':
      return undefined;
    case 'acknowledge_workflow_forecast_actions_command':
      return undefined;
    case 'get_workflow_incident_detail_command': {
      const incidentId = String(args?.incidentId ?? '');
      const row = stubOpsIncidents.get(incidentId);
      if (!row) {
        throw new Error('incident not found');
      }
      const correl = row.history.filter(
        x =>
          x.eventType === 'CORRELATED_EVENT' ||
          x.eventType === 'ALERT_CORRELATED'
      ).length;
      const n = Math.max(1, 1 + correl);
      return {
        incidentId: row.incidentId,
        createdAt: row.createdAt,
        severity: row.severity,
        status: row.status,
        errorContext: row.errorContext,
        sourceModule: row.sourceModule,
        linkedAlertId: row.linkedAlertId,
        correlationId: row.correlationId,
        correlationKey: row.correlationKey,
        triggerEventType: 'STUB',
        correlatedEventCount: correl + 1,
        lastCorrelatedAt: correl > 0 ? row.createdAt : null,
        resolvedAt: row.resolvedAt,
        rootCauseSummary: row.rootCauseSummary,
        relatedAlert: {
          id: row.linkedAlertId,
          createdAt: row.createdAt,
          signalType: 'STUB',
          severity: row.severity,
          entityId: 'stub',
          message: row.summaryPreview,
          details: {},
        },
        history: row.history.map(h => ({
          historyId: h.historyId,
          eventType: h.eventType,
          eventTimestamp: h.eventTimestamp,
          notes: h.notes,
          details: h.details,
        })),
        correlation: {
          relatedEventCount: n,
          correlationClusterSize: n,
          timeSpreadMinutes: correl > 0 ? 2.5 : 0,
          aggregationSummary:
            correl > 0
              ? `Occurred ${n} times in last 10 minutes`
              : 'No correlated events in the current window',
          correlationStreamActive: correl > 0,
          correlatedOnlyInWindow: correl,
          minutesSinceLastCorrelate: correl > 0 ? 0.05 : null,
        },
      };
    }
    case 'append_workflow_incident_resolution_note_command': {
      const incidentId = String(args?.incidentId ?? '');
      const notes = String(args?.notes ?? '');
      const row = stubOpsIncidents.get(incidentId);
      if (!row || row.status !== 'OPEN') {
        throw new Error('incident not found or not OPEN');
      }
      row.history.push({
        historyId: nextId('h'),
        eventType: 'RESOLUTION_NOTE',
        eventTimestamp: ISO(stubOpsClock),
        notes,
        details: {},
      });
      return undefined;
    }
    case 'resolve_workflow_incident_command': {
      const incidentId = String(args?.incidentId ?? '');
      const root = String(args?.rootCauseSummary ?? '').trim();
      const row = stubOpsIncidents.get(incidentId);
      if (!row || row.status !== 'OPEN') {
        throw new Error('incident not found or not OPEN');
      }
      if (root.length < 50) {
        throw new Error('root_cause_summary must be at least 50 characters');
      }
      const hasNote = row.history.some(
        h =>
          (h.eventType === 'RESOLUTION_NOTE' ||
            h.eventType === 'MANUAL_INTERVENTION') &&
          (h.notes?.trim().length ?? 0) >= 10
      );
      if (!hasNote) {
        throw new Error('resolution requires a resolution note in history');
      }
      row.status = 'RESOLVED';
      row.resolvedAt = ISO(stubOpsClock);
      row.rootCauseSummary = root;
      row.history.push({
        historyId: nextId('h'),
        eventType: 'STATUS_CHANGED',
        eventTimestamp: ISO(stubOpsClock),
        notes: 'Incident resolved',
        details: { from: 'OPEN', to: 'RESOLVED' },
      });
      return undefined;
    }
    case 'export_workflow_incidents_report_csv_command':
      return (
        'incident_id,created_at\n' +
        [...stubOpsIncidents.values()]
          .map(r => `${r.incidentId},${r.createdAt}\n`)
          .join('')
      );
    case 'refresh_workflow_incident_metrics_command':
      return undefined;
    case 'get_correlated_incident_timeline_command': {
      const incidentId = String(args?.incidentId ?? '');
      const row = stubOpsIncidents.get(incidentId);
      if (!row) {
        throw new Error('incident not found');
      }
      let cum = 0;
      return row.history.map(h => {
        if (
          h.eventType === 'CORRELATED_EVENT' ||
          h.eventType === 'ALERT_CORRELATED'
        ) {
          cum += 1;
        }
        return {
          timestamp: h.eventTimestamp,
          eventType: h.eventType,
          correlationCount: cum,
        };
      });
    }
    case 'scan_systemic_failure_bursts_command':
      return 0;
    case 'detect_stabilization_phase_command':
      return 0;
    case 'start_manual_incident_suppression_command': {
      if (!isAdminRole(String(args?.callerRole ?? ''))) {
        throw new Error('admin role required for manual suppression');
      }
      return nextId('sup');
    }
    case 'debug_trigger_failure_command': {
      if (!isAdminRole(String(args?.callerRole ?? ''))) {
        throw new Error('admin or debug required');
      }
      const mode = String(args?.mode ?? 'api_timeout').trim();
      if (mode === 'trigger_burst_failure') {
        const burstEntity = `burst-sim-${nextId('be')}`;
        const iid = nextId('inc');
        const cid = nextId('corr');
        const ckey = `job_monitor:DEBUG_BURST_CLUSTER:${burstEntity}`;
        const t = ISO(stubOpsClock);
        const hist: Array<{
          historyId: string;
          eventType: string;
          eventTimestamp: string;
          notes: string | null;
          details: Record<string, unknown>;
        }> = [
          {
            historyId: nextId('h'),
            eventType: 'CREATED',
            eventTimestamp: t,
            notes: 'Incident opened from critical alert',
            details: { alertId: nextId('al') },
          },
        ];
        for (let i = 0; i < 9; i++) {
          const aid = nextId('al-dbg');
          hist.push({
            historyId: nextId('h'),
            eventType: 'CORRELATED_EVENT',
            eventTimestamp: t,
            notes: 'Additional alert correlated into existing incident',
            details: { alertReference: aid, correlationKey: ckey, index: i },
          });
        }
        stubOpsIncidents.set(iid, {
          incidentId: iid,
          createdAt: t,
          severity: 'CRITICAL',
          status: 'OPEN',
          sourceModule: 'job_monitor',
          summaryPreview: 'stub burst cluster',
          linkedAlertId: nextId('al'),
          correlationId: cid,
          correlationKey: ckey,
          errorContext: { message: 'stub burst', correlationKey: ckey },
          rootCauseSummary: null,
          resolvedAt: null,
          history: hist,
        });
        return {
          ok: true,
          mode,
          burstEntity,
          incidentId: iid,
          alertIdsEmitted: 10,
        };
      }
      if (mode === 'trigger_suppressed_burst') {
        return {
          ok: true,
          mode,
          suppressionId: nextId('sup'),
          alertsInserted: 8,
          suppressedCount: 8,
          incidentsTouched: 0,
        };
      }
      if (mode === 'trigger_persistent_failure') {
        return {
          ok: true,
          mode,
          openIncidentId: nextId('inc'),
          stabilizationId: nextId('stab'),
          persistenceEventsDetected: 1,
        };
      }
      if (mode === 'trigger_structured_regression') {
        return {
          ok: true,
          mode,
          previousIncidentId: nextId('prev'),
          stabilizationId: nextId('stab'),
          structuredEventId: nextId('se'),
          regressionIncidentId: nextId('inc'),
        };
      }
      if (mode === 'trigger_regression_failure') {
        const iid = nextId('inc');
        const t = ISO(stubOpsClock);
        stubOpsIncidents.set(iid, {
          incidentId: iid,
          createdAt: t,
          severity: 'CRITICAL',
          status: 'OPEN',
          sourceModule: 'deployment',
          summaryPreview: 'stub regression after stabilization',
          linkedAlertId: nextId('al'),
          correlationId: nextId('corr'),
          correlationKey: 'deployment:DEBUG_REGRESSION_DRILL:stub-entity',
          errorContext: { message: 'regression drill' },
          rootCauseSummary: null,
          resolvedAt: null,
          history: [
            {
              historyId: nextId('h'),
              eventType: 'CREATED',
              eventTimestamp: t,
              notes: 'Incident opened from critical alert',
              details: {},
            },
            {
              historyId: nextId('h'),
              eventType: 'REGRESSION_DETECTED',
              eventTimestamp: t,
              notes: 'Post-stabilization regression',
              details: {
                timeSinceStabilization: 14,
                previousIncidentId: 'prev-stub',
              },
            },
          ],
        });
        return {
          ok: true,
          mode,
          previousIncidentId: 'prev-stub',
          newIncidentId: iid,
          stabilizationId: nextId('stab'),
          alertId: nextId('al'),
        };
      }
      if (mode === 'trigger_recovery_stabilization') {
        const iid = nextId('inc');
        const t = ISO(stubOpsClock);
        const stabId = nextId('stab');
        stubOpsIncidents.set(iid, {
          incidentId: iid,
          createdAt: t,
          severity: 'CRITICAL',
          status: 'OPEN',
          sourceModule: 'job_monitor',
          summaryPreview: 'stub recovery stabilization drill',
          linkedAlertId: nextId('al'),
          correlationId: nextId('corr'),
          correlationKey: 'job_monitor:DEBUG_RECOVERY_STABILIZE:stub-entity',
          errorContext: { message: 'stabilization drill' },
          rootCauseSummary: null,
          resolvedAt: null,
          history: [
            {
              historyId: nextId('h'),
              eventType: 'CREATED',
              eventTimestamp: t,
              notes: 'Incident opened from critical alert',
              details: {},
            },
            {
              historyId: nextId('h'),
              eventType: 'STABILIZATION_STARTED',
              eventTimestamp: t,
              notes: 'Stabilization phase detected',
              details: { stabilizationId: stabId, quietMinutesObserved: 45 },
            },
            {
              historyId: nextId('h'),
              eventType: 'STABILIZATION_CONFIRMED',
              eventTimestamp: t,
              notes: 'Stability window confirmed',
              details: {
                stabilizationId: stabId,
                stabilityDurationMinutes: 24,
                confidenceScore: 0.88,
              },
            },
            {
              historyId: nextId('h'),
              eventType: 'STABILIZATION_RESOLUTION_RECOMMENDED',
              eventTimestamp: t,
              notes: 'Consider resolving after operator review',
              details: { stabilizationId: stabId },
            },
          ],
        });
        return {
          ok: true,
          mode,
          burstEntity: `stabilize-sim-${nextId('be')}`,
          signalType: 'DEBUG_RECOVERY_STABILIZE',
          alertsInserted: 10,
          lastAlertId: nextId('al'),
          incidentId: iid,
          stabilizationTransitions: 2,
        };
      }
      const aid = nextId('al-dbg');
      const iid = nextId('inc');
      const t = ISO(stubOpsClock);
      const msg = `stub debug failure (${mode})`;
      const cid = nextId('corr');
      const ckey = `job_monitor|DEBUG_STUB|__global__`;
      stubOpsIncidents.set(iid, {
        incidentId: iid,
        createdAt: t,
        severity:
          mode.includes('job') || mode.includes('recovery')
            ? 'FATAL'
            : 'CRITICAL',
        status: 'OPEN',
        sourceModule: 'job_monitor',
        summaryPreview: msg,
        linkedAlertId: aid,
        correlationId: cid,
        correlationKey: ckey,
        errorContext: { message: msg, linkedAlertId: aid },
        rootCauseSummary: null,
        resolvedAt: null,
        history: [
          {
            historyId: nextId('h'),
            eventType: 'CREATED',
            eventTimestamp: t,
            notes: 'Incident opened from critical alert',
            details: { alertId: aid },
          },
        ],
      });
      return { ok: true, alertId: aid, mode };
    }
    default:
      return null;
  }
}
