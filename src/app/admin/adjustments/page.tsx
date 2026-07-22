import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import AdjustmentForm from './adjustment-form'

export const metadata: Metadata = {
  title: 'Penyesuaian Stok — InventarisBarang Admin',
}

export default async function AdjustmentsPage() {
  const supabase = await createSupabaseServerClient()

  // Load recent adjustments (last 20)
  const { data: recentAdjustments } = await supabase
    .from('stock_transactions')
    .select(
      'id,transaction_number,transaction_type,input_quantity,base_quantity,quantity_delta,transaction_at,stock_before,stock_after,reason,items!item_id(id,sku,name),units!unit_id(id,name,symbol),profiles!performed_by(id,full_name,username)',
    )
    .in('transaction_type', ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
    .order('transaction_at', { ascending: false })
    .limit(20)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Penyesuaian Stok</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Sesuaikan stok sistem berdasarkan kondisi fisik barang
        </p>
      </div>
      <AdjustmentForm recentAdjustments={recentAdjustments ?? []} />
    </div>
  )
}
