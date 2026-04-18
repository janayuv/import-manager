/**
 * Reads `test-results/drift-events.json`, groups by `testName`, and writes
 * `test-results/drift-report.html` with Chart.js lifecycle visualizations.
 *
 * Run from repo root: `npx tsx scripts/generate-drift-report.ts`
 *
 * Optional: `TOOLTIP_HISTORY_LIMIT` — max drift lifecycle rows in row tooltips (default 12).
 * Row tooltips are built lazily in the browser (see `data-tooltip-ref` + `__DRIFT_LIFECYCLE_EVENTS__`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const DRIFT_EVENTS_REL = path.join('test-results', 'drift-events.json');
const PERFORMANCE_HISTORY_REL = path.join(
  'test-results',
  'performance-history.json'
);
const DRIFT_REPORT_REL = path.join('test-results', 'drift-report.html');
const REPORT_BUILD_HISTORY_REL = path.join(
  'test-results',
  'report-build-history.json'
);

/** Max wall time for HTML generation (before write); warns when exceeded. */
const REPORT_BUILD_BUDGET_MS = 3000;

/** Max rows kept in `report-build-history.json` (rolling tail). */
const REPORT_BUILD_HISTORY_MAX_ENTRIES = 500;

/** Max duration samples drawn in the frequency-table sparkline. */
const SPARKLINE_MAX_POINTS = 24;

type DriftLifecycleEventType =
  | 'drift-detected'
  | 'critical-drift'
  | 'recovery-detected'
  | 'stabilization-detected';

type DriftLifecycleEventEntry = {
  timestamp: string;
  testName: string;
  eventType: DriftLifecycleEventType;
  slope: number;
};

/** Per-test lifecycle counts for drift frequency monitoring. */
type DriftFrequencySummary = {
  testName: string;
  driftCount: number;
  criticalCount: number;
  recoveryCount: number;
  stabilizationCount: number;
};

/** Daily aggregate of `drift-detected` events for rate trend analysis. */
type DriftRateTrendDay = {
  date: string;
  driftCount: number;
  significantIncrease: boolean;
};

/** One hour bucket (UTC) for drift-detected heatmap. */
type DriftHourHeatmapCell = {
  hour: number;
  count: number;
  isPeak: boolean;
};

const EVENT_COLORS: Record<DriftLifecycleEventType, string> = {
  'drift-detected': '#eab308',
  'critical-drift': '#ef4444',
  'recovery-detected': '#22c55e',
  'stabilization-detected': '#3b82f6',
};

const EVENT_LABELS: Record<DriftLifecycleEventType, string> = {
  'drift-detected': 'Drift',
  'critical-drift': 'Critical drift',
  'recovery-detected': 'Recovery',
  'stabilization-detected': 'Stabilization',
};

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

type ReportBuildHistoryEntry = {
  timestamp: string;
  durationMs: number;
};

function isReportBuildHistoryEntry(x: unknown): x is ReportBuildHistoryEntry {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.timestamp === 'string' &&
    typeof o.durationMs === 'number' &&
    Number.isFinite(o.durationMs) &&
    o.durationMs >= 0
  );
}

function readReportBuildHistory(filePath: string): ReportBuildHistoryEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReportBuildHistoryEntry);
  } catch {
    return [];
  }
}

function limitReportBuildHistoryLength(
  entries: ReportBuildHistoryEntry[]
): ReportBuildHistoryEntry[] {
  if (entries.length <= REPORT_BUILD_HISTORY_MAX_ENTRIES) {
    return entries;
  }
  return entries.slice(-REPORT_BUILD_HISTORY_MAX_ENTRIES);
}

/**
 * 0–100 score from rolling build durations vs `REPORT_BUILD_BUDGET_MS`.
 * Penalizes mean (40%) and peak (60%) as fractions of the budget so sustained
 * or spike load both reduce the score. Empty input → 100 (no signal).
 */
function computeReportHealthScore(entries: ReportBuildHistoryEntry[]): number {
  if (entries.length === 0) {
    return 100;
  }
  const durs = entries.map(e => e.durationMs);
  const avgDuration = durs.reduce((a, b) => a + b, 0) / durs.length;
  const maxDuration = Math.max(...durs);
  if (REPORT_BUILD_BUDGET_MS <= 0) {
    return 100;
  }
  const raw =
    100 -
    (avgDuration / REPORT_BUILD_BUDGET_MS) * 40 -
    (maxDuration / REPORT_BUILD_BUDGET_MS) * 60;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function reportHealthLineClass(score: number): string {
  if (score >= 80) return 'report-health-line--good';
  if (score >= 50) return 'report-health-line--warn';
  return 'report-health-line--bad';
}

function buildReportBuildStatsHtml(entries: ReportBuildHistoryEntry[]): string {
  const healthScore = computeReportHealthScore(entries);
  const healthClass = reportHealthLineClass(healthScore);
  const healthLine =
    entries.length === 0
      ? `<p class="report-health-line ${healthClass}" role="status"><strong>Report Health:</strong> <span class="report-health-score">100 / 100</span> <span class="report-health-note">(no build history yet)</span></p>`
      : `<p class="report-health-line ${healthClass}" role="status"><strong>Report Health:</strong> <span class="report-health-score">${healthScore} / 100</span> <span class="report-health-note">(vs ${REPORT_BUILD_BUDGET_MS} ms budget)</span></p>`;

  if (entries.length === 0) {
    return `<div class="report-build-stats-wrap">${healthLine}<p class="report-build-stats report-build-stats--empty" role="status"><strong>Report build stats:</strong> <span class="report-build-stats-muted">No samples yet.</span></p></div>`;
  }
  const durs = entries.map(e => e.durationMs);
  const latest = durs[durs.length - 1]!;
  const sum = durs.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / durs.length);
  const min = Math.min(...durs);
  const max = Math.max(...durs);
  const statsLine = `<p class="report-build-stats" role="status"><strong>Report build stats:</strong> Latest: <strong>${latest}</strong> ms | Avg: <strong>${avg}</strong> ms | Min: <strong>${min}</strong> ms | Max: <strong>${max}</strong> ms</p>`;
  return `<div class="report-build-stats-wrap">${healthLine}${statsLine}</div>`;
}

