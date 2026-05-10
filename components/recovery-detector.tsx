'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Runs on every page. If Supabase redirects a recovery email to the wrong
 * page (e.g. the landing page, because the redirect URL wasn't in the
 * allowlist), this catches the hash-based recovery token and bounces the
 * user to /reset-password so the session can be established client-side.
 */
export function RecoveryDetector() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/reset-password') return;
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      window.location.replace('/reset-password' + hash);
    }
  }, [pathname]);

  return null;
}
