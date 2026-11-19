// Design lab — Prospecting on specimen data. Never served in production.

import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ProspectingView } from '@/components/prospecting/prospecting-view';
import { labProspecting, LAB_ORG } from '@/lib/lab-fixtures';

export const dynamic = 'force-dynamic';

export default function LabProspectingPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const d = labProspecting();
  return (
    <AppShell orgName={LAB_ORG.name} orgId="lab" userEmail="elle@example.org" userName="Elle Lapsen" userRole="member" currentOrgCode={LAB_ORG.code}>
      <ProspectingView sheets={d.sheets} instrumentl={d.instrumentl} bmfTotal={d.bmfTotal} rowLimit={500} canReplace={false} />
    </AppShell>
  );
}
