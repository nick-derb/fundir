export const dynamic = 'force-dynamic';

// CYC Data Hub — the org's data-collection surface. Site directors and staff
// submit metrics and documents; everything lives in a shared OneDrive
// workbook + folder, so one person's entry is everyone's entry (here, in
// Excel, and in Teams). See lib/data-hub.ts for the architecture note.

import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { DataHubHero } from '@/components/data-hub-hero';
import { DataHub } from '@/components/data-hub';
import { redirect } from 'next/navigation';

export default async function DataPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      {/* Animated header — CYC's data flowing into Fundir */}
      <DataHubHero orgName={ctx.orgName} />

      {/* The living workbook + submission form + shared documents */}
      <div className="px-6 md:px-8 py-8 max-w-7xl mx-auto">
        <DataHub userEmail={ctx.email} />
      </div>
    </AppShell>
  );
}
