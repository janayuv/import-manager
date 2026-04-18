import { defineConfig, devices } from '@playwright/test';

/** Dedicated port so Playwright can start its own Vite instance while `npm run dev` may use 1421. */
const PLAYWRIGHT_WEB_PORT = 1422;

/**
 * Playwright config for the Import Manager **web UI** (Vite dev server).
 * This exercises the same React routes as the Tauri shell loads from Vite;
 * native `invoke` IPC is unavailable unless you run the full Tauri app.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /** Screenshots, videos, and traces for failed tests only (see `use` below). */
  outputDir: 'test-results',
  globalSetup: './playwright-global-setup.ts',
  /** Longer default for heavy UI + Vite dev server (see webServer timeout). */
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  /** One worker + no file-parallelism reduces load on Vite and avoids flaky long runs. */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: `http://localhost:${PLAYWRIGHT_WEB_PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Start Vite before tests (same dev server Tauri’s `beforeDevCommand` uses). */
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PLAYWRIGHT_WEB_PORT}`,
    // Always let Playwright own the process so env (`VITE_PLAYWRIGHT`, port) stays
    // consistent and a stale manual `npm run dev` cannot be picked up mid-suite.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_PLAYWRIGHT: '1',
      VITE_DEV_SERVER_PORT: String(PLAYWRIGHT_WEB_PORT),
    },
  },
});
