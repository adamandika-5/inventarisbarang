import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import SettingsForm from './settings-form'

export const metadata: Metadata = {
  title: 'Pengaturan — InventarisBarang Admin',
}

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pengaturan Aplikasi</h1>
        <p className="mt-1 text-sm text-gray-500">Konfigurasi nama instansi dan preferensi laporan</p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  )
}
