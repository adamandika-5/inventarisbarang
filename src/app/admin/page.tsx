import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard Admin — InventarisBarang',
}

/**
 * Admin dashboard page — shows key metrics.
 * Implemented in Milestone 6.
 */
export default function AdminDashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard Admin</h1>
      <p className="mt-2 text-gray-500">
        Selamat datang di panel admin InventarisBarang.
      </p>
      {/* TODO: Implement dashboard metrics and charts in Milestone 6 */}
    </div>
  )
}
