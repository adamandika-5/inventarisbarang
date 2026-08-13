import { BrandedLoader } from '@/components/branded-loader'

export default function Loading() {
  return (
    <main
      className="route-loading-screen"
      role="status"
      aria-live="polite"
      aria-label="Memuat halaman Inventaris Barang"
    >
      <BrandedLoader title="Inventaris Barang" message="Memuat halaman yang Anda perlukan..." />
    </main>
  )
}
