import { createServerClient } from '@/lib/supabase';

export type Provider = 'google' | 'microsoft';

export interface OrgIntegration {
  id: string;
  org_code: string;
  provider: Provider;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  user_email: string | null;
  connected_at: string;
}

export async function getIntegration(
  orgCode: string,
  provider: Provider,
): Promise<OrgIntegration | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('org_integrations')
    .select('*')
    .eq('org_code', orgCode)
    .eq('provider', provider)
    .single();
  return data ?? null;
}

export async function getAllIntegrations(orgCode: string): Promise<OrgIntegration[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('org_integrations')
    .select('*')
    .eq('org_code', orgCode);
  return data ?? [];
}

export async function upsertIntegration(
  orgCode: string,
  provider: Provider,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    email?: string;
  },
) {
  const supabase = createServerClient();
  const token_expires_at = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  await supabase.from('org_integrations').upsert(
    {
      org_code: orgCode,
      provider,
      access_token: tokens.access_token,
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
      ...(token_expires_at && { token_expires_at }),
      ...(tokens.scope && { scope: tokens.scope }),
      ...(tokens.email && { user_email: tokens.email }),
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'org_code,provider' },
  );
}

export async function removeIntegration(orgCode: string, provider: Provider) {
  const supabase = createServerClient();
  await supabase
    .from('org_integrations')
    .delete()
    .eq('org_code', orgCode)
    .eq('provider', provider);
}

/** Returns a valid access token, refreshing if within 60 seconds of expiry. */
export async function getValidToken(
  orgCode: string,
  provider: Provider,
): Promise<string | null> {
  const integration = await getIntegration(orgCode, provider);
  if (!integration) return null;

  const expiresAt = integration.token_expires_at
    ? new Date(integration.token_expires_at)
    : null;
  const isExpired = expiresAt
    ? expiresAt < new Date(Date.now() + 60_000)
    : false;

  if (!isExpired) return integration.access_token;
  if (!integration.refresh_token) return null;

  try {
    const refreshed = await refreshAccessToken(provider, integration.refresh_token);
    await upsertIntegration(orgCode, provider, refreshed);
    return refreshed.access_token;
  } catch {
    return null;
  }
}

// ── Per-user integrations (personal calendar) ───────────────────────────────
// Distinct from the org's shared Microsoft connection: each user connects their
// own account so the dashboard shows THEIR calendar.

export const MS_CALENDAR_SCOPE = 'Calendars.Read offline_access User.Read';

export interface UserIntegration {
  user_id:          string;
  provider:         Provider;
  access_token:     string;
  refresh_token:    string | null;
  token_expires_at: string | null;
  scope:            string | null;
  email:            string | null;
  connected_at:     string;
}

export async function getUserIntegration(
  userId: string,
  provider: Provider,
): Promise<UserIntegration | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  return (data as UserIntegration | null) ?? null;
}

export async function upsertUserIntegration(
  userId: string,
  provider: Provider,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; email?: string },
) {
  const supabase = createServerClient();
  const token_expires_at = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;
  await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider,
      access_token: tokens.access_token,
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
      ...(token_expires_at && { token_expires_at }),
      ...(tokens.scope && { scope: tokens.scope }),
      ...(tokens.email && { email: tokens.email }),
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  );
}

export async function removeUserIntegration(userId: string, provider: Provider) {
  const supabase = createServerClient();
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', provider);
}

/** Valid per-user access token, refreshing within 60s of expiry. */
export async function getValidUserToken(
  userId: string,
  provider: Provider,
): Promise<string | null> {
  const integration = await getUserIntegration(userId, provider);
  if (!integration) return null;

  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date(Date.now() + 60_000) : false;

  if (!isExpired) return integration.access_token;
  if (!integration.refresh_token) return null;

  try {
    const scope = provider === 'microsoft' ? MS_CALENDAR_SCOPE : undefined;
    const refreshed = await refreshAccessToken(provider, integration.refresh_token, scope);
    await upsertUserIntegration(userId, provider, refreshed);
    return refreshed.access_token;
  } catch {
    return null;
  }
}

async function refreshAccessToken(
  provider: Provider,
  refreshToken: string,
  msScope = 'Files.ReadWrite offline_access User.Read',
): Promise<{ access_token: string; expires_in?: number; refresh_token?: string; scope?: string }> {
  if (provider === 'google') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Google refresh failed');
    return data;
  } else {
    // Must match the authority used at sign-in (app/api/auth/microsoft/route.ts).
    // 'organizations' = any Microsoft 365 / Entra work-or-school tenant (nd.edu,
    // CYC, …) but NOT personal @outlook/@hotmail/@icloud MSAs. Do NOT default to
    // 'common' — that lets personal accounts in, which land in consumer OneDrive
    // (onedrive.live.com) instead of the org's SharePoint/OneDrive-for-Business.
    const tenant = process.env.MICROSOFT_TENANT_ID ?? 'organizations';
    const res = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: msScope,
        }),
      },
    );
    const data = await res.json();
    if (!data.access_token) throw new Error('Microsoft refresh failed');
    return data;
  }
}
