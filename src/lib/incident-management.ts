import { invoke } from '@tauri-apps/api/core';

export type CorrelationMetricsToday = {
  metricDate: string;
  alertsGrouped: number;
  incidentsCreated: number;
  noiseReductionRatio: number;
  burstSignalsEmitted: number;
  burstsDetected?: number;
};

export type IncidentNoiseScoreToday = {
  metricDate: string;
  noiseScore: number;
  totalAlerts: number;
  alertsGrouped: number;
};

export type ActiveSuppressionRow = {
  suppressionId: string;
  sourceModule: string;
  eventType: string;
  suppressionStart: string;
  suppressionEnd: string;
  windowMinutes: number;
  suppressedEventCount: number;
  reason: string;
  confidenceScore: number;
};

export type SuppressionMetricsToday = {
  metricDate: string;
  alertsSuppressed: number;
  suppressionWindows: number;
  noiseReductionGain: number;
  confidenceScore: number;
};

export type SystemicBurstRow = {
  burstId: string;
  sourceModule: string;
  eventType: string;
  burstStartTime: string;
  burstEndTime: string;
  eventCount: number;
  baselineRate: number;
  currentRate: number;
  severity: string;
  rootCauseHint: string;
  details: Record<string, unknown>;
  durationMinutes: number;
  confidenceScore?: number;
};

export type StabilizationSignalRow = {
  stabilizationId: string;
  sourceModule: string;
  eventType: string;
  stabilizationStart: string;
  stabilizationConfirmed: string | null;
  quietMinutes: number;
  confidenceScore: number;
  stabilityDurationMinutes: number;
  phase: 'stabilizing' | 'confirmed' | string;
  tone: 'amber' | 'green' | string;
};

export type StabilizationMetricsToday = {
  metricDate: string;
  stabilizationsDetected: number;
  avgStabilizationTime: number;
  falseRecoveryRate: number;
  stabilityConfidenceAvg: number;
};

export type SystemStabilityScoreRow = {
  stabilityScore: number;
  successfulStabilizations: number;
  totalIncidents: number;
  updatedAt: string;
};

export type RegressionSignalRow = {
  regressionId: string;
  sourceModule: string;
  eventType: string;
  regressionDetectedAt: string;
  timeSinceStabilizationMinutes: number;
  confidenceScore: number;
  /** `alert` (promoted alert) or `structured_log` (structured failure path). */
  triggerSource?: 'alert' | 'structured_log' | string;
  tone: 'red' | string;
};

export type StructuredRegressionMetricsToday = {
  metricDate: string;
  structuredRegressionsDetected: number;
  avgStructuredRegressionTime: number;
  structuredRegressionRatio: number;
};

export type RegressionMetricsToday = {
  metricDate: string;
  regressionsDetected: number;
  avgRegressionTimeMinutes: number;
  regressionFrequency: number;
};

export type RegressionRiskScoreRow = {
  regressionRisk: number;
  regressionsDetected: number;
  stabilizationsDetected: number;
  updatedAt: string;
};

export type PersistenceSignalRow = {
  persistenceId: string;
  sourceModule: string;
  eventType: string;
  persistenceDetectedAt: string;
  failureRate: number;
  expectedRate: number;
  confidenceScore: number;
  tone: 'orange' | string;
};

export type PersistenceMetricsToday = {
  metricDate: string;
  persistentFailuresDetected: number;
  avgPersistenceDuration: number;
  persistenceFrequency: number;
};

export type PersistenceRiskScoreRow = {
  persistenceRisk: number;
  persistentFailuresDetected: number;
  totalIncidents: number;
  updatedAt: string;
};

export type FailureForecastBanner = {
  forecastId: string;
  sourceModule: string;
  eventType: string;
  forecastTime: string;
  predictedFailureProbability: number;
  confidenceScore: number;
  forecastHorizonMinutes: number;
  title: string;
  primaryTrigger?: string;
  trendSummary?: string;
  secondaryTriggers?: Record<string, unknown>;
  dataPointsUsed?: number;
  explanationBullets?: string[];
  recommendedActions?: string[];
  actionPriority?: string;
};

export type ForecastMetricsToday = {
  metricDate: string;
  forecastsGenerated: number;
  forecastAccuracy: number;
  forecastFalsePositiveRate: number;
  predictionAccuracyScore: number;
};

