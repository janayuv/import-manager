/* eslint-disable security/detect-non-literal-fs-filename -- Playwright-controlled download path */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  reloadPlaywrightPageForStubHydrate,
  resetPlaywrightDatabase,
  waitForPlaywrightInvoke,
} from './playwright-helpers';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

/** Row added after backup; restore from downloaded file must remove it (proves we restored the snapshot). */
const EPHEMERAL_SUPPLIER_NAME = 'Post-Backup Ephemeral';

function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

function sidebar(page: Page) {
  return page.locator('[data-sidebar="sidebar"]');
}

/**
 * Admin login with a clean stub DB. Reset runs on /login after `invoke` is wired so
 * the dashboard always reflects seeded data.
 */
async function loginAsAdminWithFreshDatabase(page: Page) {
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

async function clickSidebarLink(page: Page, name: string) {
  await sidebar(page).getByRole('link', { name, exact: true }).click();
}

function sonnerSuccess(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="success"]')
    .filter({ hasText: text });
}

async function waitForSonnerToClear(page: Page) {
  await page.waitForFunction(
    () => document.querySelectorAll('[data-sonner-toast]').length === 0,
    { timeout: 15_000 }
  );
}

async function assertNoErrorToasts(page: Page) {
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]')
  ).toHaveCount(0);
}

