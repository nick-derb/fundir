import { NextRequest, NextResponse } from 'next/server';

const SCOPES = [
  'offline_access',
  'User.Read',
  'Files.ReadWrite',
].join(' ');

export async function GET(req: NextRequest) {
  const orgCode = req.nextUrl.searchParams.get('org');
  const returnTo = req.nextUrl.searchParams.get('return') ?? '/settings';

  if (!orgCode) {
    return NextResponse.json({ error: 'missing required `org` query param' }, { status: 400 });
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
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`,
  );
}
