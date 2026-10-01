// Target companies — corporations CYC wants contacts at, whether or not a
// board member has ever worked there (grocers, retailers, utilities, the
// Chicago-headquartered consumer brands).
//
// Why a separate list: the network refresh only scans employers that appear
// in a read board profile, so a grocery chain's community-affairs manager is
// never searched. A target is a deliberate choice: "go look at Jewel-Osco".
//
// Pipeline, one bounded step at a time (same batch pattern as the peer-staff
// scan; every call counted; nothing re-spent):
//   target ──resolve──▶ LinkedIn company id (memoized on the organization)
//   company ──employee search × keywords──▶ hits, scored on title, top N kept
//   kept people (kind 'corporate_contact') ──enrich──▶ career + education
//   ──▶ edges to CYC people (derive) ──▶ Corporate Giving Opportunity leads

import { createServerClient } from '@/lib/supabase';
import { enrichProfile, searchEmployees, isLinkedInConfigured, CallBudget, type EmployeeHit } from '@/lib/network/linkedin';
import { resolveCompanyMemo } from '@/lib/network/refresh';
import { applyProfile, linkedinSource } from '@/lib/network/candidates';
import { ensureOrganization, resolveEmployers } from '@/lib/network/bridge';
import { deriveRelationships } from '@/lib/network/edges';
import { normalizeOrgName } from '@/lib/network/normalize';
import { buildCorporateUniverse, computeCorporateLeads, type CorpRow } from '@/lib/network/corporate';

type Db = ReturnType<typeof createServerClient>;

export const CORPORATE_CONTACT_KIND = 'corporate_contact';
export const TARGET_CATEGORIES = ['grocery', 'retail', 'pharmacy', 'restaurant', 'food', 'utility', 'airline', 'bank', 'other'] as const;
export type TargetCategory = typeof TARGET_CATEGORIES[number];

const SEARCH_KEYWORDS = ['community', 'foundation'];   // plain words; title filtering is local, so a bad filter can never empty a scan
const KEEP_PER_TARGET = 4;
const RESULTS_PER_SEARCH = 25;
const SCAN_STALE_DAYS = 180;
const DEFAULT_CALL_CAP = 60;

/** Chicago-area grocers, retailers and consumer brands with a community-giving footprint. Order is scan priority. */
export const CHICAGO_STARTER: Array<{ name: string; searchName?: string; category: TargetCategory }> = [
  { name: 'Jewel-Osco', category: 'grocery' },
  { name: "Mariano's", searchName: "Mariano's", category: 'grocery' },
  { name: 'ALDI USA', searchName: 'ALDI USA', category: 'grocery' },
  { name: "Pete's Fresh Market", category: 'grocery' },
  { name: "Tony's Fresh Market", category: 'grocery' },
  { name: 'Meijer', category: 'grocery' },
  { name: 'Walgreens', category: 'pharmacy' },
  { name: 'Target', searchName: 'Target', category: 'retail' },
  { name: 'Walmart', category: 'retail' },
  { name: 'Costco Wholesale', category: 'retail' },
  { name: 'The Home Depot', category: 'retail' },
  { name: 'Ulta Beauty', category: 'retail' },
  { name: "Portillo's", category: 'restaurant' },
  { name: "McDonald's", searchName: "McDonald's", category: 'restaurant' },
  { name: 'Mondelēz International', searchName: 'Mondelez International', category: 'food' },
  { name: 'The Kraft Heinz Company', searchName: 'Kraft Heinz', category: 'food' },
  { name: 'Conagra Brands', category: 'food' },
  { name: 'US Foods', category: 'food' },
  { name: 'United Airlines', category: 'airline' },
  { name: 'Peoples Gas', category: 'utility' },
];

