import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export async function GET(req: NextRequest) {
  const orgCode  = req.nextUrl.searchParams.get('org');
  const returnTo = req.nextUrl.searchParams.get('return') ?? '/settings';

  // Org must come from the calling page (settings carries it through). No
  // hardcoded tenant default — that silently bound every tenant's
  // integration callbacks to CYC.
  if (!orgCode) {
    return NextResponse.json({ error: 'missing required `org` query param' }, { status: 400 });
  }

  // Phase 1 verification gap close: the caller MUST be authenticated AND a
  // member of the org they're trying to connect an integration to.
  // Without this check, any logged-in user could hit `?org=CYC2025` and
  // bind their Google tokens to CYC's integration record.
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

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
}
