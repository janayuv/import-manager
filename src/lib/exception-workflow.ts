import { invoke } from '@tauri-apps/api/core';

import type { EntityExceptionDto } from '@/types/dashboard-metrics';

export type ExceptionCaseQuery = {
  status?: string;
  exceptionType?: string;
  limit?: number;
};

export type UpdateExceptionCaseInput = {
  id: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  userId?: string;
};

export type AddExceptionNoteInput = {
  exceptionCaseId: string;
  userId: string;
  noteText: string;
};

export type BulkResolveInput = {
  caseIds: string[];
  userId: string;
  status: string;
  notes?: string;
};

export type LifecycleEventRow = {
  id: string;
  exceptionCaseId: string;
  eventType: string;
  userId?: string | null;
  details: string;
  createdAt: string;
};

export type ExceptionNoteRow = {
  noteId: string;
  exceptionCaseId: string;
  userId: string;
  noteText: string;
  createdAt: string;
};

export async function listExceptionCases(
  query?: ExceptionCaseQuery
): Promise<EntityExceptionDto[]> {
  return invoke<EntityExceptionDto[]>('list_exception_cases', {
    query: query ?? null,
  });
}

export async function updateExceptionCase(
  input: UpdateExceptionCaseInput
): Promise<void> {
  await invoke('update_exception_case', { input });
}

export async function addExceptionNote(
  input: AddExceptionNoteInput
): Promise<void> {
  await invoke('add_exception_note', { input });
}

export async function listExceptionNotes(
  exceptionCaseId: string
): Promise<ExceptionNoteRow[]> {
  return invoke<ExceptionNoteRow[]>('list_exception_notes', {
    exceptionCaseId,
  });
}

export async function getExceptionLifecycleEvents(
  exceptionCaseId: string
): Promise<LifecycleEventRow[]> {
  return invoke<LifecycleEventRow[]>('get_exception_lifecycle_events', {
    exceptionCaseId,
  });
}

export async function recordExceptionViewed(
  exceptionCaseId: string,
  userId: string
): Promise<void> {
  await invoke('record_exception_viewed', { exceptionCaseId, userId });
}

export async function bulkResolveExceptionCases(
  input: BulkResolveInput
): Promise<number> {
  return invoke<number>('bulk_resolve_exception_cases', { input });
}

export type ExceptionReliabilityReport = {
  slaMetrics: Record<string, unknown>[];
  backlogSnapshots: Record<string, unknown>[];
  latestResolutionAnalytics: Record<string, unknown> | null;
  integrityIssuesLast7Days: number;
};

export async function validateExceptionIntegrity(): Promise<number> {
  return invoke<number>('validate_exception_integrity_command');
}

export async function revalidateOpenExceptions(): Promise<void> {
  await invoke('revalidate_open_exceptions_command');
}

export type SimulateLoadReport = {
  inserted: number;
  durationMs: number;
  cleaned: number;
  ruleSimulation?: Record<string, unknown> | null;
};

export async function simulateExceptionLoad(
  count: number,
  userId: string,
  includeRuleSimulation?: boolean
): Promise<SimulateLoadReport> {
  return invoke<SimulateLoadReport>('simulate_exception_load_command', {
    count,
    userId,
    includeRuleSimulation: includeRuleSimulation ?? false,
  });
}

export async function simulateRuleExecution(): Promise<
  Record<string, unknown>
> {
  return invoke<Record<string, unknown>>('simulate_rule_execution_command');
}

export async function getExceptionReliabilityReport(): Promise<ExceptionReliabilityReport> {
  return invoke<ExceptionReliabilityReport>('get_exception_reliability_report');
}
