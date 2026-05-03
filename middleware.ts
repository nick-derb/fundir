import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

const PROTECTED   = ['/dashboard', '/discover', '/pipeline', '/settings', '/grant', '/financials', '/calendar', '/reports', '/org', '/foundations'];
const ADMIN_ONLY  = ['/admin'];
const AUTH_ROUTES = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const isProtected = PROTECTED.some(p => pathname.startsWith(p));
  const isAdminRoute = ADMIN_ONLY.some(p => pathname.startsWith(p));
  const isAuthRoute  = AUTH_ROUTES.some(p => pathname.startsWith(p));

  // Admin routes: middleware only checks authentication.
  // The admin layout does the stricter email check server-side.
  if (isAdminRoute) {
    if (!session) {
      return NextResponse.redirect(new URL('/login?next=/admin', request.url));
    }
    return response;
  }

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/discover/:path*',
    '/pipeline/:path*',
    '/settings/:path*',
    '/grant/:path*',
    '/financials/:path*',
    '/calendar/:path*',
    '/reports/:path*',
    '/org/:path*',
    '/foundations/:path*',
    '/admin/:path*',
    '/admin',
    '/login',
    '/signup',
  ],
};
