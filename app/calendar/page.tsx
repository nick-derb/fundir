export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { DeadlineCalendar, CalendarGrant } from '@/components/deadline-calendar';
import { CalendarDays } from 'lucide-react';

async function getCalendarGrants(): Promise<CalendarGrant[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('match_results')
    .select(`
      id,
      grant_id,
      composite_score,
      pipeline_stage,
      grant:grant_opportunities(title, close_date, agency_name)
    `)
    .not('grant_opportunities.close_date', 'is', null)
    .order('grant_opportunities.close_date', { ascending: true });

  // Supabase returns joined rows as arrays; cast through unknown to handle the shape
  const rows = (data || []) as unknown as Array<{
    id: string;
    grant_id: string;
    composite_score: number;
    pipeline_stage: string;
    grant: { title: string; close_date: string; agency_name: string } | null;
  }>;

  return rows
    .filter(m => m.grant?.close_date)
    .map(m => ({
      grant_id:        m.grant_id,
      match_id:        m.id,
      title:           m.grant!.title,
      close_date:      m.grant!.close_date,
      composite_score: m.composite_score,
      pipeline_stage:  m.pipeline_stage,
      agency_name:     m.grant!.agency_name,
    }));
}

export default async function CalendarPage() {
  const grants = await getCalendarGrants();

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <CalendarDays className="w-5 h-5 text-[#0d9488]" />
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a]">Deadline Calendar</h1>
            <p className="text-[13px] text-[#64748b]">All tracked grant deadlines · {grants.length} grants with dates</p>
          </div>
        </div>
        <DeadlineCalendar grants={grants} />
      </div>
    </AppShell>
  );
}
