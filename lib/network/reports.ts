// Reports — the numbers only Fundir has. Everything here comes from the
// relationship graph and the lead pipeline, not from re-plotting Instrumentl:
// network reach, white space, evidence quality, board coverage, pipeline
// velocity, and the refresh ledger. Grant-pipeline cards from match_results
// appear only when that data actually exists for the org.

import { createServerClient } from '@/lib/supabase';
import { OWN_KINDS } from '@/lib/network/edges';
import { OPEN_STATES, IN_MOTION, daysUntil, STATUS_LABEL_PLAIN } from '@/lib/network/pipeline';

type Db = ReturnType<typeof createServerClient>;
const CYC_EIN = '362344429';
const chunks = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
/** PostgREST caps unbounded selects at 1,000 rows — page every table that can exceed it. */
async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface ReportsIntel {
  generated_at: string;
  reach: { funders_reachable: number; doors: Array<{ person_id: string; name: string; role: string | null; funders: number; best: number; targets: string[] }>; high_confidence: number; leads_open: number };
  white_space: { funders: number; peer_dollars: number; top: Array<{ id: string; name: string; peers: number; dollars: number; score: number; lead_id: string }>; by_year: Array<{ year: number; dollars: number; grants: number }> };
  evidence: { relationships: { verified: number; probable: number; inferred: number }; leads: { High: number; Medium: number; Low: number }; explained: { model: number; deterministic: number; none: number }; claims_kept: number; claims_total: number };
  coverage: { own_total: number; with_url: number; read: number; with_paths: number; missing: Array<{ id: string; name: string; role: string | null }> };
  pipeline: { stages: Array<{ status: string; label: string; count: number; avg_days: number | null }>; in_motion: number; overdue: number; due_week: number; won: number; lost: number; not_fit: number; owners: Array<{ owner: string; count: number; overdue: number }> };
  ledger: { runs: number; api_calls: number; credits: number; claude_usd: number; last_run: string | null; last_snapshot: string | null; events_cited: number; sources: number };
  grants: { submitted: number; awarded: number; win_rate: number; awarded_value: number } | null;
}

