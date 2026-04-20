import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  reloadPlaywrightPageForStubHydrate,
  resetPlaywrightDatabase,
  waitForPlaywrightInvoke,
} from './playwright-helpers';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

const supplierFixture = path.join(
  process.cwd(),
  'test-data/supplier/valid/supplier-valid.csv'
);

const supplierInvalidWrongHeaders = path.join(
  process.cwd(),
  'test-data/supplier/invalid/supplier-invalid-wrong-headers.csv'
);
const supplierInvalidShortRow = path.join(
  process.cwd(),
  'test-data/supplier/invalid/supplier-invalid-short-row.csv'
);
const supplierInvalidBinaryPlaceholder = path.join(
  process.cwd(),
  'test-data/supplier/invalid/supplier-invalid-binary-placeholder.csv'
);

const supplierEdgeDuplicateRows = path.join(
  process.cwd(),
  'test-data/supplier/edge/supplier-edge-duplicate-consecutive-rows.csv'
);
const supplierEdgeUtf8Names = path.join(
  process.cwd(),
  'test-data/supplier/edge/supplier-edge-utf8-names.csv'
);
const supplierEdgeUtf8Bom = path.join(
  process.cwd(),
  'test-data/supplier/edge/supplier-edge-utf8-bom.csv'
);

/** Main outlet from `AppLayout` (excludes sidebar and site chrome strip). */
function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(defaultUser);
  await page.locator('#password').fill(defaultPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
  // Dashboard shows a loading skeleton until `invoke` calls settle (or fail in web-only).
  await expect(
    appContent(page).getByText('Operational overview across modules')
  ).toBeVisible({ timeout: 30_000 });
}

function sidebar(page: Page) {
  return page.locator('[data-sidebar="sidebar"]');
}

async function expandNavGroup(page: Page, parentLinkName: string) {
  const root = sidebar(page);
  const row = root.locator('[data-sidebar="menu-item"]').filter({
    has: page.getByRole('link', { name: parentLinkName, exact: true }),
  });
  const subLink = row.locator('[data-sidebar="menu-sub-button"]');
  if (
    await subLink
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }
  await row.getByRole('button', { name: 'Toggle' }).click();
  await expect(subLink.first()).toBeVisible({ timeout: 5000 });
}

async function clickSidebarLink(page: Page, name: string) {
  await sidebar(page).getByRole('link', { name, exact: true }).click();
}

async function expectPageMarker(page: Page, text: string) {
  await expect(
    appContent(page).getByText(text, { exact: true }).first()
  ).toBeVisible({
    timeout: 20_000,
  });
}

/** Clears in-memory suppliers from the Playwright `invoke` stub (see `tauri-core-playwright-stub.ts`). */
async function resetSupplierPlaywrightStub(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __IMPORT_MANAGER_STUB__?: { resetSuppliers: () => void };
    };
    w.__IMPORT_MANAGER_STUB__?.resetSuppliers?.();
  });
}

async function gotoSupplierPageWithStubReset(page: Page) {
  await resetSupplierPlaywrightStub(page);
  await page.goto('/supplier');
  await expectPageMarker(page, 'Suppliers');
}

async function pickSupplierCsv(page: Page, csvPath: string) {
  const fileChooser = page.waitForEvent('filechooser');
  await appContent(page).getByRole('button', { name: 'Import' }).click();
  (await fileChooser).setFiles(csvPath);
}

async function expectSupplierErrorToast(page: Page) {
  const err = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(err.last()).toBeVisible({ timeout: 15_000 });
  await expect(err.last()).toContainText('Supplier Error');
}

async function expectSupplierSuccessToast(page: Page) {
  const ok = page.locator('[data-sonner-toast][data-type="success"]');
  await expect(ok.last()).toBeVisible({ timeout: 15_000 });
  await expect(ok.last()).toContainText('Import Complete');
}

test.describe.configure({ mode: 'serial' });

