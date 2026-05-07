import { safeInvoke as invoke } from '@/lib/ipc-safe';

import type {
  AiConsistencyAuditReport,
  AuditVerificationSummary,
  Phase3TrendPoint,
  PredictiveRisk,
  RecoveryReadinessReport,
  ReliabilityDiagnostics,
  RuntimeAnomalyReport,
  SelfHealingRecoveryResult,
  WorkflowHealthSummary,
  WorkflowMaintenanceHistoryRow,
} from '@/types/dashboard-metrics';

const PHASE3_TREND_METADATA_KEY = 'phase3_safety_trend_history_v1';

export async function getWorkflowHealthSummary(): Promise<WorkflowHealthSummary> {
  return invoke<WorkflowHealthSummary>('get_workflow_health_summary');
}

export async function getWorkflowMaintenanceHistory(
  limit?: number
): Promise<WorkflowMaintenanceHistoryRow[]> {
  return invoke<WorkflowMaintenanceHistoryRow[]>(
    'get_workflow_maintenance_history',
    { limit }
  );
}

export async function runRecoveryReadinessCheck(): Promise<RecoveryReadinessReport> {
  return invoke<RecoveryReadinessReport>('run_recovery_readiness_check');
}

export async function reconstructExceptionLifecycle(): Promise<number> {
  return invoke<number>('reconstruct_exception_lifecycle');
}

export async function getReliabilityDiagnostics(): Promise<ReliabilityDiagnostics> {
  return invoke<ReliabilityDiagnostics>('get_reliability_diagnostics');
}

export async function getPredictiveWorkflowRisk(): Promise<PredictiveRisk> {
  return invoke<PredictiveRisk>('get_predictive_workflow_risk');
}

export async function getAuditVerificationSummary(): Promise<AuditVerificationSummary> {
  return invoke<AuditVerificationSummary>('get_audit_verification_summary');
}

export async function runAiConsistencyAuditor(): Promise<AiConsistencyAuditReport> {
  return invoke<AiConsistencyAuditReport>('run_ai_consistency_auditor');
}

export async function getRuntimeAnomalyReport(): Promise<RuntimeAnomalyReport> {
  return invoke<RuntimeAnomalyReport>('get_runtime_anomaly_report');
}

export async function runSelfHealingRecoveryFlow(): Promise<SelfHealingRecoveryResult> {
  return invoke<SelfHealingRecoveryResult>('run_self_healing_recovery_flow');
}

export async function getPhase3TrendHistory(): Promise<Phase3TrendPoint[]> {
  const raw = await invoke<string | null>('get_app_metadata_value', {
    key: PHASE3_TREND_METADATA_KEY,
  });
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is Phase3TrendPoint =>
          x &&
          typeof x.ts === 'string' &&
          typeof x.anomalyScore === 'number' &&
          typeof x.severity === 'string'
      )
      .slice(-12);
  } catch {
    return [];
  }
}

export async function savePhase3TrendHistory(
  trend: Phase3TrendPoint[]
): Promise<void> {
  const safe = trend
    .filter(
      (x): x is Phase3TrendPoint =>
        x &&
        typeof x.ts === 'string' &&
        typeof x.anomalyScore === 'number' &&
        typeof x.severity === 'string'
    )
    .slice(-12);
  await invoke('set_app_metadata_value', {
    key: PHASE3_TREND_METADATA_KEY,
    value: JSON.stringify(safe),
  });
}
