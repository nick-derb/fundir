// The daily brief behind the Today page: what changed in this organization's
// funding picture since the person last looked, what is due, and which asks
// the board could make this week. Read-only; composed from tables the
// network, pipeline and calendar features already maintain, so nothing here
// needs new storage. "Since you last looked" is a browser cookie the page
// sets for itself.

import type { createServerClient } from '@/lib/supabase';
import { listLeads, listInsights, type LeadRow } from '@/lib/network/queries';

type Db = ReturnType<typeof createServerClient>;

export type SignalKind = 'path' | 'insight' | 'refresh' | 'deadline' | 'follow_up' | 'stale' | 'filing';
export type Tone = 'accent' | 'warning' | 'critical' | 'slate' | 'info';

export interface BriefSignal {
  id: string; kind: SignalKind; tone: Tone;
  /** When the thing happened (ISO). Signals sort newest first. */
  at: string;
  /** True when it happened after the person last opened the brief. */
  isNew: boolean;
  title: string; detail: string; evidence: string | null;
  href: string; cta: string; score: number | null;
}
export interface BoardAsk {
  personId: string; name: string; role: string | null;
  targets: Array<{ leadId: string; name: string; score: number; status: string; viaOrg: string | null }>;
  total: number;
}
export interface TodoItem { id: string; kind: 'deadline' | 'follow_up' | 'stale' | 'ask'; text: string; sub: string; href: string; days: number | null; tone: Tone }
export interface Brief {
  windowStart: string; seenAt: string;
  signals: BriefSignal[]; asks: BoardAsk[]; todos: TodoItem[];
  stats: { newPaths: number; newInsights: number; refreshes: number; relationshipsFound: number; profilesRead: number; dueSoon: number; followUps: number; asksReady: number };
}

export interface DeadlineInput { funder: string; type: string; date: string; days: number; stage: string }

const DAY = 86400000;
const KIND_LABEL: Record<string, string> = { INTRO_REQUESTED: 'Intro requested', CONTACTED: 'Contacted', MEETING: 'Meeting', PROPOSAL: 'Proposal', AWAITING_DECISION: 'Awaiting decision' };
const chunks = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const leadHref = (id: string) => `/connections?tab=discover&lead=${id}`;
const personHref = (id: string) => `/connections?tab=people&person=${id}`;

/**
 * @param seenAt   when the person last opened the brief (null on a first visit)
 * @param deadlines upcoming application deadlines, already shaped by the page
 */