// ── Title scoring ───────────────────────────────────────────────────────────
// Who at a grocer or retailer can actually move money or doors toward CYC:
// community affairs / giving / foundation staff first, then the executives who
// sponsor them, then the local operators (district managers, store directors)
// who approve in-kind and neighbourhood support.
const TITLE_GIVING = /community (affairs|relations|investment|impact|engagement|partnerships?|giving|outreach|development)|corporate (social responsibility|citizenship|responsibility|affairs|giving|philanthropy)|\bcsr\b|philanthrop|foundation|charitable|giving|social impact|public affairs|government (affairs|relations)|external (affairs|relations)|sustainability|\besg\b|diversity|inclusion|\bdei\b/i;
const TITLE_EXEC = /chief|ceo|president|executive director|managing director|founder|\bvp\b|vice president|head of|senior director|director of|general manager/i;
const TITLE_LOCAL = /district manager|store director|store manager|regional (manager|director|vice president)|market (director|manager|leader)|area (manager|director)|division (president|manager)/i;
const TITLE_NOISE = /software|engineer|intern\b|cashier|clerk|stocker|associate\b|driver|warehouse|forklift|student|barista|cook\b|server|crew|customer service rep|sales associate|pharmacy technician|loss prevention/i;
const CHICAGO = /chicago|illinois|\bil\b|naperville|evanston|oak (park|brook)|schaumburg|skokie|cicero|joliet|aurora|rosemont|bolingbrook|deerfield|northbrook|lake forest|itasca|melrose park/i;

export interface ScoredTargetHit { hit: EmployeeHit; score: number; tier: 'giving' | 'executive' | 'local' }

export function scoreTargetHit(hit: EmployeeHit): ScoredTargetHit | null {
  const t = `${hit.title ?? ''} ${hit.headline ?? ''}`;
  if (TITLE_NOISE.test(t) && !TITLE_GIVING.test(t)) return null;
  let score = 0; let tier: ScoredTargetHit['tier'] | null = null;
  if (TITLE_GIVING.test(t)) { score += 50; tier = 'giving'; }
  if (TITLE_EXEC.test(t)) { score += tier ? 15 : 25; tier = tier ?? 'executive'; }
  if (TITLE_LOCAL.test(t)) { score += tier ? 5 : 20; tier = tier ?? 'local'; }
  if (!tier) return null;
  if (CHICAGO.test(hit.location ?? '')) score += 20;
  if (/chief|president|\bvp\b|vice president|head of/i.test(t) && tier === 'giving') score += 10;
  return { hit, score: Math.min(100, score), tier };
}

export const tierLabel = (tier: ScoredTargetHit['tier']) => (tier === 'giving' ? 'Community / giving staff' : tier === 'executive' ? 'Senior leadership' : 'Local operations leader');

// ── Targets ─────────────────────────────────────────────────────────────────

export interface TargetRow {
  id: string; name: string; searchName: string; category: string; organizationId: string | null;
  status: string; note: string | null; hits: number; kept: number; scannedAt: string | null;
  searches: Array<{ keyword: string; hits: number; kept: number }>;
}

const rowOf = (t: Record<string, unknown>): TargetRow => ({
  id: t.id as string, name: t.name as string, searchName: (t.search_name as string | null) || (t.name as string), category: t.category as string,
  organizationId: (t.organization_id as string | null) ?? null, status: t.status as string, note: (t.note as string | null) ?? null,
  hits: Number(t.hits ?? 0), kept: Number(t.kept ?? 0), scannedAt: (t.scanned_at as string | null) ?? null,
  searches: Array.isArray(t.searches) ? (t.searches as TargetRow['searches']) : [],
});

export async function listTargets(db: Db, orgId: string): Promise<TargetRow[]> {
  const { data } = await db.from('network_target_companies').select('*').eq('org_id', orgId).order('created_at');
  return (data ?? []).map(rowOf);
}

const isPending = (t: TargetRow) => t.status === 'pending' || t.status === 'error' || (!!t.scannedAt && Date.now() - new Date(t.scannedAt).getTime() > SCAN_STALE_DAYS * 86400000);

export async function addTarget(db: Db, orgId: string, input: { name: string; searchName?: string | null; category?: string; createdBy?: string | null }): Promise<{ added: boolean; target: TargetRow }> {
  const name = input.name.trim();
  const normalized = normalizeOrgName(name);
  if (!normalized) throw new Error('Company name is empty');
  const { data: existing } = await db.from('network_target_companies').select('*').eq('org_id', orgId).eq('normalized_name', normalized).maybeSingle();
  if (existing) return { added: false, target: rowOf(existing) };
  const category = (TARGET_CATEGORIES as readonly string[]).includes(input.category ?? '') ? input.category : 'other';
  const { data, error } = await db.from('network_target_companies').insert({
    org_id: orgId, name, normalized_name: normalized, search_name: input.searchName ?? null, category, created_by: input.createdBy ?? null,
  }).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not add the company');
  return { added: true, target: rowOf(data) };
}

