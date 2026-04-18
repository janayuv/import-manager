/* eslint-disable security/detect-non-literal-fs-filename -- paths are cwd + fixed test-results segments */
import fs from 'node:fs';
import path from 'node:path';

import { DRIFT_COOLDOWN_MS } from './drift-config';
import { PERFORMANCE_BUDGETS } from './performance-budgets';

/**
 * One persisted sample for `test-results/performance-history.json`.
 * The file holds a JSON array of these objects; new runs append only.
 */
export type PerformanceHistoryEntry = {
  timestamp: string;
  testName: string;
  durationMs: number;
};

const HISTORY_REL = path.join('test-results', 'performance-history.json');
const BASELINES_REL = path.join('test-results', 'performance-baselines.json');
const DRIFT_STATE_REL = path.join('test-results', 'drift-state.json');
const DRIFT_EVENTS_REL = path.join('test-results', 'drift-events.json');

/** Fallback when `testName` is not listed in `tests/drift-config.ts`. */
const DRIFT_COOLDOWN_DEFAULT_MS = 60 * 60 * 1000;

/**
 * Per-metric cooldown after a critical drift throw. Keys are `testName` strings.
 *
 * @example
 * ```json
 * {
 *   "ui-performance/shipment-import-1000-rows": {
 *     "lastCriticalTimestamp": "2026-04-17T12:00:00.000Z",
 *     "lastDriftSlope": 42.5,
 *     "lastStabilizationAt": "2026-04-17T13:00:00.000Z",
 *     "lastStabilizationSlope": 3.2
 *   }
 * }
 * ```
 */
export type PerformanceDriftStateEntry = {
  lastCriticalTimestamp?: string;
  lastDriftSlope?: number;
  /** ISO time of the last stabilization event from drift monitoring. */
  lastStabilizationAt?: string;
  /** Slope (ms per step) when stabilization was last recorded. */
  lastStabilizationSlope?: number;
};

export type PerformanceDriftStateFile = Record<
  string,
  PerformanceDriftStateEntry
>;

/**
 * Optional locked expectations (ms). Keys must match the `testName` used in metrics
 * (e.g. `ui-performance/shipment-import-1000-rows`), unless you align names in tests.
 *
 * @example
 * ```json
 * {
 *   "ui-performance/shipment-import-1000-rows": 3500,
 *   "ui-performance/invoice-bulk-import-600-lines": 5200
 * }
 * ```
 */
export type PerformanceBaselinesFile = Record<string, number>;

function resolveHistoryPath(): string {
  return path.join(process.cwd(), HISTORY_REL);
}

function resolveBaselinesPath(): string {
  return path.join(process.cwd(), BASELINES_REL);
}

function resolveDriftStatePath(): string {
  return path.join(process.cwd(), DRIFT_STATE_REL);
}

function readDriftState(): PerformanceDriftStateFile {
  const filePath = resolveDriftStatePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const out: PerformanceDriftStateFile = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) continue;
      const o = v as Record<string, unknown>;
      const ts = o.lastCriticalTimestamp;
      const slopeRaw = o.lastDriftSlope;
      const entry: PerformanceDriftStateEntry = {};
      if (typeof ts === 'string' && ts.length > 0) {
        entry.lastCriticalTimestamp = ts;
      }
      if (typeof slopeRaw === 'number' && Number.isFinite(slopeRaw)) {
        entry.lastDriftSlope = slopeRaw;
      }
      const stabAt = o.lastStabilizationAt;
      const stabSlope = o.lastStabilizationSlope;
      if (typeof stabAt === 'string' && stabAt.length > 0) {
        entry.lastStabilizationAt = stabAt;
      }
      if (typeof stabSlope === 'number' && Number.isFinite(stabSlope)) {
        entry.lastStabilizationSlope = stabSlope;
      }
      if (Object.keys(entry).length > 0) {
        out[k] = entry;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeDriftState(state: PerformanceDriftStateFile): void {
  const filePath = resolveDriftStatePath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

export type DriftLifecycleEventType =
  | 'drift-detected'
  | 'critical-drift'
  | 'recovery-detected'
  | 'stabilization-detected';

export type DriftLifecycleEventEntry = {
  timestamp: string;
  testName: string;
  eventType: DriftLifecycleEventType;
  slope: number;
};

function resolveDriftEventsPath(): string {
  return path.join(process.cwd(), DRIFT_EVENTS_REL);
}

function isDriftLifecycleEventEntry(x: unknown): x is DriftLifecycleEventEntry {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const types: DriftLifecycleEventType[] = [
    'drift-detected',
    'critical-drift',
    'recovery-detected',
    'stabilization-detected',
  ];
  return (
    typeof o.timestamp === 'string' &&
    typeof o.testName === 'string' &&
    typeof o.eventType === 'string' &&
    types.includes(o.eventType as DriftLifecycleEventType) &&
    typeof o.slope === 'number' &&
    Number.isFinite(o.slope)
  );
}

function readDriftEventsHistory(filePath: string): DriftLifecycleEventEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDriftLifecycleEventEntry);
  } catch {
    return [];
  }
}

