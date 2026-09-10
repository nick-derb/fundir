export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ReportsIntelView } from '@/components/reports-intel';
import { buildReportsIntel } from '@/lib/network/reports';

// Reports: the measures only Fundir has (network reach, white space, evidence
// quality, board coverage, pipeline velocity, refresh ledger). The previous
// chart page re-plotted Instrumentl's own data; its one useful card (grant
// applications) survives, and only when the org has that history.
export default async function ReportsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const data = await buildReportsIntel(createServerClient(), ctx.orgId);
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ReportsIntelView data={data} orgName={ctx.orgName} />
    </AppShell>
  );
}
