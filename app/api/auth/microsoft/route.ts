import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';

// Two connect modes on one Azure app registration:
//   org  (default) — the org's shared Microsoft 365 / OneDrive (Files.ReadWrite),
//                    stored per-org in org_integrations.
//   user (?mode=user) — the signed-in user's own calendar (Calendars.Read),
//                    stored per-user in user_integrations, so the dashboard shows
//                    THEIR schedule. No org-membership gate — it's their account.
const ORG_SCOPES  = 'offline_access User.Read Files.ReadWrite';
const USER_SCOPES = 'offline_access User.Read Calendars.Read';

export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('mode') === 'user' ? 'user' : 'org';
  const returnTo  = req.nextUrl.searchParams.get('return') ?? '/settings';
  const loginHint = req.nextUrl.searchParams.get('login_hint');

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  let statePayload: Record<string, string>;
  let scope: string;

  if (mode === 'user') {
    statePayload = { kind: 'user', userId: ctx.userId, returnTo };
    scope = USER_SCOPES;
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
    scope = ORG_SCOPES;
  }

  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  // 'organizations' accepts ANY Microsoft 365 / Entra work-or-school tenant but
  // REJECTS personal MSAs (@outlook/@hotmail/@icloud). Keep as 'organizations';
  // never 'common' or a pinned tenant GUID. (See oauth-tokens.ts for the why.)
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'organizations';
  const hint = loginHint ?? (mode === 'user' ? ctx.email : undefined);

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri:  process.env.MICROSOFT_REDIRECT_URI!,
    response_type: 'code',
    scope,
    state,
    response_mode: 'query',
    ...(hint ? { login_hint: hint } : {}),
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`,
  );
}
