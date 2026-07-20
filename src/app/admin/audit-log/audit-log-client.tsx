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
  STOCK_INITIAL: 'Stok Awal',
  STOCK_IN: 'Barang Masuk',
  STOCK_OUT: 'Barang Keluar',
  STOCK_ADJUSTMENT: 'Penyesuaian Stok',
  STOCK_REVERSAL: 'Koreksi Transaksi',
  EXCEL_IMPORT: 'Impor Excel',
  SETTINGS_UPDATED: 'Pengaturan Diperbarui',
}

export default function AuditLogClient({ logs, totalCount, page, pageSize, actionFilter }: AuditLogClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const totalPages = Math.ceil(totalCount / pageSize)

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    p.set('page', '1')
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div>
      <div className="mb-4 flex gap-3">
        <select
          id="filter-action"
          value={actionFilter}
          className="input w-56"
          onChange={(e) => updateParam('action', e.target.value)}
          aria-label="Filter jenis aksi"
        >
          <option value="">Semua Aksi</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={() => router.push(pathname)}>
          Reset
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">
          <p>Tidak ada log ditemukan.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Audit log">
            <thead>
              <tr>
                <th scope="col">Waktu</th>
                <th scope="col">Aksi</th>
                <th scope="col">Entitas</th>
                <th scope="col">Oleh</th>
                <th scope="col">Alasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="text-sm text-gray-500 whitespace-nowrap">
                    {dtf.format(new Date(log.performed_at))}
                  </td>
                  <td>
                    <span className="text-sm font-medium">{ACTION_LABELS[log.action] ?? log.action}</span>
                  </td>
                  <td className="text-sm text-gray-600">
                    {log.entity_type}
                    {log.entity_id && (
                      <div className="text-xs text-gray-400 font-mono">{log.entity_id.slice(0, 8)}…</div>
                    )}
                  </td>
                  <td className="text-sm">
                    {log.profiles?.full_name ?? log.profiles?.username ?? 'Sistem'}
                  </td>
                  <td className="text-sm text-gray-500">{log.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">Halaman {page} dari {totalPages} ({totalCount} entri)</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-sm"
              onClick={() => updateParam('page', String(page - 1))} disabled={page <= 1}>
              &laquo; Sebelumnya
            </button>
            <button type="button" className="btn-secondary text-sm"
              onClick={() => updateParam('page', String(page + 1))} disabled={page >= totalPages}>
              Berikutnya &raquo;
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
