'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

// ── OAuth provider config ─────────────────────────────────────────────────

// Microsoft first — CYC runs fully on M365, so its sign-in is the primary path.
const PROVIDERS = [
  {
    id: 'azure' as const,
    label: 'Continue with Microsoft',
    icon: (
      <svg viewBox="0 0 23 23" width="18" height="18" fill="none" aria-hidden="true">
        <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
        <rect x="12" y="1"  width="10" height="10" fill="#7FBA00"/>
        <rect x="1"  y="12" width="10" height="10" fill="#00A4EF"/>
        <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
      </svg>
    ),
  },
  {
    id: 'google' as const,
    label: 'Continue with Google',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];
type Mode       = 'login' | 'forgot' | 'sent';

const URL_ERROR_COPY: Record<string, string> = {
  oauth_denied:  'Sign-in was cancelled.',
  oauth_failed:  'Sign-in failed. Please try again.',
  network:       'Network error. Check your connection and try again.',
};

function LoginPageContent() {
  const [mode, setMode]                 = useState<Mode>('login');
  const [email, setEmail]               = useState('');
  const [resetEmail, setResetEmail]     = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [oauthLoading, setOauthLoading] = useState<ProviderId | null>(null);
  const router       = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Auto-open forgot-password form when the redirect from an expired
    // reset link drops a `?forgot=1` on us.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (searchParams.get('forgot') === '1') setMode('forgot');
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setMode('sent');
  }

  async function handleOAuth(provider: ProviderId) {
    setOauthLoading(provider);
    setError('');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(provider === 'azure' ? { scopes: 'email profile openid' } : {}),
      },
    });
    if (error) {
      setError(error.message);
      setOauthLoading(null);
    }
    // On success, browser is navigating to the provider — keep the
    // spinner up; URL will leave shortly.
  }

  const urlError = searchParams.get('error');
  const urlErrorCopy = urlError ? URL_ERROR_COPY[urlError] ?? URL_ERROR_COPY.oauth_failed : null;

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-accent rounded-md flex items-center justify-center">
            <span className="font-mono font-bold text-white text-[16px]">F</span>
          </div>
          <span className="font-semibold text-[18px] text-primary">Fundir</span>
        </div>

        <div className="bg-surface rounded-[12px] border border-hairline p-7">

          {/* ── Forgot password: sent confirmation ── */}
          {mode === 'sent' && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-accent-tint border border-hairline flex items-center justify-center mx-auto mb-4">
                <ArrowRight className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-[18px] font-semibold text-primary mb-2">Check your email</h2>
              <p className="text-[13px] text-secondary mb-1">We sent a password reset link to</p>
              <p className="font-mono text-[13px] font-semibold text-primary mb-6 tabular-nums break-all">
                {resetEmail}
              </p>
              <p className="text-[12px] text-tertiary mb-6 leading-relaxed">
                Click the link to set a new password. Check your spam folder if you don&apos;t see it.
              </p>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[13px] text-accent font-medium hover:underline"
              >
                ← Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot password: email form ── */}
          {mode === 'forgot' && (
            <>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[12px] text-tertiary hover:text-primary transition-colors mb-4 flex items-center gap-1"
              >
                ← Back to sign in
              </button>
              <h1 className="text-[20px] font-semibold text-primary -tracking-[0.01em] mb-1">Reset password</h1>
              <p className="text-[13px] text-secondary mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block font-mono text-[10.5px] font-semibold text-secondary uppercase tracking-[0.08em] mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@organization.org"
                    className="w-full px-3 py-2.5 border border-hairline rounded-md text-[14px] text-primary placeholder:text-tertiary bg-surface focus:outline-none focus:ring-2 focus:border-accent transition-colors"
                  />
                </div>
                {error && (
                  <div className="bg-surface border border-hairline border-l-[3px] border-l-critical rounded-md px-3 py-2 text-[13px] text-critical">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white font-semibold rounded-md text-[14px] hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Sending…' : <><span>Send reset link</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}

          {/* ── Sign in ── */}
          {mode === 'login' && (
            <>
              <h1 className="text-[20px] font-semibold text-primary -tracking-[0.01em] mb-1">Sign in</h1>
              <p className="text-[13px] text-secondary mb-6">Access your grant intelligence dashboard</p>

              {/* OAuth buttons — primary, equal weight */}
              <div className="flex flex-col gap-2 mb-5">
                {PROVIDERS.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleOAuth(id)}
                    disabled={!!oauthLoading || loading}
                    aria-busy={oauthLoading === id}
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-hairline rounded-md text-[14px] font-medium text-primary bg-surface hover:bg-elevated hover:border-ink-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {oauthLoading === id ? (
                      <svg className="animate-spin w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : icon}
                    {oauthLoading === id ? 'Redirecting…' : label}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-hairline" />
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-tertiary font-semibold">
                  or with password
                </span>
                <div className="flex-1 h-px bg-hairline" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block font-mono text-[10.5px] font-semibold text-secondary uppercase tracking-[0.08em] mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@organization.org"
                    className="w-full px-3 py-2.5 border border-hairline rounded-md text-[14px] text-primary placeholder:text-tertiary bg-surface focus:outline-none focus:ring-2 focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-mono text-[10.5px] font-semibold text-secondary uppercase tracking-[0.08em]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setResetEmail(email); setMode('forgot'); setError(''); }}
                      className="text-[12px] text-accent font-medium hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 pr-10 border border-hairline rounded-md text-[14px] text-primary placeholder:text-tertiary bg-surface focus:outline-none focus:ring-2 focus:border-accent transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-primary transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {(error || urlErrorCopy) && (
                  <div className="bg-surface border border-hairline border-l-[3px] border-l-critical rounded-md px-3 py-2 text-[13px] text-critical">
                    {error || urlErrorCopy}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !!oauthLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white font-semibold rounded-md text-[14px] hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
                >
                  {loading ? 'Signing in…' : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}
        </div>

        {mode === 'login' && (
          <>
            <p className="text-center text-[13px] text-secondary mt-6">
              New organization?{' '}
              <Link href="/onboarding" className="text-accent font-medium hover:underline">Get started →</Link>
            </p>
            <p className="text-center text-[13px] text-secondary mt-1">
              Joining your team?{' '}
              <Link href="/signup" className="text-accent font-medium hover:underline">Sign up →</Link>
            </p>
            <Link href="/" className="block text-center text-[12px] text-tertiary hover:text-primary mt-2 transition-colors">
              ← Back to home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
