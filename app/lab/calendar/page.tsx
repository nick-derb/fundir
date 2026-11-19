// Design lab — Calendar on specimen data. Never served in production.

import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { CalendarView } from '@/components/calendar/calendar-view';
import { labCalendar, LAB_ORG } from '@/lib/lab-fixtures';

export const dynamic = 'force-dynamic';

export default function LabCalendarPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <AppShell orgName={LAB_ORG.name} orgId="lab" userEmail="elle@example.org" userName="Elle Lapsen" userRole="member" currentOrgCode={LAB_ORG.code}>
      <CalendarView data={labCalendar()} />
    </AppShell>
  );
}