export async function removeTarget(db: Db, orgId: string, id: string): Promise<void> {
  await db.from('network_target_companies').delete().eq('org_id', orgId).eq('id', id);
}

export async function seedStarter(db: Db, orgId: string, createdBy: string | null): Promise<number> {
  let added = 0;
  for (const s of CHICAGO_STARTER) {
    const r = await addTarget(db, orgId, { name: s.name, searchName: s.searchName ?? null, category: s.category, createdBy });
    if (r.added) added++;
  }
  return added;
}

// ── Status ──────────────────────────────────────────────────────────────────

export interface TargetStatus {
  configured: boolean;
  targets: TargetRow[];
  pendingScans: number;
  people: number; enriched: number; pendingEnrich: number; withPath: number;
  creditsSpent: number;
  lastRun: { started_at: string; api_calls: number; status: string; notes: string | null } | null;
  /** Rough cost of what is still pending, in credits (resolve + two searches ≈ 15; each kept profile ≈ 2). */
  estimateCredits: number;
}

export async function targetStatus(orgId: string): Promise<TargetStatus> {
  const db = createServerClient();
  const targets = await listTargets(db, orgId);
  const [{ data: people }, { data: runs }] = await Promise.all([
    db.from('network_people').select('id, enriched_at, linkedin_url').eq('org_id', orgId).eq('kind', CORPORATE_CONTACT_KIND),
    db.from('network_refresh_runs').select('started_at, api_calls, status, notes, rapidapi_credits').eq('org_id', orgId).contains('categories', ['targets']).order('started_at', { ascending: false }).limit(200),
  ]);
  const ids = (people ?? []).map(p => p.id as string);
  let withPath = 0;
  if (ids.length) {
    const linked = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const c = ids.slice(i, i + 200);
      const [{ data: a }, { data: b }] = await Promise.all([
        db.from('network_relationships').select('source_person_id').eq('org_id', orgId).in('source_person_id', c).not('target_person_id', 'is', null),
        db.from('network_relationships').select('target_person_id').eq('org_id', orgId).in('target_person_id', c).not('source_person_id', 'is', null),
      ]);
      for (const r of a ?? []) linked.add(r.source_person_id as string);
      for (const r of b ?? []) linked.add(r.target_person_id as string);
    }
    withPath = linked.size;
  }
  const pendingScans = targets.filter(isPending).length;
  const pendingEnrich = (people ?? []).filter(p => !p.enriched_at && p.linkedin_url).length;
  return {
    configured: isLinkedInConfigured(),
    targets, pendingScans,
    people: ids.length, enriched: (people ?? []).filter(p => p.enriched_at).length, pendingEnrich, withPath,
    creditsSpent: (runs ?? []).reduce((n, r) => n + Number(r.rapidapi_credits ?? 0), 0),
    lastRun: runs?.[0] ? { started_at: runs[0].started_at as string, api_calls: Number(runs[0].api_calls ?? 0), status: runs[0].status as string, notes: (runs[0].notes as string | null) ?? null } : null,
    estimateCredits: pendingScans * (15 + KEEP_PER_TARGET * 2) + pendingEnrich * 2,
  };
}

// ── One bounded step ────────────────────────────────────────────────────────

export interface TargetStepResult {
  scanned: { target: string; hits: number; kept: number; searches: Array<{ keyword: string; hits: number; kept: number }> } | null;
  enriched: string[];
  apiCalls: number; credits: number;
  relationshipsFound: number; leadsWritten: number;
  pendingScans: number; pendingEnrich: number;
  done: boolean;
  errors: string[];
}

/**
 * One step: scan at most one target (resolve + two employee searches), read up
 * to `maxEnrich` unread corporate contacts, then on the last step (or when
 * asked) fold the facts into the graph and recompute corporate leads. Spend is
 * recorded in network_refresh_runs under the 'targets' category.
 */
