'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { FundirAuthPanel, type AuthProvider } from '@/components/fundir-auth-panel';

const URL_ERROR_COPY: Record<string, string> = {
  oauth_denied: 'Sign-in was cancelled.',
  oauth_failed: 'Sign-in failed. Please try again.',
  network:      'Network error. Check your connection and try again.',
};

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [error, setError]               = useState('');
  const [notice, setNotice]             = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [busyProvider, setBusyProvider] = useState<AuthProvider | null>(null);

  const urlError = searchParams.get('error');
  const urlErrorCopy = urlError ? (URL_ERROR_COPY[urlError] ?? URL_ERROR_COPY.oauth_failed) : '';

  // OAuth — same Supabase client and providers as before ('microsoft' → azure).
  async function handleProvider(p: AuthProvider) {
    setBusyProvider(p);
    setError(''); setNotice('');
    const provider = p === 'microsoft' ? 'azure' : 'google';
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(provider === 'azure' ? { scopes: 'email profile openid' } : {}),
      },
    });
    if (error) { setError(error.message); setBusyProvider(null); }
    // On success the browser navigates to the provider — keep the busy state.
  }

  // Email + password sign-in — unchanged behavior (→ /dashboard).
  async function handleSubmit({ email, password }: { email: string; password: string }) {
    setSubmitting(true);
    setError(''); setNotice('');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setSubmitting(false); return; }
    router.push('/dashboard');
    router.refresh();
  }

  // Forgot-password — preserved from the old page, now a single link.
  async function handleForgot(email: string) {
    setError(''); setNotice('');
    if (!email) { setError('Enter your email above first, then tap “Forgot password?” again.'); return; }
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) { setError(error.message); return; }
    setNotice(`Password reset link sent to ${email}. Check your inbox (and spam).`);
  }

  return (
    <FundirAuthPanel
      mode="signin"
      error={error || urlErrorCopy}
      notice={notice}
      submitting={submitting}
      busyProvider={busyProvider}
      onProvider={handleProvider}
      onSubmit={handleSubmit}
      onForgot={handleForgot}
      onBack={() => router.push('/')}
      onSwitchMode={() => router.push('/onboarding')}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
