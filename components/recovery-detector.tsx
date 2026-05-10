'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Runs on every page. Handles two scenarios where Supabase lands auth
 * tokens on the wrong page (occurs when the redirectTo URL is not in the
 * Supabase "Allowed Redirect URLs" list and Supabase falls back to the
 * Site URL instead):
 *
 * 1. Hash-based recovery (#access_token=...&type=recovery in URL fragment)
 *    → redirect to /reset-password with the hash so onAuthStateChange fires.
 *
 * 2. PKCE code (?code=xxx in query string, landed here instead of /auth/callback)
 *    → exchange the code, inspect the resulting session type, then route:
 *      - PASSWORD_RECOVERY → /reset-password
 *      - SIGNED_IN         → /dashboard  (covers Google/Microsoft OAuth)
 */
export function RecoveryDetector() {
  const pathname = usePathname();

  useEffect(() => {
    // These routes handle auth themselves — don't interfere.
    if (pathname === '/reset-password' || pathname.startsWith('/auth/')) return;

    const supabase = getSupabaseClient();

    // ── Case 1: hash-based implicit flow ─────────────────────────────────────
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      window.location.replace('/reset-password' + hash);
      return;
    }

    // ── Case 2: PKCE code on wrong page ──────────────────────────────────────
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) return;

    // Register the listener BEFORE the async exchange so we never miss the event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        subscription.unsubscribe();
        window.location.replace('/reset-password');
      } else if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe();
        window.location.replace('/dashboard');
      }
    });

    // The PKCE code verifier was stored in cookies when the flow started.
    // exchangeCodeForSession retrieves it automatically.
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error('[auth] code exchange failed:', error.message);
        subscription.unsubscribe();
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname]);

  return null;
}
