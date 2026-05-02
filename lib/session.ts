import { createServerClient as createSSRClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Session } from '@supabase/supabase-js';

// Reads the Supabase auth session from request cookies — safe in Server Components and Route Handlers.
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — @supabase/ssr options overload changed; existing signature still works at runtime
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {}, // read-only in server components
      },
    }
  );
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
