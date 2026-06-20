export const dynamic = 'force-dynamic';

/**
 * /admin/access — manage the access allowlist + review pending requests.
 *
 * Server component reads everything via the service-role client (RLS-bypassing
 * for the admin UI). All mutations go through actions/access.ts which
 * re-verifies the caller against ADMIN_EMAIL.
 */

import { createServerClient } from '@/lib/supabase';
import { addAllowlistEntry, removeAllowlistEntry, approveAccessRequest, denyAccessRequest } from '@/actions/access';
import { ShieldCheck, Mail, Plus, Trash2, Check, X, Clock } from 'lucide-react';

interface AllowlistRow {
  id: string;
  email: string;
  role: string;
  added_by: string | null;
  added_at: string;
  notes: string | null;
  organizations: { name: string; org_code: string } | null;
}

interface RequestRow {
  id: string;
  email: string;
  provider: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface OrgRow { id: string; name: string; org_code: string; }

async function load() {
  const db = createServerClient();

  const [{ data: allowlist }, { data: pending }, { data: history }, { data: orgs }] = await Promise.all([
    db.from('access_allowlist')
      .select('id, email, role, added_by, added_at, notes, organizations(name, org_code)')
      .order('added_at', { ascending: false }),
    db.from('access_requests')
      .select('id, email, provider, status, created_at, reviewed_at, reviewed_by')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    db.from('access_requests')
      .select('id, email, provider, status, created_at, reviewed_at, reviewed_by')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('organizations').select('id, name, org_code').order('name'),
  ]);

  return {
    allowlist: (allowlist ?? []) as unknown as AllowlistRow[],
    pending:   (pending   ?? []) as RequestRow[],
    history:   (history   ?? []) as RequestRow[],
    orgs:      (orgs      ?? []) as OrgRow[],
  };
}

const PAGE: React.CSSProperties = {
  padding: '32px 40px', minHeight: '100vh',
  background: '#070d1a', color: '#e2e8f0',
};
const HEAD: React.CSSProperties = { marginBottom: '28px' };
const EYEBROW: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono, monospace)',
  fontSize: '10.5px', letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--accent-bright, #15917A)', fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
};
const TITLE: React.CSSProperties = {
  fontSize: '24px', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', margin: 0,
};
const SUB: React.CSSProperties = { color: '#9FB0C8', fontSize: '13px', marginTop: '6px' };

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
  marginBottom: '20px',
};

const CARD_HEAD: React.CSSProperties = {
  padding: '14px 18px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '12px',
};

const ROW: React.CSSProperties = {
  padding: '12px 18px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  display: 'flex', alignItems: 'center', gap: '14px',
};

const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '13px',
  padding: '7px 10px',
  outline: 'none',
};

const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--accent, #0C6B5A)',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '7px 13px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px',
};

const BTN_GHOST: React.CSSProperties = {
  background: 'transparent',
  color: '#9FB0C8',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '5px',
};

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono, monospace)',
  fontVariantNumeric: 'tabular-nums',
};

const TAG: React.CSSProperties = {
  ...MONO,
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '3px 7px',
  borderRadius: '4px',
};

