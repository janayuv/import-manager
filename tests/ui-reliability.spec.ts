import { Buffer } from 'node:buffer';
/* eslint-disable security/detect-non-literal-fs-filename -- Playwright download paths under test runner temp */
import fs from 'node:fs';
import path from 'node:path';

import Papa from 'papaparse';
import { expect, test, type Page } from '@playwright/test';

import {
  appendPerformanceMetric,
  withProjectTestName,
} from './performance-metrics';
import {
  reloadPlaywrightPageForStubHydrate,
  resetPlaywrightDatabase,
  setFilesOnBridgeFileInput,
  waitForPlaywrightInvoke,
} from './playwright-helpers';

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

function sonnerSuccess(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="success"]')
    .filter({ hasText: text });
}

/**
 * Same columns/values style as `test-data/shipment/valid/shipment-valid.csv`.
 * Re-importing the literal fixture does not add rows (duplicate invoice numbers), so
 * reliability uses unique `invoiceNumber` / `blAwbNumber` per iteration.
 */
function buildShipmentValidStyleRow(
  invoiceNumber: string,
  blAwbNumber: string
): string {
  const header =
    'supplierId,invoiceNumber,invoiceDate,goodsCategory,invoiceValue,invoiceCurrency,incoterm,shipmentMode,shipmentType,blAwbNumber,blAwbDate,vesselName,containerNumber,grossWeightKg,etd,eta,status,dateOfDelivery';
  const row = `Sup-001,${invoiceNumber},2024-06-01,Electronics,120000,INR,FOB,FCL,40FT,${blAwbNumber},2024-06-02,Vessel Alpha,CONT-${invoiceNumber.replace(/[^A-Z0-9]/gi, '')},2200,2024-06-03,2024-06-20,in-transit,`;
  return `${header}\n${row}`;
}

async function assertNoErrorOrWarningToasts(page: Page) {
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]')
  ).toHaveCount(0);
  await expect(
    page.locator('[data-sonner-toast][data-type="warning"]')
  ).toHaveCount(0);
}

/** Sonner toasts overlay the viewport; wait until they dismiss before the next click. */
async function waitForSonnerToClear(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-sonner-toast][data-visible="true"]')
        .length === 0,
    { timeout: 20_000 }
  );
}

