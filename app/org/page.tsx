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
      <div className="px-8 py-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-[#0d9488]" />
              <h1 className="text-[22px] font-bold text-[#0f172a]">Organization Profile</h1>
            </div>
            <p className="text-[13px] text-[#64748b]">
              {profileData.name} · Self-reported data to supplement IRS 990 filings
            </p>
          </div>
          {profileData.updatedAt && (
            <div className="text-right">
              <p className="text-[11px] text-[#94a3b8]">Last updated</p>
              <p className="text-[12px] font-medium text-[#475569]">
                {new Date(profileData.updatedAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </p>
              {profileData.updatedBy && (
                <p className="text-[11px] text-[#94a3b8]">{profileData.updatedBy}</p>
              )}
            </div>
          )}
        </div>

        {/* Sub-page nav: peers + funder relationships */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <Link href="/org/peers" className="group bg-canvas-1 rounded-lg shadow-flat p-4 hover:shadow-lift transition-shadow">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-sm bg-action-soft text-action flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-body font-semibold text-ink-0">Peer organizations</h3>
                  <ArrowUpRight className="w-3.5 h-3.5 text-ink-2 group-hover:text-action transition-colors" />
                </div>
                <p className="text-caption text-ink-2 mt-0.5">
                  Edit which orgs are similar to {profileData.name}. Drives funder-prospect ranking.
                </p>
              </div>
            </div>
          </Link>
          <Link href="/org/relationships" className="group bg-canvas-1 rounded-lg shadow-flat p-4 hover:shadow-lift transition-shadow">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-sm bg-action-soft text-action flex items-center justify-center shrink-0">
                <Landmark className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-body font-semibold text-ink-0">Funder relationships</h3>
                  <ArrowUpRight className="w-3.5 h-3.5 text-ink-2 group-hover:text-action transition-colors" />
                </div>
                <p className="text-caption text-ink-2 mt-0.5">
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
    </AppShell>
  );
}