/**
 * Appends one row to `test-results/drift-events.json` (read → push → write).
 */
function appendDriftLifecycleEvent(
  testName: string,
  eventType: DriftLifecycleEventType,
  slope: number,
  timestamp: string = new Date().toISOString()
): void {
  const filePath = resolveDriftEventsPath();
  const existing = readDriftEventsHistory(filePath);
  existing.push({
    timestamp,
    testName,
    eventType,
    slope,
  });
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`, 'utf-8');
}

function driftCooldownMsForTest(testName: string): number {
  const v = DRIFT_COOLDOWN_MS[testName];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
    ? v
    : DRIFT_COOLDOWN_DEFAULT_MS;
}

function isCriticalDriftWithinCooldown(
  testName: string,
  lastCriticalIso: string
): boolean {
  const t = Date.parse(lastCriticalIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < driftCooldownMsForTest(testName);
}

function readBaselines(): PerformanceBaselinesFile {
  const filePath = resolveBaselinesPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const out: PerformanceBaselinesFile = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function readExistingHistory(filePath: string): PerformanceHistoryEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPerformanceHistoryEntry);
  } catch {
    return [];
  }
}

function isPerformanceHistoryEntry(x: unknown): x is PerformanceHistoryEntry {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.timestamp === 'string' &&
    typeof o.testName === 'string' &&
    typeof o.durationMs === 'number' &&
    Number.isFinite(o.durationMs)
  );
}

function writeHistory(
  filePath: string,
  entries: PerformanceHistoryEntry[]
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
}

/** Current run is a regression if it exceeds this multiple of the historical average. */
const REGRESSION_FACTOR = 1.3;

/** Need this many prior samples for the same testName before comparing. */
const MIN_PRIOR_SAMPLES_FOR_REGRESSION = 3;

/** Max history rows per testName used for drift slope (most recent). */
const DRIFT_WINDOW_SIZE = 10;

/** Minimum samples in the window required to compute a slope. */
const MIN_SAMPLES_FOR_DRIFT = 3;

/** Current window is treated as "flat" when |slope| is below this (ms per step). */
const STABILIZATION_FLAT_SLOPE_ABS_MAX = 10;

/** Prior persisted slope must have |slope| at least this large to be "significant". */
const STABILIZATION_PRIOR_SLOPE_ABS_MIN = 50;

/**
 * Least-squares slope of `durations[i]` vs index `i` (0 … n−1); ms per run step in the window.
 */
function linearRegressionSlopeMsPerStep(durations: number[]): number {
  const n = durations.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = durations[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Reads the last {@link DRIFT_WINDOW_SIZE} history entries for `testName`, fits a line
 * in run order (index vs duration), and warns when the slope indicates a steady increase.
 */
export type PerformanceDriftSeverity = 'info' | 'warning' | 'critical';

function driftSeverityFromSlope(slope: number): PerformanceDriftSeverity {
  if (slope >= 200) return 'critical';
  if (slope >= 50) return 'warning';
  return 'info';
}

export function detectPerformanceDrift(testName: string): void {
  const history = readExistingHistory(resolveHistoryPath());
  const forTest = history.filter(r => r.testName === testName);
  const recent = forTest.slice(-DRIFT_WINDOW_SIZE);
  if (recent.length < MIN_SAMPLES_FOR_DRIFT) return;

  const recentDurations = recent.map(r => r.durationMs);
  const slope = linearRegressionSlopeMsPerStep(recentDurations);

  const driftState = readDriftState();
  const prevSlope = driftState[testName]?.lastDriftSlope;

  if (slope < 0 && typeof prevSlope === 'number' && prevSlope > 0) {
    console.warn(
      'Performance recovery detected',
      JSON.stringify({ testName, recentDurations, slope })
    );
    appendDriftLifecycleEvent(testName, 'recovery-detected', slope);
  }

  const stabilized =
    Math.abs(slope) < STABILIZATION_FLAT_SLOPE_ABS_MAX &&
    typeof prevSlope === 'number' &&
    Number.isFinite(prevSlope) &&
    Math.abs(prevSlope) >= STABILIZATION_PRIOR_SLOPE_ABS_MIN;

  if (stabilized) {
    console.warn(
      'Performance stabilized',
      JSON.stringify({ testName, recentDurations, slope })
    );
    appendDriftLifecycleEvent(testName, 'stabilization-detected', slope);
  }

  const nextEntry: PerformanceDriftStateEntry = {
    ...driftState[testName],
    lastDriftSlope: slope,
    ...(stabilized
      ? {
          lastStabilizationAt: new Date().toISOString(),
          lastStabilizationSlope: slope,
        }
      : {}),
  };
  driftState[testName] = nextEntry;

  if (slope <= 0) {
    writeDriftState(driftState);
    return;
  }

  const severity = driftSeverityFromSlope(slope);
  const payload = JSON.stringify({
    testName,
    recentDurations,
    slope,
    severity,
  });

  console.warn('Performance drift detected', payload);
  appendDriftLifecycleEvent(testName, 'drift-detected', slope);

  if (severity === 'critical') {
    appendDriftLifecycleEvent(testName, 'critical-drift', slope);
    const lastCritical = driftState[testName]?.lastCriticalTimestamp;
    if (lastCritical && isCriticalDriftWithinCooldown(testName, lastCritical)) {
      console.warn(
        'Critical drift suppressed due to cooldown',
        JSON.stringify({ testName, lastCriticalTimestamp: lastCritical })
      );
      writeDriftState(driftState);
      return;
    }
    if (lastCritical) {
      console.warn(
        'Cooldown expired — drift monitoring resumed',
        JSON.stringify({
          testName,
          lastCriticalTimestamp: lastCritical,
          cooldownExpired: true,
        })
      );
    }

    driftState[testName] = {
      ...nextEntry,
      lastCriticalTimestamp: new Date().toISOString(),
    };
    writeDriftState(driftState);
    throw new Error('Critical performance drift detected');
  }

  writeDriftState(driftState);
}

export type PerformanceRegressionOptions = {
  /** When true, throws after logging so the host test fails. */
  failOnRegression?: boolean;
  /**
   * When true (default), `test-results/performance-baselines.json` overrides the
   * historical average when a numeric baseline exists for `testName`.
   */
  useBaselineIfAvailable?: boolean;
  /** When true, skips absolute budget enforcement (see `tests/performance-budgets.ts`). */
  skipBudgetCheck?: boolean;
};

/**
 * Compares `durationMs` in order: (1) absolute {@link PERFORMANCE_BUDGETS} when defined
 * for `testName`, (2) regression vs baseline file or historical average.
 * Historical path no-ops until there are at least 3 prior samples. Baseline path runs
 * without that minimum.
 */
export function checkPerformanceRegression(
  testName: string,
  durationMs: number,
  options?: PerformanceRegressionOptions
): void {
  if (options?.skipBudgetCheck !== true) {
    const budgetMs = PERFORMANCE_BUDGETS[testName];
    if (typeof budgetMs === 'number' && Number.isFinite(budgetMs)) {
      const withinBudget = durationMs <= budgetMs;
      console.warn(
        'Budget comparison',
        JSON.stringify({ testName, durationMs, budgetMs, withinBudget })
      );
      if (!withinBudget) {
        throw new Error(
          `Performance budget exceeded: ${testName} took ${durationMs} ms (budget ${budgetMs} ms)`
        );
      }
    }
  }

  const useBaselineIfAvailable = options?.useBaselineIfAvailable !== false;

  const filePath = resolveHistoryPath();
  const history = readExistingHistory(filePath);
  const forTest = history.filter(r => r.testName === testName);

  const baselines = useBaselineIfAvailable ? readBaselines() : {};
  const rawBaseline = baselines[testName];
  const baselineMs =
    typeof rawBaseline === 'number' && Number.isFinite(rawBaseline)
      ? rawBaseline
      : undefined;

  let referenceMs: number;
  let priorSampleCount: number;
  let comparison: 'baseline' | 'historicalAverage';

  if (baselineMs !== undefined) {
    referenceMs = baselineMs;
    priorSampleCount = forTest.length > 0 ? forTest.length - 1 : 0;
    comparison = 'baseline';
    console.warn(
      'Baseline comparison used',
      JSON.stringify({ testName, baselineMs, durationMs })
    );
  } else {
    if (forTest.length === 0) return;

    const prior = forTest.slice(0, -1);
    if (prior.length < MIN_PRIOR_SAMPLES_FOR_REGRESSION) return;

    const sum = prior.reduce((acc, r) => acc + r.durationMs, 0);
    referenceMs = sum / prior.length;
    priorSampleCount = prior.length;
    comparison = 'historicalAverage';
    console.warn(
      'Historical average comparison',
      JSON.stringify({
        testName,
        durationMs,
        historicalAverageMs: referenceMs,
        regressionThresholdMs: referenceMs * REGRESSION_FACTOR,
        priorSampleCount,
      })
    );
  }

  const thresholdMs = referenceMs * REGRESSION_FACTOR;
  if (durationMs <= thresholdMs) return;

  const payload =
    comparison === 'baseline'
      ? {
          testName,
          currentDurationMs: durationMs,
          baselineMs: referenceMs,
          regressionThresholdMs: thresholdMs,
          comparison,
        }
      : {
          testName,
          currentDurationMs: durationMs,
          historicalAverageMs: referenceMs,
          regressionThresholdMs: thresholdMs,
          priorSampleCount,
          comparison,
        };

  console.warn('Performance regression detected', JSON.stringify(payload));

  if (options?.failOnRegression) {
    const refLabel =
      comparison === 'baseline' ? 'baseline' : 'average of prior runs';
    throw new Error(
      `Performance regression detected: ${testName} took ${durationMs} ms (${refLabel} ${referenceMs.toFixed(1)} ms, threshold ${thresholdMs.toFixed(1)} ms)`
    );
  }
}

export type AppendPerformanceMetricInput = Omit<
  PerformanceHistoryEntry,
  'timestamp'
> & {
  timestamp?: string;
  failOnRegression?: boolean;
  useBaselineIfAvailable?: boolean;
  skipBudgetCheck?: boolean;
};

/**
 * Append one metric entry without discarding prior runs (read → push → write).
 * After writing, runs {@link checkPerformanceRegression} (historical path needs ≥3
 * prior samples; baseline file can compare sooner), then {@link detectPerformanceDrift}.
 */
export function appendPerformanceMetric(
  entry: AppendPerformanceMetricInput
): void {
  const { failOnRegression, useBaselineIfAvailable, skipBudgetCheck, ...rest } =
    entry;
  const row: PerformanceHistoryEntry = {
    timestamp: rest.timestamp ?? new Date().toISOString(),
    testName: rest.testName,
    durationMs: Math.round(rest.durationMs),
  };
  appendPerformanceMetrics([row]);
  checkPerformanceRegression(row.testName, row.durationMs, {
    failOnRegression,
    useBaselineIfAvailable,
    skipBudgetCheck,
  });
  detectPerformanceDrift(row.testName);
}

/**
 * Append several entries in a single read/write (fewer races when logging bursts).
 */
export function appendPerformanceMetrics(
  newEntries: PerformanceHistoryEntry[]
): void {
  if (newEntries.length === 0) return;

  const filePath = resolveHistoryPath();
  const normalized = newEntries.map(e => ({
    timestamp: e.timestamp,
    testName: e.testName,
    durationMs: Math.round(e.durationMs),
  }));

  const existing = readExistingHistory(filePath);
  existing.push(...normalized);
  writeHistory(filePath, existing);
}
