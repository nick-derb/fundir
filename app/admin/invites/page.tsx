'use client';

import { useState, useEffect } from 'react';
import {
  Key, Plus, Copy, Link2, Power, Trash2, Loader2,
  CheckCircle, AlertCircle, RefreshCw, Clock, Building2,
} from 'lucide-react';

interface InviteCode {
  id: string;
  code: string;
  label: string | null;
  org_hint: string | null;
  max_uses: number;
  uses_count: number;
  active: boolean;
  created_at: string;
  expires_at: string | null;
}

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
};

function StatusBadge({ code }: { code: InviteCode }) {
  const pct = code.max_uses > 0 ? (code.uses_count / code.max_uses) * 100 : 0;
  const expired = code.expires_at ? new Date(code.expires_at) < new Date() : false;

  if (!code.active || expired) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: '999px', fontSize: '10px', fontWeight: 600, color: '#64748b' }}>
        {expired ? 'Expired' : 'Inactive'}
      </span>
    );
  }
  if (pct >= 100) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '999px', fontSize: '10px', fontWeight: 600, color: '#f87171' }}>
        Exhausted
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '999px', fontSize: '10px', fontWeight: 600, color: '#22c55e' }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
      Active
    </span>
  );
}

function ActionBtn({ onClick, title, color, children }: {
  onClick: () => void; title: string; color?: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '6px', cursor: 'pointer', color: color ?? '#64748b',
      transition: 'background 0.1s', flexShrink: 0,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
    >
      {children}
    </button>
  );
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px',
};

const inputSt: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '7px', fontSize: '13px', color: '#e2e8f0', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

