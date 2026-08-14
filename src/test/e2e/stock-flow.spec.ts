import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const adminUsername = process.env.E2E_ADMIN_USERNAME!
const adminPassword = process.env.E2E_ADMIN_PASSWORD!
const employeeUsername = process.env.E2E_EMPLOYEE_USERNAME!
const employeePassword = process.env.E2E_EMPLOYEE_PASSWORD!

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

interface E2EItem {
  id: string
  name: string
  sku: string
  barcode: string
  unitId: string
}

interface StockTransaction {
  id: string
  transaction_number: string
  transaction_type: string
  stock_before: number | string
  stock_after: number | string
  is_reversed: boolean
}

async function login(
  page: Page,
  username: string,
  password: string,
) {
  await page.goto('/login')

  await page
    .getByLabel('Username')
    .fill(username)

  await page
    .locator('#password')
    .fill(password)

  const loginResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/login' &&
      response.request().method() === 'POST',
  )

  await page
    .getByRole('button', {
      name: 'Masuk',
    })
    .click()

  await loginResponse

  // Jangan biarkan password tetap tampil di DOM apabila
  // assertion setelah login gagal dan Playwright membuat context.
  await page
    .locator('#password')
    .evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = ''
      input.setAttribute('value', '')
    })
    .catch(() => undefined)
}

async function createE2EItem(): Promise<E2EItem> {
  const stamp = Date.now()

  const categoryName = 'E2E Testing'
  const categoryNormalized = 'e2e testing'

  const unitName = 'Unit E2E'
  const unitNormalized = 'unit e2e'
  const unitSymbol = 'UE2E'

  const { data: category, error: categoryError } =
    await supabase
      .from('categories')
      .upsert(
        {
          name: categoryName,
          name_normalized: categoryNormalized,
          is_active: true,
        },
        {
          onConflict: 'name_normalized',
        },
      )
      .select('id')
      .single()

  if (categoryError || !category) {
    throw new Error(
      `Gagal menyiapkan kategori E2E: ${
        categoryError?.message ?? 'kategori kosong'
      }`,
    )
  }

  const { data: unit, error: unitError } =
    await supabase
      .from('units')
      .upsert(
        {
          name: unitName,
          symbol: unitSymbol,
          name_normalized: unitNormalized,
          is_active: true,
        },
        {
          onConflict: 'name_normalized',
        },
      )
      .select('id')
      .single()

  if (unitError || !unit) {
    throw new Error(
      `Gagal menyiapkan satuan E2E: ${
        unitError?.message ?? 'satuan kosong'
      }`,
    )
  }

  const sku = `ATK-${stamp}`
  const barcode = `E2E-${stamp}`
  const name = `Barang E2E ${stamp}`

  const { data: item, error: itemError } =
    await supabase
      .from('items')
      .insert({
        sku,
        barcode,
        barcode_format: 'CODE128',
        name,
        category_id: category.id,
        base_unit_id: unit.id,
        default_purchase_unit_id: unit.id,
        current_stock: 0,
        minimum_stock: 0,
        notes: 'Playwright E2E stock flow',
        is_active: true,
      })
      .select('id')
      .single()

  if (itemError || !item) {
    throw new Error(
      `Gagal membuat barang E2E: ${
        itemError?.message ?? 'barang kosong'
      }`,
    )
  }

  return {
    id: item.id,
    name,
    sku,
    barcode,
    unitId: unit.id,
  }
}

async function deactivateItem(
  itemId: string,
) {
  const { error } = await supabase
    .from('items')
    .update({
      is_active: false,
    })
    .eq('id', itemId)

  if (error) {
    throw new Error(
      `Cleanup item E2E gagal: ${error.message}`,
    )
  }
}

async function getStock(
  itemId: string,
) {
  const { data, error } = await supabase
    .from('items')
    .select('current_stock')
    .eq('id', itemId)
    .single()

  if (error || !data) {
    throw new Error(
      `Gagal membaca stok E2E: ${
        error?.message ?? 'barang kosong'
      }`,
    )
  }

  return Number(data.current_stock)
}

async function getLatestTransaction(
  itemId: string,
  type: 'IN' | 'OUT',
): Promise<StockTransaction> {
  const { data, error } = await supabase
    .from('stock_transactions')
    .select(
      `
        id,
        transaction_number,
        transaction_type,
        stock_before,
        stock_after,
        is_reversed
      `,
    )
    .eq('item_id', itemId)
    .eq('transaction_type', type)
    .order('transaction_at', {
      ascending: false,
    })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(
      `Transaksi ${type} E2E tidak ditemukan: ${
        error?.message ?? 'data kosong'
      }`,
    )
  }

  return data as StockTransaction
}

