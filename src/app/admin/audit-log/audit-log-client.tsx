'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Log {
  id: string
  performed_at: string
  action: string
  entity_type: string
  entity_id: string | null
  changes_summary: unknown
  reason: string | null
  profiles: { id: string; full_name: string; username: string } | null
}

interface AuditLogClientProps {
  logs: Log[]
  totalCount: number
  page: number
  pageSize: number
  actionFilter: string
}

const dtf = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

const ENTITY_TYPE_LABELS: Record<string, string> = {
  stock_transactions: 'Transaksi Stok',
  items: 'Barang',
  units: 'Satuan',
  categories: 'Kategori',
  users: 'Pengguna',
  profiles: 'Pengguna',
  settings: 'Pengaturan',
}

function formatEntityType(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType
}

const ACTION_LABELS: Record<string, string> = {
  USER_CREATED: 'Pengguna Dibuat',
  USER_DEACTIVATED: 'Pengguna Dinonaktifkan',
  USER_ACTIVATED: 'Pengguna Diaktifkan',
  USER_PASSWORD_RESET: 'Password Direset',
  ITEM_CREATED: 'Barang Dibuat',
  ITEM_UPDATED: 'Barang Diperbarui',
  ITEM_DEACTIVATED: 'Barang Dinonaktifkan',
  ITEM_ACTIVATED: 'Barang Diaktifkan',
  CATEGORY_CREATED: 'Kategori Dibuat',
  CATEGORY_UPDATED: 'Kategori Diperbarui',
  CATEGORY_DEACTIVATED: 'Kategori Dinonaktifkan',
  UNIT_CREATED: 'Satuan Dibuat',
  UNIT_UPDATED: 'Satuan Diperbarui',
  UNIT_DEACTIVATED: 'Satuan Dinonaktifkan',
  STOCK_INITIAL: 'Stok Pembukaan',
  STOCK_IN: 'Barang Masuk',
  STOCK_OUT: 'Barang Keluar',
  STOCK_ADJUSTMENT: 'Penyesuaian Stok',
  STOCK_REVERSAL: 'Koreksi Transaksi',
  EXCEL_IMPORT: 'Impor Excel',
  SETTINGS_UPDATED: 'Pengaturan Diperbarui',
}

export default function AuditLogClient({
  logs,
  totalCount,
  page,
  pageSize,
  actionFilter,
}: AuditLogClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  /** Navigate to a page, keeping the current action filter */
  const goToPage = (targetPage: number) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('page', String(targetPage))
    router.push(`${pathname}?${p.toString()}`)
  }

  /** Change action filter and reset to page 1 */
  const setActionFilter = (value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set('action', value)
    else p.delete('action')
    p.set('page', '1')
    router.push(`${pathname}?${p.toString()}`)
  }

  /** Reset all filters and go to page 1 */
  const resetFilters = () => {
    router.push(pathname)
  }

  // Range info: "Menampilkan 1–20 dari 87 aktivitas"
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalCount)

  // Build compact page-number list with ellipsis
  const WINDOW = 2
  const pgStart = Math.max(1, page - WINDOW)
  const pgEnd = Math.min(totalPages, page + WINDOW)
  const pageNumbers: number[] = []
  for (let i = pgStart; i <= pgEnd; i++) pageNumbers.push(i)

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <select
            id="filter-action"
            value={actionFilter}
            className="input h-10 w-56"
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter jenis aktivitas"
          >
            <option value="">Semua Aktivitas</option>
            {Object.entries(ACTION_LABELS)
              .filter(([key]) => key !== 'EXCEL_IMPORT')
              .map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
          </select>
          <button
            type="button"
            className="btn-secondary h-10 flex items-center justify-center px-4"
            onClick={resetFilters}
            aria-label="Reset filter"
          >
            Reset
          </button>
        </div>
        {actionFilter === 'STOCK_INITIAL' && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Stok yang pertama kali dicatat ketika barang mulai digunakan dalam sistem.
          </p>
        )}
      </div>

      {/* Empty state */}
      {logs.length === 0 ? (
        <div className="card py-12 text-center text-slate-500 dark:text-slate-400">
          <p className="text-base font-medium">
            {actionFilter
              ? `Belum ada riwayat untuk aktivitas ${ACTION_LABELS[actionFilter] ?? actionFilter}.`
              : 'Belum ada riwayat audit.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table w-full" aria-label="Audit log">
            <thead>
              <tr>
                <th scope="col" className="w-[23%] min-w-[180px] whitespace-nowrap">WAKTU</th>
                <th scope="col" className="w-[30%]">AKTIVITAS</th>
                <th scope="col" className="w-[22%]">ENTITAS</th>
                <th scope="col">OLEH</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {dtf.format(new Date(log.performed_at))}
                  </td>
                  <td>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="text-sm text-slate-600 dark:text-slate-300">
                    {formatEntityType(log.entity_type)}
                  </td>
                  <td className="text-sm text-slate-900 dark:text-slate-100">
                    {log.profiles?.full_name ?? log.profiles?.username ?? 'Sistem'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — shown whenever there is data */}
      {totalCount > 0 && (
        <nav
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
          aria-label="Navigasi halaman audit log"
        >
          {/* Count info */}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Menampilkan{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {rangeStart}–{rangeEnd}
            </span>{' '}
            dari{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{totalCount}</span>{' '}
            aktivitas
          </p>

          {/* Page controls */}
          <div className="flex flex-wrap items-center gap-1">
            {/* Previous */}
            <button
              id="btn-prev-page-auditlog"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              aria-label="Halaman sebelumnya"
            >
              &laquo; Sebelumnya
            </button>

            {/* First page + leading ellipsis */}
            {pgStart > 1 && (
              <>
                <button
                  type="button"
                  className="btn-secondary text-sm min-w-[2rem]"
                  onClick={() => goToPage(1)}
                  aria-label="Halaman 1"
                >
                  1
                </button>
                {pgStart > 2 && (
                  <span className="select-none px-1 text-slate-400 dark:text-slate-500">…</span>
                )}
              </>
            )}

            {/* Page number window */}
            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => goToPage(n)}
                aria-label={`Halaman ${n}`}
                aria-current={n === page ? 'page' : undefined}
                className={
                  n === page
                    ? 'min-w-[2rem] rounded-md px-3 py-1.5 text-sm font-bold shadow-sm bg-blue-600 text-white dark:bg-[#22D3EE] dark:text-slate-900'
                    : 'btn-secondary text-sm min-w-[2rem]'
                }
              >
                {n}
              </button>
            ))}

            {/* Trailing ellipsis + last page */}
            {pgEnd < totalPages && (
              <>
                {pgEnd < totalPages - 1 && (
                  <span className="select-none px-1 text-slate-400 dark:text-slate-500">…</span>
                )}
                <button
                  type="button"
                  className="btn-secondary text-sm min-w-[2rem]"
                  onClick={() => goToPage(totalPages)}
                  aria-label={`Halaman ${totalPages}`}
                >
                  {totalPages}
                </button>
              </>
            )}

            {/* Next */}
            <button
              id="btn-next-page-auditlog"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              aria-label="Halaman berikutnya"
            >
              Berikutnya &raquo;
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