export default function AdminInvitesPage() {
  const [codes, setCodes]   = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [toast, setToast]   = useState('');

  const [newCode, setNewCode]       = useState('');
  const [newLabel, setNewLabel]     = useState('');
  const [newOrgHint, setNewOrgHint] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('10');
  const [newExpiry, setNewExpiry]   = useState('');
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => { fetchCodes(); }, []);

  async function fetchCodes() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/invites');
      if (!res.ok) throw new Error();
      setCodes(await res.json());
    } catch { setError('Could not load invite codes.'); }
    finally { setLoading(false); }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  function generateRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    setNewCode(Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newCode.trim()) { setCreateError('Code is required.'); return; }
    setCreating(true); setCreateError('');

    const res = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code:      newCode.trim().toUpperCase(),
        label:     newLabel.trim() || null,
        org_hint:  newOrgHint.trim() || null,
        max_uses:  parseInt(newMaxUses) || 10,
        expires_at: newExpiry || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setCreateError(data.error ?? 'Failed to create.'); setCreating(false); return; }
    setCodes(prev => [data, ...prev]);
    setNewCode(''); setNewLabel(''); setNewOrgHint(''); setNewMaxUses('10'); setNewExpiry('');
    setCreating(false);
    showToast('Invite code created.');
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch('/api/admin/invites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !current }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCodes(prev => prev.map(c => c.id === id ? updated : c));
      showToast(updated.active ? 'Code activated.' : 'Code deactivated.');
    }
  }

  async function deleteCode(id: string, code: string) {
    if (!confirm(`Delete invite code "${code}"? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/invites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { setCodes(prev => prev.filter(c => c.id !== id)); showToast('Code deleted.'); }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    showToast(`Copied code "${code}"`);
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/onboarding?code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    showToast(`Invite link copied — share with ${code}`);
  }

  function formatExpiry(ts: string | null) {
    if (!ts) return null;
    const d = new Date(ts);
    const expired = d < new Date();
    const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return { formatted, expired };
  }

  return (
    <div style={{ padding: '36px 40px', maxWidth: '960px' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px',
          background: '#0d1929', border: '1px solid rgba(13,148,136,0.3)',
          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          fontSize: '13px', color: '#e2e8f0',
        }}>
          <CheckCircle size={14} color="#0d9488" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Admin Console
        </p>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
          Invite Codes
        </h1>
        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
          Create codes for new organizations. Share the invite link — they land directly in the onboarding flow.
        </p>
      </div>

      {/* How it works */}
      <div style={{ ...CARD, padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '24px' }}>
        {[
          { icon: '1', text: 'Create a code below (e.g. YMCA2025)' },
          { icon: '2', text: 'Click "Copy link" — sends them straight to onboarding, code pre-filled' },
          { icon: '3', text: 'They register, pick their org from the IRS database, and get their own dashboard' },
        ].map(({ icon, text }) => (
          <div key={icon} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(13,148,136,0.15)', border: '1px solid rgba(13,148,136,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#0d9488', flexShrink: 0, marginTop: '1px' }}>
              {icon}
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>{text}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      <div style={{ ...CARD, padding: '24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={15} color="#0d9488" />
          New Invite Code
        </h2>

        <form onSubmit={handleCreate}>
          {/* Row 1: Code + Label + Max uses */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr auto', gap: '12px', marginBottom: '12px', alignItems: 'end' }}>
            <div>
              <label style={labelSt}>Code</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="YMCA2025"
                  style={{ ...inputSt, flex: 1, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em' }}
                />
                <button type="button" onClick={generateRandom} title="Generate random" style={{
                  padding: '0 10px', borderRadius: '7px', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', color: '#64748b', cursor: 'pointer', flexShrink: 0,
                }}>
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            <div>
              <label style={labelSt}>Internal label</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Q2 Pilot" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Max uses</label>
              <input value={newMaxUses} onChange={e => setNewMaxUses(e.target.value)} type="number" min="1" max="1000" style={{ ...inputSt, width: '80px' }} />
            </div>
          </div>

          {/* Row 2: Org hint + Expiry */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelSt}>
                <Building2 size={9} style={{ display: 'inline', marginRight: '4px' }} />
                Org hint (optional)
              </label>
              <input
                value={newOrgHint}
                onChange={e => setNewOrgHint(e.target.value)}
                placeholder="e.g. YMCA of Metro Chicago"
                style={inputSt}
              />
              <p style={{ fontSize: '10px', color: '#334155', marginTop: '4px' }}>
                Shown in the admin table so you remember which code is for which org.
              </p>
            </div>
            <div>
              <label style={labelSt}>
                <Clock size={9} style={{ display: 'inline', marginRight: '4px' }} />
                Expiry date (optional)
              </label>
              <input
                value={newExpiry}
                onChange={e => setNewExpiry(e.target.value)}
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                style={{ ...inputSt, colorScheme: 'dark' }}
              />
              <p style={{ fontSize: '10px', color: '#334155', marginTop: '4px' }}>
                Code stops working after midnight on this date.
              </p>
            </div>
          </div>

          {createError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', marginBottom: '12px', fontSize: '13px', color: '#f87171' }}>
              <AlertCircle size={13} />{createError}
            </div>
          )}

          <button type="submit" disabled={creating} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 20px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            border: 'none', borderRadius: '8px', color: 'white',
            fontSize: '13px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer',
            opacity: creating ? 0.7 : 1, boxShadow: '0 2px 8px rgba(13,148,136,0.3)',
          }}>
            {creating
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Creating…</>
              : <><Plus size={13} />Create Code</>}
          </button>
        </form>
      </div>

      {/* Code list */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={14} color="#0d9488" />
            All Codes ({codes.length})
          </h2>
          <button onClick={fetchCodes} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
            <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
        </div>

        {error && <div style={{ padding: '16px 20px', color: '#f87171', fontSize: '13px' }}>{error}</div>}

        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Loader2 size={20} color="#475569" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : codes.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
            No invite codes yet. Create one above.
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px 90px 80px 110px', gap: '12px', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
              {['Code', 'Org / Label', 'Uses', 'Status', 'Expires', 'Actions'].map(h => (
                <span key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#334155', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            {codes.map(code => {
              const pct = code.max_uses > 0 ? (code.uses_count / code.max_uses) * 100 : 0;
              const expiry = formatExpiry(code.expires_at);

              return (
                <div key={code.id} style={{
                  display: 'grid', gridTemplateColumns: '160px 1fr 140px 90px 80px 110px',
                  gap: '12px', padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.04)',
                  alignItems: 'center', transition: 'background 0.1s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Code */}
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.05em' }}>
                    {code.code}
                  </span>

                  {/* Org hint + label */}
                  <div>
                    {code.org_hint && (
                      <p style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600, margin: '0 0 2px' }}>
                        {code.org_hint}
                      </p>
                    )}
                    <p style={{ fontSize: '11px', color: '#64748b', margin: 0, fontStyle: !code.org_hint && !code.label ? 'italic' : 'normal' }}>
                      {code.label ?? (!code.org_hint ? 'No label' : '')}
                    </p>
                  </div>

                  {/* Uses progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>{code.uses_count}</span>
                      <span style={{ fontSize: '11px', color: '#334155' }}>/ {code.max_uses}</span>
                    </div>
                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: '999px', transition: 'width 0.3s',
                        background: pct >= 100 ? '#f87171' : pct >= 75 ? '#fbbf24' : '#0d9488',
                      }} />
                    </div>
                  </div>

                  {/* Status */}
                  <div><StatusBadge code={code} /></div>

                  {/* Expiry */}
                  <div>
                    {expiry ? (
                      <span style={{ fontSize: '11px', color: expiry.expired ? '#f87171' : '#64748b', fontWeight: expiry.expired ? 600 : 400 }}>
                        {expiry.formatted}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#334155' }}>Never</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ActionBtn onClick={() => copyCode(code.code)} title="Copy code">
                      <Copy size={12} />
                    </ActionBtn>
                    <ActionBtn onClick={() => copyLink(code.code)} title="Copy invite link" color="#0d9488">
                      <Link2 size={12} />
                    </ActionBtn>
                    <ActionBtn onClick={() => toggleActive(code.id, code.active)} title={code.active ? 'Deactivate' : 'Activate'} color={code.active ? '#f59e0b' : '#22c55e'}>
                      <Power size={12} />
                    </ActionBtn>
                    <ActionBtn onClick={() => deleteCode(code.id, code.code)} title="Delete" color="#f87171">
                      <Trash2 size={12} />
                    </ActionBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