test.describe('UI smoke', () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.goto('/login');
      await waitForPlaywrightInvoke(page);
      await resetPlaywrightDatabase(page);
      await reloadPlaywrightPageForStubHydrate(page);
      await resetSupplierPlaywrightStub(page);
    } finally {
      await page.close();
      await context.close();
    }
  });

  test('login flow redirects unauthenticated users and accepts default credentials', async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await expect(page).toHaveURL('/login');

    await login(page);
  });

  test('sidebar navigation reaches every main nav destination', async ({
    page,
  }) => {
    await login(page);

    await clickSidebarLink(page, 'Dashboard');
    await expectPageMarker(page, 'Dashboard');

    await clickSidebarLink(page, 'Supplier');
    await expectPageMarker(page, 'Suppliers');

    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');

    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoice Details');

    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoice Wizard');
    await expectPageMarker(page, 'Invoice Entry Wizard');

    await clickSidebarLink(page, 'Item Master');
    await expectPageMarker(page, 'Item Master');

    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'View All BOE');
    await expectPageMarker(page, 'Bill of Entry Details');

    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'BOE Entry');
    await expectPageMarker(page, 'BOE Entry & Calculation');

    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'BOE Summary');
    await expectPageMarker(page, 'BOE Reconciliation Report');

    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Manage Expenses');
    await expectPageMarker(page, 'Manage Expenses');

    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Expense Reports');
    await expectPageMarker(page, 'Expense Reports');

    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Data Manager');
    await expectPageMarker(page, 'Expense Data Manager');

    await clickSidebarLink(page, 'Report');
    await expectPageMarker(page, 'Consolidated Report');

    await clickSidebarLink(page, 'Database Management');
    await expectPageMarker(page, 'Database Management');

    await clickSidebarLink(page, 'Settings');
    await expectPageMarker(page, 'Settings');
  });

  test('supplier CSV import: template download and file picker', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/supplier');
    await expectPageMarker(page, 'Suppliers');

    const content = appContent(page);
    const templateDownload = page.waitForEvent('download');
    await content.getByRole('button', { name: 'Template' }).click();
    const template = await templateDownload;
    expect(template.suggestedFilename()).toMatch(/supplier/i);

    const fileChooser = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import' }).click();
    (await fileChooser).setFiles(supplierFixture);

    const toast = page.locator('[data-sonner-toast]');
    await expect(toast.first()).toBeVisible({ timeout: 20_000 });
    await expect(toast.first()).toContainText(/Import Complete|Supplier Error/);
  });

  test('supplier invalid CSV files show error toasts', async ({ page }) => {
    await login(page);
    await gotoSupplierPageWithStubReset(page);

    await pickSupplierCsv(page, supplierInvalidWrongHeaders);
    await expectSupplierErrorToast(page);

    await pickSupplierCsv(page, supplierInvalidShortRow);
    await expectSupplierErrorToast(page);

    await pickSupplierCsv(page, supplierInvalidBinaryPlaceholder);
    await expectSupplierErrorToast(page);
  });

  test('supplier edge duplicate CSV: repeated import adds rows consistently', async ({
    page,
  }) => {
    await login(page);
    await gotoSupplierPageWithStubReset(page);

    await pickSupplierCsv(page, supplierEdgeDuplicateRows);
    await expectSupplierSuccessToast(page);
    await expect(appContent(page).getByText('2 Active Suppliers')).toBeVisible({
      timeout: 15_000,
    });

    await pickSupplierCsv(page, supplierEdgeDuplicateRows);
    await expectSupplierSuccessToast(page);
    await expect(appContent(page).getByText('4 Active Suppliers')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('supplier edge UTF-8 CSV imports preserve names (incl. BOM file)', async ({
    page,
  }) => {
    await login(page);
    await gotoSupplierPageWithStubReset(page);

    await pickSupplierCsv(page, supplierEdgeUtf8Names);
    await expectSupplierSuccessToast(page);
    await expect(appContent(page).getByText('2 Active Suppliers')).toBeVisible({
      timeout: 15_000,
    });
    // Default text formatting uses titlecase / sentence rules (see `formatText`).
    await expect(
      appContent(page).getByText(/北京測試供應商 utf-8/i)
    ).toBeVisible();
    await expect(
      appContent(page).getByText(/beijing\.utf8@example\.com/i)
    ).toBeVisible();
    await expect(
      appContent(page).getByText(/muenchen\.test@example\.de/i)
    ).toBeVisible();

    await pickSupplierCsv(page, supplierEdgeUtf8Bom);
    await expectSupplierSuccessToast(page);
    await expect(appContent(page).getByText('3 Active Suppliers')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      appContent(page).getByText(/bom\.supplier@example\.com/i)
    ).toBeVisible();
  });

  test('consolidated report: search then export CSV', async ({ page }) => {
    await login(page);
    await page.goto('/report');
    await expectPageMarker(page, 'Consolidated Report');

    await appContent(page).getByRole('button', { name: 'Search' }).click();
    await expect(appContent(page).getByText('No data found')).toBeVisible({
      timeout: 20_000,
    });

    const csvDownload = page.waitForEvent('download');
    await appContent(page).getByRole('button', { name: 'Export CSV' }).click();
    const file = await csvDownload;
    expect(file.suggestedFilename()).toMatch(/^report_/);

    await expect(page.locator('[data-sonner-toast]').first()).toContainText(
      'Report Downloaded'
    );
  });
});
