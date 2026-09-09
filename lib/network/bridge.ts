// The organization bridge (D1): resolve every org that exists anywhere in
// Fundir — the normalized 990 graph (funders / recipients), CYC's workbook
// tables (cultivation, research queue, prospects, peers) and the people
// layer's employers — into ONE canonical node in network_organizations.
//
// Identity rules, in order:
//   1. EIN match (normalized 9 digits) — authoritative.
//   2. Exact normalized-name match against a node that has NO EIN, with no
//      state conflict — reuse it (and attach our EIN if we have one).
//   3. Otherwise insert. No fuzzy merging here: trigram/Jaccard candidates and
//      Claude adjudication stay in lib/graph/identity.ts for the 990 ingest,
//      where the ambiguity actually lives.
//
// Every node carries a source_id. Existing scorers keep reading their own
// tables; funder_id / recipient_id back-references are what let the graph and
// the match engine agree on which org is which.

import { createServerClient } from '@/lib/supabase';
import {
  normalizeOrgName, normalizeEin, orgTypeOf, canonicalEmployer,
  type OrgType, type OrgTypeHints,
} from '@/lib/network/normalize';

type Db = ReturnType<typeof createServerClient>;

export interface EnsureOrgInput {
  name: string;
  ein?: string | number | null;
  type?: OrgType;
  hints?: OrgTypeHints;
  sourceId?: string | null;
  funderId?: string | null;
  recipientId?: string | null;
  city?: string | null;
  state?: string | null;
  ntee?: string | null;
  website?: string | null;
  confidence?: number;
}

/** Find or create a source row by its stable raw_reference. */
export async function ensureSource(
  db: Db,
  s: { source_type: string; source_name: string; raw_reference: string; source_url?: string | null; confidence?: number },
): Promise<string> {
  const { data } = await db.from('network_sources').select('id').eq('raw_reference', s.raw_reference).maybeSingle();
  if (data) return data.id as string;
  const { data: ins, error } = await db.from('network_sources').insert({
    source_type: s.source_type, source_name: s.source_name, raw_reference: s.raw_reference,
    source_url: s.source_url ?? null, confidence: s.confidence ?? 0.7,
  }).select('id').single();
  if (error || !ins) throw new Error(`source insert failed: ${error?.message}`);
  return ins.id as string;
}

/** Resolve one org to its canonical node. */
export async function ensureOrganization(db: Db, input: EnsureOrgInput): Promise<{ id: string; created: boolean }> {
  const name = input.name.trim();
  const normalized = normalizeOrgName(name);
  if (!normalized) throw new Error(`ensureOrganization: empty name`);
  const ein = normalizeEin(input.ein);
  const type = input.type ?? orgTypeOf(name, { ...input.hints, ntee: input.ntee ?? input.hints?.ntee });

  // 1. EIN
  if (ein) {
    const { data } = await db.from('network_organizations')
      .select('id, funder_id, recipient_id, ntee_code, city, state').eq('ein', ein).maybeSingle();
    if (data) {
      const patch: Record<string, unknown> = {};
      if (!data.funder_id && input.funderId) patch.funder_id = input.funderId;
      if (!data.recipient_id && input.recipientId) patch.recipient_id = input.recipientId;
      if (!data.ntee_code && input.ntee) patch.ntee_code = input.ntee;
      if (!data.city && input.city) patch.city = input.city;
      if (!data.state && input.state) patch.state = input.state;
      if (Object.keys(patch).length) await db.from('network_organizations').update(patch).eq('id', data.id);
      return { id: data.id as string, created: false };
    }
  }

  // 2. Exact normalized name on an EIN-less node, no state conflict.
  const { data: byName } = await db.from('network_organizations')
    .select('id, ein, state, funder_id, recipient_id')
    .eq('normalized_name', normalized).is('ein', null).limit(2);
  if (byName && byName.length === 1) {
    const hit = byName[0];
    const stateOk = !hit.state || !input.state || hit.state === input.state;
    if (stateOk) {
      const patch: Record<string, unknown> = {};
      if (ein) patch.ein = ein;
      if (!hit.funder_id && input.funderId) patch.funder_id = input.funderId;
      if (!hit.recipient_id && input.recipientId) patch.recipient_id = input.recipientId;
      if (Object.keys(patch).length) await db.from('network_organizations').update(patch).eq('id', hit.id);
      return { id: hit.id as string, created: false };
    }
  }

  // 3. Insert.
  const { data: ins, error } = await db.from('network_organizations').insert({
    name, normalized_name: normalized, organization_type: type, ein,
    city: input.city ?? null, state: input.state ?? null, ntee_code: input.ntee ?? null,
    website: input.website ?? null,
    funder_id: input.funderId ?? null, recipient_id: input.recipientId ?? null,
    source_id: input.sourceId ?? null, confidence: input.confidence ?? 0.7,
  }).select('id').single();
  if (error || !ins) throw new Error(`org insert failed for "${name}": ${error?.message}`);
  return { id: ins.id as string, created: true };
}

