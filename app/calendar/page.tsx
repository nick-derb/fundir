export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { getValidUserToken } from '@/lib/oauth-tokens';
import { getUpcomingEvents, type CalendarEvent } from '@/lib/microsoft-graph';
import { getGoogleUpcomingEvents } from '@/lib/google-calendar';
import { CalendarView, type CalData } from '@/components/calendar/calendar-view';

// Instrumentl status → whether the row is still "live" (non-terminal). Terminal
// states (awarded / declined / abandoned) drop out of deadline tracking.
const LIVE = new Set([
  'application in progress', 'loi in progress',
  'application submitted', 'loi submitted', 'planned', 'researching',
]);

interface Sub {
  status: string | null; funder_name: string | null; opportunity_name: string | null;
  loi_deadline: string | null; preproposal_deadline: string | null; fullproposal_deadline: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default async function CalendarPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const db = createServerClient();

  const { data: subsData } = await db
    .from('cyc_grant_submissions')
    .select('status, funder_name, opportunity_name, loi_deadline, preproposal_deadline, fullproposal_deadline')
    .eq('org_id', ctx.orgId);
  const subs = (subsData ?? []) as Sub[];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const st = (s: string | null) => (s || '').trim().toLowerCase();

  // ── Grant deadlines → calendar events + the rail list ───────────────────
  const DL: Array<[keyof Sub, string]> = [
    ['loi_deadline', 'LOI'],
    ['preproposal_deadline', 'Pre-proposal'],
    ['fullproposal_deadline', 'Full proposal'],
  ];
  const deadlineEvents: CalData['events'] = [];
  interface DR { date: Date; funder: string; type: string }
  const railRows: DR[] = [];
  for (const s of subs) {
    if (!LIVE.has(st(s.status))) continue;
    const funder = s.funder_name || s.opportunity_name || '—';
    let earliest: DR | null = null;
    for (const [col, type] of DL) {
      const raw = s[col] as string | null;
      if (!raw) continue;
      const d = new Date(raw + 'T00:00:00');
      if (Number.isNaN(d.getTime())) continue;
      // Every future deadline lands on the grid…
      if (d >= today) {
        deadlineEvents.push({ date: dateKey(d), title: funder, time: `${type} due`, kind: 'grant' });
        if (!earliest || d < earliest.date) earliest = { date: d, funder, type };
      }
    }
    // …but the rail shows one row per opportunity (its earliest upcoming date).
    if (earliest) railRows.push(earliest);
  }
  railRows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const deadlines = railRows.slice(0, 6).map((r, i) => ({
    d: r.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    label: `${r.funder} · ${r.type}`,
    isNext: i === 0,
  }));

  // ── The user's own Microsoft / Google events (75-day window) ────────────
  let calendarConnected = false;
  const rawEvents: CalendarEvent[] = [];
  const msToken = await getValidUserToken(ctx.userId, 'microsoft');
  if (msToken) { calendarConnected = true; try { rawEvents.push(...await getUpcomingEvents(msToken, 75)); } catch { /* skip */ } }
  const gToken = await getValidUserToken(ctx.userId, 'google');
  if (gToken) { calendarConnected = true; try { rawEvents.push(...await getGoogleUpcomingEvents(gToken, 75)); } catch { /* skip */ } }

  const kindOf = (subject: string) => {
    const s = subject.toLowerCase();
    if (/loi|proposal|deadline|grant|report|due/.test(s)) return 'grant' as const;
    if (/funder|foundation|call|debrief|donor/.test(s)) return 'funder' as const;
    if (/site|visit|tour/.test(s)) return 'site' as const;
    return 'internal' as const;
  };
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const calEvents: CalData['events'] = rawEvents.map(e => {
    const d = new Date(e.start);
    return {
      date: Number.isNaN(d.getTime()) ? '' : dateKey(d),
      title: e.subject,
      time: e.isAllDay ? 'All day' : fmtTime(e.start),
      kind: kindOf(e.subject),
    };
  }).filter(e => e.date);

  const events = [...calEvents, ...deadlineEvents];

  // ── Today's timeline (rail) ─────────────────────────────────────────────
  const todayEvents = rawEvents
    .filter(e => { const d = new Date(e.start); return !Number.isNaN(d.getTime()) && dateKey(d) === dateKey(today); })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 6)
    .map(e => ({
      time: e.isAllDay ? 'All' : fmtTime(e.start),
      title: e.subject,
      meta: e.location || (e.online ? 'Online' : ''),
      dot: (e.online ? 'on' : 'off') as 'on' | 'off',
    }));

  // ── Calendars source list (honest counts) ───────────────────────────────
  const sources = [
    { key: 'me', label: 'My calendar', count: calEvents.length },
    { key: 'deadline', label: 'Grant deadlines', count: deadlineEvents.length },
  ];

  const data: CalData = {
    todayISO: dateKey(today),
    events,
    todayEvents,
    sources,
    deadlines,
    calendarConnected,
    orgCode: ctx.orgCode ?? '',
  };

  return (
    <AppShell
      orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email}
      userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}
    >
      <CalendarView data={data} />
    </AppShell>
  );
}