export async function runTargetStep(orgId: string, opts: { maxEnrich?: number; callCap?: number; scan?: boolean; derive?: boolean; createdBy?: string | null } = {}): Promise<TargetStepResult> {
  if (!isLinkedInConfigured()) throw new Error('RAPIDAPI_KEY is not configured');
  const db = createServerClient();
  const budget = new CallBudget(opts.callCap ?? DEFAULT_CALL_CAP);
  const maxEnrich = opts.maxEnrich ?? 8;
  const errors: string[] = [];
  const startedAt = Date.now();
  const STEP_BUDGET_MS = 220_000;
  const timeLeft = () => STEP_BUDGET_MS - (Date.now() - startedAt);
  const { data: runRow } = await db.from('network_refresh_runs').insert({ org_id: orgId, categories: ['targets'] }).select('id').single();
  const runId = runRow?.id as string | undefined;
  const sourceId = await linkedinSource(db);

  // ── 1. One target scan ──
  let scanned: TargetStepResult['scanned'] = null;
  const targets = await listTargets(db, orgId);
  const next = opts.scan === false ? undefined : targets.find(isPending);
  if (next) {
    const stamp = { scanned_at: new Date().toISOString() };
    try {
      // The company node first, so the LinkedIn id is memoized on it and employments resolve to it.
      const corp = await ensureOrganization(db, { name: next.name, type: 'corporation', confidence: 0.8 });
      const match = await resolveCompanyMemo(db, next.searchName, budget);
      if (!match) {
        await db.from('network_target_companies').update({ ...stamp, organization_id: corp.id, status: 'no_company', note: 'No matching LinkedIn company found', hits: 0, kept: 0, searches: [] }).eq('id', next.id);
        errors.push(`${next.name}: no matching LinkedIn company found`);
      } else {
        const { data: ownRows } = await db.from('network_people').select('linkedin_url').eq('org_id', orgId).not('linkedin_url', 'is', null);
        const known = new Set((ownRows ?? []).map(r => r.linkedin_url as string));
        const byUrl = new Map<string, ScoredTargetHit & { keyword: string }>();
        const searches: Array<{ keyword: string; hits: number; kept: number }> = [];
        for (const keyword of SEARCH_KEYWORDS) {
          let hits: EmployeeHit[] = [];
          try { hits = await searchEmployees(match, { budget, maxResults: RESULTS_PER_SEARCH, keywords: keyword }); }
          catch (e) { errors.push(`${next.name} (${keyword}): ${e instanceof Error ? e.message : 'search failed'}`); if (/budget exhausted/i.test(String(e))) break; }
          let kept = 0;
          for (const h of hits) {
            const s = scoreTargetHit(h);
            if (!s) continue;
            kept++;
            const cur = byUrl.get(h.url);
            if (!cur || s.score > cur.score) byUrl.set(h.url, { ...s, keyword });
          }
          searches.push({ keyword, hits: hits.length, kept });
        }
        const chosen = [...byUrl.values()].sort((a, b) => b.score - a.score).slice(0, KEEP_PER_TARGET);
        let inserted = 0;
        for (const c of chosen) {
          if (known.has(c.hit.url)) continue;   // already in the graph under another kind
          const { error } = await db.from('network_people').insert({
            org_id: orgId, kind: CORPORATE_CONTACT_KIND, name: c.hit.name ?? '(name withheld)', status: 'new',
            linkedin_url: c.hit.url, headline: c.hit.headline, current_title: c.hit.title, current_org: next.name, location: c.hit.location,
            organization_id: corp.id, source_id: sourceId, verification: 'probable',
            note: `${tierLabel(c.tier)} at ${next.name} — found by LinkedIn employee search ("${c.keyword}") for a target company.`,
          });
          if (!error) { inserted++; known.add(c.hit.url); }
        }
        const hitsTotal = searches.reduce((n, s) => n + s.hits, 0);
        await db.from('network_target_companies').update({ ...stamp, organization_id: corp.id, linkedin_company_id: match.companyId, searches, hits: hitsTotal, kept: inserted, status: 'done', note: null }).eq('id', next.id);
        scanned = { target: next.name, hits: hitsTotal, kept: inserted, searches };
      }
    } catch (e) {
      errors.push(`${next.name}: ${e instanceof Error ? e.message : 'scan failed'}`);
      if (!/budget exhausted/i.test(String(e))) {
        await db.from('network_target_companies').update({ ...stamp, status: 'error', note: String(e instanceof Error ? e.message : e).slice(0, 300), hits: 0, kept: 0, searches: [] }).eq('id', next.id);
      }
    }
  }

  // ── 2. Read unread contacts (career + education = the edges) ──
  const enriched: string[] = [];
  const { data: unread } = await db.from('network_people').select('id, name, linkedin_url').eq('org_id', orgId).eq('kind', CORPORATE_CONTACT_KIND).is('enriched_at', null).not('linkedin_url', 'is', null).order('created_at').limit(maxEnrich);
  for (const p of unread ?? []) {
    if (timeLeft() < 95_000) { errors.push('step time budget reached — remaining profiles are read next step'); break; }
    try {
      const prof = await enrichProfile(p.linkedin_url as string, budget);
      await applyProfile(db, p.id as string, prof, sourceId, { verification: 'verified', ...(prof.name ? { name: prof.name } : {}) });
      enriched.push((prof.name ?? p.name) as string);
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : 'enrich failed'}`);
      if (/budget exhausted/i.test(String(e))) break;
      if (/404|not found|no data/i.test(String(e))) await db.from('network_people').update({ enriched_at: new Date().toISOString(), note: 'LinkedIn profile could not be read.' }).eq('id', p.id);
    }
  }

  const after = await listTargets(db, orgId);
  const pendingScans = after.filter(isPending).length;
  const { count: pendingEnrich } = await db.from('network_people').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('kind', CORPORATE_CONTACT_KIND).is('enriched_at', null).not('linkedin_url', 'is', null);

  // ── 3. Fold into the graph and recompute corporate leads (last step, or when asked) ──
  let relationshipsFound = 0, leadsWritten = 0;
  const lastStep = pendingScans === 0 && (pendingEnrich ?? 0) === 0;
  if (enriched.length || scanned || opts.derive) {
    try {
      await resolveEmployers(db, orgId);
      if (lastStep || opts.derive) {
        if (timeLeft() > 90_000) {
          relationshipsFound = (await deriveRelationships(orgId)).written;
          leadsWritten = await recomputeTargetLeads(db, orgId, after);
        } else errors.push('graph derivation deferred — run a step with { derive: true }');
      }
    } catch (e) { errors.push(`graph derivation: ${e instanceof Error ? e.message : 'failed'}`); }
  }
  const credits = enriched.length * 2 + Math.max(0, budget.used - enriched.length);
  if (runId) {
    await db.from('network_refresh_runs').update({
      completed_at: new Date().toISOString(), api_calls: budget.used, rapidapi_credits: credits,
      profiles_enriched: enriched.length, companies_scanned: scanned ? 1 : 0, leads_found: leadsWritten, relationships_found: relationshipsFound,
      status: errors.length && !enriched.length && !scanned ? 'error' : 'done', notes: errors.slice(0, 5).join(' | ') || null,
    }).eq('id', runId);
  }
  return { scanned, enriched, apiCalls: budget.used, credits, relationshipsFound, leadsWritten, pendingScans, pendingEnrich: pendingEnrich ?? 0, done: lastStep, errors };
}

/** Corporate leads over the full corporate universe plus every target company, so a target with contacts but no board history still surfaces. */
export async function recomputeTargetLeads(db: Db, orgId: string, targets?: TargetRow[]): Promise<number> {
  const { corporations } = await buildCorporateUniverse(db, orgId);
  const have = new Set(corporations.map(c => c.id));
  const ids = (targets ?? await listTargets(db, orgId)).map(t => t.organizationId).filter((id): id is string => !!id && !have.has(id));
  const extra: CorpRow[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from('network_organizations').select('id, name, organization_type, website, metadata').in('id', ids.slice(i, i + 300));
    for (const o of data ?? []) extra.push({ id: o.id as string, name: o.name as string, type: o.organization_type as string, website: o.website as string | null, metadata: (o.metadata ?? {}) as Record<string, unknown> });
  }
  const report = await computeCorporateLeads(db, orgId, [...corporations, ...extra]);
  return report.leads;
}
