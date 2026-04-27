import { NextRequest, NextResponse } from 'next/server';
import { upsertIntegration } from '@/lib/oauth-tokens';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=google_denied`);
  }

  let orgCode  = 'CYC2025';
  let returnTo = '/settings';
  try {
    const parsed = JSON.parse(
      Buffer.from(state ?? '', 'base64url').toString('utf8'),
    );
    orgCode  = parsed.orgCode  ?? orgCode;
    returnTo = parsed.returnTo ?? returnTo;
  } catch { /* use defaults */ }

  // Exchange authorization code for tokens
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

  if (!tokens.access_token) {
    return NextResponse.redirect(`${appUrl}/settings?error=google_token_failed`);
  }

  // Fetch user email
  let email: string | undefined;
  try {
    const infoRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    const info = await infoRes.json();
    email = info.email;
  } catch { /* not critical */ }

  await upsertIntegration(orgCode, 'google', {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in:    tokens.expires_in,
    scope:         tokens.scope,
    email,
  });

  return NextResponse.redirect(
    `${appUrl}${returnTo}?connected=google`,
  );
}
