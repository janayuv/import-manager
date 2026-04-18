import { expect, test, type Page } from '@playwright/test';

const sizes = [
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 2560, height: 1440, name: '2560x1440' },
];

const pages = [
  { path: '/item-master', name: 'item-master' },
  { path: '/boe', name: 'boe' },
  { path: '/boe-entry', name: 'boe-entry' },
  { path: '/boe-summary', name: 'boe-summary' },
] as const;

function pageReadyLocator(
  page: Page,
  pageName: (typeof pages)[number]['name']
) {
  switch (pageName) {
    case 'item-master':
      return page.getByRole('heading', { name: 'Item Master' });
    case 'boe':
      return page.getByRole('heading', { name: 'Bill of Entry Details' });
    case 'boe-entry':
      return page.getByText(/BOE Entry & Calculation|Editing BOE/);
    case 'boe-summary':
      return page.getByText('BOE Reconciliation Report');
    default:
      return page.locator('body');
  }
}

test.describe('Item Master and BOE pages responsive tests', () => {
  for (const size of sizes) {
    test.describe(`${size.name}`, () => {
      for (const p of pages) {
        test(`responsive test ${p.name}`, async ({ page }) => {
          await page.setViewportSize({
            width: size.width,
            height: size.height,
          });
          await page.addInitScript(() => {
            try {
              localStorage.setItem('isAuthenticated', 'true');
            } catch (error) {
              console.warn('Failed to set localStorage:', error);
            }
          });
          await page.goto(p.path);
          await page.waitForLoadState('load');

          await expect(pageReadyLocator(page, p.name)).toBeVisible({
            timeout: 30000,
          });

          await expect(page.locator('header')).toBeVisible({
            timeout: 15000,
          });

          const sidebar = page.locator('[data-slot="sidebar"]');
          await expect(sidebar.first()).toBeVisible({ timeout: 15000 });

          const tableHeaders = page.locator('table th');
          const tableExists = (await tableHeaders.count()) > 0;

          if (tableExists) {
            console.log(
              `Found table on ${p.name} page with ${await tableHeaders.count()} headers`
            );

            for (let i = 0; i < (await tableHeaders.count()); i++) {
              const th = tableHeaders.nth(i);
              const text = (await th.innerText()).trim();
              if (!text) continue;

              const isTruncated = await th.evaluate(target => {
                const style = window.getComputedStyle(target);
                return (
                  target.scrollWidth > target.clientWidth ||
                  style.textOverflow === 'ellipsis'
                );
              });

              if (isTruncated) {
                console.log(
                  `Header "${text}" is truncated on ${p.name} at ${size.name}`
                );
                const rect = await th.boundingBox();
                console.log(`Header width: ${rect?.width}px`);
              }
            }
          } else {
            console.log(`No table found on ${p.name} page`);
          }

          const mainContent = page.locator('main').first();
          await expect(mainContent).toBeVisible();

          await page.screenshot({
            path: `test-results/${p.name}-${size.name}.png`,
            fullPage: true,
          });
        });
      }
    });
  }
});
