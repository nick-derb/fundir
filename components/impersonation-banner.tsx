'use client';

import { useState } from 'react';

/**
 * Persistent, unmissable banner shown on every page while a real admin is
 * viewing the app as someone else. "Exit" clears the impersonation and returns
 * to the admin's own view.
 */
export function ImpersonationBanner({ name, email }: { name: string; email: string }) {
  const [exiting, setExiting] = useState(false);

  async function exit() {
    setExiting(true);
    try {
      await fetch('/api/impersonate', { method: 'DELETE' });
    } catch { /* fall through to reload regardless */ }
    window.location.assign('/admin/people');
  }

  return (
    <div
      role="status"
      style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: '8px 16px', flexWrap: 'wrap',
        background: '#7A2E12', color: '#FDEDE4',
        fontSize: 13, lineHeight: 1.3,
        borderBottom: '1px solid rgba(255,255,255,.18)',
        boxShadow: '0 1px 0 rgba(0,0,0,.15)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFB59A', flex: 'none' }}
        />
        <span style={{ minWidth: 0 }}>
          Viewing as <strong style={{ fontWeight: 600 }}>{name}</strong>
          {email ? <span style={{ opacity: 0.8 }}> · {email}</span> : null}
          <span style={{ opacity: 0.75 }}> · read-only</span>
        </span>
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        style={{
          fontFamily: 'inherit', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
          fontWeight: 600, padding: '5px 13px', borderRadius: 999,
          border: '1px solid rgba(253,237,228,.55)', background: 'transparent', color: '#FDEDE4',
          cursor: exiting ? 'default' : 'pointer', opacity: exiting ? 0.7 : 1, whiteSpace: 'nowrap',
        }}
      >
        {exiting ? 'Exiting…' : 'Exit view'}
      </button>
    </div>
  );
}
