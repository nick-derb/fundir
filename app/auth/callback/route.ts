import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { provisionMembership, safeNextPath } from '@/lib/access-control';
import { getIntegration } from '@/lib/oauth-tokens';
import { createServerClient as createAdminClient } from '@/lib/supabase';

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
  let bounceToConnect = false;
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
    } else {
      // First-run onboarding: a user with no completed profile is routed
      // through /welcome (after any Microsoft storage-connect bounce below).
      let dest = next;
      try {
        const { data: prof } = await createAdminClient()
          .from('profiles')
          .select('onboarded_at')
          .eq('user_id', user.id)
          .single();
        if (!prof?.onboarded_at) dest = '/welcome';
      } catch {
        // profiles table missing / unreachable — don't block sign-in.
      }
      redirectTarget = `${baseUrl}${dest}`;

      if (
        provider === 'azure' &&
        result.orgCode &&
        // If a previous bounce didn't end in a connection (declined consent,
        // tenant admin-consent block, personal account), don't wall the user
        // off at every sign-in — try again after the marker expires.
        !request.cookies.get('ms_storage_prompted')
      ) {
        // Microsoft-first: signing in with Microsoft should also connect the
        // org's Microsoft 365 storage. If the org has no integration yet,
        // bounce once through the Graph OAuth flow (login_hint skips the
        // account picker; after first consent this redirect is silent), then
        // land on `dest`. Integrations are org-scoped, so this fires at most
        // once per org.
        try {
          const existing = await getIntegration(result.orgCode, 'microsoft');
          if (!existing) {
            const connectUrl = new URL(`${baseUrl}/api/auth/microsoft`);
            connectUrl.searchParams.set('org', result.orgCode);
            connectUrl.searchParams.set('return', dest);
            connectUrl.searchParams.set('login_hint', email);
            redirectTarget = connectUrl.toString();
            bounceToConnect = true;
          }
        } catch {
          // Storage auto-connect is best-effort — never block sign-in on it.
        }
      }
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
    if (bounceToConnect) {
      // Mark that we prompted for storage consent so a declined/blocked
      // consent doesn't re-wall the user at every sign-in for a week.
      // (A successful connection makes this moot — the org integration
      // check short-circuits the bounce entirely.)
      newResponse.cookies.set('ms_storage_prompted', '1', {
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });
    }
    return newResponse;
  }
  return response;
}
