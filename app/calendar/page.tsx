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

      {/* ── Hero — light surface, hairline bottom ── */}
      <div className="bg-surface border-b border-hairline">
        <div className="relative px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6 mb-7">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-accent" />
                <span className="text-[11px] font-bold text-accent uppercase tracking-widest">Deadline Tracker</span>
              </div>
              <h1 className="text-[26px] font-bold text-primary leading-tight">Grant Calendar</h1>
              <p className="text-tertiary text-[13px] mt-1">
                {grants.length} grants with deadlines tracked · {ctx.orgName}
              </p>
            </div>
            <Link href="/discover"
              className="flex items-center gap-1.5 text-[12px] font-semibold text-primary bg-elevated hover:bg-elevated border border-hairline px-3 py-1.5 rounded-lg transition-all">
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
                accent: 'var(--accent)',
                icon: CalendarDays,
                bar: 100,
              },
              {
                label: 'Due This Month',
                value: String(thisMonth.length),
                sub: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
                accent: 'var(--info)',
                icon: Clock,
                bar: grants.length > 0 ? (thisMonth.length / grants.length) * 100 : 0,
              },
              {
                label: 'Urgent (≤14 days)',
                value: String(urgent.length),
                sub: urgent.length > 0 ? 'action required' : 'none critical',
                accent: urgent.length > 0 ? 'var(--critical)' : 'var(--success)',
                icon: Flame,
                bar: grants.length > 0 ? (urgent.length / grants.length) * 100 : 0,
              },
              {
                label: 'High-Match',
                value: String(highMatch),
                sub: 'composite score ≥70',
                accent: 'var(--success)',
                icon: CheckCircle,
                bar: grants.length > 0 ? (highMatch / grants.length) * 100 : 0,
              },
            ].map(({ label, value, sub, accent, icon: Icon, bar }) => (
              <div key={label} className="rounded-[10px] border p-4"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-tertiary uppercase tracking-wide">{label}</span>
                  <div
                    className="w-6 h-6 rounded-[5px] flex items-center justify-center"
                    style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)` }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                  </div>
                </div>
                <div className="font-mono text-[26px] font-bold leading-none mb-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</div>
                <p className="text-[11px] text-secondary mb-3">{sub}</p>
                <div className="h-1 rounded-full overflow-hidden bg-ink-100">
                  <div className="h-full rounded-full" style={{ width: `${bar}%`, background: accent }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar Body ── */}
      <div className="px-8 py-6 max-w-7xl mx-auto">
        {grants.length === 0 ? (
          <div className="bg-surface rounded-xl border border-dashed border-hairline p-16 text-center">
            <CalendarDays className="w-10 h-10 text-tertiary mx-auto mb-4" />
            <h3 className="text-[16px] font-semibold text-primary mb-2">No deadlines yet</h3>
            <p className="text-[13px] text-secondary mb-6 max-w-sm mx-auto">
              Run grant discovery to start tracking deadlines. Grants with close dates will appear here.
            </p>
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover transition-colors"
            >
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
