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
import { Mail, Plus, Trash2, Check, X } from 'lucide-react';
import { AdminHeader, Card, Pill, Empty, MONO } from '@/components/admin/ui';

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

export default async function AdminAccessPage() {
  const { allowlist, pending, history, orgs } = await load();
  const defaultOrgCode = orgs[0]?.org_code ?? '';

  return (
    <div className="adm-page" style={{ maxWidth: 1000 }}>
      <AdminHeader
        title="Access Control"
        summary="Who can join a workspace. Anyone can sign in with Microsoft, Google, or email, but only an allowlisted address is provisioned; everyone else lands here as a pending request. The public Request Access form only emails you, so add those addresses to the allowlist by hand."
      />

      <Card title="Pending requests" subtitle="People who signed in but are not on the allowlist" action={<Pill tone={pending.length ? 'warn' : 'neutral'}>{pending.length} waiting</Pill>}>
        {pending.length === 0 ? (
          <Empty>No pending requests. Sign-ins by unrecognized emails show up here.</Empty>
        ) : (
          pending.map(r => (
            <div key={r.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={12} color="#7E90AB" />
                  <span style={{ ...MONO, fontSize: '13px', color: '#fff', fontWeight: 600 }}>{r.email}</span>
                  {r.provider && <Pill tone="neutral">{r.provider}</Pill>}
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
      </Card>

      <Card title="Allowlist" subtitle="Pre-authorized emails; the workspace membership is created on first sign-in" action={<Pill tone="accent">{allowlist.length} entries</Pill>}>

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
          <Empty>Empty. Add an email to authorize sign-in.</Empty>
        ) : (
          allowlist.map(a => (
            <div key={a.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ ...MONO, fontSize: '13px', color: '#fff', fontWeight: 600 }}>{a.email}</span>
                  <Pill tone="accent">{a.organizations?.org_code ?? '—'}</Pill>
                  <Pill tone="neutral">{a.role}</Pill>
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
      </Card>

      {history.length > 0 && (
        <Card title="Recently reviewed" subtitle="Last 20 decisions">
          {history.map(r => (
            <div key={r.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...MONO, fontSize: '13px', color: '#fff' }}>{r.email}</div>
                <div style={{ ...MONO, fontSize: '10.5px', color: '#7E90AB', marginTop: '4px' }}>
                  {r.status} {r.reviewed_at && `· ${new Date(r.reviewed_at).toLocaleDateString()}`}
                  {r.reviewed_by && ` · by ${r.reviewed_by}`}
                </div>
              </div>
              <Pill tone={r.status === 'approved' ? 'good' : 'bad'}>{r.status}</Pill>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
