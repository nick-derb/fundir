export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { MatchResult } from '@/types';
import { redirect } from 'next/navigation';
import { getValidUserToken } from '@/lib/oauth-tokens';
import { getUpcomingEvents, type CalendarEvent } from '@/lib/microsoft-graph';
import { getGoogleUpcomingEvents } from '@/lib/google-calendar';
import { DashboardView, type DashKpi, type DeadlineRow, type GoalVM } from '@/components/dashboard/dashboard-view';

const FY_MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
// Calendar month index (0=Jan) → fiscal-year position (0=Jul).
const fyIndex = (m: number) => (m - 6 + 12) % 12;

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const db = createServerClient();
  const [matchesRes, orgRes, goalsRes] = await Promise.all([
    db.from('match_results')
      .select('*, grant:grant_opportunities(*)')
      .eq('org_id', ctx.orgId)
      .order('composite_score', { ascending: false }),
    db.from('organizations').select('name, ein').eq('org_code', ctx.orgCode).single(),
    db.from('org_goals').select('id, label, current, target, unit').eq('org_id', ctx.orgId).order('sort'),
  ]);

  const matches = (matchesRes.data || []) as MatchResult[];
  const org = orgRes.data;
  const now = Date.now();

  // ── Activity — from pipeline stages + created_at ─────────────────────────
  const stageOf = (m: MatchResult) => (m.pipeline_stage || '').toLowerCase();
  const awarded  = matches.filter(m => stageOf(m) === 'awarded').length;
  const awaiting = matches.filter(m => stageOf(m) === 'submitted').length;
  const rejected = matches.filter(m => stageOf(m) === 'rejected').length;
  const submitted = awarded + awaiting + rejected;

  const monthly = new Array(12).fill(0) as number[];
  for (const m of matches) {
    const created = (m as unknown as { created_at?: string }).created_at;
    if (!created) continue;
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) monthly[fyIndex(d.getMonth())] += 1;
  }

  const kpis: DashKpi[] = [
    { label: 'Submitted', value: submitted, delta: null },
    { label: 'Awarded', value: awarded, delta: awarded > 0 ? `+${awarded}` : null, accent: true },
    { label: 'Awaiting decision', value: awaiting, delta: null },
  ];

  // ── Next deadlines — upcoming grant close-dates ──────────────────────────
  const deadlines: DeadlineRow[] = matches
    .filter(m => {
      if (!m.grant?.close_date) return false;
      const days = Math.ceil((new Date(m.grant.close_date).getTime() - now) / 86400000);
      return days >= 0 && !['rejected', 'awarded'].includes(stageOf(m));
    })
    .sort((a, b) => new Date(a.grant!.close_date!).getTime() - new Date(b.grant!.close_date!).getTime())
    .slice(0, 6)
    .map(m => {
      const days = Math.max(0, Math.ceil((new Date(m.grant!.close_date!).getTime() - now) / 86400000));
      const st = stageOf(m);
      return {
        funder: m.grant?.agency_name || m.grant?.title || '—',
        title:  m.grant?.title || '',
        due:    new Date(m.grant!.close_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        days,
        stage:  st === 'submitted' ? 'Submitted'
              : st === 'reviewing' || st === 'review' ? 'Drafting'
              : st === 'interested' ? 'Queued'
              : 'Tracking',
        href:   `/grant/${m.grant_id}`,
      };
    });

  // ── Goals ────────────────────────────────────────────────────────────────
  const goals: GoalVM[] = (goalsRes.data || []).map(g => {
    const cur = Number(g.current) || 0, tgt = Number(g.target) || 0;
    const pct = Math.max(0, Math.min(100, tgt ? (cur / tgt) * 100 : 0));
    const readout = g.unit === 'percent' ? `${Math.round(cur)}%`
      : g.unit === 'currency' ? `${fmtMoney(cur)} of ${fmtMoney(tgt)}`
      : `${cur} of ${tgt}`;
    return { id: g.id, label: g.label, current: cur, target: tgt, unit: g.unit, pct, readout };
  });

  // ── Calendar — the signed-in user's own Microsoft and/or Google calendar ──
  let calendarConnected = false;
  const events: CalendarEvent[] = [];
  const msToken = await getValidUserToken(ctx.userId, 'microsoft');
  if (msToken) {
    calendarConnected = true;
    try { events.push(...await getUpcomingEvents(msToken, 8)); } catch { /* skip */ }
  }
  const gToken = await getValidUserToken(ctx.userId, 'google');
  if (gToken) {
    calendarConnected = true;
    try { events.push(...await getGoogleUpcomingEvents(gToken, 8)); } catch { /* skip */ }
  }
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const nowD = new Date();
  const hour = nowD.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = nowD.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const isCyc = ctx.orgCode?.toUpperCase().startsWith('CYC') ?? false;

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      <DashboardView
        orgName={org?.name ?? ctx.orgName}
        greeting={greeting}
        today={today}
        isCyc={isCyc}
        kpis={kpis}
        monthly={monthly}
        months={FY_MONTHS}
        deadlines={deadlines}
        goals={goals}
        calendarConnected={calendarConnected}
        events={events}
      />
    </AppShell>
  );
}