/**
 * `workers=1` is set in `playwright.config.ts` for the whole suite; backup/restore is
 * stateful, so this describe stays serial as an extra safeguard.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Database Backup and Restore - Full Cycle Validation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminWithFreshDatabase(page);
  });

  test('validates create backup, download, file upload restore, reload, and data integrity', async ({
    page,
  }, testInfo) => {
    await test.step('Navigate to Database Management → Backup & Restore', async () => {
      await clickSidebarLink(page, 'Database Management');
      await expect(
        appContent(page).getByRole('heading', {
          name: 'Database Management',
          exact: true,
        })
      ).toBeVisible({ timeout: 30_000 });
      await page.getByRole('tab', { name: 'Backup & Restore' }).click();
      // Card titles use `CardTitle` (not always exposed as `heading` roles in the a11y tree).
      await expect(
        appContent(page).getByRole('button', { name: 'Create Backup Now' })
      ).toBeVisible({ timeout: 20_000 });
    });

    await test.step('Create backup and assert success notification', async () => {
      await page.getByRole('button', { name: 'Create Backup Now' }).click();
      await expect(
        sonnerSuccess(page, /Backup created successfully/i)
      ).toBeVisible({ timeout: 30_000 });
      await waitForSonnerToClear(page);
    });

    const savedBackupPath =
      await test.step('Download backup snapshot via UI and save to disk', async () => {
        const downloadPromise = page.waitForEvent('download');
        await appContent(page)
          .getByRole('button', { name: 'Download snapshot' })
          .first()
          .click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.json$/i);
        const outDir = testInfo.outputDir;
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, 'e2e-database-backup.json');
        await download.saveAs(outPath);
        expect(fs.existsSync(outPath)).toBe(true);
        const parsed = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
          suppliers?: { supplierName?: string }[];
        };
        expect(parsed.suppliers?.length).toBe(1);
        expect(parsed.suppliers?.[0]?.supplierName).toBe('Seed Supplier');
        return outPath;
      });

    await test.step('Mutate live data after backup (supplier not in backup file)', async () => {
      await page.evaluate(async ephemeralName => {
        const inv = (
          window as unknown as {
            __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
              cmd: string,
              args?: Record<string, unknown>
            ) => Promise<unknown>;
          }
        ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
        await inv('add_suppliers_bulk', {
          suppliers: [
            {
              id: 'Sup-E2E-TEMP',
              supplierName: ephemeralName,
              country: 'Testland',
              email: 'ephemeral@e2e.local',
              isActive: true,
            },
          ],
        });
      }, EPHEMERAL_SUPPLIER_NAME);
    });

    await test.step('Verify mutated state in UI (two suppliers)', async () => {
      // Full navigation rehydrates the Playwright stub from sessionStorage so the UI
      // cannot observe a stale in-memory module while `page.evaluate` sees fresh data.
      await page.goto('/supplier');
      await waitForPlaywrightInvoke(page);
      await expect(
        appContent(page).getByRole('heading', { name: 'Suppliers' })
      ).toBeVisible({ timeout: 20_000 });
      await expect(appContent(page).getByText(/Seed supplier/i)).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        appContent(page).getByText(EPHEMERAL_SUPPLIER_NAME)
      ).toBeVisible();
    });

    await test.step('Restore: upload downloaded backup file and confirm restore', async () => {
      await clickSidebarLink(page, 'Database Management');
      await expect(
        appContent(page).getByRole('heading', {
          name: 'Database Management',
          exact: true,
        })
      ).toBeVisible({ timeout: 20_000 });
      await page.getByRole('tab', { name: 'Backup & Restore' }).click();
      await expect(
        appContent(page).getByRole('button', { name: 'Create Backup Now' })
      ).toBeVisible({ timeout: 15_000 });

      await page
        .getByTestId('database-restore-file-input')
        .setInputFiles(savedBackupPath);

      await expect(
        page.getByRole('dialog', { name: /Restore Preview/i })
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Schema is compatible')).toBeVisible();

      await page.getByTestId('restore-database-confirm-button').click();
      await expect(
        sonnerSuccess(page, /Database restored successfully/i)
      ).toBeVisible({ timeout: 45_000 });
      await waitForSonnerToClear(page);
    });

    await test.step('Full application reload; session persists, stub DB rehydrates from sessionStorage', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (page.url().includes('/login')) {
        await page.locator('#username').fill(defaultUser);
        await page.locator('#password').fill(defaultPassword);
        await page.getByRole('button', { name: 'Login' }).click();
      }
      await waitForPlaywrightInvoke(page);
      // Reload keeps the current SPA route (e.g. `/database-management`), not always `/`.
      await expect(sidebar(page)).toBeVisible({ timeout: 30_000 });
      await expect(
        appContent(page)
          .getByText('Operational overview across modules')
          .or(
            appContent(page).getByRole('heading', {
              name: 'Database Management',
              exact: true,
            })
          )
      ).toBeVisible({ timeout: 45_000 });
      await assertNoErrorToasts(page);
    });

    await test.step('Core data integrity: suppliers back to seed only', async () => {
      await clickSidebarLink(page, 'Supplier');
      await expect(
        appContent(page).getByText('1 Active Suppliers')
      ).toBeVisible({ timeout: 25_000 });
      await expect(
        appContent(page).getByText('Seed Supplier').first()
      ).toBeVisible();
      await expect(
        appContent(page).getByText(EPHEMERAL_SUPPLIER_NAME)
      ).toHaveCount(0);
    });

    await test.step('Core data integrity: seed shipment row still present', async () => {
      await clickSidebarLink(page, 'Shipment');
      await expect(
        appContent(page).getByText('Shipment Management', { exact: true })
      ).toBeVisible({ timeout: 20_000 });
      await expect(appContent(page).getByText('TEST-INV-SHP-001')).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Core data integrity: dashboard loads without errors', async () => {
      await clickSidebarLink(page, 'Dashboard');
      await expect(
        appContent(page).getByText('Operational overview across modules')
      ).toBeVisible({ timeout: 30_000 });
      await assertNoErrorToasts(page);
    });

    await test.step('Final assertion: on-disk backup file still matches one-seed snapshot with shipment', async () => {
      const raw = fs.readFileSync(savedBackupPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        suppliers?: unknown[];
        shipments?: { invoiceNumber?: string }[];
      };
      expect(parsed.suppliers?.length).toBe(1);
      expect(
        parsed.shipments?.some(s => s.invoiceNumber === 'TEST-INV-SHP-001')
      ).toBe(true);
    });
  });
});