// ── Bulk path for EIN-bearing tables (thousands of rows) ───────────────────

interface BulkOrg {
  name: string; ein: string; type: OrgType;
  city?: string | null; state?: string | null; ntee?: string | null;
  funderId?: string | null; recipientId?: string | null;
}

/** Insert every org whose EIN isn't known yet; returns how many were new. */
async function insertMissingByEin(db: Db, rows: BulkOrg[], sourceId: string, confidence: number): Promise<number> {
  const byEin = new Map<string, BulkOrg>();
  for (const r of rows) if (r.ein && !byEin.has(r.ein)) byEin.set(r.ein, r);
  const eins = [...byEin.keys()];
  const known = new Set<string>();
  for (let i = 0; i < eins.length; i += 500) {
    const { data } = await db.from('network_organizations').select('ein').in('ein', eins.slice(i, i + 500));
    for (const d of data ?? []) known.add(d.ein as string);
  }
  const fresh = eins.filter(e => !known.has(e)).map(e => {
    const r = byEin.get(e)!;
    return {
      name: r.name, normalized_name: normalizeOrgName(r.name) || r.name.toLowerCase(), organization_type: r.type, ein: e,
      city: r.city ?? null, state: r.state ?? null, ntee_code: r.ntee ?? null,
      funder_id: r.funderId ?? null, recipient_id: r.recipientId ?? null,
      source_id: sourceId, confidence,
    };
  }).filter(r => r.normalized_name);
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await db.from('network_organizations').insert(fresh.slice(i, i + 500));
    if (error) throw new Error(`bulk org insert failed: ${error.message}`);
  }
  return fresh.length;
}

/** Attach funder_id / recipient_id to nodes that were created from another source first. */
async function attachBackrefs(db: Db, rows: BulkOrg[]): Promise<number> {
  let n = 0;
  const withRef = rows.filter(r => r.funderId || r.recipientId);
  for (let i = 0; i < withRef.length; i += 500) {
    const chunk = withRef.slice(i, i + 500);
    const { data } = await db.from('network_organizations')
      .select('id, ein, funder_id, recipient_id').in('ein', chunk.map(r => r.ein));
    const byEin = new Map((data ?? []).map(d => [d.ein as string, d]));
    for (const r of chunk) {
      const d = byEin.get(r.ein); if (!d) continue;
      const patch: Record<string, unknown> = {};
      if (r.funderId && !d.funder_id) patch.funder_id = r.funderId;
      if (r.recipientId && !d.recipient_id) patch.recipient_id = r.recipientId;
      if (Object.keys(patch).length) { await db.from('network_organizations').update(patch).eq('id', d.id); n++; }
    }
  }
  return n;
}

