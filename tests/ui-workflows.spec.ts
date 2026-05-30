import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  appContent,
  clickPageHeaderButton,
  clickSidebarLink,
  expandNavGroup,
  expectInvoiceRecordBadge,
  expectPageMarker,
  expectShipmentTableReady,
  loginWithFreshDatabase,
  setFilesOnBridgeFileInput,
} from './playwright-helpers';

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
    await loginWithFreshDatabase(page);
  });

  test('shipment: template, import CSV, rows, export CSV + toast', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipments');

    const content = appContent(page);
    const beforeCount = await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<Array<unknown>>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      const rows = await inv('get_shipments');
      return rows.length;
    });
    await expectShipmentTableReady(page);

    const templateDl = page.waitForEvent('download');
    await content.getByRole('button', { name: 'Template' }).click();
    const template = await templateDl;
    expect(template.suggestedFilename()).toMatch(/shipment|template/i);

    await clickPageHeaderButton(page, 'Import');
    await setFilesOnBridgeFileInput(page, shipmentValidCsv);

    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 20_000,
    });

    const afterCount = await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<Array<unknown>>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      const rows = await inv('get_shipments');
      return rows.length;
    });
    expect(afterCount).toBeGreaterThan(beforeCount);
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
    await expectPageMarker(page, 'Invoices');

    await expectInvoiceRecordBadge(page, 0);

    await clickPageHeaderButton(page, 'Import Bulk');
    await setFilesOnBridgeFileInput(page, invoiceBulkValidCsv);

    const importToast = sonnerSuccess(page, 'Import Complete');
    await expect(importToast).toBeVisible({ timeout: 20_000 });
    await expect(importToast).toContainText(/invoices imported successfully/i);

    await expectInvoiceRecordBadge(page, 2);
  });

  test('item master: import then re-import shows duplicate handling', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Item Master');
    await expectPageMarker(page, 'Item Master');

    const content = appContent(page);
    const pickCsv = async (csvPath: string) => {
      await content.getByRole('button', { name: 'Import' }).click();
      await setFilesOnBridgeFileInput(page, csvPath);
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
    await expectPageMarker(page, 'Bill of Entry');

    const content = appContent(page);
    await clickPageHeaderButton(page, 'Import');
    await setFilesOnBridgeFileInput(page, boeValidCsv);

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