export default async function AdminAccessPage() {
  const { allowlist, pending, history, orgs } = await load();
  const defaultOrgCode = orgs[0]?.org_code ?? '';

  return (
    <div style={PAGE}>

      {/* Header */}
      <div style={HEAD}>
        <div style={EYEBROW}>
          <ShieldCheck size={14} /> Admin · Access Control
        </div>
        <h1 style={TITLE}>Allowlist &amp; access requests</h1>
        <p style={SUB}>
          Pre-authorize emails to join a tenant. Unrecognized OAuth sign-ins land in{' '}
          <strong style={{ color: '#C6D3E6' }}>Pending requests</strong> for review.
        </p>
      </div>

      {/* Pending requests */}
      <div style={CARD}>
        <div style={CARD_HEAD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={14} color="var(--warning, #C0852B)" />
            <div>
              <div style={{ ...MONO, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9FB0C8', fontWeight: 600 }}>
                Pending requests
              </div>
              <div style={{ fontSize: '11px', color: '#7E90AB', marginTop: '2px' }}>
                People who tried to sign in but aren&apos;t on the allowlist.
              </div>
            </div>
          </div>
          <span style={{ ...MONO, ...TAG, background: 'rgba(192,133,43,0.12)', color: 'var(--warning, #C0852B)' }}>
            {pending.length} waiting
          </span>
        </div>

        {pending.length === 0 ? (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: '#7E90AB', fontSize: '12.5px' }}>
            No pending requests. New sign-ins by unrecognized emails will show up here.
          </div>
        ) : (
          pending.map(r => (
            <div key={r.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={12} color="#7E90AB" />
                  <span style={{ ...MONO, fontSize: '13px', color: '#fff', fontWeight: 600 }}>{r.email}</span>
                  {r.provider && (
                    <span style={{ ...TAG, background: 'rgba(255,255,255,0.05)', color: '#7E90AB' }}>
                      {r.provider}
                    </span>
                  )}
                </div>
                <div style={{ ...MONO, fontSize: '10.5px', color: '#7E90AB', marginTop: '4px' }}>
                  Requested {new Date(r.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </div>
              </div>
              <form action={approveAccessRequest} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="hidden" name="id" value={r.id} />
                <select name="org_code" defaultValue={defaultOrgCode} style={{ ...INPUT, padding: '5px 8px' }}>
                  {orgs.map(o => <option key={o.id} value={o.org_code}>{o.org_code}</option>)}
                </select>
                <select name="role" defaultValue="member" style={{ ...INPUT, padding: '5px 8px' }}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                  <option value="viewer">viewer</option>
                </select>
                <button type="submit" style={{ ...BTN_PRIMARY, padding: '5px 10px' }}>
                  <Check size={12} /> Approve
                </button>
              </form>
              <form action={denyAccessRequest}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" style={BTN_GHOST}>
                  <X size={12} /> Deny
                </button>
              </form>
            </div>
          ))
        )}
      </div>

      {/* Allowlist */}
      <div style={CARD}>
        <div style={CARD_HEAD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={14} color="var(--accent-bright, #15917A)" />
            <div>
              <div style={{ ...MONO, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9FB0C8', fontWeight: 600 }}>
                Allowlist
              </div>
              <div style={{ fontSize: '11px', color: '#7E90AB', marginTop: '2px' }}>
                Pre-authorized emails. Membership is provisioned on first sign-in.
              </div>
            </div>
          </div>
          <span style={{ ...MONO, ...TAG, background: 'rgba(12,107,90,0.18)', color: 'var(--accent-bright, #15917A)' }}>
            {allowlist.length} entries
          </span>
        </div>

        {/* Add form */}
        <form action={addAllowlistEntry} style={{ ...ROW, gap: '8px' }}>
          <input
            name="email" type="email" required
            placeholder="email@example.com"
            style={{ ...INPUT, flex: 1, ...MONO }}
          />
          <select name="org_code" defaultValue={defaultOrgCode} style={INPUT} required>
            {orgs.map(o => (
              <option key={o.id} value={o.org_code}>{o.org_code} · {o.name}</option>
            ))}
          </select>
          <select name="role" defaultValue="member" style={INPUT}>
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="viewer">viewer</option>
          </select>
          <button type="submit" style={BTN_PRIMARY}>
            <Plus size={12} /> Add
          </button>
        </form>

        {allowlist.length === 0 ? (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: '#7E90AB', fontSize: '12.5px' }}>
            Empty. Add an email to authorize sign-in.
          </div>
        ) : (
          allowlist.map(a => (
            <div key={a.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ ...MONO, fontSize: '13px', color: '#fff', fontWeight: 600 }}>{a.email}</span>
                  <span style={{ ...TAG, background: 'rgba(12,107,90,0.15)', color: 'var(--accent-bright, #15917A)' }}>
                    {a.organizations?.org_code ?? '—'}
                  </span>
                  <span style={{ ...TAG, background: 'rgba(255,255,255,0.05)', color: '#9FB0C8' }}>
                    {a.role}
                  </span>
                </div>
                <div style={{ ...MONO, fontSize: '10.5px', color: '#7E90AB', marginTop: '4px' }}>
                  Added {new Date(a.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {a.added_by && ` · by ${a.added_by}`}
                  {a.notes && ` · ${a.notes}`}
                </div>
              </div>
              <form action={removeAllowlistEntry.bind(null, a.id)}>
                <button type="submit" style={BTN_GHOST} aria-label={`Remove ${a.email}`}>
                  <Trash2 size={12} /> Remove
                </button>
              </form>
            </div>
          ))
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={CARD}>
          <div style={CARD_HEAD}>
            <div style={{ ...MONO, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9FB0C8', fontWeight: 600 }}>
              Recently reviewed
            </div>
            <span style={{ ...MONO, fontSize: '10.5px', color: '#7E90AB' }}>last 20</span>
          </div>
          {history.map(r => (
            <div key={r.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...MONO, fontSize: '13px', color: '#fff' }}>{r.email}</div>
                <div style={{ ...MONO, fontSize: '10.5px', color: '#7E90AB', marginTop: '4px' }}>
                  {r.status} {r.reviewed_at && `· ${new Date(r.reviewed_at).toLocaleDateString()}`}
                  {r.reviewed_by && ` · by ${r.reviewed_by}`}
                </div>
              </div>
              <span style={{
                ...TAG,
                background: r.status === 'approved' ? 'rgba(47,158,110,0.15)' : 'rgba(194,78,62,0.15)',
                color: r.status === 'approved' ? 'var(--success, #2F9E6E)' : 'var(--critical, #C24E3E)',
              }}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
