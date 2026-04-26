/**
 * Shapes from `get_ai_extraction_summary` / `get_provider_usage_summary` (camelCase).
 */

export type AiExtractionSummary = {
  total: number;
  successCount: number;
  failureCount: number;
  ocrCount: number;
  avgConfidence: number | null;
};

export type ProviderUsageRow = {
  providerUsed: string;
  count: number;
};
