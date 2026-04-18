import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

const shipmentValidCsv = path.join(
  process.cwd(),
  'test-data/shipment/valid/shipment-valid.csv'
);
const invoiceBulkValidCsv = path.join(
  process.cwd(),
  'test-data/invoice/valid/invoice-bulk-valid.csv'
);
const itemMasterValidCsv = path.join(
  process.cwd(),
  'test-data/item-master/valid/item-master-valid.csv'
);
const boeValidCsv = path.join(
  process.cwd(),
  'test-data/boe/valid/boe-valid.csv'
);

function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

async function waitForPlaywrightInvoke(page: Page) {
  await page.waitForFunction(
    () =>
      typeof (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__?: (
            cmd: string
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__ === 'function',
    { timeout: 60_000 }
  );
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

function sonnerSuccess(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="success"]')
    .filter({ hasText: text });
}

function sonnerWarning(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="warning"]')
    .filter({ hasText: text });
}

test.describe.configure({ mode: 'serial' });

test.describe('UI workflows', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForPlaywrightInvoke(page);
    await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      await inv('reset_test_database');
    });
  });

  test('shipment: template, import CSV, rows, export CSV + toast', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');

    const content = appContent(page);
    await expect(content.getByText(/Showing 1 of 1 shipments/)).toBeVisible({
      timeout: 20_000,
    });

    const templateDl = page.waitForEvent('download');
    await content.getByRole('button', { name: 'Template' }).click();
    const template = await templateDl;
    expect(template.suggestedFilename()).toMatch(/shipment|template/i);

    const importChooser = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import' }).click();
    (await importChooser).setFiles(shipmentValidCsv);

    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 20_000,
    });

    await expect(content.getByText(/Showing 2 of 2 shipments/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(content.getByText('TEST-SHIP-CSV-001')).toBeVisible();

    const exportDl = page.waitForEvent('download');
    await content.getByRole('button', { name: 'Export CSV' }).click();
    const exported = await exportDl;
    expect(exported.suggestedFilename()).toMatch(/shipment/i);

    await expect(sonnerSuccess(page, 'Export Complete')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('invoice: bulk import, success toast, row count increases', async ({
    page,
  }) => {
    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoice Details');

    const content = appContent(page);
    await expect(content.getByText('Showing 0 invoices')).toBeVisible({
      timeout: 20_000,
    });

    const fileChooser = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import Bulk' }).click();
    (await fileChooser).setFiles(invoiceBulkValidCsv);

    const importToast = sonnerSuccess(page, 'Import Complete');
    await expect(importToast).toBeVisible({ timeout: 20_000 });
    await expect(importToast).toContainText(/invoices imported successfully/i);

    await expect(content.getByText('Showing 2 invoices')).toBeVisible({
      timeout: 20_000,
    });
  });

  test('item master: import then re-import shows duplicate handling', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Item Master');
    await expectPageMarker(page, 'Item Master');

    const content = appContent(page);
    const pickCsv = async (csvPath: string) => {
      const fc = page.waitForEvent('filechooser');
      await content.getByRole('button', { name: 'Import' }).click();
      (await fc).setFiles(csvPath);
    };

    await pickCsv(itemMasterValidCsv);
    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 20_000,
    });

    await pickCsv(itemMasterValidCsv);
    await expect(
      sonnerWarning(page, /duplicate items were skipped/i)
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test('BOE: import CSV, entries visible, export CSV + toast', async ({
    page,
  }) => {
    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'View All BOE');
    await expectPageMarker(page, 'Bill of Entry Details');

    const content = appContent(page);
    const fc = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import' }).click();
    (await fc).setFiles(boeValidCsv);

    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 20_000,
    });

    await expect(content.getByText('BE-TEST-VALID-0001')).toBeVisible({
      timeout: 15_000,
    });

    await content.getByRole('button', { name: 'Export' }).click();
    await expect(sonnerSuccess(page, 'Export Complete')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('expenses: multiline create, report refresh, CSV export', async ({
    page,
  }) => {
    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Manage Expenses');
    await expectPageMarker(page, 'Manage Expenses');

    await expect(page.getByText('Loading shipments...')).toBeHidden({
      timeout: 20_000,
    });
    const shipmentCombo = appContent(page).getByRole('combobox').first();
    await expect(shipmentCombo).toBeVisible({ timeout: 10_000 });
    await shipmentCombo.click();
    // Seeded Playwright DB exposes exactly one active shipment for this flow.
    await page.locator('[data-slot="command-item"]').first().click();

    const addMulti = appContent(page).getByRole('button', {
      name: 'Add Multiple Expenses',
    });
    await expect(addMulti).toBeVisible({ timeout: 20_000 });
    await addMulti.scrollIntoViewIfNeeded();
    await addMulti.click();

    await expect(
      page.getByText('Service Provider *', { exact: false }).first()
    ).toBeVisible({ timeout: 20_000 });

    await page
      .getByText('Service Provider *')
      .locator('..')
      .getByRole('combobox')
      .click();
    await page.getByRole('option', { name: 'ACME Logistics' }).click();

    await page.locator('#invoice-number').fill('PW-MANUAL-EXP-001');

    await page.getByText('Expense Line 1').scrollIntoViewIfNeeded();
    await page
      .getByText('Expense Type *')
      .first()
      .locator('..')
      .getByRole('combobox')
      .click();
    await page.getByRole('option', { name: 'Customs Clearance' }).click();

    await page.locator('input[placeholder="0.00"]').first().fill('25000');

    await page.getByRole('button', { name: 'Create Invoice' }).click();

    await expect(sonnerSuccess(page, 'Expense Invoice Created')).toBeVisible({
      timeout: 20_000,
    });

    await clickSidebarLink(page, 'Expense Reports');
    await expectPageMarker(page, 'Expense Reports');

    const reports = appContent(page);
    await reports.getByRole('button', { name: 'Refresh' }).click();
    await expect(sonnerSuccess(page, 'Report Generated')).toBeVisible({
      timeout: 20_000,
    });

    const csvDl = page.waitForEvent('download');
    await reports.getByRole('button', { name: 'CSV', exact: true }).click();
    const file = await csvDl;
    expect(file.suggestedFilename()).toMatch(/expense|report|csv/i);
    await expect(sonnerSuccess(page, 'Export Complete')).toBeVisible({
      timeout: 15_000,
    });
  });
});
