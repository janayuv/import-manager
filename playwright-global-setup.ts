import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Remove previous Playwright output under `test-results/` so each run starts clean.
 * Reporters recreate `results.json` / `results.xml` after the suite finishes.
 */
export default async function globalSetup(): Promise<void> {
  const dir = path.join(process.cwd(), 'test-results');
  await fs.rm(dir, { recursive: true, force: true });
  // Path is always cwd + literal segment "test-results" (Playwright outputDir).
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- safe fixed subdirectory
  await fs.mkdir(dir, { recursive: true });
}
