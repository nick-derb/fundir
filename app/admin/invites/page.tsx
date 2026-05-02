'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Copy, Power, Trash2, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface InviteCode {
  id: string;
  code: string;
  label: string | null;
  max_uses: number;
  uses_count: number;
  active: boolean;
  created_at: string;
}

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
};

function Badge({ active, pct }: { active: boolean; pct: number }) {
  if (!active) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: '999px', fontSize: '10px', fontWeight: 600, color: '#64748b' }}>
      Inactive
    </span>
  );
  if (pct >= 100) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '999px', fontSize: '10px', fontWeight: 600, color: '#f87171' }}>
      Exhausted
    </span>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '999px', fontSize: '10px', fontWeight: 600, color: '#22c55e' }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
      Active
    </span>
  );
}

export default function AdminInvitesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Create form state
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('10');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function fetchCodes() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/invites');
      if (!res.ok) throw new Error('Failed to load');
      setCodes(await res.json());
    } catch {
      setError('Could not load invite codes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCodes(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) { setCreateError('Code is required.'); return; }
    setCreating(true);
    setCreateError('');
    const res = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: newCode.trim().toUpperCase(), label: newLabel.trim() || null, max_uses: parseInt(newMaxUses) || 10 }),
    });
    const data = await res.json();
    if (!res.ok) { setCreateError(data.error ?? 'Failed to create.'); setCreating(false); return; }
    setCodes(prev => [data, ...prev]);
    setNewCode('');
    setNewLabel('');
    setNewMaxUses('10');
    setCreating(false);
    showToast('Invite code created.');
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch('/api/admin/invites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setCodes(prev => prev.filter(c => c.id !== id));
      showToast('Code deleted.');
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    showToast(`Copied "${code}" to clipboard.`);
  }

  function generateRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setNewCode(code);
  }

  return (
    <div style={{ padding: '36px 40px', maxWidth: '900px' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 18px',
          background: '#0d1929',
          border: '1px solid rgba(13,148,136,0.3)',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          fontSize: '13px', color: '#e2e8f0',
          animation: 'fadeIn 0.2s ease',
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
          Generate and manage access codes for new organizations.
        </p>
      </div>

      {/* Create new code */}
      <div style={{ ...CARD, padding: '24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={15} color="#0d9488" />
          Create New Invite Code
        </h2>

        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end', marginBottom: '12px' }}>
            <div>
              <label style={labelSt}>Code</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="FUNDIR2025"
                  style={{ ...inputSt, flex: 1, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em' }}
                />
                <button
                  type="button"
                  onClick={generateRandom}
                  title="Generate random code"
                  style={{
                    padding: '0 10px', borderRadius: '7px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            <div>
              <label style={labelSt}>Label (optional)</label>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Pilot Program"
                style={inputSt}
              />
            </div>
            <div>
              <label style={labelSt}>Max Uses</label>
              <input
                value={newMaxUses}
                onChange={e => setNewMaxUses(e.target.value)}
                type="number"
                min="1"
                max="1000"
                style={{ ...inputSt, width: '80px' }}
              />
            </div>
          </div>

          {createError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', marginBottom: '12px', fontSize: '13px', color: '#f87171' }}>
              <AlertCircle size={13} />
              {createError}
            </div>
          )}

          <button
            type="submit"
            disabled={creating}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 18px',
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              border: 'none', borderRadius: '8px',
              color: 'white', fontSize: '13px', fontWeight: 600,
              cursor: creating ? 'not-allowed' : 'pointer',
              opacity: creating ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(13,148,136,0.3)',
            }}
          >
            {creating ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Creating…</> : <><Plus size={13} />Create Code</>}
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
          <button
            onClick={fetchCodes}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
          >
            <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
        </div>

        {error && (
          <div style={{ padding: '16px 20px', color: '#f87171', fontSize: '13px' }}>{error}</div>
        )}

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
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr 100px 120px 90px 100px',
              gap: '12px',
              padding: '10px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(0,0,0,0.15)',
            }}>
              {['Code', 'Label', 'Uses', 'Status', 'Created', 'Actions'].map(h => (
                <span key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#334155', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {h}
                </span>
              ))}
            </div>
            {codes.map(code => {
              const pct = code.max_uses > 0 ? (code.uses_count / code.max_uses) * 100 : 0;
              return (
                <div key={code.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr 100px 120px 90px 100px',
                  gap: '12px',
                  padding: '14px 20px',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Code */}
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.05em' }}>
                    {code.code}
                  </span>

                  {/* Label */}
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {code.label ?? <span style={{ color: '#334155', fontStyle: 'italic' }}>No label</span>}
                  </span>

                  {/* Uses progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>{code.uses_count}</span>
                      <span style={{ fontSize: '11px', color: '#334155' }}>/ {code.max_uses}</span>
                    </div>
                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(pct, 100)}%`,
                        background: pct >= 100 ? '#f87171' : pct >= 75 ? '#fbbf24' : '#0d9488',
                        borderRadius: '999px',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>

                  {/* Status badge */}
                  <div><Badge active={code.active} pct={pct} /></div>

                  {/* Created */}
                  <span style={{ fontSize: '11px', color: '#475569' }}>
                    {new Date(code.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <ActionButton onClick={() => copyCode(code.code)} title="Copy code">
                      <Copy size={12} />
                    </ActionButton>
                    <ActionButton
                      onClick={() => toggleActive(code.id, code.active)}
                      title={code.active ? 'Deactivate' : 'Activate'}
                      color={code.active ? '#f59e0b' : '#22c55e'}
                    >
                      <Power size={12} />
                    </ActionButton>
                    <ActionButton
                      onClick={() => deleteCode(code.id, code.code)}
                      title="Delete"
                      color="#f87171"
                    >
                      <Trash2 size={12} />
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function ActionButton({ onClick, title, color, children }: {
  onClick: () => void; title: string; color?: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '26px', height: '26px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        cursor: 'pointer',
        color: color ?? '#64748b',
        transition: 'background 0.1s, color 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
        if (color) (e.currentTarget as HTMLElement).style.color = color;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
        (e.currentTarget as HTMLElement).style.color = color ?? '#64748b';
      }}
    >
      {children}
    </button>
  );
}

const labelSt: React.CSSProperties = {
  display: 'block',
  fontSize: '11px', fontWeight: 600,
  color: '#475569',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const inputSt: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '7px',
  fontSize: '13px',
  color: '#e2e8f0',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
