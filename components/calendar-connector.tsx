'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';

// The org-wide Microsoft 365 connection (Data Hub, documents) is one thing;
// each person's calendar is another. This is the per-person half: it lives in
// user_integrations, so Elle's connection shows Elle's week and nobody else's.
// Before this card the only way in was the onboarding wizard, which is easy to
// finish without ever coming back to.

interface Props {
  status: {
    microsoft: { connected: boolean; email?: string | null };
    google:    { connected: boolean; email?: string | null };
  };
}

function MicrosoftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1"  width="10" height="10" fill="#7FBA00"/>
      <rect x="1"  y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const ROWS = [
  { key: 'microsoft' as const, label: 'Outlook calendar', desc: 'Microsoft 365 · read-only · your own events on the Calendar and Dashboard', Icon: MicrosoftIcon },
  { key: 'google'    as const, label: 'Google Calendar',  desc: 'Google Workspace · read-only',                                                Icon: GoogleIcon },
];

export function CalendarConnector({ status }: Props) {
  const [busy, setBusy] = useState<'microsoft' | 'google' | null>(null);
  const connect = (provider: 'microsoft' | 'google') => {
    setBusy(provider);
    window.location.assign(`/api/auth/${provider}?mode=user&return=${encodeURIComponent("/settings")}`);
  };
  return (
    <ul className="divide-y divide-hairline">
      {ROWS.map(({ key, label, desc, Icon }) => {
        const st = status[key];
        return (
          <li key={key} className="px-5 py-3.5 flex items-center gap-3 flex-wrap">
            <span className="w-7 h-7 rounded-md flex items-center justify-center flex-none bg-elevated border border-hairline"><Icon /></span>
            <span className="min-w-0 flex-1">
              <b className="block text-[13px] font-medium text-primary">{label}</b>
              <span className="block text-[11.5px] text-tertiary truncate">{st.connected && st.email ? `Connected as ${st.email}` : desc}</span>
            </span>
            {st.connected ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[.12em] text-accent">
                <CheckCircle className="w-3.5 h-3.5" /> Connected
              </span>
            ) : (
              <button type="button" onClick={() => connect(key)} disabled={busy !== null}
                className="inline-flex items-center gap-2 h-8 px-3.5 rounded-md bg-accent text-white text-[12.5px] font-medium disabled:opacity-60">
                {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Connect
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
