'use client';

import { useState } from 'react';

/** Starts a "view as" session for one person, then lands on their dashboard. */
export function ViewAsButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch('/api/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        setBusy(false);
        alert('Could not start view-as: ' + ((await res.json().catch(() => ({}))).error ?? res.status));
        return;
      }
      window.location.assign('/dashboard');
    } catch {
      setBusy(false);
      alert('Could not start view-as.');
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
        padding: '5px 11px', borderRadius: 7,
        border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)',
        color: busy ? '#64748b' : '#cbd5e1', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {busy ? 'Opening…' : 'View as'}
    </button>
  );
}
