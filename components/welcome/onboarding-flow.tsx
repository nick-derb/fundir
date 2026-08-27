'use client';

// First-run onboarding (/welcome) — native React rebuild of the Claude Design
// "Onboarding flow" template, wired to the real /api/profile store and the
// existing Microsoft-connect route. Post-auth: the user is already signed in,
// so step 1 confirms their name rather than creating an account.

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window { FundirField?: { init: (c: HTMLCanvasElement) => void } }
}

const STEPS = ['account', 'profile', 'role', 'calendar', 'focus', 'done'] as const;
type Step = typeof STEPS[number];

const ROLES = [
  'Director of Development', 'Grant Writer', 'Development Associate',
  'Executive Director', 'Program Director', 'Finance',
];

const FOCUS = [
  { id: 'prospect',  label: 'Finding funders worth pursuing',      note: 'Ranked matches screened against CYC filings' },
  { id: 'cultivate', label: 'Keeping the cultivation list warm',   note: 'Invitation-only funders and board paths' },
  { id: 'write',     label: 'Writing and submitting applications', note: 'Requirements read against what CYC can show' },
  { id: 'report',    label: 'Grant reporting and deadlines',       note: 'Interim reports, metrics, delivery dates' },
  { id: 'know',      label: 'Finding what we already documented',  note: 'Past narratives, outcomes, board records' },
];

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const MONO = "'JetBrains Mono',ui-monospace,monospace";
const SANS = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
const INK = '#101917', SAGE = '#659A80', ACCENT = '#0C6B5A', FAINT = '#9AA7A1', RULE = '#DFE5E2';

const lbl: React.CSSProperties = {
  display: 'block', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.13em',
  textTransform: 'uppercase', color: '#9AA7A1', marginBottom: 7,
};
const input: React.CSSProperties = {
  width: '100%', padding: '12px 13px', fontSize: 14, background: '#fff',
  border: `1px solid ${RULE}`, borderRadius: 5, transition: 'border-color .15s,box-shadow .15s',
  fontFamily: SANS, color: INK, boxSizing: 'border-box',
};
const h1: React.CSSProperties = {
  fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(2rem,3.4vw,2.7rem)',
  lineHeight: 1.06, letterSpacing: '-.02em', margin: '0 0 12px',
};
const sub: React.CSSProperties = { margin: '0 0 28px', fontSize: 14.5, lineHeight: 1.65, color: '#5E6D67' };

interface InitialProfile {
  first?: string; last?: string; display?: string; role?: string;
  avatar?: string; focus?: string[];
}

