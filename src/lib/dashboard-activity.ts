import { invoke } from '@tauri-apps/api/core';

const SESSION_DASHBOARD_VIEW_KEY = 'importManager.session.dashboardViewLogged';

export type DashboardActivityInput = {
  userId: string;
  actionType: string;
  details?: string;
  moduleName?: string;
  recordReference?: string;
  navigationTarget?: string;
  actionContext?: string;
};

/** Best-effort audit log; never throws to callers. */
export async function logDashboardActivity(
  input: DashboardActivityInput
): Promise<void> {
  try {
    await invoke('log_dashboard_activity', {
      input: {
        userId: input.userId,
        actionType: input.actionType,
        details: input.details ?? '',
        moduleName: input.moduleName ?? '',
        recordReference: input.recordReference ?? '',
        navigationTarget: input.navigationTarget ?? '',
        actionContext: input.actionContext ?? '',
      },
    });
  } catch (e) {
    console.warn('log_dashboard_activity', e);
  }
}

export function hasLoggedDashboardViewThisSession(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(SESSION_DASHBOARD_VIEW_KEY) === '1';
}

export function markDashboardViewLoggedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_DASHBOARD_VIEW_KEY, '1');
  } catch {
    /* ignore */
  }
}

export type DashboardActivityRow = {
  id: number;
  userId: string;
  timestamp: string;
  actionType: string;
  details: string;
  moduleName: string;
  recordReference: string;
  navigationTarget: string;
  actionContext: string;
  /** SHA-256 over immutable fields; empty for legacy rows. */
  checksum?: string;
};

export async function fetchDashboardActivityLog(
  limit = 200,
  callerUserId?: string
): Promise<DashboardActivityRow[]> {
  try {
    const uid = callerUserId?.trim();
    if (!uid) return [];
    return await invoke<DashboardActivityRow[]>('get_dashboard_activity_log', {
      limit,
      callerUserId: uid,
    });
  } catch {
    return [];
  }
}

export type ActivityLogQuery = {
  userId?: string;
  actionType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function queryDashboardActivityLog(
  query: ActivityLogQuery,
  callerUserId: string
): Promise<DashboardActivityRow[]> {
  return invoke<DashboardActivityRow[]>('query_dashboard_activity_log', {
    query,
    callerUserId,
  });
}
