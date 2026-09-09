// Network refresh orchestration.
//
// The insight this feature runs on: LinkedIn exposes nobody's connection list,
// but it doesn't need to. A board member's career history names the rooms they
// were in — and the people working in those rooms today are exactly who they
// can still call. So the pipeline is:
//
//   board member (URL added by CYC) ──enrich──▶ career history
//   career history ──per employer──▶ current-employee search (capped)
//   employees w/ fundraising / philanthropy / exec titles ──▶ scored warm leads
//
// Runs are ON DEMAND, in bounded steps (the app's "click to continue" batch
// pattern), with every API call counted into network_refresh_runs. Quarterly is
// the intended cadence — board turnover is slow, and each employer scan is
// remembered for 180 days so a re-run never re-spends credits on it.

import { createServerClient } from '@/lib/supabase';
import {
  enrichProfile, searchEmployees, canonicalLinkedInUrl, isLinkedInConfigured,
  CallBudget, type EmployeeHit,
} from '@/lib/network/linkedin';

const ENRICH_PER_STEP    = 6;    // profile enrichments per click (~2 credits each)
const SCANS_PER_STEP     = 2;    // employer searches per click (search polling is slow)
const CALLS_PER_STEP     = 40;   // hard budget for one step, guide §3.4
const LEADS_PER_COMPANY  = 8;    // keep only the strongest paths per employer
const ENRICH_STALE_DAYS  = 75;   // quarterly cadence with margin
const SCAN_STALE_DAYS    = 180;  // an employer scanned this half-year is settled

// Titles that make a second-order person worth a development team's time.
const TITLE_STRONG = /develop|philanthrop|foundation|grant|giving|advancement|donor|major gift|fundrais|community (affairs|relations|impact|investment)|corporate (social|citizenship|responsibility)|csr/i;
const TITLE_EXEC   = /chief|ceo|president|executive director|managing (director|partner)|principal|partner|founder|vp|vice president|head of/i;
const GENERIC_ORG  = /^(self[- ]?employed|freelance|independent|retired|consultant|various)$/i;

export interface NetworkPerson {
  id: string; kind: string; name: string; linkedin_url: string | null;
  headline: string | null; current_title: string | null; current_org: string | null;
  location: string | null; summary: string | null; note: string | null;
  status: string; enriched_at: string | null;
  employments: { org_name: string; title: string | null; started: string | null; ended: string | null; is_current: boolean }[];
}

export interface NetworkLead {
  id: string; score: number; via_org: string; reason: string;
  person: { id: string; name: string; linkedin_url: string | null; headline: string | null; current_title: string | null; current_org: string | null; location: string | null; status: string };
  viaPerson: { id: string; name: string } | null;
}

export interface NetworkState {
  configured: boolean;
  people: NetworkPerson[];       // board + staff
  leads: NetworkLead[];          // active (not dismissed), score desc
  pipeline: NetworkLead[];       // leads whose person.status === 'added'
  lastRun: { started_at: string; api_calls: number; profiles_enriched: number; companies_scanned: number; leads_found: number; status: string } | null;
  totals: { boardMapped: number; boardTotal: number; employers: number; leads: number };
}

