'use client';

// Signup rebuilt in the onboarding design language (paper surface, glyph-field
// aside, Instrument Serif) — the account-creation step. Keeps the org-code +
// email/password signup logic and adds Microsoft/Google OAuth (same as login).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase';

declare global {
  interface Window { FundirField?: { init: (c: HTMLCanvasElement) => void } }
}

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const MONO = "'JetBrains Mono',ui-monospace,monospace";
const SANS = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
const INK = '#101917', ACCENT = '#0C6B5A', FAINT = '#9AA7A1', RULE = '#DFE5E2';

const lbl: React.CSSProperties = { display: 'block', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT, marginBottom: 7 };
const input: React.CSSProperties = { width: '100%', padding: '12px 13px', fontSize: 14, background: '#fff', border: `1px solid ${RULE}`, borderRadius: 5, fontFamily: SANS, color: INK, boxSizing: 'border-box', transition: 'border-color .15s,box-shadow .15s' };
const provBtn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, padding: 14, borderRadius: 999, border: `1px solid ${RULE}`, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: SANS, color: INK, transition: 'border-color .15s,background .15s' };

export default function SignupPage() {
  const [orgCode, setOrgCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'microsoft' | 'google' | null>(null);
  const router = useRouter();
  const fieldRef = useRef<HTMLCanvasElement>(null);

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

  async function oauth(p: 'microsoft' | 'google') {
    setBusy(p); setError('');
    const provider = p === 'microsoft' ? 'azure' : 'google';
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback`, ...(provider === 'azure' ? { scopes: 'email profile openid' } : {}) },
    });
    if (error) { setError(error.message); setBusy(null); }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const supabase = getSupabaseClient();

    const { data: org, error: orgError } = await supabase
      .from('organizations').select('id, name').eq('org_code', orgCode.toUpperCase().trim()).single();
    if (orgError || !org) { setError('Invalid organization code. Contact your administrator.'); setLoading(false); return; }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email, password, options: { data: { org_id: org.id, org_name: org.name } },
    });
    if (signupError) { setError(signupError.message); setLoading(false); return; }

    if (signupData.user) {
      await supabase.from('user_organizations').insert({ user_id: signupData.user.id, org_id: org.id, role: 'member' });
      if (signupData.session) { router.push('/welcome'); router.refresh(); return; }
    }
    setSuccess(true); setLoading(false);
  }

  return (
    <div className="su-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,.82fr)', minHeight: '100vh', fontFamily: SANS, background: '#F7F8F7', color: INK, WebkitFontSmoothing: 'antialiased' }}>
      <style>{`@media (max-width:940px){.su-grid{grid-template-columns:1fr!important}.su-aside{display:none!important}.su-left{padding-left:24px!important;padding-right:24px!important}} input:focus{outline:none;border-color:${ACCENT};box-shadow:0 0 0 3px rgba(12,107,90,.09)}`}</style>

      <div className="su-left" style={{ display: 'flex', flexDirection: 'column', padding: '26px 56px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'auto' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/assets/fundir-mark.png" alt="Fundir" style={{ height: 24, width: 'auto', display: 'block' }} />
          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '.22em', textTransform: 'uppercase' }}>Fundir</span>
        </div>

        <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', padding: '40px 0' }}>
          {success ? (
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(12,107,90,.28)', borderRadius: 999, padding: '6px 12px', marginBottom: 22 }}>
                <i style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT }} />
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: ACCENT }}>Check your email</span>
              </div>
              <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(2rem,3.4vw,2.7rem)', lineHeight: 1.06, letterSpacing: '-.02em', margin: '0 0 12px' }}>Confirm your account</h1>
              <p style={{ margin: '0 0 28px', fontSize: 14.5, lineHeight: 1.65, color: '#5E6D67' }}>
                We sent a confirmation link to <b style={{ color: INK, fontWeight: 500 }}>{email}</b>. Open it to finish setting up.
              </p>
              <Link href="/login" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.13em', textTransform: 'uppercase', color: ACCENT, textDecoration: 'none' }}>Return to sign in →</Link>
            </div>
          ) : (
            <div>
              <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(2rem,3.4vw,2.7rem)', lineHeight: 1.06, letterSpacing: '-.02em', margin: '0 0 12px' }}>Create your account</h1>
              <p style={{ margin: '0 0 28px', fontSize: 14.5, lineHeight: 1.65, color: '#5E6D67' }}>Join your team on Fundir. Your organization&rsquo;s data stays shared.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                <button type="button" disabled={!!busy} onClick={() => oauth('microsoft')} style={{ ...provBtn, opacity: busy ? 0.6 : 1 }}>
                  <MsSquares /> {busy === 'microsoft' ? 'Connecting…' : 'Continue with Microsoft'}
                </button>
                <button type="button" disabled={!!busy} onClick={() => oauth('google')} style={{ ...provBtn, opacity: busy ? 0.6 : 1 }}>
                  <GoogleG /> {busy === 'google' ? 'Connecting…' : 'Continue with Google'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0' }}>
                <i style={{ flex: 1, height: 1, background: '#E2E6E4' }} />
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A3AFAA' }}>Or use an invite code</span>
                <i style={{ flex: 1, height: 1, background: '#E2E6E4' }} />
              </div>

              <form onSubmit={handleSignup}>
                <label style={{ display: 'block', marginBottom: 14 }}><span style={lbl}>Organization code</span>
                  <input value={orgCode} onChange={e => setOrgCode(e.target.value)} required placeholder="e.g. CYC2026" autoCapitalize="characters" style={{ ...input, fontFamily: MONO, textTransform: 'uppercase' }} />
                  <i style={{ display: 'block', fontStyle: 'normal', fontSize: 11.5, color: '#A3AFAA', marginTop: 7 }}>Provided by your grant admin</i>
                </label>
                <label style={{ display: 'block', marginBottom: 14 }}><span style={lbl}>Work email</span>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@organization.org" autoComplete="email" style={input} />
                </label>
                <label style={{ display: 'block', marginBottom: 22 }}><span style={lbl}>Password</span>
                  <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={8} autoComplete="new-password" style={input} />
                  <i style={{ display: 'block', fontStyle: 'normal', fontSize: 11.5, color: '#A3AFAA', marginTop: 7 }}>At least 8 characters</i>
                </label>

                {error && <div style={{ padding: '10px 12px', marginBottom: 16, background: 'rgba(180,69,58,.06)', border: '1px solid rgba(180,69,58,.28)', borderRadius: 6, fontSize: 13, color: '#B4453A' }}>{error}</div>}

                <button type="submit" disabled={loading} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.13em', textTransform: 'uppercase', padding: '14px 26px', borderRadius: 999, border: 'none', background: INK, color: '#F7F8F7', cursor: loading ? 'default' : 'pointer', width: '100%', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <p style={{ textAlign: 'center', fontSize: 13, color: '#5E6D67', margin: '22px 0 0' }}>
                Already have access? <Link href="/login" style={{ color: ACCENT, textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
              </p>
              <p style={{ textAlign: 'center', fontSize: 13, color: '#5E6D67', margin: '6px 0 0' }}>
                New organization? <Link href="/onboarding" style={{ color: ACCENT, textDecoration: 'none', fontWeight: 500 }}>Request access →</Link>
              </p>
            </div>
          )}
        </div>
        <div style={{ marginTop: 'auto' }} />
      </div>

      <div className="su-aside" style={{ position: 'relative', borderLeft: '1px solid #E2E6E4', background: 'linear-gradient(180deg,#F7F8F7,#EFF3F1 60%,#F4F6F5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
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
