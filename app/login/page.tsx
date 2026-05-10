'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

// ── OAuth provider config ─────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'google' as const,
    label: 'Continue with Google',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    id: 'azure' as const,
    label: 'Continue with Microsoft',
    icon: (
      <svg viewBox="0 0 23 23" width="18" height="18" fill="none">
        <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
        <rect x="12" y="1"  width="10" height="10" fill="#7FBA00"/>
        <rect x="1"  y="12" width="10" height="10" fill="#00A4EF"/>
        <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
      </svg>
    ),
  },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];

type Mode = 'login' | 'forgot' | 'sent';

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

  // Auto-open forgot-password form when redirected from expired reset link
  useEffect(() => {
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
        ...(provider === 'azure' ? { scopes: 'email profile' } : {}),
      },
    });
    if (error) {
      setError(error.message);
      setOauthLoading(null);
    }
  }

  const urlError = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('error')
    : null;

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

          {/* ── Forgot password: sent confirmation ── */}
          {mode === 'sent' && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto mb-4">
                <ArrowRight className="w-5 h-5 text-[#0d9488]" />
              </div>
              <h2 className="text-[18px] font-bold text-[#0f172a] mb-2">Check your email</h2>
              <p className="text-[13px] text-[#64748b] mb-1">
                We sent a password reset link to
              </p>
              <p className="text-[13px] font-semibold text-[#0f172a] mb-6">{resetEmail}</p>
              <p className="text-[12px] text-[#94a3b8] mb-6">
                Click the link in the email to set a new password. Check your spam folder if you don&apos;t see it.
              </p>
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[13px] text-[#0d9488] font-medium hover:underline"
              >
                ← Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot password: email form ── */}
          {mode === 'forgot' && (
            <>
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[12px] text-[#94a3b8] hover:text-[#475569] transition-colors mb-4 flex items-center gap-1"
              >
                ← Back to sign in
              </button>
              <h1 className="text-[20px] font-bold text-[#0f172a] mb-1">Reset password</h1>
              <p className="text-[13px] text-[#64748b] mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@organization.org"
                    className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                  />
                </div>
                {error && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-[6px] text-[13px] text-red-600">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0d9488] text-white font-semibold rounded-[6px] text-[14px] hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Sending…' : <><span>Send reset link</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}

          {/* ── Normal sign-in form ── */}
          {mode === 'login' && (
            <>
              <h1 className="text-[20px] font-bold text-[#0f172a] mb-1">Sign in</h1>
              <p className="text-[13px] text-[#64748b] mb-6">Access your grant intelligence dashboard</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@organization.org"
                    className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[12px] font-semibold text-[#475569] uppercase tracking-wide">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setResetEmail(email); setMode('forgot'); setError(''); }}
                      className="text-[12px] text-[#0d9488] font-medium hover:underline"
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
                      className="w-full px-3 py-2.5 pr-10 border border-[#e2e8f0] rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569]">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {(error || urlError) && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-[6px] text-[13px] text-red-600">
                    {error || (urlError === 'oauth_denied' ? 'Sign-in was cancelled.' : 'Sign-in failed. Please try again.')}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !!oauthLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0d9488] text-white font-semibold rounded-[6px] text-[14px] hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
                >
                  {loading
                    ? 'Signing in…'
                    : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 mt-5">
                <div className="flex-1 h-px bg-[#e2e8f0]" />
                <span className="text-[12px] text-[#94a3b8] font-medium">or</span>
                <div className="flex-1 h-px bg-[#e2e8f0]" />
              </div>

              {/* OAuth buttons */}
              <div className="flex flex-col gap-2 mt-4">
                {PROVIDERS.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    onClick={() => handleOAuth(id)}
                    disabled={!!oauthLoading || loading}
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-[#e2e8f0] rounded-[8px] text-[14px] font-medium text-[#0f172a] bg-white hover:bg-[#f8fafc] hover:border-[#cbd5e1] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {oauthLoading === id ? (
                      <svg className="animate-spin w-4 h-4 text-[#64748b]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : icon}
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {mode === 'login' && (
          <>
            <p className="text-center text-[13px] text-[#64748b] mt-6">
              New organization?{' '}
              <Link href="/onboarding" className="text-[#0d9488] font-medium hover:underline">Get started →</Link>
            </p>
            <p className="text-center text-[13px] text-[#64748b] mt-1">
              Joining your team?{' '}
              <Link href="/signup" className="text-[#0d9488] font-medium hover:underline">Sign up →</Link>
            </p>
            <Link href="/" className="block text-center text-[12px] text-[#94a3b8] hover:text-[#475569] mt-2 transition-colors">
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
