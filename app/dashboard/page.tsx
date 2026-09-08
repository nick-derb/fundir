export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { getValidUserToken } from '@/lib/oauth-tokens';
import { getUpcomingEvents, type CalendarEvent } from '@/lib/microsoft-graph';
import { getGoogleUpcomingEvents } from '@/lib/google-calendar';
import { DashboardView, type DashData } from '@/components/dashboard/dashboard-view';

const FY_MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const fyIndex = (m: number) => (m - 6 + 12) % 12;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

// Instrumentl status → dashboard stage + StatusTag tone. Terminal states
// (awarded / declined / abandoned) are excluded from the "next deadlines" work list.
const STAGE: Record<string, { label: string; tone: 'accent' | 'neutral' | 'info' | 'warning' } | null> = {
  'application in progress': { label: 'Drafting', tone: 'accent' },
  'loi in progress': { label: 'Drafting', tone: 'accent' },
  'application submitted': { label: 'Submitted', tone: 'neutral' },
  'loi submitted': { label: 'Submitted', tone: 'neutral' },
  'planned': { label: 'Queued', tone: 'neutral' },
  'researching': { label: 'Researching', tone: 'info' },
};

interface Sub {
  status: string | null; funder_name: string | null; opportunity_name: string | null;
  loi_deadline: string | null; preproposal_deadline: string | null; fullproposal_deadline: string | null;
  amount_awarded: number | null;
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const db = createServerClient();

  const [subsRes, goalsRes] = await Promise.all([
    db.from('cyc_grant_submissions')
      .select('status, funder_name, opportunity_name, loi_deadline, preproposal_deadline, fullproposal_deadline, amount_awarded')
      .eq('org_id', ctx.orgId),
    db.from('org_goals').select('id, label, current, target, unit').eq('org_id', ctx.orgId).order('sort'),
  ]);
  const subs = (subsRes.data ?? []) as Sub[];

  // ── KPIs from real status counts ────────────────────────────────────────
  const st = (s: string) => (s || '').trim().toLowerCase();
  const n = (pred: (s: string) => boolean) => subs.filter(x => pred(st(x.status ?? ''))).length;
  const appSubmitted = n(s => s === 'application submitted');
  const loiSubmitted = n(s => s === 'loi submitted');
  const awarded = n(s => s.startsWith('awarded'));
  const declined = n(s => s === 'declined');
  const inProgress = n(s => s.includes('in progress'));
  const planned = n(s => s === 'planned');
  const researching = n(s => s === 'researching');
  const submittedTotal = appSubmitted + loiSubmitted + awarded + declined;
  const awaiting = appSubmitted + loiSubmitted;
  const pipeline = researching + planned + inProgress;
  const awardedAmt = subs.filter(x => st(x.status ?? '').startsWith('awarded'))
    .reduce((a, x) => a + (Number(x.amount_awarded) || 0), 0);

  const kpis = [
    { label: 'Submitted', value: String(submittedTotal), sub: `${awarded} awarded · ${declined} declined`, icon: 'send' },
    { label: 'Awarded', value: String(awarded), sub: awardedAmt ? `${money(awardedAmt)} secured` : 'this year', icon: 'check-circle-2', accent: true },
    { label: 'Awaiting decision', value: String(awaiting), sub: 'submitted, pending', icon: 'hourglass' },
    { label: 'In pipeline', value: String(pipeline), sub: `${researching} researching · ${planned} planned`, icon: 'radar' },
  ];

  // ── Next deadlines — earliest upcoming per opportunity, non-terminal ─────
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const DL: Array<[keyof Sub, string]> = [
    ['loi_deadline', 'Letter of inquiry'],
    ['preproposal_deadline', 'Pre-proposal'],
    ['fullproposal_deadline', 'Full proposal'],
  ];
  interface Row { funder: string; type: string; date: Date; due: string; days: number; stage: string; tone: 'accent' | 'neutral' | 'info' | 'warning' }
  const deadlineRows: Row[] = [];
  for (const s of subs) {
    const stage = STAGE[st(s.status ?? '')];
    if (!stage) continue; // terminal / unknown → skip
    let best: { date: Date; type: string } | null = null;
    for (const [col, type] of DL) {
      const raw = s[col] as string | null;
      if (!raw) continue;
      const d = new Date(raw + 'T00:00:00');
      if (Number.isNaN(d.getTime()) || d < now) continue;
      if (!best || d < best.date) best = { date: d, type };
    }
    if (!best) continue;
    deadlineRows.push({
      funder: s.funder_name || s.opportunity_name || '—',
      type: best.type,
      date: best.date,
      due: best.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      days: Math.max(0, Math.ceil((best.date.getTime() - now.getTime()) / 86400000)),
      stage: stage.label, tone: stage.tone,
    });
  }
  deadlineRows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const deadlines = deadlineRows.slice(0, 8).map(({ funder, type, due, days, stage, tone }) => ({ funder, type, due, days, stage, tone }));

