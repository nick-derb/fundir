export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { Building2, ExternalLink, Copy } from 'lucide-react';
import Link from 'next/link';

async function getOrgs() {
  const db = createServerClient();
  const { data } = await db
    .from('organizations')
    .select('id, org_code, name, ein, city, state, fiscal_year_start, fiscal_year_end, created_at')
    .order('created_at', { ascending: false });
  return data ?? [];
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function fiscalLabel(start: string | null): string {
  if (!start) return 'Jan – Dec';
  const map: Record<string, string> = {
    '01-01': 'Jan – Dec',
    '07-01': 'Jul – Jun',
    '10-01': 'Oct – Sep',
    '04-01': 'Apr – Mar',
  };
  return map[start] ?? start;
}

export default async function AdminOrganizationsPage() {
  const orgs = await getOrgs();

  return (
    <div style={{ padding: '36px 40px', maxWidth: '1200px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Admin Console
          </p>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
            Organizations
          </h1>
          <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
            {orgs.length} organization{orgs.length !== 1 ? 's' : ''} registered on the platform.
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px',
          background: 'rgba(13,148,136,0.08)',
          border: '1px solid rgba(13,148,136,0.2)',
          borderRadius: '8px',
          fontSize: '12px', fontWeight: 600, color: '#0d9488',
        }}>
          <Building2 size={13} />
          {orgs.length} total
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {orgs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Building2 size={32} color="#1e293b" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', color: '#475569' }}>No organizations registered yet.</p>
            <Link href="/admin/invites" style={{ fontSize: '13px', color: '#0d9488' }}>
              Create an invite code to get started →
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Organization', 'EIN', 'Location', 'Org Code', 'Fiscal Year', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px',
                    fontSize: '10px', fontWeight: 700,
                    color: '#334155',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    textAlign: 'left',
                    background: 'rgba(0,0,0,0.2)',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map((org, i) => (
                <tr key={org.id} style={{
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Organization name */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', flexShrink: 0,
                        background: 'rgba(13,148,136,0.1)',
                        border: '1px solid rgba(13,148,136,0.2)',
                        borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0d9488' }}>
                          {(org.name ?? '?').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {org.name}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* EIN */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace', color: '#64748b' }}>
                      {org.ein ?? '—'}
                    </span>
                  </td>

                  {/* Location */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {org.city && org.state ? `${org.city}, ${org.state}` : '—'}
                    </span>
                  </td>

                  {/* Org code */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '3px 9px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '5px',
                      fontSize: '11px',
                      fontFamily: 'ui-monospace, monospace',
                      fontWeight: 600,
                      color: '#94a3b8',
                    }}>
                      {org.org_code}
                    </span>
                  </td>

                  {/* Fiscal year */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {fiscalLabel(org.fiscal_year_start)}
                    </span>
                  </td>

                  {/* Joined */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '12px', color: '#475569' }}>
                      {org.created_at ? timeAgo(org.created_at) : '—'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <OrgCodeCopyButton code={org.org_code} />
                      <Link
                        href="/dashboard"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '5px 10px',
                          background: 'rgba(13,148,136,0.08)',
                          border: '1px solid rgba(13,148,136,0.2)',
                          borderRadius: '6px',
                          fontSize: '11px', fontWeight: 600, color: '#0d9488',
                          textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={10} />
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Inline client component for copy button
function OrgCodeCopyButton({ code }: { code: string }) {
  return (
    <button
      data-code={code}
      onClick={(e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        navigator.clipboard.writeText(btn.dataset.code ?? '');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.innerHTML = ''; btn.appendChild(document.createTextNode('Copy')); }, 1500);
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '5px 10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '6px',
        fontSize: '11px', fontWeight: 500, color: '#64748b',
        cursor: 'pointer',
      }}
    >
      Copy
    </button>
  );
}
