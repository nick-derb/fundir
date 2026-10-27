// Specimen data for the /lab route: a fictional tenant with fictional people
// and funders, shaped exactly like the real read models so the new screens
// can be rendered and photographed without a database. Nothing here is
// real; names are invented.

import type { Brief } from '@/lib/brief';
import type { DashData } from '@/components/dashboard/dashboard-view';
import type { GraphPayload } from '@/lib/network/queries';

export const LAB_ORG = { name: 'Northside Youth Collaborative', code: 'NYC2026' };

const d = (daysFromNow: number) => { const x = new Date(); x.setDate(x.getDate() + daysFromNow); return x; };
const iso = (daysFromNow: number, hour = 9) => { const x = d(daysFromNow); x.setHours(hour, 0, 0, 0); return x.toISOString(); };
const ymd = (daysFromNow: number) => d(daysFromNow).toISOString().slice(0, 10);
const fmt = (daysFromNow: number) => d(daysFromNow).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const LAB_DASH: DashData = {
  greeting: 'Good morning', firstName: 'Elle', isCyc: false,
  today: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  kpis: [
    { label: 'Submitted', value: '38', sub: '14 awarded · 9 declined', icon: 'send' },
    { label: 'Awarded', value: '14', sub: '$1.2M secured', icon: 'check-circle-2', accent: true },
    { label: 'Awaiting decision', value: '7', sub: 'submitted, pending', icon: 'hourglass' },
    { label: 'In pipeline', value: '19', sub: '6 researching · 8 planned', icon: 'radar' },
  ],
  monthly: [2, 4, 3, 6, 5, 2, 3, 7, 4, 3, 2, 1], months: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], liveIdx: 4,
  deadlines: [
    { funder: 'Polk Bros. Foundation', type: 'Letter of inquiry', due: fmt(3), days: 3, stage: 'Drafting', tone: 'accent' },
    { funder: 'Crown Family Philanthropies', type: 'Full proposal', due: fmt(9), days: 9, stage: 'Drafting', tone: 'accent' },
    { funder: 'Field Foundation', type: 'Pre-proposal', due: fmt(16), days: 16, stage: 'Queued', tone: 'neutral' },
    { funder: 'McCormick Foundation', type: 'Full proposal', due: fmt(27), days: 27, stage: 'Researching', tone: 'info' },
    { funder: 'Joyce Foundation', type: 'Letter of inquiry', due: fmt(41), days: 41, stage: 'Queued', tone: 'neutral' },
  ],
  goals: [
    { id: 'g1', label: 'Foundation revenue', current: 1_240_000, target: 2_100_000, unit: 'currency', pct: 59, readout: '$1.24M of $2.1M' },
    { id: 'g2', label: 'New funders this year', current: 6, target: 10, unit: 'count', pct: 60, readout: '6 of 10' },
    { id: 'g3', label: 'Proposals submitted', current: 38, target: 48, unit: 'count', pct: 79, readout: '38 of 48' },
  ],
  week: Array.from({ length: 7 }, (_, i) => { const x = new Date(); const mon = new Date(x); mon.setDate(x.getDate() - ((x.getDay() + 6) % 7) + i); return {
    n: mon.getDate(), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][mon.getDay()], isToday: mon.toDateString() === x.toDateString(),
    events: i === 1 ? [{ title: 'Polk Bros. LOI review', time: '10:00', kind: 'grant' }] : i === 3 ? [{ title: 'Call with M. Hartigan', time: '14:30', kind: 'funder' }, { title: 'Board prep', time: '16:00', kind: 'internal' }] : i === 4 ? [{ title: 'Site visit · Uptown', time: '09:30', kind: 'site' }] : [],
  }; }),
  todayEvents: [{ time: '10:00', title: 'Polk Bros. LOI review', meta: 'Room 2', dot: 'off' }, { time: '14:30', title: 'Call with M. Hartigan', meta: 'Online', dot: 'on' }],
  needs: [], calendarConnected: true,
};

