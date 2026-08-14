import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const adminUsername = process.env.E2E_ADMIN_USERNAME!
const adminPassword = process.env.E2E_ADMIN_PASSWORD!
const employeeUsername = process.env.E2E_EMPLOYEE_USERNAME!
const employeePassword = process.env.E2E_EMPLOYEE_PASSWORD!

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function login(
  page: Page,
  username: string,
  password: string,
) {
  await page.goto('/login')

  await page.getByLabel('Username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Masuk' }).click()
}

async function restoreEmployeeState() {
  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', employeeUsername)
    .single()

  if (profileError || !profile) {
    throw new Error(
      `E2E cleanup gagal menemukan employee: ${profileError?.message ?? 'profile kosong'}`,
    )
  }

  const { error: authError } =
    await supabase.auth.admin.updateUserById(
      profile.id,
      {
        password: employeePassword,
      },
    )

  if (authError) {
    throw new Error(
      `E2E cleanup gagal memulihkan password: ${authError.message}`,
    )
  }

  const { error: flagError } = await supabase
    .from('profiles')
    .update({
      must_change_password: false,
    })
    .eq('id', profile.id)

  if (flagError) {
    throw new Error(
      `E2E cleanup gagal memulihkan must_change_password: ${flagError.message}`,
    )
  }
}

test.describe('Forced password change E2E', () => {
  test.afterEach(async () => {
    await restoreEmployeeState()
  })

  test('employee wajib mengganti password setelah admin melakukan reset', async ({
    page,
  }) => {
    const temporaryPassword =
      `E2E-Temp-${Date.now()}-Aa1!`

    // 1. Login sebagai admin.
    await login(
      page,
      adminUsername,
      adminPassword,
    )

    await expect(page).toHaveURL(/\/admin(?:\/|$)/, { timeout: 15_000 })

    // 2. Buka manajemen pengguna.
    await page.goto('/admin/users')

    const employeeRow = page
      .getByRole('row')
      .filter({ hasText: employeeUsername })

    await expect(employeeRow).toBeVisible()

    await employeeRow
      .getByRole('button', {
        name: 'Reset Password',
      })
      .click()

    // 3. Reset password employee melalui UI.
    const dialog = page.getByRole('dialog', {
      name: 'Reset Password Pegawai',
    })

    await expect(dialog).toBeVisible()

    await dialog
      .locator('#reset-user-password')
      .fill(temporaryPassword)

    await dialog
      .getByRole('button', {
        name: 'Reset Password',
        exact: true,
      })
      .click()

    await expect(dialog).toBeHidden()

    // 4. Hilangkan session admin.
    await page.context().clearCookies()

    // 5. Login employee memakai password sementara.
    await login(
      page,
      employeeUsername,
      temporaryPassword,
    )

    // Employee wajib diarahkan ke forced password change.
    await expect(page).toHaveURL(
      /\/change-password(?:\/|$)/,
      { timeout: 15_000 },
    )

    // 6. Ganti kembali ke password E2E stabil.
    await page
      .locator('#current-password')
      .fill(temporaryPassword)

    await page
      .locator('#new-password')
      .fill(employeePassword)

    await page
      .locator('#confirm-password')
      .fill(employeePassword)

    await page
      .locator('#change-password-submit')
      .click()

    // 7. Setelah berhasil, employee boleh masuk.
    await expect(page).toHaveURL(
      /\/employee(?:\/|$)/,
      { timeout: 15_000 },
    )

    await expect(
      page.getByRole('heading', {
        name: 'Operasional Pegawai',
      }),
    ).toBeVisible()
  })
})
