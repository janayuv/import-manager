import { test, expect } from '@playwright/test'

test.describe('Simple App Tests', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('http://localhost:1421')
    await page.waitForTimeout(3000)

    // Just check if the page loads and has content
    await expect(page).toHaveTitle(/Vite \+ React \+ TS/)
    await expect(page.locator('#root')).toBeVisible()

    // Check if there's any content
    const rootContent = await page.locator('#root').textContent()
    expect(rootContent !== null).toBeTruthy()
  })

  test('should load different pages', async ({ page }) => {
    const pages = ['/', '/expenses', '/supplier', '/shipment']

    for (const pagePath of pages) {
      await page.goto(`http://localhost:1421${pagePath}`)
      await page.waitForTimeout(2000)
      await expect(page.locator('#root')).toBeVisible()
    }
  })

  test('should have basic HTML structure', async ({ page }) => {
    await page.goto('http://localhost:1421')
    await page.waitForTimeout(3000)

    // Check basic HTML elements exist
    await expect(page.locator('html')).toBeVisible()
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('#root')).toBeVisible()
  })
})
