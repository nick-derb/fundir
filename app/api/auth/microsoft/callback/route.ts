import { NextRequest, NextResponse } from 'next/server';
import { upsertIntegration } from '@/lib/oauth-tokens';
import { getUserEmail } from '@/lib/microsoft-graph';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=microsoft_denied`);
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

  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common';

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
        scope:         'offline_access User.Read Files.ReadWrite',
      }),
    },
  );

  const tokens = await tokenRes.json();

  if (!tokens.access_token) {
    return NextResponse.redirect(
      `${appUrl}/settings?error=microsoft_token_failed`,
    );
  }

  let email: string | undefined;
  try {
    email = await getUserEmail(tokens.access_token);
  } catch { /* not critical */ }

  await upsertIntegration(orgCode, 'microsoft', {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in:    tokens.expires_in,
    scope:         tokens.scope,
    email,
  });

  return NextResponse.redirect(
    `${appUrl}${returnTo}?connected=microsoft`,
  );
}
