export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { Activity, CheckCircle, AlertCircle, Clock } from 'lucide-react';

async function getSystemData() {
  const db = createServerClient();
  const [runsRes, matchesRes] = await Promise.all([
    db.from('pipeline_runs')
      .select('id, started_at, grants_discovered, grants_new, high_matches, medium_matches, duration_seconds, error_message')
      .order('started_at', { ascending: false })
      .limit(20),
    db.from('match_results').select('id, composite_score, pipeline_stage, matched_at').order('matched_at', { ascending: false }).limit(5),
  ]);

  // Check Supabase connectivity
  const supabaseOk = !runsRes.error;

  return {
    runs: runsRes.data ?? [],
    recentMatches: matchesRes.data ?? [],
    supabaseOk,
  };
}

function formatDuration(s: number | null): string {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAPH_SCOPES = ['Files.ReadWrite', 'Sites.ReadWrite.All', 'User.Read', 'Calendars.Read'];

/** The tenant GUID behind a verified Microsoft 365 domain, from the public OpenID discovery document. */
async function tenantIdForDomain(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(domain)}/v2.0/.well-known/openid-configuration`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json() as { issuer?: string };
    return j.issuer?.match(/login\.microsoftonline\.com\/([0-9a-f-]{36})\//i)?.[1] ?? null;
  } catch { return null; }
}

/**
 * Everything the Microsoft 365 connection depends on, in one place, so the
 * admin never has to read env vars or the Azure portal: authority, redirect
 * URI, the live org connections and their scopes, and a ready-to-send
 * admin-consent link (v2 adminconsent grants the scopes it names, so the app
 * registration does not need them pre-listed).
 */
async function getMicrosoftReadiness(domain: string) {
  const db = createServerClient();
  const tenantSetting = process.env.MICROSOFT_TENANT_ID?.trim() || 'organizations';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const redirect = process.env.MICROSOFT_REDIRECT_URI ?? '';
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? '';
  const { data: rows } = await db.from('org_integrations').select('org_code, provider, scope, user_email, connected_at, token_expires_at').eq('provider', 'microsoft');
  const tenantId = await tenantIdForDomain(domain);
  const consentUrl = tenantId && clientId && redirect
    ? `https://login.microsoftonline.com/${tenantId}/v2.0/adminconsent?` + new URLSearchParams({
        client_id: clientId,
        scope: [...GRAPH_SCOPES.map(s => `https://graph.microsoft.com/${s}`), 'offline_access'].join(' '),
        redirect_uri: redirect,
        state: 'adminconsent',
      }).toString()
    : null;
  return {
    tenantSetting, tenantIsGuid: GUID.test(tenantSetting),
    redirect, redirectOk: !!appUrl && redirect === `${appUrl.replace(/\/$/, '')}/api/auth/microsoft/callback`,
    clientIdSet: !!clientId, domain, tenantId, consentUrl,
    connections: (rows ?? []).map(r => ({
      org: r.org_code as string, email: (r.user_email as string | null) ?? '—',
      connectedAt: r.connected_at as string | null,
      sharepoint: /Sites\.ReadWrite\.All/.test((r.scope as string | null) ?? ''),
    })),
  };
}

