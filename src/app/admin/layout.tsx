import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import AdminSidebar from './components/admin-sidebar'
import AdminMobileNav from './components/admin-mobile-nav'

/**
 * Admin root layout — verifies admin role server-side.
 * Middleware provides UX-level protection; this provides the security boundary.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()

  // Verify authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verify admin role and active status (defense in depth)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active,must_change_password,full_name,username')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    redirect('/login')
  }

  if (profile.role !== 'ADMIN') {
    // Employee accessing admin route — redirect to employee dashboard
    redirect('/employee')
  }

  if (profile.must_change_password) {
    redirect('/change-password')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <AdminSidebar fullName={profile.full_name ?? profile.username ?? 'Admin'} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Mobile header */}
        <AdminMobileNav fullName={profile.full_name ?? profile.username ?? 'Admin'} />

        {/* Page content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
