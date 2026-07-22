import type { Metadata } from 'next'
import EmployeeStockOutClient from './stock-out-client'

export const metadata: Metadata = {
  title: 'Barang Keluar — InventarisBarang',
  description: 'Pencatatan pengeluaran barang oleh pegawai',
}

export default function EmployeeStockOutPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Barang Keluar</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Catat pengeluaran atau pengambilan barang secara manual.
        </p>
      </div>

      <EmployeeStockOutClient />
    </div>
  )
}