export default async function AdminSystemPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const sp = await searchParams;
  const domain = (sp?.domain ?? 'chicagoyouthcenters.org').trim().toLowerCase();
  const [{ runs, recentMatches, supabaseOk }, ms] = await Promise.all([getSystemData(), getMicrosoftReadiness(domain)]);

  const checks = [
    { label: 'Supabase DB',       ok: supabaseOk,  note: supabaseOk ? 'Connected' : 'Connection error' },
    { label: 'Anthropic API',     ok: !!process.env.ANTHROPIC_API_KEY, note: process.env.ANTHROPIC_API_KEY ? 'Key configured' : 'Missing key' },
    { label: 'OpenAI API',        ok: !!process.env.OPENAI_API_KEY,    note: process.env.OPENAI_API_KEY    ? 'Key configured' : 'Missing key' },
    { label: 'Google OAuth',      ok: !!process.env.GOOGLE_CLIENT_ID,  note: process.env.GOOGLE_CLIENT_ID  ? 'Configured' : 'Not configured' },
    { label: 'Microsoft OAuth',   ok: !!process.env.MICROSOFT_CLIENT_ID, note: process.env.MICROSOFT_CLIENT_ID ? 'Configured' : 'Not configured' },
    { label: 'Invite Codes',      ok: (process.env.FUNDIR_INVITE_CODES ?? '').length > 0, note: `${(process.env.FUNDIR_INVITE_CODES ?? '').split(',').filter(Boolean).length} env codes` },
    { label: 'Admin Guard',       ok: !!process.env.ADMIN_EMAIL, note: process.env.ADMIN_EMAIL ? `${process.env.ADMIN_EMAIL}` : 'Not set — anyone can access /admin!' },
  ];

  return (
    <div style={{ padding: '36px 40px', maxWidth: '1000px' }}>
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Admin Console
        </p>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
          System
        </h1>
        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
          Infrastructure health and pipeline run history.
        </p>
      </div>

      {/* Health checks */}
      <div style={{ ...CARD, padding: '20px 24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={14} color="#0d9488" />
          Configuration Health
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {checks.map(({ label, ok, note }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px',
              background: ok ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
              border: `1px solid ${ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
              borderRadius: '8px',
            }}>
              {ok
                ? <CheckCircle size={14} color="#22c55e" />
                : <AlertCircle size={14} color="#f87171" />
              }
              <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{label}</p>
                <p style={{ fontSize: '11px', color: ok ? '#4ade80' : '#f87171', margin: '1px 0 0', wordBreak: 'break-all' }}>{note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline run log */}
      <div style={CARD}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={14} color="#0d9488" />
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
            Pipeline Run Log — Last {runs.length} Runs
          </h2>
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
            No pipeline runs recorded yet. Run grant discovery from the Discover page.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Timestamp', 'Discovered', 'New', 'High', 'Medium', 'Duration', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#334155', letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={run.id} style={{
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '11px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(run.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>{run.grants_discovered}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#0d9488' }}>{run.grants_new}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>{run.high_matches}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#fbbf24' }}>{run.medium_matches}</td>
                    <td style={{ padding: '11px 16px', fontSize: '12px', color: '#64748b' }}>{formatDuration(run.duration_seconds)}</td>
                    <td style={{ padding: '11px 16px' }}>
                      {run.error_message ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '5px', fontSize: '10px', fontWeight: 600, color: '#f87171' }}>
                          Error
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '5px', fontSize: '10px', fontWeight: 600, color: '#22c55e' }}>
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Microsoft 365 readiness ── */}
      <div style={{ ...CARD, marginTop: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Microsoft 365 readiness</h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>What the shared Data Hub connection depends on, and the one link a tenant admin needs.</p>
        </div>
        <div style={{ padding: '14px 20px', display: 'grid', gap: '10px', fontSize: '13px' }}>
          {[
            { ok: !ms.tenantIsGuid, label: 'Sign-in authority', note: ms.tenantIsGuid ? `Pinned to one tenant (${ms.tenantSetting.slice(0, 8)}…) — every other organization is blocked. Set MICROSOFT_TENANT_ID to "organizations".` : `${ms.tenantSetting} — any work or school tenant can connect` },
            { ok: ms.clientIdSet, label: 'App registration', note: ms.clientIdSet ? 'Client ID configured' : 'MICROSOFT_CLIENT_ID missing' },
            { ok: ms.redirectOk, label: 'Redirect URI', note: ms.redirect ? `${ms.redirect}${ms.redirectOk ? '' : ' — does not match NEXT_PUBLIC_APP_URL/api/auth/microsoft/callback'}` : 'MICROSOFT_REDIRECT_URI missing' },
          ].map(c => (
            <div key={c.label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              {c.ok ? <CheckCircle size={15} color="#22c55e" style={{ marginTop: 2, flex: 'none' }} /> : <AlertCircle size={15} color="#f87171" style={{ marginTop: 2, flex: 'none' }} />}
              <div><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{c.label}</span><span style={{ color: '#94a3b8' }}> · {c.note}</span></div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Org connections</p>
            {ms.connections.length === 0
              ? <p style={{ margin: 0, color: '#94a3b8' }}>None yet. A member connects from Settings → Cloud Storage → Microsoft 365.</p>
              : ms.connections.map(c => (
                <div key={c.org} style={{ display: 'flex', gap: '10px', alignItems: 'center', color: '#94a3b8', padding: '3px 0' }}>
                  <span style={{ color: '#e2e8f0', fontWeight: 600, minWidth: 80 }}>{c.org}</span>
                  <span>{c.email}</span>
                  <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: 999, background: c.sharepoint ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)', color: c.sharepoint ? '#22c55e' : '#eab308' }}>{c.sharepoint ? 'SharePoint scope' : 'files only — reconnect for SharePoint'}</span>
                  <span style={{ fontSize: '11px', color: '#475569' }}>{c.connectedAt ? new Date(c.connectedAt).toLocaleDateString('en-US') : ''}</span>
                </div>
              ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin-consent link for {ms.domain}</p>
            <form method="get" style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input name="domain" defaultValue={ms.domain} placeholder="organization domain" style={{ flex: 1, maxWidth: 320, padding: '6px 10px', fontSize: 12.5, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: '#e2e8f0' }} />
              <button type="submit" style={{ padding: '6px 12px', fontSize: 12.5, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', cursor: 'pointer' }}>Look up</button>
            </form>
            {ms.tenantId
              ? <>
                  <p style={{ margin: '0 0 8px', color: '#94a3b8' }}>Tenant <code style={{ color: '#e2e8f0' }}>{ms.tenantId}</code>. Send this to their Microsoft 365 administrator; one click approves Fundir for everyone in the organization (files, SharePoint, calendar read). Nothing in Azure needs to be pre-registered.</p>
                  {ms.consentUrl
                    ? <textarea readOnly rows={4} value={ms.consentUrl} style={{ width: '100%', fontSize: 11.5, fontFamily: 'ui-monospace, monospace', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: '#cbd5e1', boxSizing: 'border-box' }} />
                    : <p style={{ margin: 0, color: '#f87171' }}>Client ID or redirect URI missing — fix the checks above first.</p>}
                </>
              : <p style={{ margin: 0, color: '#f87171' }}>No Microsoft 365 tenant found for {ms.domain}. Check the spelling, or the organization may not use Microsoft 365.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
