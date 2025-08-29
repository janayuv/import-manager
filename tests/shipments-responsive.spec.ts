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
        await page.setViewportSize({
          width: screenSize.width,
          height: screenSize.height,
        });
        await page.goto('http://localhost:1421/shipments');
        await page.waitForLoadState('networkidle');
      });

      test('shipments page loads correctly', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
        // Check if we're on the shipments page
        await expect(page.locator('h1, h2, h3')).toContainText(/shipment/i);
      });

      test('important columns are fully visible without truncation', async ({
        page,
      }) => {
        // Wait for table to load
        await page.waitForSelector('table', { timeout: 10000 });

        // Check each important column
        for (const columnName of importantColumns) {
          // Find the column header
          const headerCell = page.locator(
            `th:has-text("${columnName}"), th button:has-text("${columnName}")`
          );
          await expect(headerCell).toBeVisible();

          // Check if header text is not truncated (no ellipsis)
          const headerText = await headerCell.textContent();
          expect(headerText).not.toContain('...');

          // Check if the column has reasonable width (not too narrow)
          const headerRect = await headerCell.boundingBox();
          if (headerRect) {
            expect(headerRect.width).toBeGreaterThan(80); // Minimum reasonable width
          }
        }
      });

      test('table cells show tooltips for truncated content', async ({
        page,
      }) => {
        await page.waitForSelector('table', { timeout: 10000 });

        // Check a few table cells for tooltip attributes
        const cells = page.locator('td');
        const cellCount = await cells.count();

        if (cellCount > 0) {
          // Check first few cells for tooltip attributes
          for (let i = 0; i < Math.min(10, cellCount); i++) {
            const cell = cells.nth(i);
            const cellText = await cell.textContent();

            if (cellText && cellText.length > 20) {
              // If text is long, check for title attribute
              const titleAttr = await cell.getAttribute('title');
              if (!titleAttr) {
                // Check if text is truncated (has ellipsis)
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
        await page.waitForSelector('table', { timeout: 10000 });

        // Check if table container has horizontal scroll
        const tableContainer = page.locator('table').locator('..');
        const hasHorizontalScroll = await tableContainer.evaluate(el => {
          return el.scrollWidth > el.clientWidth;
        });

        // If table is wider than container, it should be scrollable
        if (hasHorizontalScroll) {
          const overflowStyle = await tableContainer.evaluate(el => {
            return window.getComputedStyle(el).overflowX;
          });
          expect(['auto', 'scroll'].includes(overflowStyle)).toBeTruthy();
        }
      });

      test('column priorities are respected', async ({ page }) => {
        await page.waitForSelector('table', { timeout: 10000 });

        // Check that important columns have better flex properties
        const importantColumnSelectors = [
          'th:has-text("Supplier")',
          'th:has-text("Invoice No")',
          'th:has-text("Date")',
          'th:has-text("BL/AWB No")',
          'th:has-text("Status")',
        ];

        // const lessImportantColumnSelectors = [
        //   'th:has-text("Currency")',
        //   'th:has-text("Type")',
        //   'th:has-text("Actions")',
        // ]

        // Important columns should have better flex-grow values
        for (const selector of importantColumnSelectors) {
          const column = page.locator(selector);
          if ((await column.count()) > 0) {
            const flexGrow = await column.evaluate(el => {
              return window.getComputedStyle(el).flexGrow;
            });
            // Important columns should have flex-grow >= 1
            expect(parseFloat(flexGrow) || 0).toBeGreaterThanOrEqual(1);
          }
        }
      });

      test('screenshot for visual regression', async ({ page }) => {
        await page.waitForSelector('table', { timeout: 10000 });
        await page.screenshot({
          path: `test-results/shipments-${screenSize.name}.png`,
          fullPage: true,
        });
      });
    });
  }
});
