import { expect, test } from '@playwright/test'

test.describe('Login smoke test', () => {
  test('halaman login dapat dirender', async ({ page }) => {
    const response = await page.goto('/login')

    expect(response).not.toBeNull()
    expect(response?.ok()).toBe(true)

    await expect(page.locator('form')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })
})