const L = (id: string) => `/connections?tab=discover&lead=${id}`;
export const LAB_BRIEF: Brief = {
  windowStart: iso(-7), seenAt: iso(-3, 17),
  stats: { newPaths: 3, newInsights: 2, refreshes: 4, relationshipsFound: 612, profilesRead: 41, dueSoon: 2, followUps: 3, asksReady: 11 },
  signals: [
    { id: 'lead:1', kind: 'path', tone: 'accent', at: iso(-1, 6), isNew: true, title: 'New path to Polk Bros. Foundation', detail: 'M. Hartigan sat on the Crown Family board with L. Marsh from 2019 to 2022; Marsh now chairs the Polk Bros. grants committee, which funds three of your peers in youth development.', evidence: 'via M. Hartigan (Board chair) · Crown Family board · score 74 · high confidence', href: L('1'), cta: 'Open lead', score: 74 },
    { id: 'lead:2', kind: 'path', tone: 'accent', at: iso(-1, 6), isNew: true, title: 'New path to Field Foundation', detail: 'J. Lindqvist and program officer A. Delgado were colleagues at the Economic Club of Chicago; Field has no open application and funds two of your peers.', evidence: 'via J. Lindqvist (Treasurer) · Economic Club of Chicago · score 61 · medium confidence', href: L('2'), cta: 'Open lead', score: 61 },
    { id: 'filing:1', kind: 'filing', tone: 'info', at: iso(-2, 3), isNew: true, title: 'New filing read for Crown Family Philanthropies', detail: '41 grants added from the 2025 990-PF, $9.6M in total. Median grant to youth organizations rose to $120,000.', evidence: 'IRS 990-PF · filed May 2026', href: L('3'), cta: 'Open lead', score: null },
    { id: 'insight:1', kind: 'insight', tone: 'warning', at: iso(-2, 7), isNew: true, title: 'Joyce Foundation funds four of your peers and not you', detail: 'Education-focus grants to Uptown Youth, Lakeview Collective, Southside Scholars and Westside Futures in the last two filings. No board path yet; the 2025 filing shows room.', evidence: 'Untapped funder · medium confidence', href: L('5'), cta: 'Open lead', score: 47 },
    { id: 'lead:4', kind: 'path', tone: 'accent', at: iso(-3, 6), isNew: true, title: 'New path to McCormick Foundation', detail: 'Board member R. Okafor shares a former employer with trustee D. Keane (Northern Trust, 2014 to 2018).', evidence: 'via R. Okafor · Northern Trust · score 68 · high confidence', href: L('4'), cta: 'Open lead', score: 68 },
    { id: 'refresh', kind: 'refresh', tone: 'slate', at: iso(-1, 5), isNew: true, title: '4 network refreshes ran this week', detail: 'Together they read 41 profiles, found 612 relationships, 3 new leads, scanned 9 companies.', evidence: null, href: '/connections?tab=network', cta: 'See the network', score: null },
    { id: 'deadline:1', kind: 'deadline', tone: 'critical', at: ymd(3), isNew: false, title: 'Letter of inquiry for Polk Bros. Foundation due in 3 days', detail: `Drafting · ${d(3).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`, evidence: null, href: '/calendar', cta: 'Open calendar', score: null },
    { id: 'follow:6', kind: 'follow_up', tone: 'warning', at: ymd(1), isNew: false, title: 'Send the FY25 outcomes summary to S. Whitfield (tomorrow)', detail: 'Field Foundation · Meeting', evidence: null, href: L('6'), cta: 'Open lead', score: 55 },
    { id: 'deadline:2', kind: 'deadline', tone: 'warning', at: ymd(9), isNew: false, title: 'Full proposal for Crown Family Philanthropies due in 9 days', detail: `Drafting · ${d(9).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`, evidence: null, href: '/calendar', cta: 'Open calendar', score: null },
    { id: 'insight:2', kind: 'insight', tone: 'slate', at: iso(-5, 7), isNew: false, title: 'Three funders on your list share a trustee', detail: 'P. Brennan sits on the Steans, Polk Bros. and Lloyd A. Fry boards. One conversation covers three asks.', evidence: 'Funder cluster · high confidence', href: '/connections?tab=map&focus=person:p9', cta: 'See on map', score: 58 },
  ],
  asks: [
    { personId: 'p1', name: 'M. Hartigan', role: 'Board chair', total: 142, targets: [{ leadId: '1', name: 'Polk Bros. Foundation', score: 74, status: 'INTRODUCTION_NEEDED', viaOrg: 'Crown Family board' }, { leadId: '7', name: 'Steans Family Foundation', score: 68, status: 'NEW', viaOrg: 'Crown Family board' }] },
    { personId: 'p3', name: 'R. Okafor', role: 'Director', total: 68, targets: [{ leadId: '4', name: 'McCormick Foundation', score: 68, status: 'NEW', viaOrg: 'Northern Trust' }] },
    { personId: 'p2', name: 'J. Lindqvist', role: 'Treasurer', total: 61, targets: [{ leadId: '2', name: 'Field Foundation', score: 61, status: 'INTRODUCTION_NEEDED', viaOrg: 'Economic Club of Chicago' }] },
  ],
  todos: [
    { id: 'dl:1', kind: 'deadline', text: 'Letter of inquiry: Polk Bros. Foundation', sub: 'Drafting', href: '/calendar', days: 3, tone: 'critical' },
    { id: 'fu:6', kind: 'follow_up', text: 'Send the FY25 outcomes summary to S. Whitfield', sub: 'Field Foundation · elle', href: L('6'), days: 1, tone: 'warning' },
    { id: 'stale:8', kind: 'stale', text: 'Nudge Crown Family Philanthropies', sub: 'Intro requested 19 days ago, nothing since', href: L('8'), days: null, tone: 'warning' },
    { id: 'dl:2', kind: 'deadline', text: 'Full proposal: Crown Family Philanthropies', sub: 'Drafting', href: '/calendar', days: 9, tone: 'warning' },
    { id: 'ask:p1', kind: 'ask', text: 'Ask M. Hartigan about Polk Bros. Foundation', sub: 'and 1 more · score 74', href: '/connections?tab=people&person=p1', days: null, tone: 'accent' },
    { id: 'ask:p3', kind: 'ask', text: 'Ask R. Okafor about McCormick Foundation', sub: 'score 68', href: '/connections?tab=people&person=p3', days: null, tone: 'accent' },
  ],
};

