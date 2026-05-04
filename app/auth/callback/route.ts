import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get('code');
  const next  = searchParams.get('next') ?? '/dashboard';
  const error = searchParams.get('error');

  // Resolve base URL — Vercel sets x-forwarded-host in production
  const forwardedHost = request.headers.get('x-forwarded-host');
  const proto         = request.headers.get('x-forwarded-proto') ?? 'https';
  const baseUrl       = forwardedHost
    ? `${proto}://${forwardedHost}`
    : request.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_denied`);
  }

  // Create the redirect response BEFORE the Supabase client so we can
  // write the session cookies onto the response (the browser must receive
  // them for middleware to see a valid session on the next request).
  const response = NextResponse.redirect(`${baseUrl}${next}`);

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
            // Write onto the request so the Supabase client can read them
            // back, and onto the response so the browser stores them.
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[auth/callback]', exchangeError.message);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_failed`);
  }

  // response already contains the Set-Cookie headers for the session
  return response;
}
