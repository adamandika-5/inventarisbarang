import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Employee root layout — verifies employee role server-side.
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
    .select('role,is_active,must_change_password,full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    redirect('/login')
  }

  if (profile?.must_change_password) {
    redirect('/change-password')
  }

  // Employees stay in employee routes, admins can also access employee features
  // but admin should use /admin routes for admin-specific features

  return <>{children}</>
}
