export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { OrgProfileEditor } from '@/components/org-profile-editor';
import { getOrgProfile } from '@/actions/org-profile';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, Users, Landmark, ArrowUpRight } from 'lucide-react';

async function getFy990(orgCode: string): Promise<number | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('financial_year')
    .eq('org_code', orgCode)
    .single();
  return data?.financial_year ?? null;
}

export default async function OrgProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const [profileData, fy990] = await Promise.all([
    getOrgProfile(ctx.orgCode),
    getFy990(ctx.orgCode),
  ]);

  if (!profileData) {
    return (
      <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
        <div className="px-8 py-6">
          <p className="text-[13px] text-red-600">Organization not found. Contact your administrator.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <div className="bg-page min-h-screen">

        {/* ── Header — light, operations-console eyebrow ──────────────── */}
        <div className="bg-surface border-b border-hairline">
          <div className="px-4 sm:px-6 md:px-8 py-6 max-w-5xl mx-auto flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-3.5 h-3.5 text-accent" />
                <span className="font-mono text-[10.5px] font-semibold text-accent uppercase tracking-[0.14em]">
                  Organization Profile
                </span>
              </div>
              <h1 className="text-h1 text-primary leading-tight">{profileData.name}</h1>
              <p className="text-[13px] text-secondary mt-1">
                Self-reported data to supplement IRS 990 filings
              </p>
            </div>
            {profileData.updatedAt && (
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-tertiary">Last updated</p>
                <p className="font-mono text-[12px] font-semibold text-primary tabular-nums">
                  {new Date(profileData.updatedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
                {profileData.updatedBy && (
                  <p className="text-[10.5px] text-tertiary mt-0.5 truncate max-w-[200px]">{profileData.updatedBy}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 md:px-8 py-6 max-w-5xl mx-auto space-y-4">

          {/* Sub-page nav: peers + funder relationships */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link
              href="/org/peers"
              className="group bg-surface border border-hairline rounded-[10px] p-4 hover:border-ink-300 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-accent-tint text-accent flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-primary">Peer organizations</h3>
                    <ArrowUpRight className="w-3.5 h-3.5 text-tertiary group-hover:text-accent transition-colors" />
                  </div>
                  <p className="text-[11.5px] text-secondary mt-0.5">
                    Edit which orgs are similar to {profileData.name}. Drives funder-prospect ranking.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/org/relationships"
              className="group bg-surface border border-hairline rounded-[10px] p-4 hover:border-ink-300 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-accent-tint text-accent flex items-center justify-center shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-primary">Funder relationships</h3>
                    <ArrowUpRight className="w-3.5 h-3.5 text-tertiary group-hover:text-accent transition-colors" />
                  </div>
                  <p className="text-[11.5px] text-secondary mt-0.5">
                    Tag funders as Existing / Prospect / Declined / Dormant. Renders on the CRA panel.
                  </p>
                </div>
              </div>
            </Link>
          </div>

          {/* Editor */}
          <OrgProfileEditor
            orgCode={ctx.orgCode}
            orgName={profileData.name}
            ein={profileData.ein}
            profile={profileData.profile}
            updatedAt={profileData.updatedAt}
            updatedBy={profileData.updatedBy}
            userEmail={ctx.email}
            fy990={fy990}
          />
        </div>
      </div>
    </AppShell>
  );
}
