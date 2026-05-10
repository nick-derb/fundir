export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { DeadlineCalendar, CalendarGrant } from '@/components/deadline-calendar';
import { CalendarDays, Clock, Flame, CheckCircle, ArrowUpRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import Link from 'next/link';

async function getCalendarGrants(orgId: string): Promise<CalendarGrant[]> {
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
    .eq('org_id', orgId)
    .not('grant_opportunities.close_date', 'is', null)
    .order('grant_opportunities.close_date', { ascending: true });

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
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const grants = await getCalendarGrants(ctx.orgId);
  const now    = new Date();

  const urgent = grants.filter(g => {
    if (['rejected', 'awarded'].includes(g.pipeline_stage)) return false;
    const days = Math.ceil((new Date(g.close_date).getTime() - now.getTime()) / 86400000);
    return days >= 0 && days <= 14;
  });

  const thisMonth = grants.filter(g => {
    const d = new Date(g.close_date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const highMatch = grants.filter(g => g.composite_score >= 70).length;

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >

      {/* ── Dark Hero ── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 right-1/3 w-96 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }} />

        <div className="relative px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6 mb-7">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-[#0d9488]" />
                <span className="text-[11px] font-bold text-[#0d9488] uppercase tracking-widest">Deadline Tracker</span>
              </div>
              <h1 className="text-[26px] font-bold text-white leading-tight">Grant Calendar</h1>
              <p className="text-[#94a3b8] text-[13px] mt-1">
                {grants.length} grants with deadlines tracked · {ctx.orgName}
              </p>
            </div>
            <Link href="/discover"
              className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg transition-all">
              Run discovery
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Total with Dates',
                value: String(grants.length),
                sub: 'grants with close dates',
                accent: '#0d9488',
                icon: CalendarDays,
                bar: 100,
              },
              {
                label: 'Due This Month',
                value: String(thisMonth.length),
                sub: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
                accent: '#6366f1',
                icon: Clock,
                bar: grants.length > 0 ? (thisMonth.length / grants.length) * 100 : 0,
              },
              {
                label: 'Urgent (≤14 days)',
                value: String(urgent.length),
                sub: urgent.length > 0 ? 'action required' : 'none critical',
                accent: urgent.length > 0 ? '#f87171' : '#4ade80',
                icon: Flame,
                bar: grants.length > 0 ? (urgent.length / grants.length) * 100 : 0,
              },
              {
                label: 'High-Match',
                value: String(highMatch),
                sub: 'composite score ≥70',
                accent: '#16a34a',
                icon: CheckCircle,
                bar: grants.length > 0 ? (highMatch / grants.length) * 100 : 0,
              },
            ].map(({ label, value, sub, accent, icon: Icon, bar }) => (
              <div key={label} className="rounded-[10px] border border-white/10 p-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
                  <div className="w-6 h-6 rounded-[5px] flex items-center justify-center" style={{ background: accent + '25' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                  </div>
                </div>
                <div className="text-[26px] font-bold text-white leading-none mb-1">{value}</div>
                <p className="text-[11px] text-[#64748b] mb-3">{sub}</p>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${bar}%`, background: `linear-gradient(90deg, ${accent}, ${accent}99)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar Body ── */}
      <div className="px-8 py-6 max-w-7xl mx-auto">
        {grants.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-16 text-center">
            <CalendarDays className="w-10 h-10 text-[#e2e8f0] mx-auto mb-4" />
            <h3 className="text-[16px] font-semibold text-[#0f172a] mb-2">No deadlines yet</h3>
            <p className="text-[13px] text-[#64748b] mb-6 max-w-sm mx-auto">
              Run grant discovery to start tracking deadlines. Grants with close dates will appear here.
            </p>
            <Link href="/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-[13px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
              <CalendarDays className="w-3.5 h-3.5" />
              Run Discovery →
            </Link>
          </div>
        ) : (
          <DeadlineCalendar grants={grants} />
        )}
      </div>
    </AppShell>
  );
}
