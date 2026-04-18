/**
 * Absolute time ceilings (ms) by metric `testName`.
 * Enforced in {@link checkPerformanceRegression} before baseline / historical regression.
 */
export const PERFORMANCE_BUDGETS: Record<string, number> = {
  'ui-performance/shipment-import-1000-rows': 10_000,
  'ui-performance/invoice-bulk-import-600-lines': 25_000,
  'ui-performance/expense-import-200-rows': 35_000,
};
