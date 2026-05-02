import { invoke } from '@tauri-apps/api/core';

export interface UserActivityAuditLog {
  id: string;
  userId: string | null;
  actionName: string;
  entityType: string | null;
  entityId: string | null;
  detailsJson: string | null;
  status: string;
  timestamp: string;
  /** INFO | WARNING | SECURITY | CRITICAL */
  severity?: string;
}

export async function fetchUserActivityLogs(
  limit: number = 100,
  offset: number = 0,
  callerUserId?: string
): Promise<UserActivityAuditLog[]> {
  try {
    const uid = callerUserId?.trim();
    if (!uid) {
      throw new Error('Not authenticated.');
    }
    const logs = await invoke<UserActivityAuditLog[]>(
      'query_user_activity_logs',
      {
        limit,
        offset,
        callerUserId: uid,
      }
    );
    return logs;
  } catch (error) {
    console.error('Failed to fetch user activity logs:', error);
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}