export type ForecastRiskScoreRow = {
  forecastRiskScore: number;
  highRiskForecasts: number;
  totalForecasts: number;
  updatedAt: string;
};

export type ForecastExplanationMetricsToday = {
  metricDate: string;
  explanationsGenerated: number;
  accurateExplanations: number;
  misleadingExplanations: number;
};

export type ForecastExplanationScoreRow = {
  explanationAccuracyScore: number;
  accurateExplanations: number;
  totalExplanations: number;
  updatedAt: string;
};

export type ForecastActionMetricsToday = {
  metricDate: string;
  actionsGenerated: number;
  actionsAcknowledged: number;
  actionsEffective: number;
};

export type PreventiveReliabilityScoreRow = {
  preventiveReliabilityScore: number;
  preventedFailures: number;
  totalForecastsEvaluated: number;
  updatedAt: string;
};

export type OperationsCenterDashboard = {
  healthStatus: 'green' | 'amber' | 'red' | string;
  activeIncidentCount: number;
  openFatal: number;
  openCritical: number;
  recoverySuccessRate30d: number;
  systemReliabilityScore: number;
  activeIncidents: ActiveIncidentRow[];
  postMortemIncidents: PostMortemIncidentRow[];
  postMortemTimeline: PostMortemTimelineRow[];
  metricsToday: IncidentMetricsToday | null;
  correlationMetricsToday?: CorrelationMetricsToday | null;
  incidentNoiseScoreToday?: IncidentNoiseScoreToday | null;
  suppressionMetricsToday?: SuppressionMetricsToday | null;
  stabilizationMetricsToday?: StabilizationMetricsToday | null;
  systemStabilityScore?: SystemStabilityScoreRow | null;
  stabilizationSignals?: StabilizationSignalRow[];
  regressionMetricsToday?: RegressionMetricsToday | null;
  structuredRegressionMetricsToday?: StructuredRegressionMetricsToday | null;
  regressionRiskScore?: RegressionRiskScoreRow | null;
  regressionSignals?: RegressionSignalRow[];
  persistenceMetricsToday?: PersistenceMetricsToday | null;
  persistenceRiskScore?: PersistenceRiskScoreRow | null;
  persistenceSignals?: PersistenceSignalRow[];
  activeSuppressions?: ActiveSuppressionRow[];
  activeSystemicBursts?: SystemicBurstRow[];
  failureForecastBanner?: FailureForecastBanner | null;
  forecastMetricsToday?: ForecastMetricsToday | null;
  forecastRiskScore?: ForecastRiskScoreRow | null;
  forecastExplanationMetricsToday?: ForecastExplanationMetricsToday | null;
  forecastExplanationScore?: ForecastExplanationScoreRow | null;
  forecastActionMetricsToday?: ForecastActionMetricsToday | null;
  preventiveReliabilityScore?: PreventiveReliabilityScoreRow | null;
};

export type ActiveIncidentRow = {
  incidentId: string;
  createdAt: string;
  severity: string;
  status: string;
  sourceModule: string;
  summaryPreview: string;
  linkedAlertId: string;
  relatedEventCount?: number;
  correlationClusterSize?: number;
  timeSpreadMinutes?: number;
  aggregationSummary?: string;
  correlationStreamActive?: boolean;
  correlatedOnlyInWindow?: number;
  /** Set when stabilization logic recommends operator resolution (no auto-close). */
  resolutionRecommended?: boolean;
};

export type PostMortemIncidentRow = {
  incidentId: string;
  createdAt: string;
  resolvedAt: string | null;
  severity: string;
  sourceModule: string;
  rootCauseSummary: string;
  linkedAlertId: string;
};

export type PostMortemTimelineRow = {
  historyId: string;
  incidentId: string;
  eventType: string;
  eventTimestamp: string;
  notes: string;
  severity: string;
  rootCauseSummary: string;
  incidentStatus?: string;
};

export type IncidentMetricsToday = {
  metricDate: string;
  incidentsCreatedToday: number;
  incidentsResolvedToday: number;
  avgResolutionTime: number;
  criticalIncidentCount: number;
};

export type IncidentCorrelationStats = {
  relatedEventCount: number;
  correlationClusterSize: number;
  timeSpreadMinutes: number;
  aggregationSummary: string;
  correlationStreamActive: boolean;
  correlatedOnlyInWindow: number;
  minutesSinceLastCorrelate: number | null;
};

