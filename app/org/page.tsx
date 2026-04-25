export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { OrgProfileEditor } from '@/components/org-profile-editor';
import { getOrgProfile } from '@/actions/org-profile';
import { Building2 } from 'lucide-react';

const ORG_CODE = 'CYC2025';

async function getUserEmail(): Promise<string> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? '';
}

async function getFy990(): Promise<number | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('financial_year')
    .eq('org_code', ORG_CODE)
    .single();
  return data?.financial_year ?? null;
}

export default async function OrgProfilePage() {
  const [profileData, userEmail, fy990] = await Promise.all([
    getOrgProfile(ORG_CODE),
    getUserEmail(),
    getFy990(),
  ]);

  // getOrgProfile always returns a default profile merged with DB data
  // If org not found, show a minimal fallback — should not happen in production
  if (!profileData) {
    return (
      <AppShell>
        <div className="px-8 py-6">
          <p className="text-[13px] text-red-600">Organization not found. Contact your administrator.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell userEmail={userEmail}>
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
          orgCode={ORG_CODE}
          orgName={profileData.name}
          ein={profileData.ein}
          profile={profileData.profile}
          updatedAt={profileData.updatedAt}
          updatedBy={profileData.updatedBy}
          userEmail={userEmail}
          fy990={fy990}
        />
      </div>
    </AppShell>
  );
}
