'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Eye, EyeOff, ArrowRight, Info, CheckCircle } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = getSupabaseClient();

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('org_code', orgCode.toUpperCase().trim())
      .single();

    if (orgError || !org) {
      setError('Invalid organization code. Contact your administrator.');
      setLoading(false);
      return;
    }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { org_id: org.id, org_name: org.name } },
    });

    if (signupError) { setError(signupError.message); setLoading(false); return; }

    if (signupData.user) {
      await supabase.from('user_organizations').insert({ user_id: signupData.user.id, org_id: org.id, role: 'member' });
      if (signupData.session) { router.push('/welcome'); router.refresh(); return; }
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-[#f0fdfa] border border-[#99f6e4] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-[#0d9488]" />
          </div>
          <h1 className="text-[20px] font-bold text-[#0f172a] mb-2">Check your email</h1>
          <p className="text-[14px] text-[#64748b] mb-6">
            We sent a confirmation link to <span className="font-medium text-[#0f172a]">{email}</span>.
          </p>
          <Link href="/login" className="text-[#0d9488] font-medium hover:underline text-[14px]">
            Return to sign in →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-[#0d9488] rounded-[8px] flex items-center justify-center">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-[18px] text-[#0f172a]">Fundir</span>
        </div>

        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-8">
          <h1 className="text-[20px] font-bold text-[#0f172a] mb-1">Join your team</h1>
          <p className="text-[13px] text-[#64748b] mb-6">Enter your organization&apos;s code to join an existing Fundir account</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                Organization Code
              </label>
              <input
                type="text"
                value={orgCode}
                onChange={e => setOrgCode(e.target.value)}
                required
                placeholder="e.g. YMCA2025"
                className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] uppercase focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all font-mono"
              />
              <p className="flex items-center gap-1 text-[11px] text-[#94a3b8] mt-1.5">
                <Info className="w-3 h-3" /> Provided by your grant admin
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                Work Email
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
                  minLength={8}
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2.5 pr-10 border border-[#e2e8f0] rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569]">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-[6px] text-[13px] text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0d9488] text-white font-semibold rounded-[6px] text-[14px] hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? 'Creating account…' : <><span>Create account</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-[#64748b] mt-6">
          Already have access?{' '}
          <Link href="/login" className="text-[#0d9488] font-medium hover:underline">Sign in</Link>
        </p>
        <p className="text-center text-[13px] text-[#64748b] mt-1">
          Registering a new organization?{' '}
          <Link href="/onboarding" className="text-[#0d9488] font-medium hover:underline">Start here →</Link>
        </p>
        <Link href="/" className="block text-center text-[12px] text-[#94a3b8] hover:text-[#475569] mt-2 transition-colors">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
