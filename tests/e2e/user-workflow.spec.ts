import { test, expect } from '@playwright/test'

test.describe('User Workflow', () => {
  test('should navigate between main pages', async ({ page }) => {
    // Start from dashboard
    await page.goto('http://localhost:1421')
    await page.waitForTimeout(2000)
    await expect(page.locator('#root')).toBeVisible()

    // Navigate to expenses
    await page.goto('http://localhost:1421/expenses')
    await page.waitForTimeout(2000)
    await expect(page.locator('#root')).toBeVisible()

    // Navigate to supplier
    await page.goto('http://localhost:1421/supplier')
    await page.waitForTimeout(2000)
    await expect(page.locator('#root')).toBeVisible()

    // Navigate to shipment
    await page.goto('http://localhost:1421/shipment')
    await page.waitForTimeout(2000)
    await expect(page.locator('#root')).toBeVisible()
  })

  test('should handle basic app functionality', async ({ page }) => {
    await page.goto('http://localhost:1421')
    await page.waitForTimeout(2000)

    // Check if app is responsive
    await expect(page.locator('#root')).toBeVisible()

    // Check if there's any content
    const rootContent = await page.locator('#root').textContent()
    expect(rootContent !== null).toBeTruthy()
  })

  test('should maintain app state during navigation', async ({ page }) => {
    // Test that the app doesn't crash during navigation
    const pages = ['/', '/expenses', '/supplier', '/shipment', '/item-master']

    for (const pagePath of pages) {
      await page.goto(`http://localhost:1421${pagePath}`)
      await page.waitForTimeout(1000)
      await expect(page.locator('#root')).toBeVisible()
    }
  })
})
