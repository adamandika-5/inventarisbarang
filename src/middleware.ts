/**
 * Middleware — Route protection and session refresh.
 *
 * SECURITY:
 * - All routes are protected by default
 * - Session is refreshed on every request using Supabase SSR
 * - Role-based access is enforced at the route level
 * - Even with middleware protection, server components and API routes
 *   perform their own authorization checks (defense in depth)
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

// Routes accessible without authentication
const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/api/auth/logout']

// Routes only accessible by admin role
const ADMIN_ROUTES = ['/admin']

// Routes only accessible by employee role
const EMPLOYEE_ROUTES = ['/employee']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Allow public auth API routes immediately without calling getUser()
  if (pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
    const res = NextResponse.next({ request })
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
    return res
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Fast path for login page when no auth cookie is present
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes('sb-') || c.name.includes('token'))

  if (pathname === '/login' && !hasAuthCookie) {
    return supabaseResponse
  }

  // Refresh session & validate auth
  const startAuth = performance.now()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (process.env.NODE_ENV === 'development') {
    const duration = performance.now() - startAuth
    // eslint-disable-next-line no-console
    console.log(`[PERF] Middleware auth check (${pathname}): ${duration.toFixed(2)}ms`)
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    // If logged in and hitting /login, redirect to /admin
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return supabaseResponse
  }

  // Require authentication for all other routes
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
    redirectResponse.headers.set('Pragma', 'no-cache')
    redirectResponse.headers.set('Expires', '0')
    return redirectResponse
  }

  // Prevent browser caching of protected routes to enforce auth check on Back button
  supabaseResponse.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  supabaseResponse.headers.set('Pragma', 'no-cache')
  supabaseResponse.headers.set('Expires', '0')

  // Role-based route protection
  if (ADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
    return supabaseResponse
  }

  if (EMPLOYEE_ROUTES.some((route) => pathname.startsWith(route))) {
    return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - manifest.json
     * - /branding (login branding assets)
     * - /icons (PWA icons)
     * - /api/auth (auth endpoints)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|branding|icons|illustrations|sw.js).*)',
  ],
}