export async function buildReportsIntel(db: Db, orgId: string): Promise<ReportsIntel> {
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', CYC_EIN).maybeSingle();
  const cycId = (cyc?.id as string | undefined) ?? null;
  const [{ data: leads }, { data: own }, relCounts, { data: runs }, peers, { count: srcCount }, { count: citedCount }, { data: actions }, { data: mr }] = await Promise.all([
    db.from('network_leads').select('id, insight_type, pipeline_status, opportunity_score, evidence_confidence, explanation, via_person_id, target_org_id, owner, next_action_date, updated_at, target:network_organizations!network_leads_target_org_id_fkey(id, name)').eq('org_id', orgId),
    db.from('network_people').select('id, name, kind, board_role, linkedin_url, enriched_at').eq('org_id', orgId),
    // Grades are three numbers, not 3,500 rows: ask the database to count them.
    Promise.all((['verified', 'probable', 'inferred'] as const).map(v => db.from('network_relationships').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('verification', v).then(r => [v, r.count ?? 0] as const))),
    db.from('network_refresh_runs').select('started_at, api_calls, rapidapi_credits, claude_micro_cents, status, notes').eq('org_id', orgId).order('started_at', { ascending: false }).limit(200),
    pageAll<{ organization_id: string }>((a, b) => db.from('network_peer_orgs').select('organization_id').eq('org_id', orgId).order('id').range(a, b)),
    db.from('network_sources').select('id', { count: 'exact', head: true }),
    db.from('grants_made').select('id', { count: 'exact', head: true }).not('source_url', 'is', null),
    db.from('network_actions').select('lead_id, status, created_at').eq('org_id', orgId).in('action', ['status_change', 'dismiss', 'outcome']).order('created_at', { ascending: false }).limit(5000),
    db.from('match_results').select('pipeline_stage, grant:grant_opportunities(extracted_fields)').eq('org_id', orgId).in('pipeline_stage', ['submitted', 'awarded', 'rejected']).limit(2000),
  ]);
  type L = { id: string; insight_type: string | null; pipeline_status: string; opportunity_score: number | null; evidence_confidence: string | null; explanation: { method?: string; validation?: { bullets_kept: number; bullets_total: number } } | null; via_person_id: string | null; target_org_id: string | null; owner: string | null; next_action_date: string | null; updated_at: string; target: { id: string; name: string } | null };
  const L = (leads ?? []) as unknown as L[];
  const openL = L.filter(l => (OPEN_STATES as string[]).includes(l.pipeline_status));
  const ownPeople = (own ?? []).filter(p => OWN_KINDS.has(p.kind as string));
  const ownName = new Map(ownPeople.map(p => [p.id as string, { name: p.name as string, role: (p.board_role as string | null) ?? null }]));

  // ── Reach: funders reachable through a CYC person, and who opens the doors ──
  const doors = new Map<string, { funders: Set<string>; best: number; targets: Set<string> }>();
  for (const l of openL) if (l.via_person_id && l.target) { const d = doors.get(l.via_person_id) ?? { funders: new Set(), best: 0, targets: new Set() }; d.funders.add(l.target.id); d.best = Math.max(d.best, Math.round(Number(l.opportunity_score ?? 0))); d.targets.add(l.target.name); doors.set(l.via_person_id, d); }
  const reach = {
    funders_reachable: new Set(openL.filter(l => l.via_person_id && l.target).map(l => l.target!.id)).size,
    doors: [...doors].map(([pid, d]) => ({ person_id: pid, name: ownName.get(pid)?.name ?? 'CYC person', role: ownName.get(pid)?.role ?? null, funders: d.funders.size, best: d.best, targets: [...d.targets].slice(0, 4) })).sort((a, b) => b.funders - a.funders || b.best - a.best).slice(0, 8),
    high_confidence: openL.filter(l => l.evidence_confidence === 'High').length,
    leads_open: openL.length,
  };

  // ── White space: untapped funders and what they give CYC's peers ──
  const untapped = openL.filter(l => l.insight_type === 'Untapped Funder' && l.target);
  const peerIds = new Set((peers ?? []).map(p => p.organization_id as string));
  const funderIds = [...new Set(untapped.map(l => l.target!.id))];
  const dollars = new Map<string, { dollars: number; peers: Set<string> }>();
  const byYear = new Map<number, { dollars: number; grants: number }>();
  // One funder (McCormick) can carry thousands of grants, so fetch the chunks concurrently.
  const grantPages = await Promise.all(chunks(funderIds, 50).map(c =>
    pageAll<{ funder_org_id: string; recipient_org_id: string | null; amount: number | null; fiscal_year: number | null }>((a, b) => db.from('grants_made').select('funder_org_id, recipient_org_id, amount, fiscal_year').in('funder_org_id', c).order('id').range(a, b))));
  for (const data of grantPages) {
    for (const g of data) {
      if (!g.recipient_org_id || !peerIds.has(g.recipient_org_id as string)) continue;
      const d = dollars.get(g.funder_org_id as string) ?? { dollars: 0, peers: new Set() }; d.dollars += Number(g.amount) || 0; d.peers.add(g.recipient_org_id as string); dollars.set(g.funder_org_id as string, d);
      if (g.fiscal_year) { const y = byYear.get(Number(g.fiscal_year)) ?? { dollars: 0, grants: 0 }; y.dollars += Number(g.amount) || 0; y.grants++; byYear.set(Number(g.fiscal_year), y); }
    }
  }
  const white_space = {
    funders: funderIds.length,
    peer_dollars: [...dollars.values()].reduce((n, d) => n + d.dollars, 0),
    top: untapped.map(l => ({ id: l.target!.id, name: l.target!.name, peers: dollars.get(l.target!.id)?.peers.size ?? 0, dollars: dollars.get(l.target!.id)?.dollars ?? 0, score: Math.round(Number(l.opportunity_score ?? 0)), lead_id: l.id })).sort((a, b) => b.dollars - a.dollars).slice(0, 8),
    by_year: [...byYear].map(([year, v]) => ({ year, ...v })).sort((a, b) => a.year - b.year),
  };

  // ── Evidence quality ──
  const rc = { verified: 0, probable: 0, inferred: 0 };
  for (const [v, n] of relCounts) rc[v] = n;
  const lc = { High: 0, Medium: 0, Low: 0 };
  for (const l of openL) if (l.evidence_confidence && l.evidence_confidence in lc) lc[l.evidence_confidence as keyof typeof lc]++;
  const ex = { model: 0, deterministic: 0, none: 0 }; let kept = 0, total = 0;
  for (const l of openL) { const m = l.explanation?.method; if (m === 'model') ex.model++; else if (m === 'deterministic') ex.deterministic++; else ex.none++; if (l.explanation?.validation) { kept += l.explanation.validation.bullets_kept; total += l.explanation.validation.bullets_total; } }
  const evidence = { relationships: rc, leads: lc, explained: ex, claims_kept: kept, claims_total: total };

  // ── Board coverage ──
  const viaSet = new Set(openL.map(l => l.via_person_id).filter(Boolean));
  const boardish = ownPeople.filter(p => p.kind === 'board' || p.kind === 'staff');
  const coverage = {
    own_total: boardish.length, with_url: boardish.filter(p => p.linkedin_url).length, read: boardish.filter(p => p.enriched_at).length, with_paths: boardish.filter(p => viaSet.has(p.id as string)).length,
    missing: boardish.filter(p => !p.linkedin_url).sort((a, b) => (a.board_role ? 0 : 1) - (b.board_role ? 0 : 1) || String(a.name).localeCompare(String(b.name))).slice(0, 12).map(p => ({ id: p.id as string, name: p.name as string, role: (p.board_role as string | null) ?? null })),
  };

  // ── Pipeline velocity ──
  const enteredAt = new Map<string, string>();
  for (const a of actions ?? []) { const k = a.lead_id as string; if (!enteredAt.has(k)) enteredAt.set(k, a.created_at as string); }   // most recent stage change per lead
  const now = Date.now();
  const stages = Object.keys(STATUS_LABEL_PLAIN).map(status => {
    const ls = L.filter(l => l.pipeline_status === status);
    const ages = ls.map(l => (now - new Date(enteredAt.get(l.id) ?? l.updated_at).getTime()) / 86_400_000);
    return { status, label: STATUS_LABEL_PLAIN[status], count: ls.length, avg_days: ages.length ? Math.round(ages.reduce((n, x) => n + x, 0) / ages.length) : null };
  });
  const ownersMap = new Map<string, { count: number; overdue: number }>();
  for (const l of openL) { if (!l.owner) continue; const o = ownersMap.get(l.owner) ?? { count: 0, overdue: 0 }; o.count++; if ((daysUntil(l.next_action_date) ?? 1) < 0) o.overdue++; ownersMap.set(l.owner, o); }
  const pipeline = {
    stages, in_motion: L.filter(l => (IN_MOTION as string[]).includes(l.pipeline_status)).length,
    overdue: openL.filter(l => (daysUntil(l.next_action_date) ?? 1) < 0).length, due_week: openL.filter(l => { const d = daysUntil(l.next_action_date); return d !== null && d >= 0 && d <= 7; }).length,
    won: L.filter(l => l.pipeline_status === 'WON').length, lost: L.filter(l => l.pipeline_status === 'LOST').length, not_fit: L.filter(l => l.pipeline_status === 'NOT_A_FIT').length,
    owners: [...ownersMap].map(([owner, v]) => ({ owner, ...v })).sort((a, b) => b.count - a.count).slice(0, 6),
  };

  // ── Ledger ──
  const R = runs ?? [];
  const ledger = {
    runs: R.length, api_calls: R.reduce((n, r) => n + (Number(r.api_calls) || 0), 0), credits: R.reduce((n, r) => n + (Number(r.rapidapi_credits) || 0), 0),
    claude_usd: R.reduce((n, r) => n + (Number(r.claude_micro_cents) || 0), 0) / 1_000_000,
    last_run: (R[0]?.started_at as string | undefined) ?? null, last_snapshot: (R.find(r => /snapshot/i.test(String(r.notes ?? '')))?.started_at as string | undefined) ?? null,
    events_cited: citedCount ?? 0, sources: srcCount ?? 0,
  };

  // ── Instrumentl-derived grant pipeline, only when it exists (fetched in the opening batch) ──
  const M = (mr ?? []) as unknown as Array<{ pipeline_stage: string; grant: { extracted_fields: Record<string, unknown> } | null }>;
  const awarded = M.filter(m => m.pipeline_stage === 'awarded');
  const grants = M.length ? { submitted: M.length, awarded: awarded.length, win_rate: Math.round((awarded.length / M.length) * 100), awarded_value: awarded.reduce((n, m) => n + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0) } : null;

  return { generated_at: new Date().toISOString(), reach, white_space, evidence, coverage, pipeline, ledger, grants };
}
