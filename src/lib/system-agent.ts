import { invoke } from '@tauri-apps/api/core';

export type SystemAgentSettings = {
  enabled: boolean;
  model: string;
  baseUrl: string;
  confidenceThresholdMutate: number;
  maxLlmCallsPerDay: number;
  maxLlmCallsPerSession: number;
  hasApiKey: boolean;
};

export type UpdateSystemAgentSettingsInput = {
  enabled?: boolean;
  model?: string;
  baseUrl?: string;
  confidenceThresholdMutate?: number;
  maxLlmCallsPerDay?: number;
  maxLlmCallsPerSession?: number;
  deepseekApiKey?: string;
};

export type SystemAgentMessage = {
  role: string;
  content: string;
};

export type ExplainGraphEvent = {
  event: string;
  execution_id?: string;
  job_id?: string;
  status?: string;
  started_at?: string;
  error_message?: string;
  cause_code?: string;
  is_root_cause?: boolean;
};

export type ExplainGraph = {
  schemaVersion: string;
  traceSha256: string;
  generatedAt: string;
  snapshotTimestamp: string;
  dbVersion: number;
  events: ExplainGraphEvent[];
};

export type SystemAgentTurnOutput = {
  intentRoute: string;
  matchedRuleId?: string | null;
  llmUsed: boolean;
  content: string;
  explainGraph?: ExplainGraph | null;
  policyDecision?: Record<string, unknown> | null;
  groundingOk?: boolean | null;
};

export type SystemAgentObservabilitySummary = {
  totalTurns7d: number;
  llmUsedTurns7d: number;
  blockedTurns7d: number;
  blockedPercent7d: number;
};

export async function getSystemAgentSettings(
  callerRole: string
): Promise<SystemAgentSettings> {
  return invoke<SystemAgentSettings>('get_system_agent_settings', {
    callerRole,
  });
}

export async function setSystemAgentSettings(
  callerRole: string,
  input: UpdateSystemAgentSettingsInput
): Promise<SystemAgentSettings> {
  return invoke<SystemAgentSettings>('set_system_agent_settings', {
    callerRole,
    input,
  });
}

export async function systemAgentTurn(input: {
  sessionId: string;
  callerUserId: string;
  callerRole: string;
  messages: SystemAgentMessage[];
}): Promise<SystemAgentTurnOutput> {
  return invoke<SystemAgentTurnOutput>('system_agent_turn', { input });
}

export async function getSystemAgentObservabilitySummary(
  callerRole: string
): Promise<SystemAgentObservabilitySummary> {
  return invoke<SystemAgentObservabilitySummary>(
    'get_system_agent_observability_summary',
    { callerRole }
  );
}
