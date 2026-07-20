import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Beranda — InventarisBarang',
}

export default function EmployeeDashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Beranda Pegawai</h1>
      <p className="mt-2 text-gray-500">Selamat datang di InventarisBarang.</p>
    </div>
  )
}
