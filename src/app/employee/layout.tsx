import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import EmployeeNav from './components/employee-nav'

/**
 * Employee root layout — verifies active user role server-side.
 */
export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active,must_change_password,full_name,username')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    redirect('/login')
  }

  if (profile?.must_change_password) {
    redirect('/change-password')
  }

  const fullName = profile.full_name ?? profile.username ?? 'Pegawai'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-[#F8FAFC] transition-colors">
      <EmployeeNav fullName={fullName} />
      <main className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