async function expectTransactionReversed(
  transactionId: string,
) {
  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .from('stock_transactions')
          .select('is_reversed')
          .eq('id', transactionId)
          .single()

        if (error || !data) {
          throw new Error(
            error?.message ??
              'Transaksi tidak ditemukan',
          )
        }

        return data.is_reversed
      },
      {
        timeout: 10_000,
      },
    )
    .toBe(true)
}

async function selectItem(
  page: Page,
  item: E2EItem,
) {
  const searchInput =
    page.locator('#item-search-input')

  await searchInput.fill(item.sku)

  const option = page
    .getByRole('option')
    .filter({
      hasText: item.sku,
    })

  await expect(option).toBeVisible({
    timeout: 10_000,
  })

  await option.click()
}

function jakartaDate() {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).formatToParts(new Date())

  const year = parts.find(
    (part) => part.type === 'year',
  )?.value

  const month = parts.find(
    (part) => part.type === 'month',
  )?.value

  const day = parts.find(
    (part) => part.type === 'day',
  )?.value

  return `${year}-${month}-${day}`
}

test.describe(
  'Stock transaction E2E',
  () => {
    test.setTimeout(120_000)
    let item: E2EItem | null = null

    test.afterEach(async () => {
      if (item) {
        await deactivateItem(item.id)
      }
    })

    test(
      'stock-in admin, stock-out employee, reversal, dan laporan',
      async ({ page }) => {
        item = await createE2EItem()

        // =====================================================
        // 1. Kondisi awal
        // =====================================================

        expect(
          await getStock(item.id),
        ).toBe(0)

        // =====================================================
        // 2. ADMIN: STOCK IN 10
        // =====================================================

        await login(
          page,
          adminUsername,
          adminPassword,
        )

        await expect(page).toHaveURL(
          /\/admin(?:\/|$)/,
          {
            timeout: 15_000,
          },
        )

        await page.goto(
          '/admin/stock-in',
        )

        await selectItem(
          page,
          item,
        )

        await page
          .locator('#stock-in-unit')
          .selectOption(item.unitId)

        await page
          .locator('#stock-in-qty')
          .fill('10')

        await page
          .locator(
            '#btn-konfirmasi-barang-masuk',
          )
          .click()

        const stockInDialog =
          page.getByRole('dialog', {
            name: 'Konfirmasi Barang Masuk',
          })

        await expect(
          stockInDialog,
        ).toBeVisible()

        await stockInDialog
          .locator('#btn-confirm-stock-in')
          .click()

        await expect(
          page.getByRole('alert').filter({
            hasText: 'berhasil',
          }),
        ).toContainText('berhasil', {
          timeout: 15_000,
        })

        await expect
          .poll(
            () => getStock(item!.id),
            {
              timeout: 10_000,
            },
          )
          .toBe(10)

        const stockInTx =
          await getLatestTransaction(
            item.id,
            'IN',
          )

        expect(
          Number(stockInTx.stock_before),
        ).toBe(0)

        expect(
          Number(stockInTx.stock_after),
        ).toBe(10)

        expect(
          stockInTx.is_reversed,
        ).toBe(false)

        // =====================================================
        // 3. EMPLOYEE: STOCK OUT 3
        // =====================================================

        await page.context().clearCookies()

        await login(
          page,
          employeeUsername,
          employeePassword,
        )

        await expect(page).toHaveURL(
          /\/employee(?:\/|$)/,
          {
            timeout: 15_000,
          },
        )

        await page.goto(
          '/employee/stock-out',
        )

        await selectItem(
          page,
          item,
        )

        await page
          .locator('#stockout-unit')
          .selectOption(item.unitId)

        await page
          .locator('#stockout-quantity')
          .fill('3')

        await page
          .getByRole('button', {
            name: 'Catat Barang Keluar',
          })
          .click()

        await expect(
          page.getByRole('alert').filter({
            hasText: 'Pengeluaran barang berhasil dicatat',
          }),
        ).toContainText(
          'Pengeluaran barang berhasil dicatat',
          {
            timeout: 15_000,
          },
        )

        await expect
          .poll(
            () => getStock(item!.id),
            {
              timeout: 10_000,
            },
          )
          .toBe(7)

        const stockOutTx =
          await getLatestTransaction(
            item.id,
            'OUT',
          )

        expect(
          Number(stockOutTx.stock_before),
        ).toBe(10)

        expect(
          Number(stockOutTx.stock_after),
        ).toBe(7)

        expect(
          stockOutTx.is_reversed,
        ).toBe(false)

        // =====================================================
        // 4. ADMIN: REVERSE STOCK OUT
        //    stok 7 -> 10
        // =====================================================

        await page.context().clearCookies()

        await login(
          page,
          adminUsername,
          adminPassword,
        )

        await expect(page).toHaveURL(
          /\/admin(?:\/|$)/,
          {
            timeout: 15_000,
          },
        )

        await page.goto(
          `/admin/reversals?q=${encodeURIComponent(
            stockOutTx.transaction_number,
          )}`,
        )

        await expect(
          page.getByText(
            stockOutTx.transaction_number,
            {
              exact: true,
            },
          ),
        ).toBeVisible({
          timeout: 15_000,
        })

        await page
          .locator(
            `#btn-balik-${stockOutTx.id}`,
          )
          .click()

        await page
          .locator(
            `#reason-${stockOutTx.id}`,
          )
          .fill(
            'Pembatalan otomatis E2E stock-out',
          )

        await page
          .locator(
            `#btn-konfirmasi-balik-${stockOutTx.id}`,
          )
          .click()

        await expect(
          page.getByRole('alert').filter({
            hasText: 'berhasil dicatat',
          }),
        ).toContainText(
          'berhasil dicatat',
          {
            timeout: 15_000,
          },
        )

        await expectTransactionReversed(
          stockOutTx.id,
        )

        await expect
          .poll(
            () => getStock(item!.id),
            {
              timeout: 10_000,
            },
          )
          .toBe(10)

        // =====================================================
        // 5. ADMIN: REVERSE STOCK IN
        //    stok 10 -> 0
        // =====================================================

        await page.goto(
          `/admin/reversals?q=${encodeURIComponent(
            stockInTx.transaction_number,
          )}`,
        )

        await expect(
          page.getByText(
            stockInTx.transaction_number,
            {
              exact: true,
            },
          ),
        ).toBeVisible({
          timeout: 15_000,
        })

        await page
          .locator(
            `#btn-balik-${stockInTx.id}`,
          )
          .click()

        await page
          .locator(
            `#reason-${stockInTx.id}`,
          )
          .fill(
            'Pembatalan otomatis E2E stock-in',
          )

        await page
          .locator(
            `#btn-konfirmasi-balik-${stockInTx.id}`,
          )
          .click()

        await expect(
          page.getByRole('alert').filter({
            hasText: 'berhasil dicatat',
          }),
        ).toContainText(
          'berhasil dicatat',
          {
            timeout: 15_000,
          },
        )

        await expectTransactionReversed(
          stockInTx.id,
        )

        await expect
          .poll(
            () => getStock(item!.id),
            {
              timeout: 10_000,
            },
          )
          .toBe(0)

        // =====================================================
        // 6. ADMIN: LAPORAN + DOWNLOAD EXCEL
        // =====================================================

        const today = jakartaDate()

        await page.goto(
          `/admin/reports?from=${today}&to=${today}`,
        )

        await expect(
          page.locator(
            '#btn-export-transactions-detail',
          ),
        ).toBeVisible({
          timeout: 15_000,
        })

        const reportResponsePromise =
          page.waitForResponse(
            (response) => {
              const url = new URL(response.url())

              return (
                url.pathname ===
                  '/api/reports/transactions-detail' &&
                response.request().method() === 'GET'
              )
            },
            {
              timeout: 30_000,
            },
          )

        await page
          .locator(
            '#btn-export-transactions-detail',
          )
          .click()

        const reportResponse =
          await reportResponsePromise

        expect(
          reportResponse.ok(),
        ).toBe(true)

        expect(
          reportResponse
            .headers()['content-type'],
        ).toMatch(
          /spreadsheetml|application\/octet-stream/i,
        )

        expect(
          reportResponse
            .headers()['content-disposition'],
        ).toMatch(/\.xlsx/i)

        // Verifikasi isi file melalui request langsung menggunakan
        // session/cookie browser yang sama. Respons fetch di UI sudah
        // dikonsumsi menjadi Blob oleh kode client.
        const reportApiResponse =
          await page.request.get(
            reportResponse.url(),
          )

        expect(
          reportApiResponse.ok(),
        ).toBe(true)

        expect(
          reportApiResponse
            .headers()['content-type'],
        ).toMatch(
          /spreadsheetml|application\/octet-stream/i,
        )

        const reportBody =
          await reportApiResponse.body()

        expect(
          reportBody.byteLength,
        ).toBeGreaterThan(0)

        // Final integrity check.
        expect(
          await getStock(item.id),
        ).toBe(0)
      },
    )
  },
)
