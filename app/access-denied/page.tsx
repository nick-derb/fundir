export const dynamic = 'force-dynamic';

/**
 * /access-denied — friendly request-access screen.
 *
 * Reached when an authenticated user has no `user_organizations` row,
 * either because:
 *   - they signed in for the first time and aren't on the allow-list, or
 *   - they exist in auth.users but their membership row was removed.
 *
 * The session is left intact (RLS denies them zero rows anyway). They
 * can either request access, sign out, or come back later if an admin
 * adds them to the allow-list.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { latestRequestStatus, recordAccessRequest } from '@/lib/access-control';
import { SignOutButton } from '@/components/sign-out-button';
import { ShieldAlert, Mail, Clock } from 'lucide-react';

interface PageProps {
  searchParams: Promise<{ email?: string; provider?: string }>;
}

export default async function AccessDeniedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();

  // Read the authenticated email from the session (preferred over the
  // ?email param, which is user-controllable).
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? params.email ?? null;
  const provider = (user?.app_metadata?.provider as string | undefined) ?? params.provider ?? null;

  // Ensure a pending request exists. Idempotent.
  if (email && user) {
    await recordAccessRequest(user.id, email, provider);
  } else if (email) {
    await recordAccessRequest(null, email, provider);
  }

  const reqStatus = email ? await latestRequestStatus(email) : { status: null, createdAt: null };

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-accent rounded-md flex items-center justify-center">
            <span className="font-mono font-bold text-white text-[16px]">F</span>
          </div>
          <span className="font-semibold text-[18px] text-primary">Fundir</span>
        </div>

        <div className="bg-surface rounded-[12px] border border-hairline overflow-hidden">

          {/* Header — semantic left border to telegraph "blocked but not broken" */}
          <div className="border-b border-hairline border-l-[3px] border-l-warning px-6 py-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-warning" />
              <span className="font-mono text-[10.5px] font-semibold text-warning uppercase tracking-[0.14em]">
                Access required
              </span>
            </div>
            <h1 className="text-[22px] font-semibold text-primary -tracking-[0.01em] leading-tight">
              This email isn&apos;t on the CYC roster yet
            </h1>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">

            {/* Attempted email */}
            {email && (
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md bg-accent-tint flex items-center justify-center flex-shrink-0">
                  <Mail className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">
                    You signed in as
                  </p>
                  <p className="font-mono text-[13px] font-semibold text-primary tabular-nums break-all mt-0.5">
                    {email}
                  </p>
                  {provider && (
                    <p className="font-mono text-[10.5px] text-tertiary mt-0.5 uppercase tracking-[0.08em]">
                      via {provider}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Request status */}
            {reqStatus.status === 'pending' && (
              <div className="bg-surface border border-hairline border-l-[3px] border-l-info rounded-md px-3 py-3 flex items-start gap-2.5">
                <Clock className="w-3.5 h-3.5 text-info flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-info">
                    Pending review
                  </p>
                  <p className="text-[12px] text-muted mt-1 leading-relaxed">
                    Your access request was submitted{' '}
                    {reqStatus.createdAt && (
                      <span className="font-mono tabular-nums">
                        {new Date(reqStatus.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    )}
                    . Your CYC administrator will review and notify you by email.
                  </p>
                </div>
              </div>
            )}

            {/* Explainer copy */}
            <p className="text-[13px] text-muted leading-relaxed">
              Fundir is access-controlled. Sign-in via Google or Microsoft works for anyone,
              but only emails pre-authorized by your CYC administrator can see CYC data.
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-1">
              <Link
                href="mailto:?subject=Fundir%20access%20request&body=I%27m%20trying%20to%20access%20Fundir%20with%20"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white font-semibold rounded-md text-[13px] hover:bg-accent-hover transition-colors"
              >
                Email your admin
              </Link>
              <SignOutButton
                className="w-full text-center px-4 py-2 text-[12px] text-secondary hover:text-primary transition-colors font-medium"
              >
                Sign out and try a different account
              </SignOutButton>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-hairline bg-elevated">
            <p className="font-mono text-[10.5px] text-tertiary tabular-nums">
              No CYC data is visible from this account.
            </p>
          </div>
        </div>

        <p className="text-center text-[12px] text-tertiary mt-6">
          Already on the roster?{' '}
          <Link href="/dashboard" className="text-accent hover:underline">
            Reload the dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
