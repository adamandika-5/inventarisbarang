'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Transaction {
  id: string
  transaction_number: string
  transaction_type: string
  input_quantity: bigint | string | number
  quantity_delta: bigint | string | number
  transaction_at: string
  stock_before: bigint | string | number
  stock_after: bigint | string | number
  is_reversed: boolean
  items: { id: string; sku: string; name: string } | null
  units: { id: string; name: string; symbol: string } | null
  profiles: { id: string; full_name: string; username: string } | null
}

interface ReversalsClientProps {
  transactions: Transaction[]
  totalCount: number
  page: number
  pageSize: number
  search: string
}

const dtf = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

export default function ReversalsClient({
  transactions,
  totalCount,
  page,
  pageSize,
  search,
}: ReversalsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [reversing, setReversing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const totalPages = Math.ceil(totalCount / pageSize)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    p.set('page', '1')
    router.push(`${pathname}?${p.toString()}`)
  }

  const handleReversal = (txId: string) => {
    if (!reason.trim()) { showMsg('error', 'Alasan wajib diisi.'); return }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('client_request_id', crypto.randomUUID())
      formData.set('original_transaction_id', txId)
      formData.set('reason', reason)

      const res = await fetch('/api/transactions/reversal', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json() as { success: boolean; error?: string; data?: { transaction_number?: string } }

      if (result.success) {
        showMsg('success', `Pembalikan ${result.data?.transaction_number ?? ''} berhasil.`)
        setReversing(null)
        setReason('')
        router.refresh()
      } else {
        showMsg('error', result.error ?? 'Gagal membalik transaksi.')
      }
    })
  }

  return (
    <div>
      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
          {message.text}
        </div>
      )}

      <div className="mb-4">
        <input
          id="search-reversal"
          type="search"
          placeholder="Cari nomor transaksi…"
          defaultValue={search}
          className="input max-w-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateParam('search', (e.target as HTMLInputElement).value)
          }}
        />
      </div>

      {transactions.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">
          <p>Tidak ada transaksi yang dapat dibalik.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <code className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{tx.transaction_number}</code>
                  <span className="ml-2 text-xs text-gray-500">{tx.transaction_type}</span>
                  <p className="mt-1 font-medium">{tx.items?.name ?? '—'}</p>
                  <p className="text-sm text-gray-500">
                    {Number(tx.input_quantity).toLocaleString('id-ID')} {tx.units?.symbol}
                    {' · '}Oleh: {tx.profiles?.full_name ?? tx.profiles?.username ?? '—'}
                    {' · '}{dtf.format(new Date(tx.transaction_at))}
                  </p>
                </div>
                <button
                  id={`btn-balik-${tx.id}`}
                  type="button"
                  className="btn-danger text-sm"
                  onClick={() => { setReversing(tx.id); setReason('') }}
                  disabled={isPending || reversing === tx.id}
                >
                  Balik
                </button>
              </div>

              {reversing === tx.id && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <label htmlFor={`reason-${tx.id}`} className="label mb-1">
                    Alasan Pembalikan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id={`reason-${tx.id}`}
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Contoh: Transaksi salah barang"
                    className="input mb-2"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      id={`btn-konfirmasi-balik-${tx.id}`}
                      type="button"
                      className="btn-danger text-sm"
                      onClick={() => handleReversal(tx.id)}
                      disabled={isPending || !reason.trim()}
                    >
                      {isPending ? 'Memproses…' : 'Konfirmasi Pembalikan'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      onClick={() => { setReversing(null); setReason('') }}
                      disabled={isPending}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">Halaman {page} dari {totalPages}</p>
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
