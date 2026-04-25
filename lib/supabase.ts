import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client (singleton) — supports auth, used in client components
let _browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    // SSR fallback — return a plain client (no cookie handling needed for direct calls)
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (!_browserClient) {
    _browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _browserClient;
}

// Legacy proxy alias (kept for backwards compatibility)
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof ReturnType<typeof createClient>];
  },
});

// Server-side admin client — uses service role, bypasses RLS
// Used in Server Actions and server-only data fetching
export function createServerClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
