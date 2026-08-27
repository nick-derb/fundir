import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';

// Two modes on one Google OAuth client:
//   org  (default) — the org's shared Google Drive (Drive/Sheets/Docs scopes),
//                    stored per-org in org_integrations.
//   user (?mode=user) — the signed-in user's own Google Calendar (read-only),
//                    stored per-user in user_integrations, so the dashboard can
//                    show their Google schedule. No org-membership gate.
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export async function GET(req: NextRequest) {
  const mode     = req.nextUrl.searchParams.get('mode') === 'user' ? 'user' : 'org';
  const returnTo = req.nextUrl.searchParams.get('return') ?? '/settings';

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  let statePayload: Record<string, string>;
  let scope: string;

  if (mode === 'user') {
    statePayload = { kind: 'user', userId: ctx.userId, returnTo };
    scope = CALENDAR_SCOPES;
  } else {
    const orgCode = req.nextUrl.searchParams.get('org');
    if (!orgCode) {
      return NextResponse.json({ error: 'missing required `org` query param' }, { status: 400 });
    }
    const isMember = ctx.orgCode === orgCode || ctx.availableOrgs.some(o => o.org_code === orgCode);
    if (!isMember) {
      return NextResponse.json({ error: 'forbidden: not a member of this org' }, { status: 403 });
    }
    statePayload = { kind: 'org', orgCode, returnTo };
    scope = DRIVE_SCOPES;
  }

  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