/** When `STRICT_REPORT_BUILD` is set, fail the process; otherwise emit a warning. */
function strictReportBuildFailOrWarn(message: string): void {
  if (process.env.STRICT_REPORT_BUILD === 'true') {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

function writeReportBuildHistory(
  cwd: string,
  entries: ReportBuildHistoryEntry[]
): void {
  const history = limitReportBuildHistoryLength(entries);
  const filePath = path.join(cwd, REPORT_BUILD_HISTORY_REL);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, 'utf-8');
}

/** Safe embedding of JSON in inline `<script>` (prevents `</script>` breakouts). */
function safeJsonForScript(v: unknown): string {
  return JSON.stringify(v).replaceAll('<', '\\u003c');
}

function readDriftEvents(filePath: string): DriftLifecycleEventEntry[] {
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

/** Matches `tests/performance-metrics.ts` history rows. */
type PerformanceHistoryEntry = {
  timestamp: string;
  testName: string;
  durationMs: number;
};

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

function readPerformanceHistory(filePath: string): PerformanceHistoryEntry[] {
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

function recentDurationsForTest(
  testName: string,
  history: PerformanceHistoryEntry[],
  limit: number
): number[] {
  const forTest = history
    .filter(r => r.testName === testName)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return forTest.slice(-limit).map(r => r.durationMs);
}

/**
 * Inline SVG sparkline for recent duration samples (ms). Flat / empty renders a placeholder.
 */
function buildSparkline(recentDurations: number[]): string {
  const w = 72;
  const h = 20;
  const pad = 2;
  const innerW = w - 2 * pad;
  const innerH = h - 2 * pad;

  if (!recentDurations.length) {
    return `<svg class="freq-sparkline freq-sparkline--empty" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><text x="6" y="14" font-size="11" fill="#94a3b8">—</text></svg>`;
  }

  const vals = recentDurations.map(d => (Number.isFinite(d) && d >= 0 ? d : 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  let pointsStr: string;
  if (vals.length === 1) {
    const y = pad + innerH / 2;
    pointsStr = `${pad},${y} ${pad + innerW},${y}`;
  } else {
    pointsStr = vals
      .map((v, i) => {
        const x = pad + (i / (vals.length - 1)) * innerW;
        const ny = (v - min) / span;
        const y = pad + innerH * (1 - ny);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  return `<svg class="freq-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Duration trend (${vals.length} samples, ms)"><polyline fill="none" stroke="#334155" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" points="${pointsStr}" /></svg>`;
}

function groupByTestName(
  events: DriftLifecycleEventEntry[]
): Map<string, DriftLifecycleEventEntry[]> {
  const map = new Map<string, DriftLifecycleEventEntry[]>();
  for (const e of events) {
    const list = map.get(e.testName);
    if (list) list.push(e);
    else map.set(e.testName, [e]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }
  return map;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function chartIdForTest(testName: string, index: number): string {
  const safe = testName.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
  return `drift_chart_${index}_${safe}`.slice(0, 120);
}

function countByType(
  events: DriftLifecycleEventEntry[]
): Record<DriftLifecycleEventType, number> {
  const counts: Record<DriftLifecycleEventType, number> = {
    'drift-detected': 0,
    'critical-drift': 0,
    'recovery-detected': 0,
    'stabilization-detected': 0,
  };
  for (const e of events) {
    counts[e.eventType] += 1;
  }
  return counts;
}

function driftFrequencySummaries(
  grouped: Map<string, DriftLifecycleEventEntry[]>
): DriftFrequencySummary[] {
  const rows: DriftFrequencySummary[] = [];
  for (const [testName, events] of grouped) {
    const c = countByType(events);
    rows.push({
      testName,
      driftCount: c['drift-detected'],
      criticalCount: c['critical-drift'],
      recoveryCount: c['recovery-detected'],
      stabilizationCount: c['stabilization-detected'],
    });
  }
  rows.sort(
    (a, b) =>
      b.driftCount - a.driftCount ||
      b.criticalCount - a.criticalCount ||
      a.testName.localeCompare(b.testName)
  );
  return rows;
}

/** Test names tied for the maximum `drift-detected` count (empty if all zero). */
function highestDriftFrequencyNames(
  summaries: DriftFrequencySummary[]
): Set<string> {
  if (!summaries.length) return new Set();
  const maxDrift = Math.max(...summaries.map(s => s.driftCount));
  if (maxDrift === 0) return new Set();
  return new Set(
    summaries.filter(s => s.driftCount === maxDrift).map(s => s.testName)
  );
}

const STABILITY_SCORE_TOOLTIP =
  'Stability score (0–100): 100 − (driftCount×2) − (criticalCount×5) − (recoveryCount×2) − (stabilization×3), clamped. Colors: ≥90 green, 70–89 yellow, below 70 red.';

/**
 * Stability score from lifecycle counts (0–100, higher is more stable).
 *
 *     score = 100
 *           − (summary.driftCount × 2)
 *           − (summary.criticalCount × 5)
 *           − (summary.recoveryCount × 2)
 *           − (summary.stabilizationCount × 3)
 */
function calculateStabilityScore(summary: DriftFrequencySummary): number {
  const raw =
    100 -
    summary.driftCount * 2 -
    summary.criticalCount * 5 -
    summary.recoveryCount * 2 -
    summary.stabilizationCount * 3;
  return Math.max(0, Math.min(100, raw));
}

function stabilityScoreTierClass(score: number): string {
  if (score >= 90) return 'stability-pill--tier-high';
  if (score >= 70) return 'stability-pill--tier-mid';
  return 'stability-pill--tier-low';
}

/**
 * Uses the last two drift lifecycle rows for `testName` in `lifecycleEvents` (same source as
 * `drift-events.json`), ordered by time, and compares their `slope` values.
 */
function getTrendDirection(
  testName: string,
  lifecycleEvents: DriftLifecycleEventEntry[]
): string {
  const forTest = lifecycleEvents
    .filter(e => e.testName === testName)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (forTest.length < 2) return '→';
  const prev = forTest.at(-2)!.slope;
  const curr = forTest.at(-1)!.slope;
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return '→';
  if (curr > prev) return '↑';
  if (curr < prev) return '↓';
  return '→';
}

function stabilityTrendTitle(arrow: string): string {
  if (arrow === '↑') {
    return 'Slope trend: latest drift lifecycle slope is higher than the previous one';
  }
  if (arrow === '↓') {
    return 'Slope trend: latest drift lifecycle slope is lower than the previous one';
  }
  return 'Slope trend: flat, or fewer than two drift lifecycle events for this test';
}

function stabilityPillHtml(score: number, trendArrow: string): string {
  const tier = stabilityScoreTierClass(score);
  const trendTitle = stabilityTrendTitle(trendArrow);
  return `<span class="stability-pill ${tier}" title="${escapeHtml(STABILITY_SCORE_TOOLTIP)}">Stability: ${score} <span class="stability-trend" title="${escapeHtml(trendTitle)}">${trendArrow}</span></span>`;
}

/** More than 5 drift-detected or more than 2 critical-drift events ⇒ unstable badge. */
function isUnstableSummary(summary: DriftFrequencySummary): boolean {
  return summary.driftCount > 5 || summary.criticalCount > 2;
}

const UNSTABLE_BADGE_TITLE =
  'Unstable: drift-detected count is greater than 5, or critical-drift count is greater than 2';

function unstableBadgeHtml(): string {
  return `<span class="badge-unstable" title="${escapeHtml(UNSTABLE_BADGE_TITLE)}">UNSTABLE</span>`;
}

function formatRelativeTimeSince(msAgo: number): string {
  if (!Number.isFinite(msAgo) || msAgo < 0) {
    return 'just now';
  }
  const sec = Math.floor(msAgo / 1000);
  if (sec < 60) {
    return 'under 1m ago';
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const h = Math.floor(min / 60);
  if (h < 24) {
    return `${h}h ago`;
  }
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Max drift lifecycle events listed under “Recent slopes” in row tooltips.
 * Set `TOOLTIP_HISTORY_LIMIT` to a positive integer to override; invalid or unset → 12.
 */
const TOOLTIP_HISTORY_LIMIT = ((): number => {
  const raw = process.env.TOOLTIP_HISTORY_LIMIT;
  if (raw === undefined || String(raw).trim() === '') {
    return 12;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) {
    return 12;
  }
  return n;
})();

/**
 * Elapsed time since the latest `critical-drift` row for `testName` in the drift lifecycle
 * log (same data as `drift-events.json`). Uses report generation time as "now".
 */
function timeSinceLastCritical(
  testName: string,
  lifecycleEvents: DriftLifecycleEventEntry[]
): string {
  const criticals = lifecycleEvents
    .filter(e => e.testName === testName && e.eventType === 'critical-drift')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  if (criticals.length === 0) {
    return 'Never';
  }
  const latest = criticals[0]!;
  const t = Date.parse(latest.timestamp);
  if (!Number.isFinite(t)) {
    return 'Never';
  }
  return formatRelativeTimeSince(Date.now() - t);
}

function utcCalendarDay(isoTimestamp: string): string {
  const t = Date.parse(isoTimestamp);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

function addUtcCalendarDays(ymd: string, deltaDays: number): string {
  const [ys, ms, ds] = ymd.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (![y, m, d].every(n => Number.isFinite(n))) return ymd;
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return next.toISOString().slice(0, 10);
}

/**
 * Day-over-day jump in drift-detected count considered “significant” for highlighting.
 */
function isSignificantDriftIncrease(
  prevDayCount: number,
  currDayCount: number
): boolean {
  if (currDayCount <= prevDayCount) return false;
  const delta = currDayCount - prevDayCount;
  if (prevDayCount === 0) {
    return currDayCount >= 3;
  }
  return delta >= Math.max(2, Math.ceil(prevDayCount * 0.5));
}

/**
 * Groups `drift-detected` events by UTC calendar day, counts per day, fills the
 * range from first to last drift day with zeros, and flags sharp day-over-day rises.
 */
function calculateDriftRateTrend(
  events: DriftLifecycleEventEntry[]
): DriftRateTrendDay[] {
  const driftOnly = events.filter(e => e.eventType === 'drift-detected');
  if (driftOnly.length === 0) {
    return [];
  }

  const perDay = new Map<string, number>();
  for (const e of driftOnly) {
    const day = utcCalendarDay(e.timestamp);
    if (!day) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  const sortedDays = [...perDay.keys()].sort();
  const first = sortedDays[0]!;
  const last = sortedDays[sortedDays.length - 1]!;

  const series: DriftRateTrendDay[] = [];
  for (let cur = first; ; cur = addUtcCalendarDays(cur, 1)) {
    const driftCount = perDay.get(cur) ?? 0;
    series.push({ date: cur, driftCount, significantIncrease: false });
    if (cur >= last) break;
  }

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.driftCount;
    const curr = series[i]!.driftCount;
    series[i]!.significantIncrease = isSignificantDriftIncrease(prev, curr);
  }

  return series;
}

/**
 * Buckets all `drift-detected` events by UTC hour (0–23). `isPeak` is true for every
 * hour whose count equals the global maximum (when that maximum is positive).
 */
function calculateDriftHourHeatmap(
  events: DriftLifecycleEventEntry[]
): DriftHourHeatmapCell[] {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const e of events) {
    if (e.eventType !== 'drift-detected') continue;
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) continue;
    const hour = new Date(t).getUTCHours();
    counts[hour] += 1;
  }
  const max = Math.max(0, ...counts);
  return counts.map((count, hour) => ({
    hour,
    count,
    isPeak: max > 0 && count === max,
  }));
}

function buildHtml(
  events: DriftLifecycleEventEntry[],
  grouped: Map<string, DriftLifecycleEventEntry[]>
): string {
  const perfHistoryPath = path.join(process.cwd(), PERFORMANCE_HISTORY_REL);
  const perfHistory = readPerformanceHistory(perfHistoryPath);

  const driftRateTrend = calculateDriftRateTrend(events);
  const driftHourHeatmap = calculateDriftHourHeatmap(events);
  const frequencySummary = driftFrequencySummaries(grouped);
  const topDriftTests = highestDriftFrequencyNames(frequencySummary);

  const tooltipRefTests = [...grouped.keys()].sort();
  const tooltipRefIndex = new Map(
    tooltipRefTests.map((name, index) => [name, index])
  );

  const tests = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  const payload = tests.map(([testName, events]) => {
    const counts = countByType(events);
    const order: DriftLifecycleEventType[] = [
      'drift-detected',
      'critical-drift',
      'recovery-detected',
      'stabilization-detected',
    ];
    const datasets = order.map(eventType => ({
      label: EVENT_LABELS[eventType],
      eventType,
      color: EVENT_COLORS[eventType],
      data: events
        .filter(e => e.eventType === eventType)
        .map(e => ({
          x: Date.parse(e.timestamp),
          y: e.slope,
          t: e.timestamp,
        })),
    }));
    return { testName, counts, datasets };
  });

  const summaryJson = escapeHtml(JSON.stringify(frequencySummary, null, 2));

  const frequencyTableRows = frequencySummary
    .map(s => {
      const high = topDriftTests.has(s.testName);
      const stab = calculateStabilityScore(s);
      const unstable = isUnstableSummary(s);
      const sinceCrit = timeSinceLastCritical(s.testName, events);
      const tipRef = tooltipRefIndex.get(s.testName) ?? 0;
      const rowClass = high
        ? 'freq-row-tooltip row-high-drift has-custom-tooltip'
        : 'freq-row-tooltip has-custom-tooltip';
      const sparkDurs = recentDurationsForTest(
        s.testName,
        perfHistory,
        SPARKLINE_MAX_POINTS
      );
      const sparkSvg = buildSparkline(sparkDurs);
      return `<tr class="${rowClass}" data-tooltip-ref="${tipRef}">
          <td class="col-name">${high ? '<span class="badge-high" title="Highest drift frequency">●</span> ' : ''}<span class="col-name-label">${escapeHtml(s.testName)}</span><span class="col-name-spark" title="Recent run durations (ms) from performance-history.json (${sparkDurs.length} sample${sparkDurs.length === 1 ? '' : 's'})">${sparkSvg}</span> ${unstable ? `${unstableBadgeHtml()} ` : ''}${stabilityPillHtml(stab, getTrendDirection(s.testName, events))}</td>
          <td class="num">${s.driftCount}</td>
          <td class="num">${s.criticalCount}</td>
          <td class="num">${s.recoveryCount}</td>
          <td class="num">${s.stabilizationCount}</td>
          <td class="num since-critical-col" title="Time since latest critical-drift for this test (at report build time)">${escapeHtml(sinceCrit)}</td>
        </tr>`;
    })
    .join('\n');

  const frequencySection =
    frequencySummary.length === 0
      ? ''
      : `
  <section class="frequency-panel" aria-labelledby="freq-heading">
    <h2 id="freq-heading">Drift frequency summary</h2>
    <p class="freq-note">Drift count is the number of <code>drift-detected</code> events per test.${
      topDriftTests.size > 0
        ? ` Rows with ● and a tinted background are tied for the highest drift frequency (${topDriftTests.size} test${topDriftTests.size === 1 ? '' : 's'}).`
        : ' No <code>drift-detected</code> events were recorded, so nothing is highlighted.'
    } Stability scores (0–100): 100 − 2×drift − 5×critical − 2×recovery − 3×stabilization (clamped). Pill colors: ≥90 green, 70–89 yellow, &lt;70 red. Inline sparklines use the latest durations from <code>performance-history.json</code> (— if none). Hover highlighted rows for a tooltip (built on first hover: recent slopes, last recovery / stabilization).</p>
    <div class="table-wrap">
      <table class="freq-table">
        <thead>
          <tr>
            <th scope="col">testName</th>
            <th scope="col">driftCount</th>
            <th scope="col">criticalCount</th>
            <th scope="col">recoveryCount</th>
            <th scope="col">stabilizationCount</th>
            <th scope="col">Since last critical</th>
          </tr>
        </thead>
        <tbody>
          ${frequencyTableRows}
        </tbody>
      </table>
    </div>
    <h3 class="json-heading">Summary (JSON)</h3>
    <pre class="freq-json" tabindex="0">${summaryJson}</pre>
  </section>`;

  const topUnstableTests = frequencySummary.slice(0, 3);
  const topUnstableListHtml = topUnstableTests
    .map(s => {
      const stab = calculateStabilityScore(s);
      const unstable = isUnstableSummary(s);
      const sinceCritTop = timeSinceLastCritical(s.testName, events);
      const topTipRef = tooltipRefIndex.get(s.testName) ?? 0;
      return `<li class="top-unstable-item has-custom-tooltip" data-tooltip-ref="${topTipRef}"><span class="top-unstable-line">${escapeHtml(s.testName)} ${unstable ? `${unstableBadgeHtml()} ` : ''}${stabilityPillHtml(stab, getTrendDirection(s.testName, events))} <span class="top-unstable-metric">driftCount <strong>${s.driftCount}</strong></span></span><div class="top-unstable-since">Last critical drift: <strong>${escapeHtml(sinceCritTop)}</strong></div></li>`;
    })
    .join('\n');

  const topUnstableSection =
    payload.length === 0
      ? ''
      : `
  <section class="top-unstable-panel" aria-labelledby="top-unstable-heading">
    <h2 id="top-unstable-heading">Top Unstable Tests</h2>
    <p class="top-unstable-note">Up to three tests with the highest <code>drift-detected</code> count (same ordering as the frequency table: drift, then critical, then name).</p>
    <ol class="top-unstable-list" start="1">
${topUnstableListHtml}
    </ol>
  </section>`;

  const significantTrendDays = driftRateTrend.filter(
    d => d.significantIncrease
  );
  const trendNote =
    driftRateTrend.length === 0
      ? 'No <code>drift-detected</code> events were recorded, so a daily drift rate timeline cannot be built.'
      : `Each bar is the number of <code>drift-detected</code> events on that UTC day (zero-filled between the first and last drift day). Orange bars mark a significant day-over-day increase (at least +2 and ≥50% above the prior day, or ≥3 when the prior day was 0).`;

  const trendHighlightsHtml =
    significantTrendDays.length === 0
      ? ''
      : `<p class="trend-spikes"><strong>Significant increases:</strong> ${significantTrendDays
          .map(d => {
            const i = driftRateTrend.findIndex(x => x.date === d.date);
            const prevCount = i > 0 ? driftRateTrend[i - 1]!.driftCount : 0;
            const delta = d.driftCount - prevCount;
            return `<span class="trend-spike-pill">${escapeHtml(d.date)} (Δ ${delta >= 0 ? '+' : ''}${delta}, total ${d.driftCount})</span>`;
          })
          .join(' ')}</p>`;

  const trendSection =
    payload.length === 0
      ? ''
      : `
  <section class="trend-panel" aria-labelledby="trend-heading">
    <h2 id="trend-heading">Drift Rate Trend</h2>
    <p class="trend-note">${trendNote}</p>
    ${trendHighlightsHtml}
    ${
      driftRateTrend.length > 0
        ? `<div class="chart-wrap trend-chart-wrap">
      <canvas id="drift_rate_trend_chart" aria-label="Drift rate by UTC day"></canvas>
    </div>`
        : ''
    }
  </section>`;

  const maxHourlyDrift = driftHourHeatmap.reduce(
    (m, c) => Math.max(m, c.count),
    0
  );
  const heatmapCellsHtml = driftHourHeatmap
    .map(cell => {
      const intensity = maxHourlyDrift > 0 ? cell.count / maxHourlyDrift : 0;
      const peakClass = cell.isPeak ? ' heatmap-cell--peak' : '';
      const title = `${String(cell.hour).padStart(2, '0')}:00 UTC — ${cell.count} drift-detected`;
      return `<div class="heatmap-cell${peakClass}" style="--int:${intensity}" title="${escapeHtml(title)}"><span class="heatmap-count">${cell.count > 0 ? String(cell.count) : ''}</span></div>`;
    })
    .join('\n          ');
  const heatmapAxisHtml = driftHourHeatmap
    .map(cell => `<span class="heatmap-axis-hour">${cell.hour}</span>`)
    .join('');
  const peakHours = driftHourHeatmap.filter(c => c.isPeak);
  const heatmapPeaksHtml =
    maxHourlyDrift === 0
      ? '<p class="heatmap-peaks">No <code>drift-detected</code> events; hourly heatmap is empty.</p>'
      : `<p class="heatmap-peaks"><strong>Peak drift periods (UTC):</strong> ${peakHours
          .map(
            c =>
              `<span class="heatmap-peak-pill">${String(c.hour).padStart(2, '0')}:00</span>`
          )
          .join(
            ' '
          )} <span class="heatmap-peak-meta">(tied at <strong>${maxHourlyDrift}</strong> drift-detected per hour)</span></p>`;

  const heatmapSection =
    payload.length === 0
      ? ''
      : `
  <section class="heatmap-panel" aria-labelledby="heatmap-heading">
    <h2 id="heatmap-heading">Drift heatmap</h2>
    <p class="heatmap-note">Hour of day is <strong>UTC</strong>. Each cell counts <code>drift-detected</code> events whose timestamp falls in that hour (across all days in the file). Darker = higher frequency; red outline = peak hour(s).</p>
    ${heatmapPeaksHtml}
    <div class="heatmap-visual" role="img" aria-label="Drift-detected count by UTC hour of day">
      <div class="heatmap-grid">${heatmapCellsHtml}</div>
      <div class="heatmap-axis">${heatmapAxisHtml}</div>
    </div>
  </section>`;

  const chartsHtml = payload
    .map((row, i) => {
      const id = chartIdForTest(row.testName, i);
      const c = row.counts;
      const summaryRow: DriftFrequencySummary = {
        testName: row.testName,
        driftCount: c['drift-detected'],
        criticalCount: c['critical-drift'],
        recoveryCount: c['recovery-detected'],
        stabilizationCount: c['stabilization-detected'],
      };
      const stabScore = calculateStabilityScore(summaryRow);
      const unstable = isUnstableSummary(summaryRow);
      const blockClass = topDriftTests.has(row.testName)
        ? 'test-block test-block--high-drift has-custom-tooltip'
        : 'test-block has-custom-tooltip';
      const chartTipRef = tooltipRefIndex.get(row.testName) ?? 0;
      return `
      <section class="${blockClass}" data-tooltip-ref="${chartTipRef}">
        <h2 class="test-heading">${escapeHtml(row.testName)} ${unstable ? `${unstableBadgeHtml()} ` : ''}${stabilityPillHtml(stabScore, getTrendDirection(row.testName, events))}${
          topDriftTests.has(row.testName)
            ? ' <span class="pill-high" title="Highest drift frequency (drift-detected count)">High drift</span>'
            : ''
        }</h2>
        <div class="stats">
          <span class="stat drift"><strong>${c['drift-detected']}</strong> drift</span>
          <span class="stat critical"><strong>${c['critical-drift']}</strong> critical</span>
          <span class="stat recovery"><strong>${c['recovery-detected']}</strong> recovery</span>
          <span class="stat stabilization"><strong>${c['stabilization-detected']}</strong> stabilization</span>
          <span class="stat since-critical" title="Since latest critical-drift event (at report build time)">Last critical: <strong>${escapeHtml(timeSinceLastCritical(row.testName, events))}</strong></span>
        </div>
        <div class="chart-wrap">
          <canvas id="${id}" aria-label="Drift lifecycle timeline for ${escapeHtml(row.testName)}"></canvas>
        </div>
      </section>`;
    })
    .join('\n');

  const dataJson = JSON.stringify(
    payload.map((row, i) => ({
      ...row,
      chartId: chartIdForTest(row.testName, i),
    }))
  );
  const trendDataJson = JSON.stringify(driftRateTrend);

  const reportBuildFooter = `
  <footer class="report-footer" aria-labelledby="build-trend-heading">
    <h2 id="build-trend-heading">Report Build Duration Trend</h2>
    <p class="report-footer-note">Each run appends one sample to <code>test-results/report-build-history.json</code> (oldest on the left, latest on the right; last <strong>${REPORT_BUILD_HISTORY_MAX_ENTRIES}</strong> runs retained). HTML generation budget: <strong>${REPORT_BUILD_BUDGET_MS} ms</strong>.</p>
    __REPORT_BUILD_STATS_HTML__
    <div class="chart-wrap build-duration-chart-wrap" id="report_build_duration_chart_wrap">
      <canvas id="report_build_duration_chart" aria-label="Report build duration trend"></canvas>
    </div>
    <p class="build-trend-empty" id="report_build_duration_empty" hidden>No build duration samples in history yet.</p>
  </footer>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Drift lifecycle report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
  <style>
    :root { font-family: system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
    body { margin: 0 auto; max-width: 1100px; padding: 1.5rem 1rem 3rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .sub { color: #64748b; margin-bottom: 1.25rem; font-size: 0.95rem; }
    .top-unstable-panel { background: #fff; border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); border-left: 4px solid #f87171; }
    .top-unstable-panel h2 { font-size: 1.15rem; margin: 0 0 0.5rem; color: #991b1b; }
    .top-unstable-note { color: #64748b; font-size: 0.9rem; margin: 0 0 0.75rem; line-height: 1.45; }
    .top-unstable-list { margin: 0; padding-left: 1.35rem; }
    .top-unstable-item { margin: 0.5rem 0; padding-left: 0.15rem; }
    .top-unstable-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.6rem; }
    .top-unstable-metric { font-size: 0.85rem; color: #64748b; margin-left: auto; }
    .test-block { background: #fff; border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); }
    h2 { font-size: 1.1rem; margin: 0 0 0.75rem; word-break: break-word; }
    .stats { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-bottom: 1rem; font-size: 0.9rem; }
    .stat strong { margin-right: 0.25rem; }
    .stat.drift { color: #a16207; }
    .stat.critical { color: #b91c1c; }
    .stat.recovery { color: #15803d; }
    .stat.stabilization { color: #1d4ed8; }
    .stat.since-critical { color: #991b1b; }
    .since-critical-col { color: #991b1b; font-weight: 600; }
    .top-unstable-since { font-size: 0.8rem; color: #64748b; margin: 0.25rem 0 0 1.5rem; }
    .chart-wrap { position: relative; height: 320px; }
    .empty { background: #fff; border-radius: 10px; padding: 2rem; text-align: center; color: #64748b; }
    .frequency-panel { background: #fff; border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); }
    .frequency-panel h2 { font-size: 1.15rem; margin: 0 0 0.5rem; }
    .frequency-panel h3.json-heading { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; color: #334155; }
    .freq-note { color: #64748b; font-size: 0.9rem; margin: 0 0 1rem; line-height: 1.45; }
    .table-wrap { overflow-x: auto; margin-bottom: 0.5rem; }
    .freq-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    .freq-table th, .freq-table td { text-align: left; padding: 0.5rem 0.65rem; border-bottom: 1px solid #e2e8f0; }
    .freq-table th { background: #f1f5f9; color: #475569; font-weight: 600; }
    .freq-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .freq-table .col-name { word-break: break-word; max-width: 28rem; }
    .col-name-label { vertical-align: middle; }
    .col-name-spark { display: inline-flex; vertical-align: middle; margin-left: 0.35rem; margin-right: 0.15rem; align-items: center; }
    .freq-sparkline { display: block; }
    .freq-row-tooltip.has-custom-tooltip,
    .has-custom-tooltip { cursor: help; }
    .freq-table tr.row-high-drift { background: #fffbeb; }
    .freq-table tr.row-high-drift td { border-color: #fde68a; }
    .badge-high { color: #ca8a04; font-size: 0.75rem; vertical-align: middle; }
    .freq-json { margin: 0; padding: 1rem; background: #0f172a; color: #e2e8f0; border-radius: 8px; font-size: 0.78rem; overflow-x: auto; line-height: 1.4; }
    .test-block--high-drift { border-left: 4px solid #eab308; padding-left: calc(1.5rem - 4px); }
    .pill-high { display: inline-block; margin-left: 0.35rem; padding: 0.15rem 0.45rem; font-size: 0.68rem; font-weight: 600; vertical-align: middle; color: #854d0e; background: #fef9c3; border-radius: 999px; border: 1px solid #fde047; }
    .test-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.5rem; }
    .stability-pill { display: inline-block; padding: 0.12rem 0.45rem; font-size: 0.75rem; font-weight: 600; border-radius: 6px; white-space: nowrap; }
    .stability-pill--tier-high { color: #14532d; background: #dcfce7; border: 1px solid #4ade80; }
    .stability-pill--tier-mid { color: #713f12; background: #fef9c3; border: 1px solid #eab308; }
    .stability-pill--tier-low { color: #7f1d1d; background: #fee2e2; border: 1px solid #f87171; }
    .stability-trend { font-weight: 800; font-size: 0.85em; margin-left: 0.1rem; cursor: help; }
    .badge-unstable { display: inline-block; padding: 0.1rem 0.45rem; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em; color: #fff; background: #dc2626; border-radius: 4px; border: 1px solid #991b1b; vertical-align: middle; }
    .trend-panel { background: #fff; border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); }
    .trend-panel h2 { font-size: 1.15rem; margin: 0 0 0.5rem; }
    .trend-note { color: #64748b; font-size: 0.9rem; margin: 0 0 0.75rem; line-height: 1.45; }
    .trend-spikes { font-size: 0.88rem; margin: 0 0 1rem; color: #334155; }
    .trend-spike-pill { display: inline-block; margin: 0.2rem 0.35rem 0.2rem 0; padding: 0.2rem 0.5rem; background: #ffedd5; color: #9a3412; border-radius: 6px; border: 1px solid #fdba74; }
    .trend-chart-wrap { margin-top: 0.25rem; }
    .heatmap-panel { background: #fff; border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); }
    .heatmap-panel h2 { font-size: 1.15rem; margin: 0 0 0.5rem; }
    .heatmap-note { color: #64748b; font-size: 0.9rem; margin: 0 0 0.75rem; line-height: 1.45; }
    .heatmap-peaks { font-size: 0.88rem; margin: 0 0 1rem; color: #334155; }
    .heatmap-peak-pill { display: inline-block; margin: 0.15rem 0.35rem 0.15rem 0; padding: 0.15rem 0.45rem; font-weight: 700; font-size: 0.8rem; color: #991b1b; background: #fef2f2; border: 1px solid #f87171; border-radius: 6px; }
    .heatmap-peak-meta { color: #64748b; font-weight: 400; }
    .heatmap-visual { margin-top: 0.25rem; }
    .heatmap-grid { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; margin-bottom: 2px; }
    .heatmap-axis { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; font-size: 0.62rem; color: #64748b; text-align: center; }
    .heatmap-axis-hour { min-width: 0; }
    .heatmap-cell { min-height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 5px; border: 1px solid #e2e8f0; background: hsl(43, 90%, calc(97% - var(--int) * 52%)); }
    .heatmap-cell--peak { box-shadow: 0 0 0 2px #dc2626; border-color: #f97316; }
    .heatmap-count { font-size: 0.7rem; font-weight: 800; color: #422006; font-variant-numeric: tabular-nums; }
    .report-footer { background: #fff; border-radius: 10px; padding: 1.25rem 1.5rem; margin-top: 2rem; margin-bottom: 0.5rem; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); border-top: 1px solid #e2e8f0; }
    .report-footer h2 { font-size: 1.15rem; margin: 0 0 0.5rem; color: #1e293b; }
    .report-footer-note { color: #64748b; font-size: 0.9rem; margin: 0 0 1rem; line-height: 1.45; }
    .report-build-stats-wrap { margin: 0 0 1rem; }
    .report-health-line { margin: 0 0 0.55rem; padding: 0.55rem 0.9rem; border-radius: 8px; font-size: 0.92rem; line-height: 1.45; font-variant-numeric: tabular-nums; font-weight: 500; border: 1px solid transparent; }
    .report-health-line strong { font-weight: 700; }
    .report-health-score { font-weight: 800; font-size: 1.05em; margin-left: 0.15rem; }
    .report-health-note { font-weight: 400; font-size: 0.82rem; margin-left: 0.35rem; opacity: 0.9; }
    .report-health-line--good { color: #14532d; background: #dcfce7; border-color: #4ade80; }
    .report-health-line--warn { color: #713f12; background: #fef9c3; border-color: #eab308; }
    .report-health-line--bad { color: #7f1d1d; background: #fee2e2; border-color: #f87171; }
    .report-build-stats { margin: 0; padding: 0.65rem 0.9rem; background: #f8fafc; border-radius: 8px; font-size: 0.88rem; color: #334155; line-height: 1.5; font-variant-numeric: tabular-nums; border: 1px solid #e2e8f0; }
    .report-build-stats > strong:first-child { color: #0f172a; margin-right: 0.35rem; }
    .report-build-stats-muted { color: #94a3b8; font-weight: 500; }
    .build-duration-chart-wrap { height: 260px; margin-top: 0.25rem; }
    .build-trend-empty { color: #64748b; font-size: 0.9rem; margin: 0.75rem 0 0; text-align: center; }
    .custom-tooltip {
      position: fixed;
      display: none;
      background: #222;
      color: #fff;
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 12px;
      max-width: 320px;
      z-index: 9999;
      pointer-events: none;
      line-height: 1.35;
      box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
    }
  </style>
</head>
<body>
  <h1>Drift lifecycle report</h1>
  <p class="sub">Source: <code>test-results/drift-events.json</code> — timeline shows slope at each event; markers are colored by lifecycle phase.</p>
  ${payload.length === 0 ? '<div class="empty">No drift events found. Run tests that record drift metrics, or ensure drift-events.json exists.</div>' : `${topUnstableSection}\n${frequencySection}\n${trendSection}\n${heatmapSection}\n${chartsHtml}`}
  ${reportBuildFooter}
  <div class="custom-tooltip" aria-hidden="true"></div>
  <script>
    window.__DRIFT_REPORT__ = ${dataJson};
    window.__DRIFT_RATE_TREND__ = ${trendDataJson};
    window.__REPORT_BUILD_HISTORY__ = __REPORT_BUILD_HISTORY_JSON__;
    window.__DRIFT_LIFECYCLE_EVENTS__ = ${safeJsonForScript(events)};
    window.__TOOLTIP_REF_TESTS__ = ${safeJsonForScript(tooltipRefTests)};
    window.__TOOLTIP_HISTORY_LIMIT__ = ${TOOLTIP_HISTORY_LIMIT};
  </script>
  <script>
    (function () {
      if (typeof Chart === 'undefined') return;

      var trend = window.__DRIFT_RATE_TREND__ || [];
      var trendCanvas = document.getElementById('drift_rate_trend_chart');
      if (trendCanvas && trend.length) {
        new Chart(trendCanvas, {
          type: 'bar',
          data: {
            labels: trend.map(function (r) { return r.date; }),
            datasets: [
              {
                label: 'Drift-detected count (per UTC day)',
                data: trend.map(function (r) { return r.driftCount; }),
                backgroundColor: trend.map(function (r) {
                  return r.significantIncrease ? '#f97316' : '#94a3b8';
                }),
                borderColor: trend.map(function (r) {
                  return r.significantIncrease ? '#c2410c' : '#64748b';
                }),
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: true },
              tooltip: {
                callbacks: {
                  afterBody: function (items) {
                    if (!items.length) return '';
                    var idx = items[0].dataIndex;
                    var r = trend[idx];
                    if (r && r.significantIncrease) {
                      return 'Significant increase vs previous UTC day';
                    }
                    return '';
                  },
                },
              },
            },
            scales: {
              x: {
                title: { display: true, text: 'Date (UTC)' },
                ticks: { maxRotation: 45, minRotation: 0 },
              },
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Drift count' },
                ticks: { precision: 0 },
              },
            },
          },
        });
      }

      var buildHist = window.__REPORT_BUILD_HISTORY__ || [];
      var buildCanvas = document.getElementById('report_build_duration_chart');
      var buildWrap = document.getElementById('report_build_duration_chart_wrap');
      var buildEmpty = document.getElementById('report_build_duration_empty');
      if (buildHist.length === 0) {
        if (buildWrap) buildWrap.hidden = true;
        if (buildEmpty) buildEmpty.hidden = false;
      } else if (buildCanvas) {
        var maxMs = buildHist.reduce(function (m, r) {
          return Math.max(m, typeof r.durationMs === 'number' ? r.durationMs : 0);
        }, 0);
        var useSeconds = maxMs >= 4000;
        new Chart(buildCanvas, {
          type: 'line',
          data: {
            labels: buildHist.map(function (_, i) {
              return '#' + (i + 1);
            }),
            datasets: [
              {
                label: useSeconds ? 'Build time (s)' : 'Build time (ms)',
                data: buildHist.map(function (r) {
                  var v = typeof r.durationMs === 'number' ? r.durationMs : 0;
                  return useSeconds ? v / 1000 : v;
                }),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                borderWidth: 2,
                tension: 0.25,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#2563eb',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true },
              tooltip: {
                callbacks: {
                  title: function (items) {
                    if (!items.length) return '';
                    var r = buildHist[items[0].dataIndex];
                    return r && r.timestamp ? r.timestamp : '';
                  },
                  label: function (ctx) {
                    var r = buildHist[ctx.dataIndex];
                    var ms = r && typeof r.durationMs === 'number' ? r.durationMs : 0;
                    return 'Duration: ' + ms + ' ms';
                  },
                },
              },
            },
            scales: {
              x: {
                title: { display: true, text: 'Build sequence (chronological)' },
                ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 16 },
              },
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: useSeconds ? 'Seconds' : 'Milliseconds',
                },
                ticks: useSeconds
                  ? {
                      callback: function (v) {
                        return typeof v === 'number' ? v.toFixed(2) + ' s' : v;
                      },
                    }
                  : { maxTicksLimit: 8 },
              },
            },
          },
        });
      }

      var rows = window.__DRIFT_REPORT__ || [];
      if (!rows.length) return;

      rows.forEach(function (row) {
        var canvas = document.getElementById(row.chartId);
        if (!canvas) return;

        var pointRadiusFn = function (ctx) {
          var t = ctx.dataset.eventType;
          return t === 'critical-drift' ? 9 : 6;
        };

        var datasets = row.datasets.map(function (ds) {
          return {
            label: ds.label,
            eventType: ds.eventType,
            data: ds.data,
            backgroundColor: ds.color,
            borderColor: ds.color,
            pointRadius: pointRadiusFn,
            pointHoverRadius: function (ctx) {
              return ctx.dataset.eventType === 'critical-drift' ? 11 : 8;
            },
            parsing: false,
          };
        });

        new Chart(canvas, {
          type: 'scatter',
          data: { datasets: datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  title: function (items) {
                    if (!items.length) return '';
                    var raw = items[0].raw;
                    return raw && raw.t ? raw.t : '';
                  },
                  label: function (ctx) {
                    var raw = ctx.raw;
                    var y = raw && typeof raw.y === 'number' ? raw.y.toFixed(6) : '';
                    return (ctx.dataset.label || '') + ': slope ' + y;
                  },
                },
              },
            },
            scales: {
              x: {
                type: 'linear',
                title: { display: true, text: 'Time' },
                ticks: {
                  maxTicksLimit: 8,
                  callback: function (value) {
                    var d = new Date(value);
                    return isNaN(d.getTime()) ? value : d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
                  },
                },
              },
              y: {
                title: { display: true, text: 'Slope' },
                ticks: { maxTicksLimit: 8 },
              },
            },
          },
        });
      });
    })();
  </script>
  <script>
    (function () {
      var tip = document.querySelector('.custom-tooltip');
      if (!tip) return;

      function esc(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      var active = null;
      var pad = 12;

      function positionTip(e) {
        tip.style.left = e.clientX + pad + 'px';
        tip.style.top = e.clientY + pad + 'px';
      }

      var MAX_PAYLOAD = 4000;
      var TRUNC_MARKER = '... (truncated)';

      function pack(arr) {
        return encodeURIComponent(JSON.stringify(arr));
      }

      function limitLines(lines) {
        var encoded = pack(lines);
        if (encoded.length <= MAX_PAYLOAD) return lines.slice();

        if (lines.length < 4) {
          var bump = lines.slice().concat([TRUNC_MARKER]);
          encoded = pack(bump);
          return encoded.length <= MAX_PAYLOAD
            ? bump
            : [lines[0] || 'Recent slopes:', TRUNC_MARKER];
        }

        var head = lines[0];
        var tail = lines.slice(-3);
        var originalMiddle = lines.slice(1, -3);
        var middle = originalMiddle.slice();

        while (middle.length > 0 && pack([head].concat(middle).concat(tail)).length > MAX_PAYLOAD) {
          middle.shift();
        }

        if (middle.length < originalMiddle.length) {
          middle.push(TRUNC_MARKER);
          while (
            middle.length > 1 &&
            pack([head].concat(middle).concat(tail)).length > MAX_PAYLOAD
          ) {
            if (middle[middle.length - 1] === TRUNC_MARKER) middle.pop();
            if (middle.length > 0) middle.shift();
            middle.push(TRUNC_MARKER);
          }
        }

        var out = [head].concat(middle).concat(tail);
        if (pack(out).length <= MAX_PAYLOAD) return out;
        return [head, TRUNC_MARKER].concat(tail);
      }

      function buildLines(testName, allEvents, histLimit) {
        var forTest = allEvents
          .filter(function (e) {
            return e.testName === testName;
          })
          .sort(function (a, b) {
            return Date.parse(a.timestamp) - Date.parse(b.timestamp);
          });

        var lineList = ['Recent slopes:'];
        var recent = forTest.slice(-histLimit);
        if (!recent.length) {
          lineList.push('(no drift lifecycle rows for this test)');
        } else {
          recent.forEach(function (e) {
            lineList.push(
              '  slope ' + e.slope + ' (' + e.eventType + ') @ ' + e.timestamp
            );
          });
        }

        var lastRecovery = null;
        var lastStab = null;
        for (var i = forTest.length - 1; i >= 0; i--) {
          var ev = forTest[i];
          if (!lastRecovery && ev.eventType === 'recovery-detected') lastRecovery = ev;
          if (!lastStab && ev.eventType === 'stabilization-detected') lastStab = ev;
          if (lastRecovery && lastStab) break;
        }

        lineList.push('');
        lineList.push(
          lastRecovery
            ? 'Last recovery: ' + lastRecovery.timestamp
            : 'Last recovery: (none)'
        );
        lineList.push(
          lastStab
            ? 'Last stabilization: ' + lastStab.timestamp
            : 'Last stabilization: (none)'
        );
        return lineList;
      }

      var lineCacheByRef = {};

      function getTooltipLines(refId) {
        if (lineCacheByRef[refId] !== undefined) return lineCacheByRef[refId];
        var names = window.__TOOLTIP_REF_TESTS__ || [];
        var evs = window.__DRIFT_LIFECYCLE_EVENTS__ || [];
        var lim = Number(window.__TOOLTIP_HISTORY_LIMIT__) || 12;
        var name = names[refId];
        if (!name) {
          lineCacheByRef[refId] = ['(unknown test)'];
          return lineCacheByRef[refId];
        }
        var raw = buildLines(name, evs, lim);
        lineCacheByRef[refId] = limitLines(raw);
        return lineCacheByRef[refId];
      }

      function showTip(e, el) {
        var refAttr = el.getAttribute('data-tooltip-ref');
        if (refAttr === null || refAttr === '') return;
        var refId = parseInt(refAttr, 10);
        if (!Number.isFinite(refId)) return;
        var lines = getTooltipLines(refId);
        tip.innerHTML = lines
          .map(function (line) {
            return esc(line);
          })
          .join('<br>');
        tip.style.display = 'block';
        active = el;
        positionTip(e);
      }

      function hideTip() {
        tip.style.display = 'none';
        tip.innerHTML = '';
        active = null;
      }

      document.querySelectorAll('.has-custom-tooltip').forEach(function (el) {
        el.addEventListener('mouseenter', function (e) {
          showTip(e, el);
        });
        el.addEventListener('mousemove', function (e) {
          if (active === el) positionTip(e);
        });
        el.addEventListener('mouseleave', hideTip);
      });
    })();
  </script>
</body>
</html>
`;
}

function main(): void {
  const start = performance.now();
  const cwd = process.cwd();
  const inputPath = path.join(cwd, DRIFT_EVENTS_REL);
  const outputPath = path.join(cwd, DRIFT_REPORT_REL);
  const historyPath = path.join(cwd, REPORT_BUILD_HISTORY_REL);

  const historyBefore = readReportBuildHistory(historyPath);
  const events = readDriftEvents(inputPath);
  const grouped = groupByTestName(events);
  const htmlBase = buildHtml(events, grouped);

  const durationMs = Math.round(performance.now() - start);
  const newEntry: ReportBuildHistoryEntry = {
    timestamp: new Date().toISOString(),
    durationMs: durationMs,
  };
  const mergedHistory = [...historyBefore, newEntry];
  const fullHistory = limitReportBuildHistoryLength(mergedHistory);
  const statsHtml = buildReportBuildStatsHtml(fullHistory);
  const htmlFinal = htmlBase
    .replace('__REPORT_BUILD_HISTORY_JSON__', safeJsonForScript(fullHistory))
    .replace('__REPORT_BUILD_STATS_HTML__', statsHtml);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, htmlFinal, 'utf-8');

  writeReportBuildHistory(cwd, mergedHistory);

  console.log(`Drift report generated in ${durationMs} ms`);

  if (durationMs > REPORT_BUILD_BUDGET_MS) {
    strictReportBuildFailOrWarn(
      `Report build exceeded budget: ${durationMs}ms (limit: ${REPORT_BUILD_BUDGET_MS}ms)`
    );
  }

  // Compare this run to prior-file average only (current run excluded from mean).
  if (historyBefore.length >= 5) {
    const historicalAverage =
      historyBefore.reduce((s, e) => s + e.durationMs, 0) /
      historyBefore.length;
    if (durationMs > historicalAverage * 1.3) {
      const historicalAverageRounded = Math.round(historicalAverage);
      strictReportBuildFailOrWarn(
        `Report build regression detected: ${durationMs}ms (historical avg: ${historicalAverageRounded}ms)`
      );
    }
  }

  const summary = driftFrequencySummaries(grouped);
  const top = highestDriftFrequencyNames(summary);
  const topMsg =
    top.size > 0
      ? ` Highest drift frequency: ${[...top]
          .sort((a, b) => a.localeCompare(b))
          .map(n => JSON.stringify(n))
          .join(', ')}.`
      : '';
  console.log(
    `Wrote ${outputPath} (${events.length} event(s), ${grouped.size} test(s)).${topMsg}`
  );
}

main();
