import { expect, test } from '@playwright/test';

test('should navigate between main pages', async ({ page }) => {
  // Start from dashboard
  await page.goto('/');
  await page.waitForTimeout(2000);
  await expect(page.locator('#root')).toBeVisible();

  // Navigate to expenses
  await page.goto('/expenses');
  await page.waitForTimeout(2000);
  await expect(page.locator('#root')).toBeVisible();

  // Navigate to supplier
  await page.goto('/supplier');
  await page.waitForTimeout(2000);
  await expect(page.locator('#root')).toBeVisible();

  // Navigate to shipment
  await page.goto('/shipment');
  await page.waitForTimeout(2000);
  await expect(page.locator('#root')).toBeVisible();
});

test('should handle basic app functionality', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Check if app is responsive
  await expect(page.locator('#root')).toBeVisible();

  // Check if there's any content
  const rootContent = await page.locator('#root').textContent();
  expect(rootContent !== null).toBeTruthy();
});

test('should maintain app state during navigation', async ({ page }) => {
  // Test that the app doesn't crash during navigation
  const pages = ['/', '/expenses', '/supplier', '/shipment', '/item-master'];

  for (const pagePath of pages) {
    await page.goto(pagePath);
    await page.waitForTimeout(1000);
    await expect(page.locator('#root')).toBeVisible();
  }
});
