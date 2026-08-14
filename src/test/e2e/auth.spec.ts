import { expect, test } from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME!
const adminPassword = process.env.E2E_ADMIN_PASSWORD!
const employeeUsername = process.env.E2E_EMPLOYEE_USERNAME!
const employeePassword = process.env.E2E_EMPLOYEE_PASSWORD!

async function login(
  page: import('@playwright/test').Page,
  username: string,
  password: string,
) {
  await page.goto('/login')

  await page.getByLabel('Username').fill(username)
  await page.locator('#password').fill(password)

  await page.getByRole('button', { name: 'Masuk' }).click()
}

test.describe('Autentikasi E2E', () => {
  test('admin dapat login dan diarahkan ke dashboard admin', async ({ page }) => {
    await login(page, adminUsername, adminPassword)

    await expect(page).toHaveURL(/\/admin(?:\/|$)/, { timeout: 15_000 })
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible()
  })

  test('pegawai dapat login dan diarahkan ke halaman employee', async ({ page }) => {
    await login(page, employeeUsername, employeePassword)

    await expect(page).toHaveURL(/\/employee(?:\/|$)/)
    await expect(
      page.getByRole('heading', { name: 'Operasional Pegawai' }),
    ).toBeVisible()
  })
})
