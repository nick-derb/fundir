import { NextRequest, NextResponse } from 'next/server';
import { upsertIntegration, upsertUserIntegration } from '@/lib/oauth-tokens';
import { getUserEmail } from '@/lib/microsoft-graph';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // ── Decode state (kind=org|user, orgCode?, userId?, returnTo) ──
  let kind: 'org' | 'user' = 'org';
  let orgCode: string | null = null;
  let userId: string | null = null;
  let returnTo = '/settings';
  try {
    const parsed = JSON.parse(Buffer.from(state ?? '', 'base64url').toString('utf8'));
    kind     = parsed.kind === 'user' ? 'user' : 'org';
    orgCode  = parsed.orgCode ?? null;
    userId   = parsed.userId ?? null;
    returnTo = parsed.returnTo ?? returnTo;
  } catch { /* unparseable state */ }
  // Open-redirect guard: only same-origin paths.
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) returnTo = '/dashboard';

  const fail = (reason: string) => {
    const base = kind === 'user' ? returnTo : '/settings';
    const u = new URL(base, appUrl);
    u.searchParams.set('error', reason);
    return NextResponse.redirect(u.toString());
  };

  if (error || !code) return fail('microsoft_denied');

  const scope = kind === 'user'
    ? 'offline_access User.Read Calendars.Read'
    : 'offline_access User.Read Files.ReadWrite';
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'organizations';

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri:  process.env.MICROSOFT_REDIRECT_URI!,
        grant_type:    'authorization_code',
        scope,
      }),
    },
  );
  const tokens = await tokenRes.json();
  if (!tokens.access_token) return fail('microsoft_token_failed');

  let email: string | undefined;
  try { email = await getUserEmail(tokens.access_token); } catch { /* not critical */ }

  if (kind === 'user') {
    if (!userId) return fail('microsoft_state_missing_user');
    await upsertUserIntegration(userId, 'microsoft', {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in:    tokens.expires_in,
      scope:         tokens.scope,
      email,
    });
    const dest = new URL(returnTo, appUrl);
    dest.searchParams.set('connected', 'calendar');
    return NextResponse.redirect(dest.toString());
  }

  // org flow
  if (!orgCode) return NextResponse.redirect(`${appUrl}/settings?error=microsoft_state_missing_org`);
  await upsertIntegration(orgCode, 'microsoft', {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in:    tokens.expires_in,
    scope:         tokens.scope,
    email,
  });
  const dest = new URL(returnTo, appUrl);
  dest.searchParams.set('connected', 'microsoft');
  return NextResponse.redirect(dest.toString());
}
