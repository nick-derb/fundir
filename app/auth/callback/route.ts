import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { provisionMembership, safeNextPath } from '@/lib/access-control';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code   = searchParams.get('code');
  const next   = safeNextPath(searchParams.get('next'));   // open-redirect defence
  const error  = searchParams.get('error');

  // Resolve base URL — Vercel sets x-forwarded-host in production.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const proto         = request.headers.get('x-forwarded-proto') ?? 'https';
  const baseUrl       = forwardedHost
    ? `${proto}://${forwardedHost}`
    : request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_denied`);
  }

  if (!code) {
    // No PKCE code — may be a hash-based recovery redirect that the
    // browser will resolve client-side. Pass-through to reset-password
    // so the client picks it up.
    if (next.startsWith('/reset-password')) {
      return NextResponse.redirect(`${baseUrl}/reset-password`);
    }
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  // Create the redirect response BEFORE the Supabase client so we can
  // write the session cookies onto the response (the browser must
  // receive them for middleware to see a valid session on next request).
  // We may rewrite this URL below once we know whether the user is
  // provisioned or denied.
  let redirectTarget = `${baseUrl}${next}`;
  const response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[auth/callback]', exchangeError.message);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_failed`);
  }

  // Provisioning: if it's an OAuth sign-in, decide whether the user is
  // allowed into the CYC tenant. Email-based password sign-ins skip the
  // allowlist check (they already have a `user_organizations` row from
  // the legacy /signup flow), but we still call the helper because it
  // short-circuits on `already_member`.
  const user      = data.user;
  const provider  = user?.app_metadata?.provider ?? null;
  const email     = user?.email ?? null;

  if (user && email) {
    const result = await provisionMembership(user.id, email, provider);
    if (result.status === 'denied') {
      // Keep the session (RLS denies them zero rows anyway) and route to
      // the friendly access-denied screen so they can request access.
      const denyUrl = new URL(`${baseUrl}/access-denied`);
      denyUrl.searchParams.set('email', email);
      if (provider) denyUrl.searchParams.set('provider', provider);
      redirectTarget = denyUrl.toString();
    }
  }

  // Apply the (possibly rewritten) target. NextResponse.redirect returned
  // earlier set headers on `response`; we need to construct a fresh one
  // if the URL changed, copying over the auth cookies.
  if (redirectTarget !== `${baseUrl}${next}`) {
    const newResponse = NextResponse.redirect(redirectTarget);
    response.cookies.getAll().forEach(c => {
      newResponse.cookies.set(c.name, c.value, c);
    });
    return newResponse;
  }
  return response;
}
