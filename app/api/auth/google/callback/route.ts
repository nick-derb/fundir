import { NextRequest, NextResponse } from 'next/server';
import { upsertIntegration, upsertUserIntegration } from '@/lib/oauth-tokens';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

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
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) returnTo = '/dashboard';

  const fail = (reason: string) => {
    const u = new URL(kind === 'user' ? returnTo : '/settings', appUrl);
    u.searchParams.set('error', reason);
    return NextResponse.redirect(u.toString());
  };

  if (error || !code) return fail('google_denied');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
      grant_type:    'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) return fail('google_token_failed');

  let email: string | undefined;
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    email = (await infoRes.json()).email;
  } catch { /* not critical */ }

  if (kind === 'user') {
    if (!userId) return fail('google_state_missing_user');
    await upsertUserIntegration(userId, 'google', {
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

  if (!orgCode) return NextResponse.redirect(`${appUrl}/settings?error=google_state_missing_org`);
  await upsertIntegration(orgCode, 'google', {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in:    tokens.expires_in,
    scope:         tokens.scope,
    email,
  });
  const dest = new URL(returnTo, appUrl);
  dest.searchParams.set('connected', 'google');
  return NextResponse.redirect(dest.toString());
}
