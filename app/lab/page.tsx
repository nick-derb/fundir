// Design lab — the new screens rendered on specimen data, so they can be
// reviewed without signing in. Never served in production.

import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { labBrief, labDash, LAB_ORG } from '@/lib/lab-fixtures';

export const dynamic = 'force-dynamic';

export default function LabTodayPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <AppShell orgName={LAB_ORG.name} orgId="lab" userEmail="elle@example.org" userName="Elle Lapsen" userRole="member" currentOrgCode={LAB_ORG.code}>
      <DashboardView data={labDash()} brief={labBrief()} trackSeen={false} />
    </AppShell>
  );
}
