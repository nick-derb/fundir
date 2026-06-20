'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Single-purpose sign-out button. Clears the Supabase session
 * everywhere ('global' scope), then routes to /login.
 */
export function SignOutButton({
  children, className = '',
}: { children: React.ReactNode; className?: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setPending(true);
    const supabase = getSupabaseClient();
    await supabase.auth.signOut({ scope: 'global' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={className}
      aria-busy={pending}
    >
      {pending ? 'Signing out…' : children}
    </button>
  );
}
