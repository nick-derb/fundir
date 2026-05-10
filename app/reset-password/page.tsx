'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Eye, EyeOff, ArrowRight, CheckCircle, RefreshCw, Check } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

type PageState = 'loading' | 'ready' | 'expired' | 'success';

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '#e2e8f0' };
  let s = 0;
  if (pwd.length >= 8)           s++;
  if (pwd.length >= 12)          s++;
  if (/[A-Z]/.test(pwd))         s++;
  if (/[0-9]/.test(pwd))         s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  const score = Math.min(s, 4) as 0 | 1 | 2 | 3 | 4;
  const labels: Record<number, string> = { 0: '', 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' };
  const colors:  Record<number, string> = { 0: '#e2e8f0', 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#22c55e' };
  return { score, label: labels[score], color: colors[score] };
}

const REQS = [
  { label: 'At least 8 characters', met: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter',       met: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number',                 met: (p: string) => /[0-9]/.test(p) },
];

export default function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [error, setError]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const router       = useRouter();
  const searchParams = useSearchParams();

  const strength       = passwordStrength(password);
  const allReqsMet     = REQS.every(r => r.met(password));
  const passwordsMatch    = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  // Establish session from either PKCE (server set it already) or
  // hash-based recovery (Supabase fires PASSWORD_RECOVERY event).
  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      setPageState('expired');
      return;
    }

    const supabase = getSupabaseClient();
    let timer: ReturnType<typeof setTimeout>;
    let unsub: (() => void) | undefined;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState('ready');
        return;
      }

      // Listen for the PASSWORD_RECOVERY event fired by hash-based flows
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          clearTimeout(timer);
          setPageState('ready');
        }
      });
      unsub = () => subscription.unsubscribe();

      // If nothing establishes a session in 5s, the link is expired/invalid
      timer = setTimeout(() => {
        subscription.unsubscribe();
        setPageState('expired');
      }, 5000);
    });

    return () => { unsub?.(); clearTimeout(timer); };
  }, [searchParams]);

  // Countdown + redirect after success
  useEffect(() => {
    if (pageState !== 'success') return;
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(id); router.push('/dashboard'); }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pageState, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!allReqsMet)        { setError('Please meet all password requirements.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    setError('');
    const { error: err } = await getSupabaseClient().auth.updateUser({ password });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setPageState('success');
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-[#0d9488] rounded-[8px] flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-[18px] text-[#0f172a]">Fundir</span>
        </div>

        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-8">

          {/* ── Verifying ── */}
          {pageState === 'loading' && (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full border-2 border-[#e2e8f0] border-t-[#0d9488] animate-spin mx-auto mb-4" />
              <h2 className="text-[16px] font-semibold text-[#0f172a] mb-1">Verifying your link…</h2>
              <p className="text-[13px] text-[#94a3b8]">Just a moment</p>
            </div>
          )}

          {/* ── Expired / invalid ── */}
          {pageState === 'expired' && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-5 h-5 text-amber-500" />
              </div>
              <h2 className="text-[18px] font-bold text-[#0f172a] mb-2">Link expired</h2>
              <p className="text-[13px] text-[#64748b] mb-6">
                Reset links expire after 1 hour for security. Request a fresh one and you&apos;ll be set up in seconds.
              </p>
              <button
                onClick={() => router.push('/login?forgot=1')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0d9488] text-white font-semibold rounded-[6px] text-[14px] hover:bg-[#0f766e] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Send me a new link
              </button>
              <button
                onClick={() => router.push('/login')}
                className="mt-3 block w-full text-center text-[13px] text-[#94a3b8] hover:text-[#475569] transition-colors"
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Success ── */}
          {pageState === 'success' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-[#0d9488]" />
              </div>
              <h2 className="text-[18px] font-bold text-[#0f172a] mb-2">Password updated!</h2>
              <p className="text-[13px] text-[#64748b] mb-5">You&apos;re all set. Signing you in now.</p>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full transition-colors duration-500"
                    style={{ background: i <= 3 - countdown ? '#0d9488' : '#e2e8f0' }}
                  />
                ))}
              </div>
              <p className="text-[12px] text-[#94a3b8]">Redirecting in {countdown}…</p>
            </div>
          )}

          {/* ── Password form ── */}
          {pageState === 'ready' && (
            <>
              <h1 className="text-[20px] font-bold text-[#0f172a] mb-1">Set new password</h1>
              <p className="text-[13px] text-[#64748b] mb-6">Choose a strong password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New password */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoFocus
                      placeholder="Min. 8 characters"
                      className="w-full px-3 py-2.5 pr-10 border border-[#e2e8f0] rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                    />
                    <button type="button" onClick={() => setShowPwd(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569]">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Strength bars */}
                  {password.length > 0 && (
                    <div className="mt-2.5">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3, 4].map(i => (
                          <div
                            key={i}
                            className="h-1.5 flex-1 rounded-full transition-all duration-300"
                            style={{ background: i <= strength.score ? strength.color : '#e2e8f0' }}
                          />
                        ))}
                      </div>
                      {strength.label && (
                        <p className="text-[11px] font-semibold transition-colors" style={{ color: strength.color }}>
                          {strength.label}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Live requirements */}
                  {password.length > 0 && (
                    <div className="mt-2.5 space-y-1">
                      {REQS.map(req => {
                        const met = req.met(password);
                        return (
                          <div key={req.label} className="flex items-center gap-1.5">
                            {met
                              ? <Check className="w-3 h-3 flex-shrink-0 text-[#22c55e]" />
                              : <div className="w-3 h-3 rounded-full border border-[#cbd5e1] flex-shrink-0" />
                            }
                            <span className={`text-[11px] transition-colors ${met ? 'text-[#475569]' : 'text-[#94a3b8]'}`}>
                              {req.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                    Confirm password
                  </label>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter password"
                    className={`w-full px-3 py-2.5 border rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 transition-all ${
                      passwordsMismatch
                        ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                        : passwordsMatch
                        ? 'border-[#22c55e] focus:ring-[#22c55e]/10 focus:border-[#22c55e]'
                        : 'border-[#e2e8f0] focus:ring-[#0d9488]/20 focus:border-[#0d9488]'
                    }`}
                  />
                  {passwordsMismatch && (
                    <p className="text-[11px] text-red-500 mt-1">Passwords don&apos;t match</p>
                  )}
                  {passwordsMatch && (
                    <p className="text-[11px] text-[#22c55e] mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Passwords match
                    </p>
                  )}
                </div>

                {error && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-[6px] text-[13px] text-red-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !allReqsMet || password !== confirm}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0d9488] text-white font-semibold rounded-[6px] text-[14px] hover:bg-[#0f766e] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {submitting
                    ? 'Updating…'
                    : <><span>Update password</span><ArrowRight className="w-4 h-4" /></>
                  }
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
