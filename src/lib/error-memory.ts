import { invoke } from '@tauri-apps/api/core';

import { isTauriEnvironment } from '@/lib/tauri-bridge';

export type ErrorEventPayload = {
  appVersion?: string;
  buildVersion?: string;
  environment?: string;
  moduleName?: string;
  commandName?: string;
  pageName?: string;
  componentName?: string;
  errorCode?: string;
  errorCategory?: string;
  errorMessage: string;
  stackTrace?: string;
  sourceFile?: string;
  sourceFunction?: string;
  userAction?: string;
  redactedInputContext?: string;
  affectedEntityIds?: string;
  severity?: string;
  recoverable?: boolean;
  retryable?: boolean;
  appStateSnapshot?: string;
  status?: string;
  aiSummary?: string;
};

export type ErrorMemoryRow = {
  id: string;
  fingerprint: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  moduleName?: string;
  commandName?: string;
  pageName?: string;
  componentName?: string;
  errorCode?: string;
  errorCategory?: string;
  errorMessage: string;
  stackTrace?: string;
  sourceFile?: string;
  sourceFunction?: string;
  userAction?: string;
  redactedInputContext?: string;
  affectedEntityIds?: string;
  severity: string;
  recoverable: boolean;
  retryable: boolean;
  appStateSnapshot?: string;
  status: string;
  aiSummary?: string;
  occurrence_count?: number;
};

export type ErrorMemoryFilter = {
  severity?: string;
  moduleName?: string;
  commandName?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  fingerprint?: string;
  limit?: number;
};

export type ErrorMemoryMaintenanceStats = {
  totalCount: number;
  duplicateCount: number;
  oldResolvedCount: number;
  hardCap: number;
  lastCleanupAt?: string;
  lastCleanupSummary?: string;
};

export type ErrorMemoryCleanupRequest = {
  dryRun?: boolean;
  deleteLimit?: number;
};

export type ErrorMemoryCleanupResult = {
  runId: string;
  dryRun: boolean;
  triggerSource: string;
  totalBefore: number;
  totalAfter: number;
  hardCap: number;
  candidateCount: number;
  wouldPruneCount: number;
  deletedCount: number;
  protectedCount: number;
  prunedIds: string[];
  pruneReasons: string[];
  executedAt: string;
};

const APP_VERSION = '0.4.5';

const scrub = (s: string): string =>
  s
    .replace(
      /("?(token|password|secret|authorization|api[_-]?key)"?\s*[:=]\s*)"[^"]+"/gi,
      '$1"<redacted>"'
    )
    .replace(
      /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      '<redacted-jwt>'
    );

export async function captureErrorEvent(
  payload: ErrorEventPayload
): Promise<void> {
  if (!isTauriEnvironment) return;
  const safe: ErrorEventPayload = {
    ...payload,
    appVersion: payload.appVersion ?? APP_VERSION,
    environment: payload.environment ?? (import.meta.env.DEV ? 'dev' : 'local'),
    errorMessage: scrub(payload.errorMessage || 'unknown error'),
    stackTrace: payload.stackTrace
      ? scrub(payload.stackTrace).slice(0, 8000)
      : undefined,
    redactedInputContext: payload.redactedInputContext
      ? scrub(payload.redactedInputContext).slice(0, 4000)
      : undefined,
    appStateSnapshot: payload.appStateSnapshot
      ? scrub(payload.appStateSnapshot).slice(0, 4000)
      : undefined,
  };
  try {
    await invoke('capture_error_event', { payload: safe });
  } catch {
    // Must not break app flow.
  }
}

export async function listErrorEvents(
  filter?: ErrorMemoryFilter
): Promise<ErrorMemoryRow[]> {
  return invoke<ErrorMemoryRow[]>('list_error_events', { filter });
}

export async function updateErrorEventStatus(
  id: string,
  status: 'new' | 'triaged' | 'fixed' | 'ignored' | 'duplicate'
): Promise<void> {
  await invoke('update_error_event_status', { id, status });
}

export async function exportErrorEventsCursorReport(
  ids: string[]
): Promise<string> {
  return invoke<string>('export_error_events_cursor_report', { ids });
}

export async function getErrorMemoryMaintenanceStats(): Promise<ErrorMemoryMaintenanceStats> {
  return invoke<ErrorMemoryMaintenanceStats>(
    'get_error_memory_maintenance_stats'
  );
}

export async function runErrorMemoryCleanup(
  request?: ErrorMemoryCleanupRequest
): Promise<ErrorMemoryCleanupResult> {
  return invoke<ErrorMemoryCleanupResult>('run_error_memory_cleanup', {
    request,
  });
}
