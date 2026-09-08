export const dynamic = 'force-dynamic';

// CYC Data Hub — the org's data surface, ported to the Claude Design "Data hub"
// template. Documents and metrics live in a shared OneDrive folder + workbook,
// so one person's entry is everyone's entry (here, in Excel, and in Teams).
// Uploaded documents are read into the advisor's knowledge base on arrival —
// see lib/cyc-context/documents.ts.

import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { DataHubView } from '@/components/data-hub-view';
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
      <DataHubView orgName={ctx.orgName} userEmail={ctx.email} />
    </AppShell>
  );
}
