'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  {
    id: 'apple' as const,
    label: 'Continue with Apple',
    icon: (
      <svg viewBox="0 0 814 1000" width="16" height="18" fill="currentColor">
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.5 264.1-317.5 71.9 0 134 46.8 178.7 46.8 43.5 0 113.1-49.4 193.3-49.4 34.3 0 108.2 6.4 162.5 47.5zm-166.7-193.8c32.5-40.2 56.3-96.2 56.3-152.2 0-7.7-.6-15.4-1.9-21.8-53.3 2.6-116.5 35.3-154.6 81.5-28.8 33.9-56.3 89.9-56.3 146.6 0 8.3 1.3 16.6 1.9 19.2 3.2.6 8.3 1.3 13.4 1.3 47.5 0 109.7-31.2 141.2-74.6z"/>
      </svg>
    ),
  },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];

export default function LoginPage() {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [oauthLoading, setOauthLoading] = useState<ProviderId | null>(null);
  const router = useRouter();

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
    // On success the browser navigates away — no need to reset loading
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
          <h1 className="text-[20px] font-bold text-[#0f172a] mb-1">Sign in</h1>
          <p className="text-[13px] text-[#64748b] mb-6">Access your grant intelligence dashboard</p>

          {/* OAuth buttons */}
          <div className="flex flex-col gap-2 mb-5">
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

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-[#e2e8f0]" />
            <span className="text-[12px] text-[#94a3b8] font-medium">or</span>
            <div className="flex-1 h-px bg-[#e2e8f0]" />
          </div>

          {/* Email/password form */}
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
              <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                Password
              </label>
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
        </div>

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
      </div>
    </div>
  );
}
