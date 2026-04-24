import { invoke } from '@tauri-apps/api/core';

/** Mirrors `get_system_metrics` JSON keys from the backend. */
export type SystemMetricsExport = {
  jobs: Record<string, unknown>;
  deployments: Record<string, unknown>;
  recovery: Record<string, unknown>;
  system_health: Record<string, unknown>;
  risk?: Record<string, unknown>;
};

export type SystemHealthExport = {
  status: string;
  failed_jobs: number;
  pending_recovery: number;
  risk_level: string;
  criticalSignals24h?: number;
};

export type AlertSignalRow = {
  id: string;
  createdAt: string;
  signalType: string;
  severity: string;
  entityId?: string | null;
  message: string;
  details: unknown;
};

export type AlertSignalDashboard = {
  recentSignals: AlertSignalRow[];
  severityDistribution14d: { severity: string; count: number }[];
  failureClusters: { jobId: string; errorMessage: string; count: number }[];
  alertTrends14d: { day: string; count: number }[];
};

export async function getSystemMetrics(
  callerRole: string
): Promise<SystemMetricsExport> {
  return invoke<SystemMetricsExport>('get_system_metrics_command', {
    callerRole,
  });
}

export async function getSystemHealth(
  callerRole: string
): Promise<SystemHealthExport> {
  return invoke<SystemHealthExport>('get_system_health_command', {
    callerRole,
  });
}

export async function getWorkflowAlertSignalDashboard(
  callerRole: string
): Promise<AlertSignalDashboard> {
  return invoke<AlertSignalDashboard>(
    'get_workflow_alert_signal_dashboard_command',
    {
      callerRole,
    }
  );
}

export async function listWorkflowAlertSignalLog(
  callerRole: string,
  limit?: number
): Promise<AlertSignalRow[]> {
  return invoke<AlertSignalRow[]>('list_workflow_alert_signal_log_command', {
    callerRole,
    limit,
  });
}

export async function simulateAlertEvent(
  scenario: 'JOB_FAILURE' | 'DEPLOYMENT_BLOCK' | 'RECOVERY_FAILURE',
  callerRole: string
): Promise<{ ok: boolean; scenario: string }> {
  return invoke('simulate_alert_event_command', { scenario, callerRole });
}

export async function exportMetricsSnapshotCsv(
  callerRole: string
): Promise<string> {
  return invoke<string>('export_metrics_snapshot_csv_command', { callerRole });
}
