// Design lab — the dashboard as a CYC member sees it, hero included. Never served in production.

import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { LAB_BRIEF, LAB_DASH } from '@/lib/lab-fixtures';

export const dynamic = 'force-static';

export default function LabCycPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <AppShell orgName="Chicago Youth Centers" orgId="lab" userEmail="elle@example.org" userName="Elle Lapsen" userRole="member" currentOrgCode="CYC2026">
      <DashboardView data={{ ...LAB_DASH, isCyc: true }} brief={LAB_BRIEF} />
    </AppShell>
  );
}
