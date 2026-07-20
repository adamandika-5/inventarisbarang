import { redirect } from 'next/navigation'

/**
 * Root page — redirect to login.
 * The actual dashboard routing is handled after auth check in middleware.
 */
export default function RootPage() {
  redirect('/login')
}
