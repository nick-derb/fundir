'use client';

import { useState } from 'react';

const btn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
  padding: '9px 15px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)',
  color: '#e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap',
};

export function TrainingActions() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: 'snapshot' | 'export') {
    setBusy(action); setMsg(null);
    try {
      const res = await fetch('/api/admin/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg('Error: ' + (data.error ?? res.status)); setBusy(null); return; }

      if (action === 'snapshot') {
        setMsg(
          data.skipped
            ? (data.reason === 'not_connected'
                ? 'Data Hub not connected — nothing to snapshot.'
                : `No change since the last snapshot (${data.rowCount} rows).`)
            : `Snapshot saved — ${data.rowCount} rows.`,
        );
      } else {
        setMsg(`Rebuilt training examples — ${data.written} written (${data.awarded} awarded / ${data.rejected} rejected).`);
      }
      setBusy(null);
      setTimeout(() => window.location.reload(), 1100);
    } catch {
      setMsg('Request failed.'); setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={() => run('snapshot')}>
          {busy === 'snapshot' ? 'Snapshotting…' : 'Snapshot Data Hub'}
        </button>
        <button type="button" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={() => run('export')}>
          {busy === 'export' ? 'Rebuilding…' : 'Rebuild training examples'}
        </button>
      </div>
      {msg && <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>{msg}</p>}
    </div>
  );
}
