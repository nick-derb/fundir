export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { OrgProfileEditor } from '@/components/org-profile-editor';
import { getOrgProfile } from '@/actions/org-profile';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';

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
