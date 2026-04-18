#!/usr/bin/env node
/**
 * Validates `test-results/performance-baselines.json`: required keys, numeric ms values.
 * Exit 0 when the file is present and well-formed (release / CI gate).
 */
import fs from 'node:fs';
import path from 'node:path';

const BASELINE_REL = path.join('test-results', 'performance-baselines.json');
const REQUIRED_KEYS = [
  'ui-performance/shipment-import-1000-rows',
  'ui-performance/invoice-bulk-import-600-lines',
  'ui-performance/expense-import-200-rows',
  'report-build',
  'full-test-runtime',
];

const abs = path.join(process.cwd(), BASELINE_REL);

if (!fs.existsSync(abs)) {
  console.error(`check-performance-baselines: missing ${BASELINE_REL}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
} catch (e) {
  console.error('check-performance-baselines: invalid JSON', e);
  process.exit(1);
}

if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
  console.error('check-performance-baselines: root must be a JSON object');
  process.exit(1);
}

const missing = [];
const bad = [];

for (const key of REQUIRED_KEYS) {
  const v = parsed[key];
  if (v === undefined) {
    missing.push(key);
    continue;
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    bad.push(`${key}=${String(v)}`);
  }
}

if (missing.length) {
  console.error(
    'check-performance-baselines: missing keys:',
    missing.join(', ')
  );
  process.exit(1);
}
if (bad.length) {
  console.error(
    'check-performance-baselines: non-positive or non-numeric:',
    bad.join(', ')
  );
  process.exit(1);
}

console.log('check-performance-baselines: OK', BASELINE_REL);
process.exit(0);