async function assertUniqueShipmentIds(page: Page): Promise<void> {
  const ids = await page.evaluate(async () => {
    const inv = (
      window as unknown as {
        __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
          cmd: string
        ) => Promise<Array<{ id?: string }>>;
      }
    ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
    const rows = await inv('get_shipments');
    return rows.map(r => String(r.id ?? ''));
  });
  const set = new Set(ids);
  expect(set.size, `duplicate shipment ids: ${ids.length} vs ${set.size}`).toBe(
    ids.length
  );
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('UI reliability and stress (repeated operations)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('repeat shipment import stability (5 sequential imports, shipment-valid schema)', async ({
    page,
  }, testInfo) => {
    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');
    const content = appContent(page);
    await expect(content.getByText(/Showing 1 of 1 shipments/)).toBeVisible({
      timeout: 20_000,
    });
    await content.getByRole('button', { name: 'Table' }).click();

    const timings: number[] = [];

    for (let i = 1; i <= 5; i += 1) {
      const invNo = `REL-STAB-SHP-${String(i).padStart(3, '0')}`;
      const bl = `BL-REL-STAB-${String(i).padStart(3, '0')}`;
      const csv = buildShipmentValidStyleRow(invNo, bl);
      const buf = Buffer.from(csv, 'utf-8');

      const t0 = await page.evaluate(() => performance.now());
      await content.getByRole('button', { name: 'Import' }).click();
      await setFilesOnBridgeFileInput(page, {
        name: `reliability-shipment-${i}.csv`,
        mimeType: 'text/csv',
        buffer: buf,
      });
      await expect(sonnerSuccess(page, 'Import Complete').first()).toBeVisible({
        timeout: 30_000,
      });
      const t1 = await page.evaluate(() => performance.now());
      timings.push(t1 - t0);
      appendPerformanceMetric({
        testName: withProjectTestName(
          `ui-reliability/shipment-import-stability/iter-${i}`,
          testInfo.project.name
        ),
        durationMs: t1 - t0,
      });
      await waitForSonnerToClear(page);

      const expected = 1 + i;
      await expect(
        content.getByText(`Showing ${expected} of ${expected} shipments`)
      ).toBeVisible({ timeout: 25_000 });

      await assertUniqueShipmentIds(page);
      await assertNoErrorOrWarningToasts(page);
    }

    await testInfo.attach('reliability-shipment-import-ms.json', {
      body: JSON.stringify(timings.map(ms => Math.round(ms))),
      contentType: 'application/json',
    });
  });

  test('repeat invoice bulk import stability (3 identical imports)', async ({
    page,
  }, testInfo) => {
    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoice Details');
    const content = appContent(page);
    await expect(content.getByText('Showing 0 invoices')).toBeVisible({
      timeout: 20_000,
    });

    const timings: number[] = [];

    for (let round = 1; round <= 3; round += 1) {
      const t0 = await page.evaluate(() => performance.now());
      await content.getByRole('button', { name: 'Import Bulk' }).click();
      await setFilesOnBridgeFileInput(page, invoiceBulkValidCsv);
      await expect(sonnerSuccess(page, 'Import Complete').first()).toBeVisible({
        timeout: 30_000,
      });
      const t1 = await page.evaluate(() => performance.now());
      timings.push(t1 - t0);
      appendPerformanceMetric({
        testName: withProjectTestName(
          `ui-reliability/invoice-bulk-stability/round-${round}`,
          testInfo.project.name
        ),
        durationMs: t1 - t0,
      });
      await waitForSonnerToClear(page);

      await assertNoErrorOrWarningToasts(page);

      const expectedLines = round * 2;
      await expect(
        content.getByText(`Showing ${expectedLines} invoices`)
      ).toBeVisible({ timeout: 25_000 });
    }

    await testInfo.attach('reliability-invoice-import-ms.json', {
      body: JSON.stringify(timings.map(ms => Math.round(ms))),
      contentType: 'application/json',
    });
  });

  test('repeated shipment CSV export stability (5 downloads, consistent data)', async ({
    page,
  }, testInfo) => {
    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');
    const content = appContent(page);
    await expect(content.getByText(/Showing 1 of 1 shipments/)).toBeVisible({
      timeout: 20_000,
    });
    await content.getByRole('button', { name: 'Table' }).click();

    await content.getByRole('button', { name: 'Import' }).click();
    await setFilesOnBridgeFileInput(page, shipmentValidCsv);
    await expect(sonnerSuccess(page, 'Import Complete').first()).toBeVisible({
      timeout: 25_000,
    });
    await waitForSonnerToClear(page);
    await expect(content.getByText(/Showing 2 of 2 shipments/)).toBeVisible({
      timeout: 20_000,
    });

    const fingerprints: string[] = [];
    const exportMs: number[] = [];

    for (let i = 1; i <= 5; i += 1) {
      const t0 = await page.evaluate(() => performance.now());
      const dl = page.waitForEvent('download');
      await content.getByRole('button', { name: 'Export CSV' }).click();
      const file = await dl;
      expect(file.suggestedFilename()).toMatch(/shipment/i);
      const fp = await file.path();
      if (!fp) throw new Error('missing download path');
      const text = fs.readFileSync(fp, 'utf-8');
      const t1 = await page.evaluate(() => performance.now());
      exportMs.push(t1 - t0);
      appendPerformanceMetric({
        testName: withProjectTestName(
          `ui-reliability/shipment-csv-export/iter-${i}`,
          testInfo.project.name
        ),
        durationMs: t1 - t0,
      });
      await waitForSonnerToClear(page);

      const rows = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      }).data;
      expect(rows.length).toBe(2);
      const invoices = rows
        .map(r => (r.invoiceNumber ?? '').trim())
        .filter(Boolean)
        .sort()
        .join('|');
      fingerprints.push(invoices);
    }

    expect(new Set(fingerprints).size).toBe(1);

    await testInfo.attach('reliability-shipment-export-ms.json', {
      body: JSON.stringify(exportMs.map(ms => Math.round(ms))),
      contentType: 'application/json',
    });
  });

  test('multi-cycle workflow stability (shipment → invoice → BOE → expense × 3)', async ({
    page,
  }, testInfo) => {
    const cycleMs: number[] = [];

    for (let c = 1; c <= 3; c += 1) {
      const cycleStart = await page.evaluate(() => performance.now());

      const invNo = `REL-WF-CYC${c}-001`;
      const bl = `BL-WF-CYC${c}-001`;
      const shipCsv = buildShipmentValidStyleRow(invNo, bl);

      await clickSidebarLink(page, 'Shipment');
      await expectPageMarker(page, 'Shipment Management');
      const shipContent = appContent(page);
      await shipContent.getByRole('button', { name: 'Table' }).click();
      await shipContent.getByRole('button', { name: 'Import' }).click();
      await setFilesOnBridgeFileInput(page, {
        name: `wf-${c}-ship.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(shipCsv, 'utf-8'),
      });
      await expect(sonnerSuccess(page, 'Import Complete').first()).toBeVisible({
        timeout: 25_000,
      });
      await waitForSonnerToClear(page);
      await assertNoErrorOrWarningToasts(page);

      const invCsv = [
        'shipmentInvoiceNumber,itemPartNumber,quantity,unitPrice',
        `${invNo},TEST-PART-INV-001,1,10.00`,
        `${invNo},TEST-PART-INV-002,1,20.00`,
      ].join('\n');

      await expandNavGroup(page, 'Invoice');
      await clickSidebarLink(page, 'Invoices');
      await expectPageMarker(page, 'Invoice Details');
      const invContent = appContent(page);
      await invContent.getByRole('button', { name: 'Import Bulk' }).click();
      await setFilesOnBridgeFileInput(page, {
        name: `wf-${c}-inv.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(invCsv, 'utf-8'),
      });
      await expect(sonnerSuccess(page, 'Import Complete').first()).toBeVisible({
        timeout: 25_000,
      });
      await waitForSonnerToClear(page);
      await assertNoErrorOrWarningToasts(page);

      const boeCsv = [
        'beNumber,beDate,location,totalAssessmentValue,dutyAmount,paymentDate,dutyPaid',
        `BE-WF-CYC${c}-001,15-06-2024,Mumbai,10000,1500,20-06-2024,1500`,
      ].join('\n');

      await expandNavGroup(page, 'BOE');
      await clickSidebarLink(page, 'View All BOE');
      await expectPageMarker(page, 'Bill of Entry Details');
      const boeContent = appContent(page);
      await boeContent.getByRole('button', { name: 'Import' }).click();
      await setFilesOnBridgeFileInput(page, {
        name: `wf-${c}-boe.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(boeCsv, 'utf-8'),
      });
      await expect(sonnerSuccess(page, 'Import Complete').first()).toBeVisible({
        timeout: 25_000,
      });
      await waitForSonnerToClear(page);
      await assertNoErrorOrWarningToasts(page);

      const expCsv = [
        'Expense Type,Service Provider,Invoice No,Invoice Date,Amount,CGST Amount,SGST Amount,IGST Amount,TDS Amount,Total Amount,Remarks',
        `Customs Clearance,ABC Logistics Ltd,EXP-WF-CYC${c}-001,2024-06-15,100.00,9.00,9.00,0.00,5.00,123.00,wf cycle ${c}`,
      ].join('\n');

      await expandNavGroup(page, 'Expenses');
      await clickSidebarLink(page, 'Manage Expenses');
      await expectPageMarker(page, 'Manage Expenses');
      await expect(page.getByText('Loading shipments...')).toBeHidden({
        timeout: 20_000,
      });

      await page.getByRole('tab', { name: 'Import Expenses' }).click();
      const importSection = appContent(page);
      await importSection.getByRole('combobox').first().click();
      await page
        .locator('[data-slot="command-item"]')
        .filter({ hasText: invNo })
        .first()
        .click({ timeout: 15_000 });
      await importSection.locator('#file-upload').setInputFiles({
        name: `wf-${c}-exp.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(expCsv, 'utf-8'),
      });
      await expect(
        importSection.getByRole('button', { name: /Import \d+ Expenses/i })
      ).toBeVisible({ timeout: 15_000 });
      await importSection
        .getByRole('button', { name: /Import \d+ Expenses/i })
        .click();
      await expect(sonnerSuccess(page, 'Import Complete').first()).toBeVisible({
        timeout: 25_000,
      });
      await waitForSonnerToClear(page);
      await assertNoErrorOrWarningToasts(page);

      const cycleEnd = await page.evaluate(() => performance.now());
      cycleMs.push(cycleEnd - cycleStart);
      appendPerformanceMetric({
        testName: withProjectTestName(
          `ui-reliability/workflow-cycle/cycle-${c}`,
          testInfo.project.name
        ),
        durationMs: cycleEnd - cycleStart,
      });
    }

    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');
    await expect(
      appContent(page).getByText(/Showing 4 of 4 shipments/)
    ).toBeVisible({ timeout: 25_000 });

    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoice Details');
    await expect(appContent(page).getByText(/Showing 6 invoices/)).toBeVisible({
      timeout: 25_000,
    });

    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'View All BOE');
    await expectPageMarker(page, 'Bill of Entry Details');
    const boeMain = appContent(page);
    await expect(boeMain.getByText('BE-WF-CYC1-001')).toBeVisible({
      timeout: 20_000,
    });
    await expect(boeMain.getByText('BE-WF-CYC2-001')).toBeVisible();
    await expect(boeMain.getByText('BE-WF-CYC3-001')).toBeVisible();

    await assertUniqueShipmentIds(page);

    await testInfo.attach('reliability-workflow-cycle-ms.json', {
      body: JSON.stringify(cycleMs.map(ms => Math.round(ms))),
      contentType: 'application/json',
    });
  });
});
