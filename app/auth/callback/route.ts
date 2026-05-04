import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get('code');
  const next  = searchParams.get('next') ?? '/dashboard';
  const error = searchParams.get('error');

  // Determine the base URL — Vercel sets x-forwarded-host in production
  const forwardedHost = request.headers.get('x-forwarded-host');
  const proto         = request.headers.get('x-forwarded-proto') ?? 'https';
  const baseUrl       = forwardedHost
    ? `${proto}://${forwardedHost}`
    : request.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_denied`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[auth/callback] exchange error:', exchangeError.message);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_failed`);
  }

  return NextResponse.redirect(`${baseUrl}${next}`);
}