  // ── Activity — upcoming deadline load by fiscal month ───────────────────
  const monthly = new Array(12).fill(0) as number[];
  for (const r of deadlineRows) monthly[fyIndex(r.date.getMonth())] += 1;
  const liveIdx = fyIndex(new Date().getMonth()) + 1;

  // ── Goals (editable, from org_goals) ────────────────────────────────────
  const goals = (goalsRes.data ?? []).map(g => {
    const cur = Number(g.current) || 0, tgt = Number(g.target) || 0;
    const pct = Math.max(0, Math.min(100, tgt ? (cur / tgt) * 100 : 0));
    const readout = g.unit === 'percent' ? `${Math.round(cur)}%`
      : g.unit === 'currency' ? `${money(cur)} of ${money(tgt)}` : `${cur} of ${tgt}`;
    return { id: g.id as string, label: g.label as string, current: cur, target: tgt, unit: g.unit as 'percent' | 'count' | 'currency', pct, readout };
  });

  // ── Needs a decision — real counts ──────────────────────────────────────
  const needs = [
    { icon: 'file-edit', text: `${inProgress} application${inProgress === 1 ? '' : 's'} in progress to finish` },
    { icon: 'send', text: `${awaiting} submitted, awaiting a funder decision` },
    { icon: 'radar', text: `${planned} planned opportunit${planned === 1 ? 'y' : 'ies'} to launch` },
  ].filter(x => !/^0 /.test(x.text));

  // ── Calendar — the user's own Microsoft/Google events ───────────────────
  let calendarConnected = false;
  const events: CalendarEvent[] = [];
  const msToken = await getValidUserToken(ctx.userId, 'microsoft');
  if (msToken) { calendarConnected = true; try { events.push(...await getUpcomingEvents(msToken, 8)); } catch { /* skip */ } }
  const gToken = await getValidUserToken(ctx.userId, 'google');
  if (gToken) { calendarConnected = true; try { events.push(...await getGoogleUpcomingEvents(gToken, 8)); } catch { /* skip */ } }

  // This-week grid (Mon–Sun containing today) + today's timeline.
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const monday = new Date(todayD); monday.setDate(todayD.getDate() - ((todayD.getDay() + 6) % 7));
  const kindOf = (subject: string) => {
    const s = subject.toLowerCase();
    if (/loi|proposal|deadline|grant|report|due/.test(s)) return 'grant';
    if (/funder|foundation|call|debrief/.test(s)) return 'funder';
    if (/site|visit/.test(s)) return 'site';
    return 'internal';
  };
  const fmtTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dayEvents = events.filter(e => { const ed = new Date(e.start); return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate(); })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 2)
      .map(e => ({ title: e.subject, time: e.isAllDay ? 'All day' : fmtTime(e.start), kind: kindOf(e.subject) }));
    return { n: d.getDate(), dow: DOW[d.getDay()], isToday: d.getTime() === todayD.getTime(), events: dayEvents };
  });
  const todayEvents = events
    .filter(e => { const ed = new Date(e.start); return ed.getFullYear() === todayD.getFullYear() && ed.getMonth() === todayD.getMonth() && ed.getDate() === todayD.getDate(); })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5)
    .map(e => ({ time: e.isAllDay ? 'All' : fmtTime(e.start), title: e.subject, meta: e.location || (e.online ? 'Online' : ''), dot: e.online ? 'on' : 'off' }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const data: DashData = {
    greeting, firstName: ctx.firstName || ctx.displayName || 'there', today: todayLabel,
    isCyc: ctx.orgCode?.toUpperCase().startsWith('CYC') ?? false,
    kpis, monthly, months: FY_MONTHS, liveIdx, deadlines, goals, week, todayEvents, needs,
    calendarConnected,
  };

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <DashboardView data={data} />
    </AppShell>
  );
}
