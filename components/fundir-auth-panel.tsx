'use client';

/* ==================================================================
   FundirAuthPanel — sign in / create account (presentational).

   Integration notes (vs. the original .jsx drop):
   - Inter is self-hosted via Fontsource (no Google @import — Turbopack
     can't fetch fonts at build here). Family: 'Inter Variable'.
   - Purely presentational: it owns email/password field state, but all
     auth goes through the callbacks (onProvider / onSubmit / onForgot),
     which app/login/page.tsx wires to the EXISTING Supabase client. No
     second auth client is introduced.
   - error / notice / submitting / busyProvider are passed in so the
     panel can show the same feedback the old page did.

   ARTWORK
     One image, used twice, by path. Inset panel = crisp (object-fit
     cover). Page backdrop = same file at near-natural framing (whole
     skyline visible), softly blurred — the source is already pixel-art,
     so it reads pixelated without a zoom. Drop the file at heroSrc; a
     bad path fails quietly to a flat sage block.
================================================================== */

import { useState } from 'react';
import '@fontsource-variable/inter';

const SAGE = '#66977F';
const SAGE_DEEP = '#4E7A64';
const CARD = '#F4F4F1';
const FIELD = '#E9E9E4';
const HAIR = '#DCDCD5';
const INK = '#141614';
const MUTED = '#6A6F6B';
const ERR = '#A64B42';

/* Traced from the supplied logo file — do not redraw. */
const MARK_PATH =
  'M169.6 296.9C137.7 292.2 108.4 277.8 85.7 255.5C63.0 233.2 48.1 204.5 42.6 172.8L41.9 169.0L80.0 169.0C115.9 169.0 118.1 169.1 117.6 170.8C116.8 173.5 105.0 235.2 105.0 236.7C105.0 238.6 143.8 238.6 144.5 236.8C144.8 236.1 147.7 221.3 151.0 204.0C154.4 186.7 157.3 171.7 157.6 170.8C158.1 169.1 160.1 169.0 181.8 169.0C206.8 169.0 211.5 168.4 219.8 164.1C229.6 159.1 238.7 145.7 239.8 134.9L240.3 130.0L120.1 130.0L0.0 130.0L0.0 118.0L0.0 106.0L23.6 105.8L47.1 105.5L50.9 95.9C62.5 66.3 81.8 42.4 107.7 25.3C129.5 11.0 153.0 3.0 178.4 1.1C212.4 -1.4 244.5 7.1 273.1 26.2C284.4 33.7 304.2 53.1 311.6 64.0C331.3 92.9 340.1 125.1 337.9 160.0C334.7 210.8 303.8 257.8 258.4 281.2C243.0 289.2 225.9 294.6 208.7 296.9C199.6 298.2 178.2 298.1 169.6 296.9ZM169.2 110.0C169.6 107.5 170.2 104.5 170.5 103.2L171.0 101.0L205.5 101.0L240.0 101.0L240.0 108.1C240.0 114.0 240.3 115.1 241.5 114.6C242.3 114.3 255.8 106.7 271.5 97.7C292.0 85.9 299.7 81.0 298.8 80.3C296.8 78.8 243.7 48.2 241.7 47.4C240.2 46.9 240.0 47.6 240.0 53.9L240.0 61.0L189.3 61.2L138.6 61.5L134.4 83.0C132.1 94.8 129.8 106.9 129.5 109.8L128.8 115.0L148.6 114.8L168.4 114.5L169.2 110.0Z';