export async function getNetworkState(orgId: string): Promise<NetworkState> {
  const db = createServerClient();
  const [peopleRes, leadsRes, runRes] = await Promise.all([
    db.from('network_people')
      .select('id, kind, name, linkedin_url, headline, current_title, current_org, location, summary, note, status, enriched_at, network_employments(org_name, title, started, ended, is_current)')
      .eq('org_id', orgId).in('kind', ['board', 'staff'])
      .order('created_at'),
    db.from('network_leads')
      .select('id, score, via_org, reason, person:network_people!network_leads_person_id_fkey(id, name, linkedin_url, headline, current_title, current_org, location, status), via:network_people!network_leads_via_person_id_fkey(id, name)')
      .eq('org_id', orgId).order('score', { ascending: false }).limit(400),
    db.from('network_refresh_runs')
      .select('started_at, api_calls, profiles_enriched, companies_scanned, leads_found, status')
      .eq('org_id', orgId).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const people: NetworkPerson[] = (peopleRes.data ?? []).map(p => ({
    id: p.id as string, kind: p.kind as string, name: p.name as string,
    linkedin_url: p.linkedin_url as string | null, headline: p.headline as string | null,
    current_title: p.current_title as string | null, current_org: p.current_org as string | null,
    location: p.location as string | null, summary: p.summary as string | null,
    note: p.note as string | null, status: p.status as string, enriched_at: p.enriched_at as string | null,
    employments: ((p.network_employments ?? []) as NetworkPerson['employments'])
      .sort((a, b) => Number(b.is_current) - Number(a.is_current)),
  }));

  const allLeads: NetworkLead[] = (leadsRes.data ?? []).flatMap(l => {
    const person = l.person as unknown as NetworkLead['person'] | null;
    if (!person) return [];
    const via = l.via as unknown as { id: string; name: string } | null;
    return [{
      id: l.id as string, score: Number(l.score) || 0,
      via_org: l.via_org as string, reason: l.reason as string,
      person, viaPerson: via ? { id: via.id, name: via.name } : null,
    }];
  });

  const board = people.filter(p => p.kind === 'board');
  const employers = new Set(people.flatMap(p => p.employments.map(e => e.org_name.toLowerCase())));

  return {
    configured: isLinkedInConfigured(),
    people,
    leads: allLeads.filter(l => l.person.status !== 'dismissed' && l.person.status !== 'added'),
    pipeline: allLeads.filter(l => l.person.status === 'added'),
    lastRun: runRes.data ?? null,
    totals: {
      boardMapped: board.filter(p => p.enriched_at).length,
      boardTotal: board.length,
      employers: employers.size,
      leads: allLeads.filter(l => l.person.status !== 'dismissed').length,
    },
  };
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function scoreHit(hit: EmployeeHit, viaCount: number): { score: number; tier: string | null } {
  const t = `${hit.title ?? ''} ${hit.headline ?? ''}`;
  let score = 0; let tier: string | null = null;
  if (TITLE_STRONG.test(t)) { score += 45; tier = 'fundraising / philanthropy'; }
  if (TITLE_EXEC.test(t))   { score += 25; tier = tier ?? 'senior leadership'; }
  if (!tier) return { score: 0, tier: null };  // irrelevant title → not a lead
  if (/chicago|illinois|\bil\b/i.test(hit.location ?? '')) score += 15;
  score += Math.min(15, (viaCount - 1) * 10);  // multiple board members share this org
  return { score: Math.min(100, score), tier };
}

const normCo = (s: string) => s.toLowerCase().replace(/[.,]|\b(inc|llc|llp|ltd|co|corp|company)\b/g, '').replace(/\s+/g, ' ').trim();

// ── One bounded refresh step ────────────────────────────────────────────────

export interface RefreshStepResult {
  enriched: string[];
  scanned: { company: string; leads: number }[];
  leadsFound: number;
  apiCalls: number;
  pendingEnrich: number;
  pendingScans: number;
  done: boolean;
  errors: string[];
}

export async function runRefreshStep(orgId: string): Promise<RefreshStepResult> {
  if (!isLinkedInConfigured()) throw new Error('RAPIDAPI_KEY is not configured');
  const db = createServerClient();
  const budget = new CallBudget(CALLS_PER_STEP);
  const errors: string[] = [];
  const now = Date.now();

  const { data: runRow } = await db.from('network_refresh_runs')
    .insert({ org_id: orgId }).select('id').single();
  const runId = runRow?.id as string | undefined;

  // ── 1. Enrich CYC people whose profile is missing or stale ───────────────
  const { data: own } = await db.from('network_people')
    .select('id, name, linkedin_url, enriched_at')
    .eq('org_id', orgId).in('kind', ['board', 'staff'])
    .not('linkedin_url', 'is', null);

  const staleCut = now - ENRICH_STALE_DAYS * 86400000;
  const pendingEnrichAll = (own ?? []).filter(p =>
    !p.enriched_at || new Date(p.enriched_at as string).getTime() < staleCut);
  const toEnrich = pendingEnrichAll.slice(0, ENRICH_PER_STEP);

  const enriched: string[] = [];
  for (const p of toEnrich) {
    try {
      const prof = await enrichProfile(p.linkedin_url as string, budget);
      await db.from('network_people').update({
        headline: prof.headline, current_title: prof.currentTitle, current_org: prof.currentOrg,
        location: prof.location, summary: prof.summary,
        enriched_at: new Date().toISOString(),
      }).eq('id', p.id);
      // Replace their career history wholesale — it's provider-owned data.
      await db.from('network_employments').delete().eq('person_id', p.id);
      if (prof.experiences.length) {
        await db.from('network_employments').insert(prof.experiences.map(e => ({
          person_id: p.id, org_name: e.org, title: e.title,
          started: e.started, ended: e.ended, is_current: e.isCurrent,
        })));
      }
      enriched.push(p.name as string);
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : 'enrich failed'}`);
      if (/budget exhausted/i.test(String(e))) break;
    }
  }

  // ── 2. Scan employers from board career histories for warm second-order paths
  const scanned: { company: string; leads: number }[] = [];
  let leadsFound = 0;

  // Only spend search credits after the enrich queue is drained — profiles
  // first, paths second, one bounded step at a time.
  if (pendingEnrichAll.length <= toEnrich.length) {
    const { companiesPending } = await pendingCompanies(orgId);
    for (const c of companiesPending.slice(0, SCANS_PER_STEP)) {
      try {
        const hits = await searchEmployees(c.display, { budget, maxResults: LEADS_PER_COMPANY * 2 });
        const kept = await storeLeads(orgId, c, hits);
        leadsFound += kept;
        scanned.push({ company: c.display, leads: kept });
        await db.from('network_org_scans').upsert(
          { org_id: orgId, company: c.display, scanned_at: new Date().toISOString(), results: kept },
          { onConflict: 'org_id,company' });
      } catch (e) {
        errors.push(`${c.display}: ${e instanceof Error ? e.message : 'scan failed'}`);
        if (/budget exhausted/i.test(String(e))) break;
      }
    }
  }

  const after = await pendingCompanies(orgId);
  const pendingEnrich = Math.max(0, pendingEnrichAll.length - enriched.length);
  const pendingScans = after.companiesPending.length;

  if (runId) {
    await db.from('network_refresh_runs').update({
      completed_at: new Date().toISOString(),
      api_calls: budget.used,
      profiles_enriched: enriched.length,
      companies_scanned: scanned.length,
      leads_found: leadsFound,
      status: errors.length && !enriched.length && !scanned.length ? 'error' : 'done',
      notes: errors.slice(0, 5).join(' | ') || null,
    }).eq('id', runId);
  }

  return {
    enriched, scanned, leadsFound, apiCalls: budget.used,
    pendingEnrich, pendingScans,
    done: pendingEnrich === 0 && pendingScans === 0,
    errors,
  };
}

/** Employers named in board/staff career histories that haven't been scanned
 *  within SCAN_STALE_DAYS. Prioritized by how many CYC people share them. */
async function pendingCompanies(orgId: string): Promise<{
  companiesPending: { display: string; viaPersonIds: string[] }[];
}> {
  const db = createServerClient();
  const [{ data: people }, { data: scans }] = await Promise.all([
    db.from('network_people')
      .select('id, network_employments(org_name)')
      .eq('org_id', orgId).in('kind', ['board', 'staff']),
    db.from('network_org_scans').select('company, scanned_at').eq('org_id', orgId),
  ]);

  const scanCut = Date.now() - SCAN_STALE_DAYS * 86400000;
  const recentlyScanned = new Set(
    (scans ?? [])
      .filter(s => new Date(s.scanned_at as string).getTime() >= scanCut)
      .map(s => normCo(s.company as string)),
  );

  const byCo = new Map<string, { display: string; viaPersonIds: string[] }>();
  for (const p of people ?? []) {
    for (const e of (p.network_employments ?? []) as { org_name: string }[]) {
      const display = e.org_name.trim();
      const key = normCo(display);
      if (!key || key.length < 3 || GENERIC_ORG.test(display)) continue;
      if (/chicago youth centers/i.test(display)) continue;   // that's us
      if (recentlyScanned.has(key)) continue;
      const cur = byCo.get(key) ?? { display, viaPersonIds: [] };
      if (!cur.viaPersonIds.includes(p.id as string)) cur.viaPersonIds.push(p.id as string);
      byCo.set(key, cur);
    }
  }
  return {
    companiesPending: [...byCo.values()].sort((a, b) => b.viaPersonIds.length - a.viaPersonIds.length),
  };
}

/** Store the relevant hits from one employer scan as lead people + warm paths. */
async function storeLeads(
  orgId: string,
  company: { display: string; viaPersonIds: string[] },
  hits: EmployeeHit[],
): Promise<number> {
  const db = createServerClient();

  // Don't rediscover CYC's own people as leads.
  const { data: ownRows } = await db.from('network_people')
    .select('linkedin_url').eq('org_id', orgId).in('kind', ['board', 'staff']);
  const ownUrls = new Set((ownRows ?? []).map(r => r.linkedin_url).filter(Boolean));

  const viaCount = company.viaPersonIds.length;
  const { data: viaRows } = await db.from('network_people')
    .select('id, name').in('id', company.viaPersonIds).limit(1);
  const via = viaRows?.[0] ?? null;

  const scoredHits = hits
    .map(h => ({ h, ...scoreHit(h, viaCount) }))
    .filter(x => x.score > 0 && !ownUrls.has(x.h.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADS_PER_COMPANY);

  let kept = 0;
  for (const { h, score, tier } of scoredHits) {
    // Find-or-create by canonical URL (partial unique index → manual check).
    const { data: existing } = await db.from('network_people')
      .select('id').eq('org_id', orgId).eq('linkedin_url', h.url).maybeSingle();
    let personId = existing?.id as string | undefined;
    if (!personId) {
      const { data: ins, error } = await db.from('network_people').insert({
        org_id: orgId, kind: 'lead', name: h.name ?? '(name withheld)',
        linkedin_url: h.url, headline: h.headline, current_title: h.title,
        current_org: company.display, location: h.location,
      }).select('id').single();
      if (error || !ins) continue;
      personId = ins.id as string;
    }
    const reason = via
      ? `${tier} at ${company.display} — ${via.name} ${viaCount > 1 ? `and ${viaCount - 1} other CYC people` : ''} worked there`.replace(/\s+—\s+/, ' — ').trim()
      : `${tier} at ${company.display}, an org in CYC's board network`;
    const { error: leadErr } = await db.from('network_leads').upsert({
      org_id: orgId, person_id: personId, via_person_id: via?.id ?? null,
      via_org: company.display, reason, score,
    }, { onConflict: 'person_id,via_org' });
    if (!leadErr) kept++;
  }
  return kept;
}
