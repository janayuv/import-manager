import { expect, test, type Page } from '@playwright/test';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(defaultUser);
  await page.locator('#password').fill(defaultPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
  await expect(
    appContent(page).getByText('Operational overview across modules')
  ).toBeVisible({ timeout: 30_000 });
}

/** Attach listeners before navigation so early errors are captured. */
function attachConsoleErrorCollector(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`[console] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return errors;
}

test.describe('Dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('isAuthenticated', 'true');
      } catch {
        /* ignore */
      }
    });
  });

  test('main KPI cards and primary sections are visible after load', async ({
    page,
  }) => {
    await login(page);
    const main = appContent(page);

    await expect(main.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      message: 'Dashboard title should render once invoke data has loaded',
    });
    await expect(
      main.getByText('Operational overview across modules')
    ).toBeVisible();

    await expect(
      main.getByText('Total Shipments', { exact: true })
    ).toBeVisible();
    await expect(main.getByText('Suppliers', { exact: true })).toBeVisible();
    await expect(
      main.getByText('Reconciled BOEs', { exact: true })
    ).toBeVisible();
    await expect(
      main.getByText('Shipment Analytics', { exact: true })
    ).toBeVisible();
    await expect(
      main.getByText('Shipment Status', { exact: true })
    ).toBeVisible();
    await expect(
      main.getByText('Invoice Trend', { exact: true })
    ).toBeVisible();
    await expect(
      main.getByText('Expenses Overview', { exact: true })
    ).toBeVisible();

    const refresh = main.getByRole('button', { name: 'Refresh' });
    await expect(refresh).toBeEnabled();
  });

  test('KPI grid shows multiple primary metric values', async ({ page }) => {
    await login(page);
    const main = appContent(page);
    const valueCells = main.locator('.text-2xl.font-bold');
    await expect(valueCells.first()).toBeVisible({
      message: 'KPI cards should render their main value line',
    });
    expect(
      await valueCells.count(),
      'dashboard KPI grid should include several metrics'
    ).toBeGreaterThanOrEqual(4);
  });

  test('tables section shows headers and either rows or empty-state copy', async ({
    page,
  }) => {
    await login(page);
    const main = appContent(page);

    await expect(
      main.getByRole('columnheader', { name: 'Invoice #' })
    ).toBeVisible();
    await expect(
      main.getByRole('columnheader', { name: 'Part Number' })
    ).toBeVisible();

    const emptyOrData = main
      .getByText(/No upcoming shipments\.|No items found\./)
      .or(main.getByRole('cell').first());
    await expect(emptyOrData.first()).toBeVisible({ timeout: 15_000 });
  });

  test('expenses overview shows totals row or explicit empty state', async ({
    page,
  }) => {
    await login(page);
    const main = appContent(page);

    const overview = main
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Expenses Overview' })
      .first();

    await expect(overview).toBeVisible();
    await expect(
      overview
        .getByText(/Total: ₹/)
        .or(overview.getByText('No expenses found.'))
    ).toBeVisible({
      timeout: 15_000,
      message:
        'Expenses overview should show a rupee total or a clear empty message',
    });
  });

  test('no console errors or uncaught exceptions during dashboard load', async ({
    page,
  }) => {
    const errors = attachConsoleErrorCollector(page);
    await login(page);
    await expect(
      appContent(page).getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();

    expect(
      errors,
      `Unexpected browser errors during dashboard load:\n${errors.join('\n')}`
    ).toEqual([]);
  });

  test('Recharts surfaces render without SVG errors', async ({ page }) => {
    await login(page);
    const charts = appContent(page).locator('.recharts-wrapper');
    await expect(charts.first()).toBeVisible({
      timeout: 20_000,
      message: 'At least one chart (Shipment Analytics) should mount',
    });

    const count = await charts.count();
    expect(
      count,
      'dashboard should render at least one Recharts container'
    ).toBeGreaterThanOrEqual(1);

    // Main plot surface (role="application"); legend icons are separate small SVGs.
    await expect(
      appContent(page)
        .locator('svg.recharts-surface[role="application"]')
        .first()
    ).toBeVisible({
      message: 'Primary chart canvas should render',
    });
  });
});
