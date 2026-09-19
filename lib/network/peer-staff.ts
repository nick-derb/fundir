// Peer-organization staff — the development and executive people at the
// youth-serving nonprofits most like CYC.
//
// Why: those people sit across the table from the same program officers CYC
// wants to reach, and their career histories are the rooms CYC's board once
// shared. Reading them puts a bounded, high-yield set of second-degree people
// into the graph, kept apart from CYC's own contacts (kind 'peer_staff').
//
// Pipeline, one bounded step at a time (same batch pattern as the network
// refresh; every call counted; nothing re-spent):
//   peer (network_peer_orgs.staff_scan) ──resolve──▶ LinkedIn company id
//   company ──employee search × keywords──▶ hits, scored on title, top N kept
//   kept people ──enrich──▶ career + education ──▶ edges to CYC people (derive)

import { createServerClient } from '@/lib/supabase';
import { enrichProfile, searchEmployees, isLinkedInConfigured, CallBudget, type EmployeeHit } from '@/lib/network/linkedin';
import { resolveCompanyMemo } from '@/lib/network/refresh';
import { applyProfile, linkedinSource } from '@/lib/network/candidates';
import { resolveEmployers } from '@/lib/network/bridge';
import { deriveRelationships, OWN_KINDS } from '@/lib/network/edges';

type Db = ReturnType<typeof createServerClient>;

export const PEER_STAFF_KIND = 'peer_staff';
const SEARCH_KEYWORDS = ['development', 'executive'];   // plain words; title filtering is local, so a bad filter can never empty a scan
const KEEP_PER_PEER = 10;
const RESULTS_PER_SEARCH = 25;
const SCAN_STALE_DAYS = 365;                            // yearly is plenty: development teams turn over slowly
const TITLE_STRONG = /develop|philanthrop|foundation|grant|giving|advancement|donor|major gift|fundrais|institutional|external (affairs|relations)|partnership/i;
const TITLE_EXEC = /chief|ceo|president|executive director|managing director|founder|vp|vice president|head of|director of/i;
const TITLE_NOISE = /software|engineer|intern\b|volunteer|board member|coach|teacher|tutor|student|counselor|case manager|driver|custodian/i;
/** "Development" that is not fundraising: training, curriculum, real estate, software. Stripped before the title test. */
const NOT_FUNDRAISING = /(professional|youth|program|programme|workforce|talent|leadership|staff|curriculum|software|product|business|web|app|real estate|economic|community|organizational|learning|career|child|early childhood|teen|teacher) development/gi;

/** The fundraising / leadership reading of a title, with the false "development"s removed. */
export function titleTier(title: string | null, headline: string | null): 'development' | 'executive' | null {
  const t = `${title ?? ''} ${headline ?? ''}`.replace(NOT_FUNDRAISING, ' ');
  if (TITLE_STRONG.test(t)) return 'development';
  if (TITLE_EXEC.test(t)) return 'executive';
  return null;
}

export interface ScoredHit { hit: EmployeeHit; score: number; tier: 'development' | 'executive' }

/** Which hits are worth a seat in the graph, and why. */
export function scorePeerHit(hit: EmployeeHit): ScoredHit | null {
  const t = `${hit.title ?? ''} ${hit.headline ?? ''}`.replace(NOT_FUNDRAISING, ' ');
  if (TITLE_NOISE.test(t) && !TITLE_STRONG.test(t)) return null;
  let score = 0; let tier: ScoredHit['tier'] | null = null;
  if (TITLE_STRONG.test(t)) { score += 45; tier = 'development'; }
  if (TITLE_EXEC.test(t)) { score += 25; tier = tier ?? 'executive'; }
  if (!tier) return null;
  if (/chicago|illinois|\bil\b/i.test(hit.location ?? '')) score += 15;
  if (/chief|ceo|president|executive director/i.test(t)) score += 10;
  return { hit, score: Math.min(100, score), tier };
}

export interface PeerTarget { peerId: string; orgId: string; name: string; searchName: string; scannedAt: string | null; status: string | null }

/** The peers flagged for a staff scan, oldest scan first. */
export async function peerTargets(db: Db, orgId: string): Promise<PeerTarget[]> {
  const [{ data: peers }, { data: scans }] = await Promise.all([
    db.from('network_peer_orgs').select('id, organization_id, staff_scan_name, org:network_organizations!network_peer_orgs_organization_id_fkey(name)').eq('org_id', orgId).eq('staff_scan', true),
    db.from('network_peer_scans').select('peer_organization_id, scanned_at, status').eq('org_id', orgId),
  ]);
  const scan = new Map((scans ?? []).map(s => [s.peer_organization_id as string, s]));
  return ((peers ?? []) as unknown as Array<{ id: string; organization_id: string; staff_scan_name: string | null; org: { name: string } | null }>)
    .map(p => ({ peerId: p.id, orgId: p.organization_id, name: p.org?.name ?? p.staff_scan_name ?? '', searchName: p.staff_scan_name ?? p.org?.name ?? '', scannedAt: (scan.get(p.organization_id)?.scanned_at as string | null) ?? null, status: (scan.get(p.organization_id)?.status as string | null) ?? null }))
    .filter(p => p.searchName)
    .sort((a, b) => (a.scannedAt ?? '').localeCompare(b.scannedAt ?? '') || a.name.localeCompare(b.name));
}