const n = (id: string, kind: 'person' | 'org', label: string, sub: string | null, extra: Partial<GraphPayload['nodes'][number]> = {}) => ({ id, kind, label, sub, own: false, orgType: null, focus: false, lead_id: null, score: null, status: null, rowId: id.slice(2), ...extra });
export const LAB_GRAPH: GraphPayload = {
  mode: 'overview', focus: null,
  nodes: [
    n('o:root', 'org', 'Northside Youth Collaborative', 'your organization', { own: true, focus: true, rowId: null }),
    n('p:p1', 'person', 'M. Hartigan', 'Board chair · 2016–', { own: true }),
    n('p:p2', 'person', 'J. Lindqvist', 'Treasurer · 2019–', { own: true }),
    n('p:p3', 'person', 'R. Okafor', 'Director · 2021–', { own: true }),
    n('o:r1', 'org', 'Crown Family board', 'shared seat · 2019–22', { orgType: 'nonprofit' }),
    n('o:r2', 'org', 'Economic Club of Chicago', 'member · 2020–', { orgType: 'association' }),
    n('o:r3', 'org', 'Northern Trust', 'former employer · 2014–18', { orgType: 'corporation' }),
    n('p:t1', 'person', 'L. Marsh', 'Grants committee chair', {}),
    n('p:t2', 'person', 'A. Delgado', 'Program officer', {}),
    n('p:t3', 'person', 'D. Keane', 'Trustee', {}),
    n('o:f1', 'org', 'Polk Bros. Foundation', 'family foundation', { orgType: 'private_foundation', lead_id: '1', score: 74, status: 'INTRODUCTION_NEEDED' }),
    n('o:f2', 'org', 'Field Foundation', 'independent', { orgType: 'private_foundation', lead_id: '2', score: 61, status: 'INTRODUCTION_NEEDED' }),
    n('o:f3', 'org', 'McCormick Foundation', 'independent', { orgType: 'private_foundation', lead_id: '4', score: 68, status: 'NEW' }),
    n('o:f4', 'org', 'Steans Family Foundation', 'family foundation', { orgType: 'private_foundation', lead_id: '7', score: 68, status: 'NEW' }),
    n('o:w1', 'org', 'Joyce Foundation', 'funds 4 peers', { orgType: 'private_foundation', lead_id: '5', score: 47, status: 'NEW' }),
    n('o:w2', 'org', 'Lloyd A. Fry Foundation', 'funds 2 peers', { orgType: 'private_foundation', lead_id: '9', score: 44, status: 'NEW' }),
    n('o:w3', 'org', 'Chicago Community Trust', 'funds 6 peers', { orgType: 'community_foundation', lead_id: '10', score: 52, status: 'RESEARCHING' }),
  ],
  links: [
    { source: 'o:root', target: 'p:p1', type: 'seat', verification: 'verified', strength: 90, label: 'Board chair' },
    { source: 'o:root', target: 'p:p2', type: 'seat', verification: 'verified', strength: 85, label: 'Treasurer' },
    { source: 'o:root', target: 'p:p3', type: 'seat', verification: 'verified', strength: 80, label: 'Director' },
    { source: 'p:p1', target: 'o:r1', type: 'seat', verification: 'verified', strength: 80, label: '2019–22' },
    { source: 'p:p2', target: 'o:r2', type: 'employment', verification: 'probable', strength: 55, label: 'member' },
    { source: 'p:p3', target: 'o:r3', type: 'employment', verification: 'verified', strength: 70, label: '2014–18' },
    { source: 'o:r1', target: 'p:t1', type: 'seat', verification: 'verified', strength: 78, label: '2017–' },
    { source: 'o:r2', target: 'p:t2', type: 'employment', verification: 'probable', strength: 50, label: null },
    { source: 'o:r3', target: 'p:t3', type: 'employment', verification: 'inferred', strength: 40, label: null },
    { source: 'p:t1', target: 'o:f1', type: 'seat', verification: 'verified', strength: 88, label: 'Grants committee' },
    { source: 'p:t1', target: 'o:f4', type: 'seat', verification: 'probable', strength: 60, label: 'Trustee' },
    { source: 'p:t2', target: 'o:f2', type: 'employment', verification: 'verified', strength: 75, label: 'Program officer' },
    { source: 'p:t3', target: 'o:f3', type: 'seat', verification: 'probable', strength: 58, label: 'Trustee' },
    { source: 'o:root', target: 'o:w1', type: 'white_space', verification: 'probable', strength: 47, label: null },
    { source: 'o:root', target: 'o:w2', type: 'white_space', verification: 'probable', strength: 44, label: null },
    { source: 'o:root', target: 'o:w3', type: 'white_space', verification: 'probable', strength: 52, label: null },
  ],
};