function FundirMark({ height = 58 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 339 298"
      style={{ width: (339 / 298) * height, display: 'block', flex: 'none' }}
      aria-hidden="true"
    >
      <path fillRule="evenodd" fill={SAGE} d={MARK_PATH} />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function MicrosoftSquares() {
  return (
    <svg width="17" height="17" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

const CSS = `
.fa-root{position:relative;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:40px 24px;
  font-family:'Inter Variable','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:${INK};overflow:hidden;background:#CFD6CC}

/* backdrop: same file at near-natural framing (whole skyline visible), softly
   blurred. The source is already pixel-art, so it reads pixelated without a zoom.
   The slight scale hides the blur's feathered edges. */
.fa-bg{position:absolute;inset:0;overflow:hidden}
.fa-bg img{width:100%;height:100%;object-fit:cover;transform:scale(1.03);transform-origin:50% 45%;
  filter:blur(3px)}
.fa-bg::after{content:'';position:absolute;inset:0;background:rgba(243,243,238,.22)}

.fa-card{position:relative;display:flex;width:100%;max-width:1180px;background:${CARD};border-radius:26px;
  box-shadow:0 30px 70px rgba(20,26,22,.24);overflow:hidden}
.fa-art{position:relative;flex:0 0 50%;margin:14px 0 14px 14px;border-radius:16px;overflow:hidden;background:#BFC8BE}
.fa-art img{width:100%;height:100%;object-fit:cover;display:block}
.fa-pane{flex:1;display:flex;flex-direction:column;padding:40px 64px 44px}

.fa-back{align-self:flex-start;display:inline-flex;align-items:center;gap:9px;background:none;border:0;padding:0;
  cursor:pointer;font:inherit;font-size:15px;font-weight:500;color:${INK};line-height:1}
.fa-back:hover{color:${SAGE_DEEP}}
.fa-back:focus-visible{outline:2px solid ${SAGE};outline-offset:4px;border-radius:4px}

.fa-body{margin-top:56px;max-width:460px;width:100%}
.fa-eyebrow{font-size:17px;line-height:1;color:${MUTED};margin:0 0 20px}

/* the lockup is the headline */
.fa-lock{display:flex;align-items:center;gap:14px;margin:0 0 44px}
.fa-wordmark{font-size:46px;font-weight:500;letter-spacing:-.035em;line-height:1;color:${INK}}
.fa-wordmark span{font-weight:400;color:${SAGE}}

.fa-msg{margin:0 0 20px;font-size:13.5px;line-height:1.4}
.fa-msg.err{color:${ERR}}
.fa-msg.ok{color:${SAGE_DEEP}}

.fa-sso{display:flex;flex-direction:column;gap:12px;margin-bottom:32px}
.fa-provider{display:flex;align-items:center;justify-content:center;gap:11px;width:100%;height:52px;background:#fff;
  border:1px solid ${HAIR};border-radius:12px;cursor:pointer;font:inherit;font-size:15px;font-weight:500;color:${INK};
  transition:border-color .15s ease,background .15s ease}
.fa-provider:hover{border-color:#BFC4BB;background:#FCFCFA}
.fa-provider:focus-visible{outline:2px solid ${SAGE};outline-offset:2px}
.fa-provider:disabled{opacity:.55;cursor:not-allowed}

.fa-or{display:flex;align-items:center;gap:14px;margin:0 0 32px;color:${MUTED};font-size:13px;line-height:1}
.fa-or::before,.fa-or::after{content:'';flex:1;height:1px;background:${HAIR}}

.fa-field{display:block;width:100%;height:52px;background:${FIELD};border:1px solid transparent;border-radius:12px;
  padding:0 18px;font:inherit;font-size:15px;color:${INK};margin-bottom:12px}
.fa-field::placeholder{color:#8C918C}
.fa-field:focus{outline:none;border-color:${SAGE};background:#F2F3EF}

.fa-forgot{align-self:flex-end;display:block;margin:-4px 0 0 auto;background:none;border:0;padding:0;
  font:inherit;font-size:13px;font-weight:500;color:${SAGE_DEEP};cursor:pointer}
.fa-forgot:hover{text-decoration:underline}
.fa-forgot:focus-visible{outline:2px solid ${SAGE};outline-offset:3px;border-radius:3px}

.fa-submit{width:100%;height:52px;background:${SAGE};color:#fff;border:0;border-radius:12px;cursor:pointer;
  font:inherit;font-size:15px;font-weight:600;margin-top:12px;transition:background .15s ease}
.fa-submit:hover{background:${SAGE_DEEP}}
.fa-submit:focus-visible{outline:2px solid ${SAGE_DEEP};outline-offset:3px}
.fa-submit:disabled{opacity:.6;cursor:not-allowed}

.fa-alt{margin:32px 0 0;font-size:14.5px;line-height:1;color:${MUTED}}
.fa-link{background:none;border:0;padding:0;font:inherit;font-size:14.5px;font-weight:600;color:${SAGE_DEEP};cursor:pointer}
.fa-link:hover{text-decoration:underline}
.fa-link:focus-visible{outline:2px solid ${SAGE};outline-offset:3px;border-radius:3px}

@media (max-width:900px){
  .fa-card{flex-direction:column}
  .fa-art{flex:0 0 200px;margin:14px 14px 0}
  .fa-pane{padding:28px 26px 32px}
  .fa-body{margin-top:32px;max-width:none}
  .fa-lock{margin-bottom:32px;gap:12px}
  .fa-wordmark{font-size:36px}
  .fa-bg img{transform:scale(1.1);filter:blur(3px)}
}
@media (prefers-reduced-motion:reduce){.fa-root *{transition:none!important}}
`;

export type AuthProvider = 'microsoft' | 'google';

export interface FundirAuthPanelProps {
  /** Point this at the asset in the repo (public/…). */
  heroSrc?: string;
  logoSrc?: string | null;
  mode?: 'signin' | 'register';
  copy?: { eyebrow?: string };
  error?: string;
  notice?: string;
  submitting?: boolean;
  busyProvider?: AuthProvider | null;
  onBack?: () => void;
  onProvider?: (p: AuthProvider) => void;
  onSubmit?: (v: { email: string; password: string; mode: string }) => void;
  onForgot?: (email: string) => void;
  onSwitchMode?: () => void;
}

export function FundirAuthPanel({
  heroSrc = '/images/login-chicago-currency.png',
  logoSrc = null,
  mode = 'signin',
  copy,
  error,
  notice,
  submitting = false,
  busyProvider = null,
  onBack,
  onProvider = (p) => console.log('sso:', p),
  onSubmit = (v) => console.log('submit:', v),
  onForgot,
  onSwitchMode,
}: FundirAuthPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [artFailed, setArtFailed] = useState(false);
  const register = mode === 'register';
  const busy = submitting || !!busyProvider;

  const eyebrow = copy?.eyebrow ?? (register ? 'Create your account for' : 'Sign in to');
  const submit = () => onSubmit({ email, password, mode });

  return (
    <div className="fa-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="fa-bg" aria-hidden="true">
        {!artFailed && <img src={heroSrc} alt="" />}
      </div>

      <div className="fa-card">
        <div className="fa-art">
          {!artFailed && (
            <img
              src={heroSrc}
              alt="Chicago skyline rendered in currency"
              onError={() => setArtFailed(true)}
            />
          )}
        </div>

        <div className="fa-pane">
          <button className="fa-back" type="button" onClick={onBack}>
            <svg width="17" height="14" viewBox="0 0 17 14" fill="none" aria-hidden="true">
              <path d="M7 1L1 7l6 6M1 7h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>

          <div className="fa-body">
            <p className="fa-eyebrow">{eyebrow}</p>

            <div className="fa-lock">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoSrc ? <img src={logoSrc} alt="fundir" height="58" /> : <FundirMark height={58} />}
              <span className="fa-wordmark">
                fundir<span>.ai</span>
              </span>
            </div>

            {error ? <p className="fa-msg err" role="alert">{error}</p> : null}
            {notice ? <p className="fa-msg ok" role="status">{notice}</p> : null}

            <div className="fa-sso">
              <button className="fa-provider" type="button" disabled={busy}
                aria-busy={busyProvider === 'microsoft'} onClick={() => onProvider('microsoft')}>
                <MicrosoftSquares />
                {busyProvider === 'microsoft' ? 'Redirecting…' : 'Continue with Microsoft'}
              </button>
              <button className="fa-provider" type="button" disabled={busy}
                aria-busy={busyProvider === 'google'} onClick={() => onProvider('google')}>
                <GoogleG />
                {busyProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}
              </button>
            </div>

            <div className="fa-or">or use your email</div>

            <input
              className="fa-field"
              type="email"
              autoComplete="email"
              placeholder="Enter email"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="fa-field"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder={register ? 'Create a password' : 'Enter password'}
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />

            {!register && onForgot ? (
              <button className="fa-forgot" type="button" onClick={() => onForgot(email)}>
                Forgot password?
              </button>
            ) : null}

            <button className="fa-submit" type="button" disabled={busy} onClick={submit}>
              {submitting ? (register ? 'Creating…' : 'Signing in…') : register ? 'Create account' : 'Sign in'}
            </button>

            <p className="fa-alt">
              {register ? 'Already have an account? ' : "Don't have an account? "}
              <button className="fa-link" type="button" onClick={onSwitchMode}>
                {register ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
