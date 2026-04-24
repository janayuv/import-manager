import { invoke } from '@tauri-apps/api/core';

import type {
  AuditVerificationSummary,
  PredictiveRisk,
  RecoveryReadinessReport,
  ReliabilityDiagnostics,
  WorkflowHealthSummary,
  WorkflowMaintenanceHistoryRow,
} from '@/types/dashboard-metrics';

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
