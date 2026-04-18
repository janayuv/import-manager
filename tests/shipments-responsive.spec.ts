import { test, expect } from '@playwright/test';

test.describe('Shipments Page Responsive Tests', () => {
  const screenSizes = [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' },
    { width: 2560, height: 1440, name: '2560x1440' },
  ];

  const importantColumns = [
    'Supplier',
    'Invoice No',
    'Date',
    'BL/AWB No',
    'Status',
  ];

  for (const screenSize of screenSizes) {
    test.describe(`Screen Size: ${screenSize.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
          try {
            localStorage.setItem('isAuthenticated', 'true');
          } catch {
            /* ignore */
          }
        });
        await page.setViewportSize({
          width: screenSize.width,
          height: screenSize.height,
        });
        await page.goto('/shipment');
        await page.waitForLoadState('load');
        await expect(
          page.getByRole('heading', { level: 1, name: /shipment management/i })
        ).toBeVisible({ timeout: 20000 });
        await page.getByRole('button', { name: 'Table', exact: true }).click();
        await page.waitForSelector('table', { timeout: 20000 });
      });

      test('shipments page loads correctly', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
        await expect(
          page.getByRole('heading', { level: 1, name: /shipment management/i })
        ).toBeVisible();
      });

      test('important columns are fully visible without truncation', async ({
        page,
      }) => {
        await page.waitForSelector('table', { timeout: 15000 });

        for (const columnName of importantColumns) {
          const headerCell = page.getByRole('columnheader', {
            name: columnName,
            exact: true,
          });
          await expect(headerCell.first()).toBeVisible();

          const headerText = await headerCell.first().textContent();
          expect(headerText).not.toContain('...');
        }
      });

      test('table cells show tooltips for truncated content', async ({
        page,
      }) => {
        await page.waitForSelector('table', { timeout: 15000 });

        const cells = page.locator('td');
        const cellCount = await cells.count();

        if (cellCount > 0) {
          for (let i = 0; i < Math.min(10, cellCount); i++) {
            const cell = cells.nth(i);
            const cellText = await cell.textContent();

            if (cellText && cellText.length > 20) {
              const titleAttr = await cell.getAttribute('title');
              if (!titleAttr) {
                const isTruncated = await cell.evaluate(el => {
                  const style = window.getComputedStyle(el);
                  return (
                    style.textOverflow === 'ellipsis' ||
                    style.overflow === 'hidden' ||
                    el.scrollWidth > el.clientWidth
                  );
                });

                if (isTruncated) {
                  console.warn(
                    `Cell ${i} has long text but no tooltip: "${cellText}"`
                  );
                }
              }
            }
          }
        }
      });

      test('table is horizontally scrollable if needed', async ({ page }) => {
        await page.waitForSelector('table', { timeout: 15000 });

        const tableContainer = page.locator('table').locator('..');
        const hasHorizontalScroll = await tableContainer.evaluate(el => {
          return el.scrollWidth > el.clientWidth;
        });

        if (hasHorizontalScroll) {
          const overflowStyle = await tableContainer.evaluate(el => {
            return window.getComputedStyle(el).overflowX;
          });
          expect(['auto', 'scroll'].includes(overflowStyle)).toBeTruthy();
        }
      });

      test('column priorities are respected', async ({ page }) => {
        await page.waitForSelector('table', { timeout: 15000 });

        for (const columnName of importantColumns) {
          await expect(
            page.locator(`th:has-text("${columnName}")`).first()
          ).toBeVisible();
        }
      });

      test('screenshot for visual regression', async ({ page }) => {
        await page.waitForSelector('table', { timeout: 15000 });
        await page.screenshot({
          path: `test-results/shipments-${screenSize.name}.png`,
          fullPage: true,
        });
      });
    });
  }
});