const isPending = (t: PeerTarget) => !t.scannedAt || Date.now() - new Date(t.scannedAt).getTime() > SCAN_STALE_DAYS * 86400000;

export interface PeerStaffStatus {
  configured: boolean;
  peers: number; scanned: number; pendingScans: number;
  people: number; enriched: number; pendingEnrich: number;
  withPath: number;
  lastRun: { started_at: string; api_calls: number; status: string; notes: string | null } | null;
  creditsSpent: number;
}

export async function peerStaffStatus(orgId: string): Promise<PeerStaffStatus> {
  const db = createServerClient();
  const targets = await peerTargets(db, orgId);
  const [{ data: people }, { data: runs }] = await Promise.all([
    db.from('network_people').select('id, enriched_at').eq('org_id', orgId).eq('kind', PEER_STAFF_KIND),
    db.from('network_refresh_runs').select('started_at, api_calls, status, notes, rapidapi_credits').eq('org_id', orgId).contains('categories', ['peer_staff']).order('started_at', { ascending: false }).limit(200),
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
  return {
    configured: isLinkedInConfigured(),
    peers: targets.length, scanned: targets.filter(t => !isPending(t)).length, pendingScans: targets.filter(isPending).length,
    people: ids.length, enriched: (people ?? []).filter(p => p.enriched_at).length, pendingEnrich: (people ?? []).filter(p => !p.enriched_at).length,
    withPath,
    lastRun: runs?.[0] ? { started_at: runs[0].started_at as string, api_calls: Number(runs[0].api_calls ?? 0), status: runs[0].status as string, notes: (runs[0].notes as string | null) ?? null } : null,
    creditsSpent: (runs ?? []).reduce((n, r) => n + Number(r.rapidapi_credits ?? 0), 0),
  };
}

export interface PeerStaffStepResult {
  scanned: { peer: string; hits: number; kept: number; searches: Array<{ keyword: string; hits: number; kept: number }> } | null;
  enriched: string[];
  apiCalls: number; credits: number;
  relationshipsFound: number;
  pendingScans: number; pendingEnrich: number;
  done: boolean;
  errors: string[];
}

/**
 * One bounded step: scan at most one peer (resolve + two employee searches),
 * then read up to `maxEnrich` unread peer-staff profiles, then fold the new
 * facts into the graph. Spend is recorded in network_refresh_runs.
 */
export async function runPeerStaffStep(orgId: string, opts: { maxEnrich?: number; callCap?: number; scan?: boolean; derive?: boolean } = {}): Promise<PeerStaffStepResult> {
  if (!isLinkedInConfigured()) throw new Error('RAPIDAPI_KEY is not configured');
  const db = createServerClient();
  const budget = new CallBudget(opts.callCap ?? 60);
  const maxEnrich = opts.maxEnrich ?? 10;
  const errors: string[] = [];
  const { data: runRow } = await db.from('network_refresh_runs').insert({ org_id: orgId, categories: ['peer_staff'] }).select('id').single();
  const runId = runRow?.id as string | undefined;
  const sourceId = await linkedinSource(db);

  // ── 1. One peer scan ──
  let scanned: PeerStaffStepResult['scanned'] = null;
  const targets = await peerTargets(db, orgId);
  const next = opts.scan === false ? undefined : targets.find(isPending);
  if (next) {
    try {
      const match = await resolveCompanyMemo(db, next.searchName, budget);
      if (!match) {
        await db.from('network_peer_scans').upsert({ org_id: orgId, peer_organization_id: next.orgId, company: next.searchName, status: 'no_company', note: 'No matching LinkedIn company found', scanned_at: new Date().toISOString(), hits: 0, kept: 0, searches: [] }, { onConflict: 'org_id,peer_organization_id' });
        errors.push(`${next.name}: no matching LinkedIn company found`);
      } else {
        const { data: ownRows } = await db.from('network_people').select('linkedin_url').eq('org_id', orgId).not('linkedin_url', 'is', null);
        const known = new Set((ownRows ?? []).map(r => r.linkedin_url as string));
        const byUrl = new Map<string, ScoredHit & { keyword: string }>();
        const searches: Array<{ keyword: string; hits: number; kept: number }> = [];
        for (const keyword of SEARCH_KEYWORDS) {
          let hits: EmployeeHit[] = [];
          try { hits = await searchEmployees(match, { budget, maxResults: RESULTS_PER_SEARCH, keywords: keyword }); }
          catch (e) { errors.push(`${next.name} (${keyword}): ${e instanceof Error ? e.message : 'search failed'}`); if (/budget exhausted/i.test(String(e))) break; }
          let kept = 0;
          for (const h of hits) {
            const s = scorePeerHit(h);
            if (!s) continue;
            kept++;
            const cur = byUrl.get(h.url);
            if (!cur || s.score > cur.score) byUrl.set(h.url, { ...s, keyword });
          }
          searches.push({ keyword, hits: hits.length, kept });
        }
        const chosen = [...byUrl.values()].sort((a, b) => b.score - a.score).slice(0, KEEP_PER_PEER);
        let inserted = 0;
        for (const c of chosen) {
          if (known.has(c.hit.url)) continue;   // already in the graph under another kind (a CYC person, a trustee, a lead)
          const { error } = await db.from('network_people').insert({
            org_id: orgId, kind: PEER_STAFF_KIND, name: c.hit.name ?? '(name withheld)', status: 'new',
            linkedin_url: c.hit.url, headline: c.hit.headline, current_title: c.hit.title, current_org: next.name, location: c.hit.location,
            organization_id: next.orgId, source_id: sourceId, verification: 'probable',
            note: `${c.tier === 'development' ? 'Development / philanthropy staff' : 'Senior leadership'} at ${next.name} — found by LinkedIn employee search ("${c.keyword}").`,
          });
          if (!error) { inserted++; known.add(c.hit.url); }
        }
        const hitsTotal = searches.reduce((n, s) => n + s.hits, 0);
        await db.from('network_peer_scans').upsert({ org_id: orgId, peer_organization_id: next.orgId, company: match.name, linkedin_company_id: match.companyId, searches, hits: hitsTotal, kept: inserted, status: 'done', note: null, scanned_at: new Date().toISOString() }, { onConflict: 'org_id,peer_organization_id' });
        scanned = { peer: next.name, hits: hitsTotal, kept: inserted, searches };
      }
    } catch (e) {
      errors.push(`${next.name}: ${e instanceof Error ? e.message : 'scan failed'}`);
      if (!/budget exhausted/i.test(String(e))) {
        await db.from('network_peer_scans').upsert({ org_id: orgId, peer_organization_id: next.orgId, company: next.searchName, status: 'error', note: String(e instanceof Error ? e.message : e).slice(0, 300), scanned_at: new Date().toISOString(), hits: 0, kept: 0, searches: [] }, { onConflict: 'org_id,peer_organization_id' });
      }
    }
  }

  // ── 2. Read unread profiles (career + education = the edges) ──
  const enriched: string[] = [];
  const { data: unread } = await db.from('network_people').select('id, name, linkedin_url').eq('org_id', orgId).eq('kind', PEER_STAFF_KIND).is('enriched_at', null).not('linkedin_url', 'is', null).order('created_at').limit(maxEnrich);
  for (const p of unread ?? []) {
    try {
      const prof = await enrichProfile(p.linkedin_url as string, budget);
      await applyProfile(db, p.id as string, prof, sourceId, { verification: 'verified', ...(prof.name ? { name: prof.name } : {}) });
      enriched.push((prof.name ?? p.name) as string);
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : 'enrich failed'}`);
      if (/budget exhausted/i.test(String(e))) break;
      // A profile the provider cannot read (private, deleted) is marked so it is not retried every step.
      if (/404|not found|no data/i.test(String(e))) await db.from('network_people').update({ enriched_at: new Date().toISOString(), note: 'LinkedIn profile could not be read.' }).eq('id', p.id);
    }
  }

  const after = await peerTargets(db, orgId);
  const pendingScans = after.filter(isPending).length;
  const { count: pendingEnrich } = await db.from('network_people').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('kind', PEER_STAFF_KIND).is('enriched_at', null).not('linkedin_url', 'is', null);

  // ── 3. Fold into the graph ──
  // Employers are resolved every step (cheap, and only touches new rows), but
  // deriving relationships rebuilds every edge for the org — minutes of work
  // once the graph is large. It runs on the last step only, or when asked, so a
  // mid-run step never approaches the request timeout.
  let relationshipsFound = 0;
  const lastStep = pendingScans === 0 && (pendingEnrich ?? 0) === 0;
  if (enriched.length) {
    try {
      await resolveEmployers(db, orgId);
      if (lastStep || opts.derive) relationshipsFound = (await deriveRelationships(orgId)).written;
    } catch (e) { errors.push(`graph derivation: ${e instanceof Error ? e.message : 'failed'}`); }
  }
  const credits = enriched.length * 2 + Math.max(0, budget.used - enriched.length);
  if (runId) {
    await db.from('network_refresh_runs').update({
      completed_at: new Date().toISOString(), api_calls: budget.used, rapidapi_credits: credits,
      profiles_enriched: enriched.length, companies_scanned: scanned ? 1 : 0, leads_found: scanned?.kept ?? 0, relationships_found: relationshipsFound,
      status: errors.length && !enriched.length && !scanned ? 'error' : 'done', notes: errors.slice(0, 5).join(' | ') || null,
    }).eq('id', runId);
  }
  return { scanned, enriched, apiCalls: budget.used, credits, relationshipsFound, pendingScans, pendingEnrich: pendingEnrich ?? 0, done: pendingScans === 0 && (pendingEnrich ?? 0) === 0, errors };
}

/** Kinds whose people count as "CYC's side" of a path. */
export const CYC_SIDE_KINDS = new Set([...OWN_KINDS, 'trustee', 'executive']);
