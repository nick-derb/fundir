'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [done, setDone]                 = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => router.push('/dashboard'), 2500);
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

          {done ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-5 h-5 text-[#0d9488]" />
              </div>
              <h2 className="text-[18px] font-bold text-[#0f172a] mb-2">Password updated</h2>
              <p className="text-[13px] text-[#64748b]">Redirecting you to the dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-[20px] font-bold text-[#0f172a] mb-1">Set new password</h1>
              <p className="text-[13px] text-[#64748b] mb-6">Choose a strong password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoFocus
                      placeholder="Min. 8 characters"
                      className="w-full px-3 py-2.5 pr-10 border border-[#e2e8f0] rounded-[6px] text-[14px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569]">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
                    Confirm password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter password"
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
                  {loading ? 'Updating…' : <><span>Update password</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
