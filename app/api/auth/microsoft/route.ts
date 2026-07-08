import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';

const SCOPES = [
  'offline_access',
  'User.Read',
  'Files.ReadWrite',
].join(' ');

export async function GET(req: NextRequest) {
  const orgCode   = req.nextUrl.searchParams.get('org');
  const returnTo  = req.nextUrl.searchParams.get('return') ?? '/settings';
  // Optional: pre-select the Microsoft account (used by the post-login
  // auto-connect bounce so users who just signed in with Microsoft don't
  // hit the account picker a second time).
  const loginHint = req.nextUrl.searchParams.get('login_hint');

  if (!orgCode) {
    return NextResponse.json({ error: 'missing required `org` query param' }, { status: 400 });
  }

  // Same membership gate as the Google init route — see comment there.
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }
  const isMember = ctx.orgCode === orgCode || ctx.availableOrgs.some(o => o.org_code === orgCode);
  if (!isMember) {
    return NextResponse.json({ error: 'forbidden: not a member of this org' }, { status: 403 });
  }

  const state = Buffer.from(JSON.stringify({ orgCode, returnTo })).toString(
    'base64url',
  );

  // 'organizations' accepts all Microsoft 365 / Entra work & school accounts.
  // Set MICROSOFT_TENANT_ID=common in env if personal @outlook/@hotmail accounts are also needed
  // (requires Azure Portal → Authentication → Supported account types to include personal accounts).
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'organizations';

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri:  process.env.MICROSOFT_REDIRECT_URI!,
    response_type: 'code',
    scope:         SCOPES,
    state,
    response_mode: 'query',
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`,
  );
}