// Supabase query builders are thenables, not Promises — accept PromiseLike.
async function pageAll<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetch(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// ── Stack A: funders + recipients ───────────────────────────────────────────

export async function bridgeStackA(db: Db): Promise<{ funders: number; recipients: number; backrefs: number }> {
  const srcA = await ensureSource(db, {
    source_type: 'propublica', source_name: 'Fundir 990 graph (funders / recipients via ProPublica + seeds)',
    raw_reference: 'stack_a:funders+recipients', confidence: 0.8,
  });

  const funders = await pageAll<{ id: string; ein: string | null; name: string; funder_type: string | null; metadata: Record<string, unknown> | null }>(
    (a, b) => db.from('funders').select('id, ein, name, funder_type, metadata').not('ein', 'is', null).range(a, b));
  const fRows: BulkOrg[] = funders.flatMap(f => {
    const ein = normalizeEin(f.ein); if (!ein) return [];
    const m = f.metadata ?? {};
    return [{
      name: f.name, ein, funderId: f.id,
      type: orgTypeOf(f.name, { funderType: f.funder_type, ntee: (m.ntee_code as string) ?? null }),
      city: (m.city as string) ?? null, state: (m.state as string) ?? null, ntee: (m.ntee_code as string) ?? null,
    }];
  });
  const fNew = await insertMissingByEin(db, fRows, srcA, 0.8);

  const recipients = await pageAll<{ id: string; ein: string | null; name: string; ntee_code: string | null; metadata: Record<string, unknown> | null }>(
    (a, b) => db.from('recipients').select('id, ein, name, ntee_code, metadata').not('ein', 'is', null).range(a, b));
  const rRows: BulkOrg[] = recipients.flatMap(r => {
    const ein = normalizeEin(r.ein); if (!ein) return [];
    const m = r.metadata ?? {};
    return [{
      name: r.name, ein, recipientId: r.id,
      type: orgTypeOf(r.name, { ntee: r.ntee_code ?? null, subsection: '03' }),
      city: (m.city as string) ?? null, state: (m.state as string) ?? null, ntee: r.ntee_code ?? null,
    }];
  });
  const rNew = await insertMissingByEin(db, rRows, srcA, 0.8);
  const backrefs = await attachBackrefs(db, [...fRows, ...rRows]);
  return { funders: fNew, recipients: rNew, backrefs };
}

// ── Stack B: CYC workbook tables ────────────────────────────────────────────

const B_TYPE: Record<string, OrgType> = {
  'family/independent foundation': 'foundation',
  'community foundation': 'community_foundation',
  'grantmaking public charity': 'foundation',
  'public foundation': 'foundation',
  'operating foundation': 'foundation',
  'grantmaking foundation (other)': 'foundation',
  'corporate foundation': 'corporate_foundation',
  'corporate': 'corporate_foundation',
};
const bType = (name: string, ft: string | null | undefined, ntee?: string | null): OrgType =>
  B_TYPE[(ft ?? '').trim().toLowerCase()] ?? orgTypeOf(name, { ntee: ntee ?? null });

export async function bridgeStackB(db: Db, orgId: string): Promise<{ cultivation: number; queue: number; prospects: number; peers: number }> {
  const srcCult = await ensureSource(db, { source_type: 'cyc_workbook', source_name: 'Foundation Cultivation List FY27 (CYC)', raw_reference: 'Foundation Cultivation List FY27(Sheet1).csv', confidence: 0.85 });
  const srcEo   = await ensureSource(db, { source_type: 'cyc_workbook', source_name: 'Funder Prospecting Master File (eo_il.xlsx, Claude-assisted)', raw_reference: 'eo_il.xlsx', confidence: 0.75 });
  const srcBmf  = await ensureSource(db, { source_type: 'irs_bmf', source_name: 'IRS Exempt Organizations BMF - Illinois', raw_reference: 'eo_il sheet', confidence: 0.95 });

  // Cultivation list (5) and research queue (150): small, row-by-row so name-only rows resolve too.
  const { data: cult } = await db.from('cyc_cultivation').select('foundation_name, bmf_ein, bmf_legal_name, funder_type, metro_area, lookup_url').eq('org_id', orgId);
  let cultN = 0;
  for (const c of cult ?? []) {
    if (!c.foundation_name) continue;
    const r = await ensureOrganization(db, {
      name: c.foundation_name, ein: c.bmf_ein, type: bType(c.foundation_name, c.funder_type),
      state: /chicago|il\b/i.test(c.metro_area ?? '') ? 'IL' : null, sourceId: srcCult, confidence: 0.85,
    });
    if (r.created) cultN++;
  }

  const { data: queue } = await db.from('cyc_research_queue').select('organization_name, ein, funder_type, city').eq('org_id', orgId);
  let queueN = 0;
  for (const q of queue ?? []) {
    if (!q.organization_name) continue;
    const r = await ensureOrganization(db, {
      name: q.organization_name, ein: q.ein, type: bType(q.organization_name, q.funder_type),
      city: q.city ?? null, sourceId: srcEo, confidence: 0.75,
    });
    if (r.created) queueN++;
  }

  // Prospect universe (13k) — EIN-bearing, bulk.
  const prospects = await pageAll<{ ein: string | null; name: string; funder_type: string | null; city: string | null; ntee_code: string | null }>(
    (a, b) => db.from('cyc_funder_prospects').select('ein, name, funder_type, city, ntee_code').eq('org_id', orgId).range(a, b));
  const pRows: BulkOrg[] = prospects.flatMap(p => {
    const ein = normalizeEin(p.ein); if (!ein || !p.name) return [];
    return [{ name: p.name, ein, type: bType(p.name, p.funder_type, p.ntee_code), city: p.city, state: 'IL', ntee: p.ntee_code }];
  });
  const prospectsN = await insertMissingByEin(db, pRows, srcBmf, 0.8);

  // Peers (1,598) — bulk orgs + a network_peer_orgs row each, flagged as workbook-seeded
  // (Phase 3 replaces the placeholder similarity with the real model).
  const peers = await pageAll<{ ein: string | null; name: string; ntee_code: string | null; city: string | null; peer_category: string | null; same_ntee_as_cyc: string | null; revenue: number | null; total_assets: number | null }>(
    (a, b) => db.from('cyc_peer_orgs').select('ein, name, ntee_code, city, peer_category, same_ntee_as_cyc, revenue, total_assets').eq('org_id', orgId).range(a, b));
  const peerRows: BulkOrg[] = peers.flatMap(p => {
    const ein = normalizeEin(p.ein); if (!ein || !p.name) return [];
    return [{ name: p.name, ein, type: 'nonprofit', city: p.city, state: 'IL', ntee: p.ntee_code }];
  });
  await insertMissingByEin(db, peerRows, srcBmf, 0.8);

  let peersN = 0;
  for (let i = 0; i < peers.length; i += 500) {
    const chunk = peers.slice(i, i + 500);
    const eins = chunk.map(p => normalizeEin(p.ein)).filter((e): e is string => !!e);
    const { data: nodes } = await db.from('network_organizations').select('id, ein').in('ein', eins);
    const idByEin = new Map((nodes ?? []).map(n => [n.ein as string, n.id as string]));
    const rows = chunk.flatMap(p => {
      const ein = normalizeEin(p.ein); const id = ein ? idByEin.get(ein) : null;
      if (!id) return [];
      const sameNtee = /^y|true|yes/i.test(String(p.same_ntee_as_cyc ?? ''));
      return [{
        org_id: orgId, organization_id: id,
        similarity: sameNtee ? 0.6 : 0.4,
        components: { seed: 'cyc_peer_orgs', peer_category: p.peer_category, same_ntee_as_cyc: sameNtee, program: sameNtee ? 0.8 : 0.5, geography: 1, size: null, population: null, mission: null },
        source_id: srcEo,
      }];
    });
    if (rows.length) {
      const { error } = await db.from('network_peer_orgs').upsert(rows, { onConflict: 'org_id,organization_id', ignoreDuplicates: true });
      if (error) throw new Error(`peer upsert failed: ${error.message}`);
      peersN += rows.length;
    }
  }
  return { cultivation: cultN, queue: queueN, prospects: prospectsN, peers: peersN };
}

// ── Funding events → canonical org ids ──────────────────────────────────────

export async function linkGrantsMade(db: Db): Promise<number> {
  const { data: grants } = await db.from('grants_made').select('id, funder_id, recipient_id, funder_org_id, recipient_org_id');
  const need = (grants ?? []).filter(g => !g.funder_org_id || !g.recipient_org_id);
  if (!need.length) return 0;
  // Look up only the funders/recipients these grants reference — a blanket
  // select would silently stop at PostgREST's 1,000-row default.
  const funderIds = [...new Set(need.map(g => g.funder_id as string).filter(Boolean))];
  const recipientIds = [...new Set(need.map(g => g.recipient_id as string).filter(Boolean))];
  const byFunder = new Map<string, string>(), byRecipient = new Map<string, string>();
  for (let i = 0; i < funderIds.length; i += 500) {
    const { data } = await db.from('network_organizations').select('id, funder_id').in('funder_id', funderIds.slice(i, i + 500));
    for (const o of data ?? []) byFunder.set(o.funder_id as string, o.id as string);
  }
  for (let i = 0; i < recipientIds.length; i += 500) {
    const { data } = await db.from('network_organizations').select('id, recipient_id').in('recipient_id', recipientIds.slice(i, i + 500));
    for (const o of data ?? []) byRecipient.set(o.recipient_id as string, o.id as string);
  }
  let n = 0;
  for (const g of need) {
    const patch: Record<string, unknown> = {};
    const f = byFunder.get(g.funder_id as string), r = byRecipient.get(g.recipient_id as string);
    if (!g.funder_org_id && f) patch.funder_org_id = f;
    if (!g.recipient_org_id && r) patch.recipient_org_id = r;
    if (Object.keys(patch).length) { await db.from('grants_made').update(patch).eq('id', g.id); n++; }
  }
  return n;
}

// ── Employers named by people → canonical org ids ──────────────────────────

export async function resolveEmployers(db: Db, orgId: string): Promise<{ people: number; employments: number; created: number }> {
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', '362344429').maybeSingle();
  let people = 0, employments = 0, created = 0;

  const resolve = async (raw: string | null, sourceId: string | null): Promise<string | null> => {
    const emp = canonicalEmployer(raw);
    if (!emp) return null;
    if (/chicago youth centers/i.test(emp.display)) return cyc?.id ?? null;
    const r = await ensureOrganization(db, { name: emp.display, type: orgTypeOf(emp.display), sourceId, confidence: 0.7 });
    if (r.created) created++;
    return r.id;
  };

  const { data: ppl } = await db.from('network_people')
    .select('id, current_org, source_id').eq('org_id', orgId).in('kind', ['board', 'staff', 'auxiliary', 'council']).is('organization_id', null);
  for (const p of ppl ?? []) {
    const id = await resolve(p.current_org as string | null, p.source_id as string | null);
    if (id) { await db.from('network_people').update({ organization_id: id }).eq('id', p.id); people++; }
  }

  const { data: emps } = await db.from('network_employments')
    .select('id, org_name, source_id, person:network_people!inner(org_id)').is('organization_id', null);
  for (const e of emps ?? []) {
    const person = e.person as unknown as { org_id: string } | null;
    if (person?.org_id !== orgId) continue;
    const id = await resolve(e.org_name as string, e.source_id as string | null);
    if (id) { await db.from('network_employments').update({ organization_id: id }).eq('id', e.id); employments++; }
  }
  return { people, employments, created };
}

export interface BridgeReport {
  stackA: { funders: number; recipients: number; backrefs: number };
  stackB: { cultivation: number; queue: number; prospects: number; peers: number };
  grantsLinked: number;
  employers: { people: number; employments: number; created: number };
  totalOrganizations: number;
}

export async function runBridge(orgId: string): Promise<BridgeReport> {
  const db = createServerClient();
  const stackA = await bridgeStackA(db);
  const stackB = await bridgeStackB(db, orgId);
  const grantsLinked = await linkGrantsMade(db);
  const employers = await resolveEmployers(db, orgId);
  const { count } = await db.from('network_organizations').select('id', { count: 'exact', head: true });
  return { stackA, stackB, grantsLinked, employers, totalOrganizations: count ?? 0 };
}
