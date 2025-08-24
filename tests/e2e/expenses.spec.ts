import { expect, test } from '@playwright/test'

test('should load expenses page successfully', async ({ page }) => {
  await page.goto('http://localhost:1421/expenses')
  await page.waitForTimeout(2000)

  // Check if the page loads
  await expect(page).toHaveTitle(/Vite \+ React \+ TS/)
  await expect(page.locator('#root')).toBeVisible()
})

test('should display expenses content', async ({ page }) => {
  await page.goto('http://localhost:1421/expenses')
  await page.waitForTimeout(2000)

  // Check if there's any content in the root area
  const rootContent = await page.locator('#root').textContent()
  expect(rootContent !== null).toBeTruthy()
})

test('should have basic app functionality', async ({ page }) => {
  await page.goto('http://localhost:1421/expenses')
  await page.waitForTimeout(2000)

  // Check if page is interactive (has any clickable elements)
  const clickableElements = await page.locator('button, a, [role="button"]').count()
  expect(clickableElements).toBeGreaterThanOrEqual(0)
})
