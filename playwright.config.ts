import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

const E2E_PROJECT_REF = 'dncyhftgkwkdhksvxaob'
const E2E_SUPABASE_URL = `https://${E2E_PROJECT_REF}.supabase.co`
const E2E_BASE_URL = 'http://127.0.0.1:3101'
const E2E_ENV_PATH = resolve(process.cwd(), '.env.test.local')

let envSource: string

try {
  envSource = readFileSync(E2E_ENV_PATH, 'utf8')
} catch {
  throw new Error(
    '[E2E SAFETY] .env.test.local tidak ditemukan. E2E dibatalkan.',
  )
}

function readRequiredEnv(name: string) {
  const prefix = `${name}=`

  const line = envSource
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix))

  const value = line?.slice(prefix.length).trim()

  if (!value) {
    throw new Error(
      `[E2E SAFETY] ${name} kosong atau tidak ditemukan di .env.test.local.`,
    )
  }

  return value
}

const e2eEnv = {
  NEXT_PUBLIC_SUPABASE_URL: readRequiredEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: readRequiredEnv(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ),
  SUPABASE_SERVICE_ROLE_KEY: readRequiredEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
  ),
  LOGIN_RATE_LIMIT_SECRET: readRequiredEnv(
    'LOGIN_RATE_LIMIT_SECRET',
  ),
  E2E_ADMIN_USERNAME: readRequiredEnv(
    'E2E_ADMIN_USERNAME',
  ),
  E2E_ADMIN_PASSWORD: readRequiredEnv(
    'E2E_ADMIN_PASSWORD',
  ),
  E2E_EMPLOYEE_USERNAME: readRequiredEnv(
    'E2E_EMPLOYEE_USERNAME',
  ),
  E2E_EMPLOYEE_PASSWORD: readRequiredEnv(
    'E2E_EMPLOYEE_PASSWORD',
  ),
}

if (e2eEnv.NEXT_PUBLIC_SUPABASE_URL !== E2E_SUPABASE_URL) {
  throw new Error(
    `[E2E SAFETY] DITOLAK: E2E hanya boleh memakai Supabase testing ${E2E_PROJECT_REF}.`,
  )
}

/*
 * Masukkan environment TESTING ke proses Playwright.
 * Child process Next.js yang dibuat webServer akan mewarisinya.
 *
 * Dengan demikian .env.local development tidak dapat mengambil alih
 * koneksi Supabase saat E2E berjalan.
 */
Object.assign(process.env, e2eEnv, {
  PLAYWRIGHT_E2E: '1',
})

export default defineConfig({
  testDir: './src/test/e2e',
  testMatch: '**/*.spec.ts',

  /*
   * Transaksi E2E nantinya menyentuh state database.
   * Jalankan satu worker agar alurnya deterministik.
   */
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 1 : 0,

  reporter: 'list',

  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },

  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3101',
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
