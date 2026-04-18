/**
 * Critical drift throw cooldown (ms) per metric `testName`.
 * Tests not listed here use {@link DRIFT_COOLDOWN_DEFAULT_MS} in `performance-metrics.ts`.
 */
export const DRIFT_COOLDOWN_MS: Record<string, number> = {
  'ui-performance/shipment-import-1000-rows': 60 * 60 * 1000,
  'ui-performance/invoice-bulk-import-600-lines': 2 * 60 * 60 * 1000,
  'ui-performance/expense-import-200-rows': 30 * 60 * 1000,
};
