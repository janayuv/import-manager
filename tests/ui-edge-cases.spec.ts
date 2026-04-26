import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  reloadPlaywrightPageForStubHydrate,
  resetPlaywrightDatabase,
  setFilesOnBridgeFileInput,
  waitForPlaywrightInvoke,
} from './playwright-helpers';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

const shipmentInvalidWrongHeaders = path.join(
  process.cwd(),
  'test-data/shipment/invalid/shipment-invalid-wrong-headers.csv'
);
const invoiceBulkUnknownShipment = path.join(
  process.cwd(),
  'test-data/invoice/invalid/invoice-bulk-unknown-shipment-item.csv'
);
const itemMasterDuplicatePartNumbers = path.join(
  process.cwd(),
  'test-data/item-master/edge/item-master-duplicate-partNumber.csv'
);
const boeInvalidWrongHeaders = path.join(
  process.cwd(),
  'test-data/boe/invalid/boe-invalid-wrong-headers.csv'
);
const expenseImportHeaderOnly = path.join(
  process.cwd(),
  'test-data/expenses/invalid/expense-import-only-header.csv'
);

function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

async function login(page: Page) {
  await page.goto('/login');
  await waitForPlaywrightInvoke(page);
  await resetPlaywrightDatabase(page);
  await reloadPlaywrightPageForStubHydrate(page);
  await page.locator('#username').fill(defaultUser);
  await page.locator('#password').fill(defaultPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
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

function sonnerError(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({ hasText: text });
}

function sonnerWarning(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="warning"]')
    .filter({ hasText: text });
}

function sonnerInfo(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="info"]')
    .filter({ hasText: text });
}

test.describe.configure({ mode: 'serial' });

test.describe('UI edge cases and import failures', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('shipment: invalid CSV headers show error toast and list unchanged', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');

    const content = appContent(page);
    await expect(content.getByText(/Showing 1 of 1 shipments/)).toBeVisible({
      timeout: 20_000,
    });

    await content.getByRole('button', { name: 'Import' }).click();
    await setFilesOnBridgeFileInput(page, shipmentInvalidWrongHeaders);

    await expect(
      sonnerError(page, /Invalid Shipment Import|invalid shipment import/i)
    ).toBeVisible({ timeout: 20_000 });

    await expect(content.getByText(/Showing 1 of 1 shipments/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('invoice: unknown shipment reference shows validation warning and count unchanged', async ({
    page,
  }) => {
    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoice Details');

    const content = appContent(page);
    await expect(content.getByText('Showing 0 invoices')).toBeVisible({
      timeout: 20_000,
    });

    await content.getByRole('button', { name: 'Import Bulk' }).click();
    await setFilesOnBridgeFileInput(page, invoiceBulkUnknownShipment);

    await expect(
      sonnerWarning(page, /Skipping row: Shipment with invoice number/i)
    ).toBeVisible({ timeout: 20_000 });
    await expect(sonnerInfo(page, /No Valid Invoices/i)).toBeVisible({
      timeout: 15_000,
    });

    await expect(content.getByText('Showing 0 invoices')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('item master: duplicate part numbers in one file show warning and import once', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Item Master');
    await expectPageMarker(page, 'Item Master');

    const content = appContent(page);
    await content.getByRole('button', { name: 'Import' }).click();
    await setFilesOnBridgeFileInput(page, itemMasterDuplicatePartNumbers);

    await expect(
      sonnerWarning(page, /duplicate items were skipped/i)
    ).toBeVisible({ timeout: 20_000 });

    await expect(content.getByText('IMP-DUP-001', { exact: true })).toHaveCount(
      1
    );
  });

  test('BOE: malformed CSV headers show error toast and no rows added', async ({
    page,
  }) => {
    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'View All BOE');
    await expectPageMarker(page, 'Bill of Entry Details');

    const content = appContent(page);
    await content.getByRole('button', { name: 'Import' }).click();
    await setFilesOnBridgeFileInput(page, boeInvalidWrongHeaders);

    await expect(sonnerError(page, /Import Failed/i)).toBeVisible({
      timeout: 20_000,
    });

    const boeCount = await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      const list = (await inv('get_boes')) as unknown[];
      return list.length;
    });
    expect(boeCount).toBe(0);
  });

  test('expenses: CSV missing data rows shows validation warning', async ({
    page,
  }) => {
    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Manage Expenses');
    await expectPageMarker(page, 'Manage Expenses');

    await expect(page.getByText('Loading shipments...')).toBeHidden({
      timeout: 20_000,
    });

    await page.getByRole('tab', { name: 'Import Expenses' }).click();

    const importSection = appContent(page);
    const fileInput = importSection.locator('#file-upload');
    await fileInput.setInputFiles(expenseImportHeaderOnly);

    await expect(sonnerWarning(page, /Expense import validation/i)).toBeVisible(
      { timeout: 20_000 }
    );
    await expect(importSection.getByText(/Validation Errors/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