export async function buildBrief(db: Db, orgId: string, opts: { seenAt: Date | null; deadlines: DeadlineInput[]; now?: Date }): Promise<Brief> {
  const now = opts.now ?? new Date();
  const windowStart = new Date(now.getTime() - 7 * DAY);
  const seenAt = opts.seenAt && opts.seenAt > windowStart ? opts.seenAt : windowStart;
  const isNew = (iso: string | null | undefined) => !!iso && new Date(iso) > seenAt;
  const since = windowStart.toISOString();

  const [leads, insights, createdRes, runsRes] = await Promise.all([
    listLeads(db, orgId).catch(() => [] as LeadRow[]),
    listInsights(db, orgId).catch(() => []),
    db.from('network_leads').select('id, created_at').eq('org_id', orgId),
    db.from('network_refresh_runs').select('completed_at, profiles_enriched, relationships_found, leads_found, companies_scanned, status').eq('org_id', orgId).gte('completed_at', since).order('completed_at', { ascending: false }).limit(60),
  ]);
  const createdAt = new Map<string, string>(((createdRes.data ?? []) as Array<{ id: string; created_at: string }>).map(r => [r.id, r.created_at]));
  const signals: BriefSignal[] = [];

  // ── New warm paths: leads surfaced this week that come with a person to ask ──
  const seenLeads = new Set<string>();
  for (const l of leads) {
    const c = createdAt.get(l.id);
    if (!c || new Date(c) < windowStart || !l.target) continue;
    if (['NOT_A_FIT', 'LOST'].includes(l.pipeline_status)) continue;
    seenLeads.add(l.id);
    const viaLine = l.via ? `via ${l.via.name}${l.via.role ? ` (${l.via.role})` : ''}${l.via_org ? ` · ${l.via_org}` : ''}` : l.insight_type === 'Untapped Funder' ? 'funds your peers · no path yet' : null;
    signals.push({
      id: `lead:${l.id}`, kind: 'path', tone: l.via ? 'accent' : 'warning', at: c, isNew: isNew(c),
      title: l.via ? `New path to ${l.target.name}` : `${l.target.name} is new on the list`,
      detail: l.thesis, evidence: [viaLine, `score ${l.score}`, l.confidence ? `${l.confidence.toLowerCase()} confidence` : null].filter(Boolean).join(' · '),
      href: leadHref(l.id), cta: 'Open lead', score: l.score,
    });
  }

  // ── Insights the network layer wrote this week (deduped against the lead rows above) ──
  for (const i of insights) {
    if (!i.generated_at || new Date(i.generated_at) < windowStart) continue;
    if (i.lead_id && seenLeads.has(i.lead_id)) continue;
    const person = i.path.find(p => p.kind === 'person' && p.id);
    signals.push({
      id: `insight:${i.id}`, kind: 'insight', tone: /Dormant/.test(i.insight_type) ? 'critical' : /Untapped|Emerging|Repeated/.test(i.insight_type) ? 'warning' : 'slate',
      at: i.generated_at, isNew: isNew(i.generated_at), title: i.title, detail: i.summary ?? '', evidence: `${i.insight_type} · ${String(i.confidence).toLowerCase()} confidence`,
      href: i.lead_id ? leadHref(i.lead_id) : person?.id ? `/connections?tab=map&focus=person:${person.id}` : '/connections?tab=discover', cta: i.lead_id ? 'Open lead' : 'See on map', score: Math.round(Number(i.score) || 0) || null,
    });
  }

  // ── Network refresh runs, summed into one line ──
  type Run = { completed_at: string | null; profiles_enriched: number | null; relationships_found: number | null; leads_found: number | null; companies_scanned: number | null; status: string | null };
  const runs = ((runsRes.data ?? []) as Run[]).filter(r => r.completed_at);
  const sum = (k: keyof Run) => runs.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  if (runs.length) {
    const latest = runs[0].completed_at!;
    const parts = [sum('profiles_enriched') ? `read ${sum('profiles_enriched')} profiles` : null, sum('relationships_found') ? `found ${sum('relationships_found')} relationships` : null, sum('leads_found') ? `${sum('leads_found')} new leads` : null, sum('companies_scanned') ? `scanned ${sum('companies_scanned')} companies` : null].filter(Boolean);
    signals.push({
      id: 'refresh', kind: 'refresh', tone: 'slate', at: latest, isNew: isNew(latest),
      title: `${runs.length === 1 ? 'The network refresh ran' : `${runs.length} network refreshes ran`} this week`,
      detail: parts.length ? `Together they ${parts.join(', ')}.` : 'Nothing new was found.', evidence: null,
      href: '/connections?tab=network', cta: 'See the network', score: null,
    });
  }

  // ── Filings read this week for funders already on the list ──
  const targetIds = [...new Set(leads.map(l => l.target?.id).filter((x): x is string => !!x))];
  if (targetIds.length) {
    const orgRows: Array<{ id: string; name: string; funder_id: string | null }> = [];
    for (const part of chunks(targetIds, 150)) {
      const { data } = await db.from('network_organizations').select('id, name, funder_id').in('id', part).not('funder_id', 'is', null);
      orgRows.push(...((data ?? []) as typeof orgRows));
    }
    const funderIds = orgRows.map(o => o.funder_id!).filter(Boolean);
    if (funderIds.length) {
      const nameOf = new Map(orgRows.map(o => [o.funder_id!, o.name]));
      const leadOf = new Map<string, string>(); for (const l of leads) if (l.target) { const o = orgRows.find(x => x.id === l.target!.id); if (o?.funder_id && !leadOf.has(o.funder_id)) leadOf.set(o.funder_id, l.id); }
      const counts = new Map<string, { n: number; amount: number; at: string }>();
      for (const part of chunks(funderIds, 150)) {
        const { data } = await db.from('grants_made').select('funder_id, amount, ingested_at').in('funder_id', part).gte('ingested_at', since).limit(1000);
        for (const g of (data ?? []) as Array<{ funder_id: string; amount: number | null; ingested_at: string }>) {
          const c = counts.get(g.funder_id) ?? { n: 0, amount: 0, at: g.ingested_at };
          c.n++; c.amount += Number(g.amount) || 0; if (g.ingested_at > c.at) c.at = g.ingested_at; counts.set(g.funder_id, c);
        }
      }
      for (const [fid, c] of counts) {
        const leadId = leadOf.get(fid);
        signals.push({
          id: `filing:${fid}`, kind: 'filing', tone: 'info', at: c.at, isNew: isNew(c.at),
          title: `New filing read for ${nameOf.get(fid) ?? 'a funder on your list'}`,
          detail: `${c.n} grant${c.n === 1 ? '' : 's'} added from the latest 990${c.amount ? `, ${money(c.amount)} in total` : ''}.`, evidence: 'IRS 990 filing',
          href: leadId ? leadHref(leadId) : '/prospecting', cta: leadId ? 'Open lead' : 'Open prospecting', score: null,
        });
      }
    }
  }

  // ── Deadlines inside two weeks ──
  for (const d of opts.deadlines) {
    if (d.days > 14) continue;
    signals.push({
      id: `deadline:${d.funder}:${d.date}`, kind: 'deadline', tone: d.days <= 3 ? 'critical' : 'warning', at: d.date, isNew: false,
      title: `${d.type} for ${d.funder} due ${d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : `in ${d.days} days`}`,
      detail: `${d.stage} · ${new Date(d.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`, evidence: null,
      href: '/calendar', cta: 'Open calendar', score: null,
    });
  }

  // ── Follow-ups the team promised, and intros that have gone quiet ──
  const todos: TodoItem[] = [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  for (const l of leads) {
    if (!l.target) continue;
    if (l.next_action && l.next_action_date) {
      const days = Math.round((new Date(l.next_action_date + 'T00:00:00').getTime() - today.getTime()) / DAY);
      if (days <= 7) {
        todos.push({ id: `fu:${l.id}`, kind: 'follow_up', text: l.next_action, sub: `${l.target.name}${l.owner ? ` · ${l.owner.split('@')[0]}` : ''}`, href: leadHref(l.id), days, tone: days < 0 ? 'critical' : days <= 2 ? 'warning' : 'slate' });
        signals.push({ id: `follow:${l.id}`, kind: 'follow_up', tone: days < 0 ? 'critical' : 'warning', at: l.next_action_date, isNew: false, title: days < 0 ? `Overdue: ${l.next_action}` : `${l.next_action} (${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`})`, detail: `${l.target.name} · ${KIND_LABEL[l.pipeline_status] ?? l.pipeline_status.toLowerCase().replace(/_/g, ' ')}`, evidence: null, href: leadHref(l.id), cta: 'Open lead', score: l.score });
      }
    } else if (['INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL'].includes(l.pipeline_status) && l.updated_at) {
      const quiet = Math.round((now.getTime() - new Date(l.updated_at).getTime()) / DAY);
      if (quiet >= 14) {
        todos.push({ id: `stale:${l.id}`, kind: 'stale', text: `Nudge ${l.target.name}`, sub: `${KIND_LABEL[l.pipeline_status]} ${quiet} days ago, nothing since`, href: leadHref(l.id), days: null, tone: quiet >= 28 ? 'critical' : 'warning' });
      }
    }
  }
  for (const d of opts.deadlines) if (d.days <= 14) todos.push({ id: `dl:${d.funder}:${d.date}`, kind: 'deadline', text: `${d.type}: ${d.funder}`, sub: d.stage, href: '/calendar', days: d.days, tone: d.days <= 3 ? 'critical' : 'warning' });

  // ── Asks the board could make: open leads with a person to ask, grouped by that person ──
  const askable = leads.filter(l => l.via && l.target && ['NEW', 'RESEARCHING', 'INTRODUCTION_NEEDED'].includes(l.pipeline_status));
  const byVia = new Map<string, BoardAsk>();
  for (const l of askable) {
    const a = byVia.get(l.via!.id) ?? { personId: l.via!.id, name: l.via!.name, role: l.via!.role, targets: [], total: 0 };
    a.targets.push({ leadId: l.id, name: l.target!.name, score: l.score, status: l.pipeline_status, viaOrg: l.via_org });
    a.total += l.score; byVia.set(l.via!.id, a);
  }
  const asks = [...byVia.values()].map(a => ({ ...a, targets: a.targets.sort((x, y) => y.score - x.score).slice(0, 3) })).sort((a, b) => b.total - a.total).slice(0, 6);
  for (const a of asks.slice(0, 3)) todos.push({ id: `ask:${a.personId}`, kind: 'ask', text: `Ask ${a.name} about ${a.targets[0].name}`, sub: a.targets.length > 1 ? `and ${a.targets.length - 1} more · score ${a.targets[0].score}` : `score ${a.targets[0].score}`, href: personHref(a.personId), days: null, tone: 'accent' });

  const order: Record<TodoItem['kind'], number> = { deadline: 0, follow_up: 1, stale: 2, ask: 3 };
  todos.sort((a, b) => order[a.kind] - order[b.kind] || (a.days ?? 99) - (b.days ?? 99));
  signals.sort((a, b) => Number(b.isNew) - Number(a.isNew) || new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    windowStart: since, seenAt: seenAt.toISOString(), signals: signals.slice(0, 40), asks, todos: todos.slice(0, 8),
    stats: {
      newPaths: signals.filter(s => s.kind === 'path' && s.isNew).length,
      newInsights: signals.filter(s => s.kind === 'insight' && s.isNew).length,
      refreshes: runs.length, relationshipsFound: sum('relationships_found'), profilesRead: sum('profiles_enriched'),
      dueSoon: opts.deadlines.filter(d => d.days <= 14).length,
      followUps: todos.filter(t => t.kind === 'follow_up' || t.kind === 'stale').length,
      asksReady: askable.length,
    },
  };
}

function money(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
