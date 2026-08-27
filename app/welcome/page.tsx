export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { getUserIntegration } from '@/lib/oauth-tokens';
import { OnboardingFlow } from '@/components/welcome/onboarding-flow';

const STEP_INDEX: Record<string, number> = {
  account: 0, profile: 1, role: 2, calendar: 3, focus: 4, done: 5,
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const db = createServerClient();
  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('user_id', ctx.userId)
    .single();

  // Already onboarded → straight to the dashboard.
  if (profile?.onboarded_at) redirect('/dashboard');

  const [msIntegration, googleIntegration] = await Promise.all([
    getUserIntegration(ctx.userId, 'microsoft'),
    getUserIntegration(ctx.userId, 'google'),
  ]);
  const sp = await searchParams;
  const initialStep = STEP_INDEX[sp?.step ?? ''] ?? 0;

  const initialProfile = profile
    ? {
        first:   profile.first_name ?? '',
        last:    profile.last_name ?? '',
        display: profile.display_name ?? '',
        role:    profile.role ?? '',
        avatar:  profile.avatar_url ?? '',
        focus:   profile.focus ?? [],
      }
    : null;

  return (
    <OnboardingFlow
      email={ctx.email}
      calendarConnected={!!(msIntegration || googleIntegration)}
      initialProfile={initialProfile}
      initialStep={initialStep}
    />
  );
}