export type IncidentDetail = {
  incidentId: string;
  createdAt: string;
  severity: string;
  status: string;
  errorContext: Record<string, unknown>;
  sourceModule: string;
  linkedAlertId: string;
  correlationId: string;
  correlationKey: string;
  triggerEventType?: string;
  correlatedEventCount?: number;
  lastCorrelatedAt?: string | null;
  resolvedAt: string | null;
  rootCauseSummary: string | null;
  relatedAlert: Record<string, unknown> | null;
  history: Array<{
    historyId: string;
    eventType: string;
    eventTimestamp: string;
    notes: string | null;
    details: Record<string, unknown>;
  }>;
  correlation?: IncidentCorrelationStats;
};

export type CorrelatedTimelineEntry = {
  timestamp: string;
  eventType: string;
  correlationCount: number;
};

export async function fetchOperationsCenterDashboard(
  callerRole: string
): Promise<OperationsCenterDashboard> {
  return invoke<OperationsCenterDashboard>(
    'get_operations_center_dashboard_command',
    { callerRole }
  );
}

export async function getWorkflowIncidentDetail(
  incidentId: string,
  callerRole: string
): Promise<IncidentDetail> {
  return invoke<IncidentDetail>('get_workflow_incident_detail_command', {
    incidentId,
    callerRole,
  });
}

export async function appendWorkflowIncidentResolutionNote(
  incidentId: string,
  notes: string,
  callerRole: string
): Promise<void> {
  await invoke('append_workflow_incident_resolution_note_command', {
    incidentId,
    notes,
    callerRole,
  });
}

export async function resolveWorkflowIncident(
  incidentId: string,
  rootCauseSummary: string,
  callerRole: string
): Promise<void> {
  await invoke('resolve_workflow_incident_command', {
    incidentId,
    rootCauseSummary,
    callerRole,
  });
}

export async function exportWorkflowIncidentsReportCsv(
  callerRole: string
): Promise<string> {
  return invoke<string>('export_workflow_incidents_report_csv_command', {
    callerRole,
  });
}

export async function refreshWorkflowIncidentMetrics(
  callerRole: string
): Promise<void> {
  await invoke('refresh_workflow_incident_metrics_command', { callerRole });
}

export async function getCorrelatedIncidentTimeline(
  incidentId: string,
  callerRole: string
): Promise<CorrelatedTimelineEntry[]> {
  return invoke<CorrelatedTimelineEntry[]>(
    'get_correlated_incident_timeline_command',
    { incidentId, callerRole }
  );
}

/** Optional manual systemic burst scan (same logic as daily maintenance). */
export async function scanSystemicFailureBursts(
  callerRole: string
): Promise<number> {
  return invoke<number>('scan_systemic_failure_bursts_command', { callerRole });
}

/** Runs suppression refresh + stabilization phase detection (same as dashboard load). */
export async function detectStabilizationPhase(
  callerRole: string
): Promise<number> {
  return invoke<number>('detect_stabilization_phase_command', { callerRole });
}

export async function startManualIncidentSuppression(
  sourceModule: string,
  eventType: string,
  windowMinutes: number,
  reason: string,
  incidentId: string | null | undefined,
  callerRole: string
): Promise<string> {
  return invoke<string>('start_manual_incident_suppression_command', {
    sourceModule,
    eventType,
    windowMinutes,
    reason,
    incidentId: incidentId?.trim() || null,
    callerRole,
  });
}

export async function debugTriggerFailure(
  mode: string,
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('debug_trigger_failure_command', {
    mode,
    callerRole,
  });
}

export async function submitWorkflowForecastFeedback(
  forecastId: string,
  feedbackKind: 'accurate' | 'misleading',
  callerRole: string,
  notes?: string | null
): Promise<void> {
  await invoke('submit_workflow_forecast_feedback_command', {
    forecastId: forecastId.trim(),
    feedbackKind,
    notes: notes?.trim() || null,
    callerRole,
  });
}

export async function acknowledgeWorkflowForecastActions(
  forecastId: string,
  actionTaken: string,
  callerRole: string
): Promise<void> {
  await invoke('acknowledge_workflow_forecast_actions_command', {
    forecastId: forecastId.trim(),
    actionTaken: actionTaken.trim(),
    callerRole,
  });
}