export function OnboardingFlow({
  email, calendarConnected, initialProfile, initialStep,
}: {
  email: string;
  calendarConnected: boolean;
  initialProfile: InitialProfile | null;
  initialStep: number;
}) {
  const p = initialProfile ?? {};
  const [i, setI] = useState(Math.min(Math.max(0, initialStep), STEPS.length - 1));
  const [first, setFirst] = useState(p.first ?? '');
  const [last, setLast] = useState(p.last ?? '');
  const [display, setDisplay] = useState(p.display ?? '');
  const [role, setRole] = useState(p.role ?? '');
  const [photo, setPhoto] = useState(p.avatar ?? '');
  const [focus, setFocus] = useState<string[]>(p.focus ?? ['prospect']);
  const [saving, setSaving] = useState(false);
  const fieldRef = useRef<HTMLCanvasElement>(null);

  const step: Step = STEPS[i];

  // Google fonts + glyph-field aside (loaded once).
  useEffect(() => {
    if (!document.getElementById('welcome-fonts')) {
      const l = document.createElement('link');
      l.id = 'welcome-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(l);
    }
    const initField = () => { if (fieldRef.current && window.FundirField) window.FundirField.init(fieldRef.current); };
    if (window.FundirField) { initField(); return; }
    const s = document.createElement('script');
    s.src = '/welcome/field.js'; s.onload = initField;
    document.body.appendChild(s);
  }, []);

  const profileBody = (onboarded: boolean) => ({
    first, last, display: display || `${first} ${last}`.trim(), role, avatar: photo, focus, onboarded,
  });

  async function savePartial() {
    try {
      await fetch('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileBody(false)),
      });
    } catch { /* best effort */ }
  }

  function next() {
    setI(prev => {
      if (prev >= STEPS.length - 1) return prev;
      if (STEPS[prev] === 'account' && !display) setDisplay(`${first} ${last}`.trim());
      return prev + 1;
    });
  }
  const back = () => setI(prev => Math.max(0, prev - 1));

  async function connectProvider(provider: 'microsoft' | 'google') {
    await savePartial();
    const ret = encodeURIComponent('/welcome?step=calendar');
    window.location.href = `/api/auth/${provider}?mode=user&return=${ret}`;
  }

  async function finish() {
    setSaving(true);
    // Save the completed profile, but never let a slow/failed save trap the
    // user on this step: time the request out, then navigate regardless.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      await fetch('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileBody(true)), signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch { /* proceed regardless — profile is best-effort */ }
    // Hard navigation: leave /welcome immediately so the browser shows the
    // dashboard loading normally, instead of client-nav keeping this page (and
    // its "Finishing…" button) visible while the data-heavy dashboard renders.
    window.location.assign('/dashboard');
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Resize to <=256px so the stored data URL stays small.
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
        setPhoto(cv.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  }

  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'CY';
  const canBack = i > 0 && step !== 'done';
  const canSkip = step === 'profile' || step === 'calendar' || step === 'focus';
  const cta = step === 'done' ? 'Go to dashboard'
    : step === 'calendar' && !calendarConnected ? 'Continue without calendar'
    : 'Continue';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr .82fr', minHeight: '100vh', fontFamily: SANS, background: '#F7F8F7', color: INK, WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Left: steps ── */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '26px 56px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'auto' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/assets/fundir-mark.png" alt="Fundir" style={{ height: 24, width: 'auto', display: 'block' }} />
          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '.22em', textTransform: 'uppercase' }}>Fundir</span>
        </div>

        <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', padding: '40px 0' }}>
          {/* progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 34 }}>
            <div style={{ flex: 1, height: 2, background: '#E2E6E4', borderRadius: 2, overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', width: `${((i + 1) / STEPS.length) * 100}%`, background: ACCENT, borderRadius: 2, transition: 'width .45s cubic-bezier(.2,.8,.3,1)' }} />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT, whiteSpace: 'nowrap' }}>Step {i + 1} of {STEPS.length}</span>
          </div>

          {/* ── account ── */}
          {step === 'account' && (
            <div>
              <h1 style={h1}>Welcome to Fundir</h1>
              <p style={sub}>Fundir works best when it knows who is asking. Your organization&apos;s data stays shared.</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${RULE}`, borderRadius: 999, padding: '7px 13px', marginBottom: 22, fontSize: 12.5, color: '#5E6D67' }}>
                <i style={{ width: 5, height: 5, borderRadius: '50%', background: SAGE }} />
                Signed in as <b style={{ fontWeight: 500, color: INK }}>{email}</b>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <label style={{ display: 'block' }}><span style={lbl}>First name</span>
                  <input value={first} onChange={e => setFirst(e.target.value)} autoComplete="given-name" style={input} /></label>
                <label style={{ display: 'block' }}><span style={lbl}>Last name</span>
                  <input value={last} onChange={e => setLast(e.target.value)} autoComplete="family-name" style={input} /></label>
              </div>
            </div>
          )}

          {/* ── profile ── */}
          {step === 'profile' && (
            <div>
              <h1 style={h1}>Add a photo</h1>
              <p style={sub}>Your colleagues will see this next to comments and anything you edit.</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
                <label style={{ position: 'relative', width: 88, height: 88, flex: 'none', borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', background: '#EDF0EE', border: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <span style={{ fontFamily: SERIF, fontSize: 30, color: FAINT }}>{initials}</span>}
                  <input type="file" accept="image/*" onChange={onPhoto} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </label>
                <div>
                  <p style={{ margin: '0 0 9px', fontSize: 13.5, lineHeight: 1.55, color: '#5E6D67' }}>Square images work best. JPG or PNG, under 5 MB.</p>
                  <button type="button" onClick={() => setPhoto('')} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', padding: '9px 15px', borderRadius: 999, border: '1px solid transparent', background: 'none', color: FAINT, cursor: 'pointer' }}>Remove</button>
                </div>
              </div>
              <label style={{ display: 'block' }}><span style={lbl}>Display name</span>
                <input value={display} onChange={e => setDisplay(e.target.value)} placeholder="How your name appears in Fundir" style={input} /></label>
            </div>
          )}

          {/* ── role ── */}
          {step === 'role' && (
            <div>
              <h1 style={h1}>What do you do at CYC?</h1>
              <p style={sub}>Used on your profile and to route mentions. It does not restrict what you can see.</p>
              <label style={{ display: 'block', marginBottom: 16 }}><span style={lbl}>Job title</span>
                <input value={role} onChange={e => setRole(e.target.value)} placeholder="Director of Development" style={input} /></label>
              <p style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT, margin: '0 0 11px' }}>Common at CYC</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ROLES.map(r => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    style={{ fontSize: 12.5, padding: '8px 13px', borderRadius: 999, border: `1px solid ${role === r ? ACCENT : RULE}`, background: '#fff', cursor: 'pointer', color: role === r ? ACCENT : '#5E6D67' }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── calendar ── */}
          {step === 'calendar' && (
            <div>
              <h1 style={h1}>Connect your calendar</h1>
              <p style={sub}>Fundir puts your week next to your deadlines. Connect the calendar you use for work — it stays connected.</p>
              {calendarConnected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 16px', border: `1px solid ${RULE}`, borderRadius: 7, background: '#fff', marginBottom: 16 }}>
                  <i style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT, flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>Calendar connected</b>
                    <span style={{ fontSize: 11.5, color: '#8B968F' }}>Your schedule will appear on the dashboard.</span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: ACCENT }}><i style={{ width: 4, height: 4, borderRadius: '50%', background: SAGE }} />Connected</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  <button type="button" onClick={() => connectProvider('microsoft')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px', borderRadius: 8, border: `1px solid ${RULE}`, background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: INK }}>
                    <MsSquares /> Connect Microsoft
                  </button>
                  <button type="button" onClick={() => connectProvider('google')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px', borderRadius: 8, border: `1px solid ${RULE}`, background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: INK }}>
                    <GoogleG /> Connect Google
                  </button>
                </div>
              )}
              <p style={{ margin: '0 0 26px', fontSize: 12, lineHeight: 1.6, color: '#8B968F' }}>Fundir reads events to show your schedule. It never writes to your calendar without asking, and mail is only ever opened in Outlook.</p>
            </div>
          )}

          {/* ── focus ── */}
          {step === 'focus' && (
            <div>
              <h1 style={h1}>What should Fundir help with?</h1>
              <p style={sub}>Pick as many as apply. This orders what you see first, and you can change it later.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {FOCUS.map(f => {
                  const sel = focus.includes(f.id);
                  return (
                    <button key={f.id} type="button" aria-pressed={sel}
                      onClick={() => setFocus(fs => fs.includes(f.id) ? fs.filter(x => x !== f.id) : [...fs, f.id])}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', padding: '13px 15px', borderRadius: 7, border: `1px solid ${sel ? ACCENT : RULE}`, background: sel ? '#F4F9F6' : '#fff', cursor: 'pointer', transition: 'border-color .18s,background .18s' }}>
                      <i style={{ width: 15, height: 15, flex: 'none', marginTop: 1, borderRadius: 4, border: `1px solid ${sel ? ACCENT : RULE}`, background: sel ? ACCENT : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9 }}>{sel ? '✓' : ''}</i>
                      <span style={{ minWidth: 0 }}>
                        <b style={{ display: 'block', fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>{f.label}</b>
                        <span style={{ fontSize: 12, lineHeight: 1.55, color: '#8B968F' }}>{f.note}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── done ── */}
          {step === 'done' && (
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(12,107,90,.28)', borderRadius: 999, padding: '6px 12px', marginBottom: 22 }}>
                <i style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT }} />
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: ACCENT }}>Account ready</span>
              </div>
              <h1 style={h1}>You are set up, {first || 'there'}.</h1>
              <p style={{ ...sub, marginBottom: 26 }}>Your workspace is Chicago Youth Centers. Everything the team has loaded is already there.</p>
              <div style={{ border: `1px solid ${RULE}`, borderRadius: 7, background: '#fff', padding: '4px 16px', marginBottom: 26 }}>
                {[
                  ['Profile', display || `${first} ${last}`.trim() || 'Not set'],
                  ['Role', role || 'Not set'],
                  ['Calendar', calendarConnected ? 'Connected' : 'Not connected'],
                ].map(([k, v], idx) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: idx < 2 ? '1px solid #F1F4F2' : 'none' }}>
                    <span style={{ fontSize: 13, color: '#5E6D67' }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {canBack && <button type="button" onClick={back} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', color: FAINT }}>← Back</button>}
            <span style={{ flex: 1 }} />
            {canSkip && <button type="button" onClick={next} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', color: FAINT }}>Skip</button>}
            <button type="button" onClick={step === 'done' ? finish : next} disabled={saving}
              style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.13em', textTransform: 'uppercase', padding: '14px 26px', borderRadius: 999, border: 'none', background: INK, color: '#F7F8F7', cursor: saving ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Finishing…' : cta}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 'auto' }} />
      </div>

      {/* ── Right: glyph-field aside ── */}
      <div style={{ position: 'relative', borderLeft: `1px solid #E2E6E4`, background: 'linear-gradient(180deg,#F7F8F7,#EFF3F1 60%,#F4F6F5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <canvas ref={fieldRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function MsSquares() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="0.6" y="0.6" width="5.9" height="5.9" fill="#F25022" />
      <rect x="7.5" y="0.6" width="5.9" height="5.9" fill="#7FBA00" />
      <rect x="0.6" y="7.5" width="5.9" height="5.9" fill="#00A4EF" />
      <rect x="7.5" y="7.5" width="5.9" height="5.9" fill="#FFB900" />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
