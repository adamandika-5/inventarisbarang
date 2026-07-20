import type { Metadata } from 'next'
import NewEmployeeForm from './new-employee-form'

export const metadata: Metadata = {
  title: 'Tambah Pegawai — InventarisBarang Admin',
}

export default function NewUserPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tambah Pegawai</h1>
        <p className="mt-1 text-sm text-gray-500">Buat akun baru untuk pegawai</p>
      </div>
      <NewEmployeeForm />
    </div>
  )
}
