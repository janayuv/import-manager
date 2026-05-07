import { safeInvoke as invoke } from '@/lib/ipc-safe';

export type RebuildDashboardResult = {
  clearedCacheRows: number;
  kpiOk: boolean;
  exceptionOk: boolean;
  workflowOk: boolean;
  warnings: string[];
  correlationId: string;
};

export async function rebuildDashboardSnapshots(
  callerUserId: string
): Promise<RebuildDashboardResult> {
  return invoke<RebuildDashboardResult>('rebuild_dashboard_snapshots', {
    callerUserId,
  });
}
