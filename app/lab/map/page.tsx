// Design lab — the relationship map on specimen data. Never served in production.

import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { LabMap } from '@/components/lab-map';
import { LAB_ORG } from '@/lib/lab-fixtures';

export const dynamic = 'force-static';

export default function LabMapPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <AppShell orgName={LAB_ORG.name} orgId="lab" userEmail="elle@example.org" userName="Elle Lapsen" userRole="member" currentOrgCode={LAB_ORG.code}>
      <LabMap />
    </AppShell>
  );
}
