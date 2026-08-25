import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

const PROTECTED   = ['/dashboard', '/discover', '/pipeline', '/settings', '/grant', '/financials', '/calendar', '/reports', '/org', '/foundations', '/welcome'];
const ADMIN_ONLY  = ['/admin'];
const AUTH_ROUTES = ['/login', '/signup'];
const PUBLIC_AUTH = ['/access-denied', '/auth/callback']; // authenticated-OK but not membership-gated

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
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

  const isProtected   = PROTECTED.some(p => pathname.startsWith(p));
  const isAdminRoute  = ADMIN_ONLY.some(p => pathname.startsWith(p));
  const isAuthRoute   = AUTH_ROUTES.some(p => pathname.startsWith(p));
  const isPublicAuth  = PUBLIC_AUTH.some(p => pathname.startsWith(p));

  // /access-denied + /auth/callback: require an authenticated session
  // (no anon access) but do not check tenant membership — that's the
  // whole point of the deny screen.
  if (isPublicAuth) {
    if (pathname.startsWith('/access-denied') && !session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // Admin routes — middleware only checks session; the admin layout
  // server-side checks the email against ADMIN_EMAIL.
  if (isAdminRoute) {
    if (!session) {
      return NextResponse.redirect(new URL('/login?next=/admin', request.url));
    }
    return response;
  }

  if (isProtected) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Authenticated, but does the user have a tenant membership?
    // If not, route to /access-denied (not /login — that would loop).
    const userId = session.user.id;
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      const denyUrl = new URL('/access-denied', request.url);
      if (session.user.email) denyUrl.searchParams.set('email', session.user.email);
      return NextResponse.redirect(denyUrl);
    }
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
    '/access-denied',
    '/login',
    '/signup',
    '/welcome',
  ],
};
