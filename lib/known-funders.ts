// Funders the tenant already has a relationship with, recorded by the tenant.
//
// Two ways in: one click on a lead ("Past funder" / "Current funder"), or a
// donor-system export (Raiser's Edge) uploaded through the Data Hub. Grant
// trackers miss many of these funders: ones that just send money without an
// application, or that last gave before the tracked fiscal years. Without
// this record the network kept pitching them as untapped prospects.
//
// What a record does:
//   - The lead read model labels any lead for that funder (Current funder /
//     Past funder, with the last gift year) and drops the "no funding
//     identified" claim from an untapped-funder lead.
//   - An existing_cyc_relationship edge (tenant → funder, source_type
//     'known_funder') goes into the relationship graph, so the untapped-funder
//     generator stops proposing it and insights stop calling it untapped. The
//     derived-edge rebuild only replaces 'derived:%' edges, so this one stays.
//   - A current funder's open untapped-funder lead is closed as "Already funds
//     us". A past funder's stays open: a lapsed funder that still gives to
//     peers is a re-engagement opportunity, and the label says so.

import * as XLSX from 'xlsx';
import type { createServerClient } from '@/lib/supabase';
import { readWorkbook } from '@/lib/instrumentl-import';
import { normalizeOrgName } from '@/lib/network/normalize';

type Db = ReturnType<typeof createServerClient>;

export type KnownRelationship = 'current' | 'past';
export type KnownSource = 'manual' | 'raisers_edge' | 'feedback' | 'grant_report';

export interface KnownFunder {
  id: string; name: string; normalized_name: string; network_org_id: string | null;
  relationship: KnownRelationship; last_gift_year: number | null; last_gift_date: string | null;
  last_gift_amount: number | null; total_given: number | null; gift_count: number | null;
  source: KnownSource; notes: string | null; recorded_by: string | null; updated_at: string;
}

/** What a lead row carries when its funder is on record. */
export interface KnownTag { id: string; relationship: KnownRelationship; last_gift_year: number | null; source: KnownSource }

const SELECT = 'id, name, normalized_name, network_org_id, relationship, last_gift_year, last_gift_date, last_gift_amount, total_given, gift_count, source, notes, recorded_by, updated_at';
export const KNOWN_EDGE_SOURCE = 'known_funder';
/** Gifts within this many months make a donor-system funder "current". */
export const CURRENT_WINDOW_MONTHS = 18;

export async function listKnownFunders(db: Db, orgId: string): Promise<KnownFunder[]> {
  const { data, error } = await db.from('org_known_funders').select(SELECT).eq('org_id', orgId).order('name');
  if (error) throw new Error(`known funders: ${error.message}`);
  return (data ?? []) as unknown as KnownFunder[];
}

/** Lookup by graph node first, then by normalized name, so an imported funder is recognised when its lead appears later. */
export function knownIndex(rows: KnownFunder[]) {
  const byOrg = new Map<string, KnownFunder>(), byName = new Map<string, KnownFunder>();
  for (const r of rows) { if (r.network_org_id) byOrg.set(r.network_org_id, r); byName.set(r.normalized_name, r); }
  return (target: { id: string; name: string } | null | undefined): KnownTag | null => {
    if (!target) return null;
    const r = byOrg.get(target.id) ?? byName.get(normalizeOrgName(target.name));
    return r ? { id: r.id, relationship: r.relationship, last_gift_year: r.last_gift_year, source: r.source } : null;
  };
}

/** The tenant's own node in the relationship graph: by EIN, else a unique exact name. */
export async function ownOrgNodeId(db: Db, orgId: string): Promise<string | null> {
  const { data: org } = await db.from('organizations').select('name, ein').eq('id', orgId).maybeSingle();
  if (!org) return null;
  const ein = String(org.ein ?? '').replace(/\D/g, '');
  if (ein) {
    const { data } = await db.from('network_organizations').select('id').eq('ein', ein.padStart(9, '0')).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: hits } = await db.from('network_organizations').select('id').eq('normalized_name', normalizeOrgName(org.name as string)).limit(2);
  return hits && hits.length === 1 ? (hits[0].id as string) : null;
}

/** A funder name → one graph node, or null when absent or ambiguous (no guessing). */
export async function resolveFunderNode(db: Db, normalized: string): Promise<{ id: string; name: string } | null> {
  if (!normalized) return null;
  const { data } = await db.from('network_organizations').select('id, name, funder_id').eq('normalized_name', normalized).limit(5);
  const rows = data ?? [];
  if (rows.length === 1) return { id: rows[0].id as string, name: rows[0].name as string };
  const funders = rows.filter(r => r.funder_id);
  return funders.length === 1 ? { id: funders[0].id as string, name: funders[0].name as string } : null;
}

const describe = (r: Pick<KnownFunder, 'relationship' | 'last_gift_year' | 'source'>, own: string, funder: string) =>
  `${funder} is on record as a ${r.relationship} ${own} funder${r.last_gift_year ? ` (last gift ${r.last_gift_year})` : ''}, per ${r.source === 'raisers_edge' ? "the Raiser's Edge export" : r.source === 'feedback' ? 'a correction from the team' : r.source === 'grant_report' ? 'the grant report' : 'the team'}`;

async function writeEdge(db: Db, orgId: string, ownNode: string, target: { id: string; name: string }, r: Pick<KnownFunder, 'relationship' | 'last_gift_year' | 'source' | 'notes'>, own: string) {
  await db.from('network_relationships').delete().eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').eq('source_type', KNOWN_EDGE_SOURCE).eq('source_organization_id', ownNode).eq('target_organization_id', target.id);
  await db.from('network_relationships').insert({
    org_id: orgId, relationship_type: 'existing_cyc_relationship', source_organization_id: ownNode, target_organization_id: target.id,
    relationship_strength: r.relationship === 'current' ? 10 : 8, confidence: 0.9, verification: 'verified', source_type: KNOWN_EDGE_SOURCE,
    evidence: { summary: describe(r, own, target.name), status: r.relationship, last_gift_year: r.last_gift_year, source: r.source, notes: r.notes },
    observed_at: new Date().toISOString(),
  });
}

async function dropEdge(db: Db, orgId: string, targetId: string) {
  await db.from('network_relationships').delete().eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').eq('source_type', KNOWN_EDGE_SOURCE).eq('target_organization_id', targetId);
}

/** A current funder is not white space: close its open untapped-funder leads, logged like any other dismissal. */
async function closeUntapped(db: Db, orgId: string, targetId: string, actor: string | null): Promise<number> {
  const { data: open } = await db.from('network_leads').select('id, pipeline_status').eq('org_id', orgId).eq('target_org_id', targetId).eq('insight_type', 'Untapped Funder')
    .not('pipeline_status', 'in', '(WON,LOST,NOT_A_FIT)');
  const ids = (open ?? []).map(l => l.id as string);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  await db.from('network_leads').update({ pipeline_status: 'NOT_A_FIT', dismissal_reason: 'already_funder', next_action: null, next_action_date: null, updated_at: now }).in('id', ids);
  await db.from('network_actions').insert(ids.map(id => ({ org_id: orgId, lead_id: id, actor: actor ?? 'fundir', action: 'dismiss', status: 'NOT_A_FIT', notes: 'reason: already_funder · recorded as a current funder' })));
  return ids.length;
}

async function ownShort(db: Db, orgId: string): Promise<string> {
  const { orgShortName } = await import('@/lib/org-label');
  const { data } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
  return orgShortName((data?.name as string | null) ?? null);
}

export interface RecordInput {
  name: string; network_org_id?: string | null; relationship: KnownRelationship;
  last_gift_year?: number | null; last_gift_date?: string | null; last_gift_amount?: number | null; total_given?: number | null; gift_count?: number | null;
  notes?: string | null; source: KnownSource;
}

/** Record (or update) one funder relationship and apply it to the graph and the leads. */
export async function recordKnownFunder(db: Db, orgId: string, input: RecordInput, actor: string | null, ctx?: { ownNode: string | null; own: string }): Promise<{ funder: KnownFunder; linked: boolean; closed: number }> {
  const name = input.name.trim().slice(0, 200);
  const normalized = normalizeOrgName(name);
  if (!normalized) throw new Error('A funder name is required');
  const node = input.network_org_id
    ? await db.from('network_organizations').select('id, name').eq('id', input.network_org_id).maybeSingle().then(r => (r.data ? { id: r.data.id as string, name: r.data.name as string } : null))
    : await resolveFunderNode(db, normalized);
  const row = {
    org_id: orgId, name, normalized_name: normalized, network_org_id: node?.id ?? null, relationship: input.relationship,
    last_gift_year: input.last_gift_year ?? null, last_gift_date: input.last_gift_date ?? null, last_gift_amount: input.last_gift_amount ?? null,
    total_given: input.total_given ?? null, gift_count: input.gift_count ?? null, source: input.source, notes: input.notes?.slice(0, 1000) ?? null,
    recorded_by: actor, updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('org_known_funders').upsert(row, { onConflict: 'org_id,normalized_name' }).select(SELECT).single();
  if (error) throw new Error(`record funder: ${error.message}`);
  let closed = 0;
  if (node) {
    // The untapped-funder insight's premise ("no funding identified") is now wrong: retire it.
    await db.from('network_insights').update({ dismissed_at: new Date().toISOString() }).eq('org_id', orgId).eq('insight_type', 'Untapped Funder').is('dismissed_at', null).filter('path', 'cs', JSON.stringify([{ id: node.id }]));
    const ownNode = ctx ? ctx.ownNode : await ownOrgNodeId(db, orgId);
    const own = ctx?.own ?? await ownShort(db, orgId);
    if (ownNode) await writeEdge(db, orgId, ownNode, node, row, own);
    if (input.relationship === 'current') closed = await closeUntapped(db, orgId, node.id, actor);
  }
  return { funder: data as unknown as KnownFunder, linked: !!node, closed };
}

/** Take a record off (a mistake): the label and the graph edge go; a closed lead stays closed and can be reopened from the lead. */
export async function removeKnownFunder(db: Db, orgId: string, id: string): Promise<boolean> {
  const { data } = await db.from('org_known_funders').select('id, network_org_id').eq('org_id', orgId).eq('id', id).maybeSingle();
  if (!data) return false;
  if (data.network_org_id) await dropEdge(db, orgId, data.network_org_id as string);
  await db.from('org_known_funders').delete().eq('id', id).eq('org_id', orgId);
  return true;
}

// ── Raiser's Edge (or any donor-system) export ──────────────────────────────

export interface DonorRow {
  name: string; normalized: string; type: string | null;
  last_gift_date: string | null; last_gift_amount: number | null; total_given: number | null; gift_count: number | null; first_gift_date: string | null;
}
export interface DonorParse { rows: DonorRow[]; file_rows: number; skipped_individuals: number; columns: { name: string; type: string | null; last_date: string | null; amount: string | null; total: string | null; count: string | null } }

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
const pick = (header: string[], ...cands: string[]): number => {
  const h = header.map(norm);
  for (const c of cands) { const i = h.indexOf(c); if (i >= 0) return i; }
  return -1;
};
const NAME_COLS = ['organization name', 'org name', 'organization', 'funder name', 'funder', 'foundation name', 'foundation', 'constituent name', 'name', 'key name', 'donor name', 'donor', 'account name', 'full name', 'constituent'];
const TYPE_COLS = ['constituent type', 'constituent code', 'type', 'record type', 'donor type', 'constituency'];
const LAST_DATE_COLS = ['last gift date', 'last gift', 'most recent gift date', 'latest gift date', 'last gift dt', 'last donation date', 'gift date', 'date'];
const AMOUNT_COLS = ['last gift amount', 'last gift amt', 'most recent gift amount', 'gift amount', 'amount'];
const TOTAL_COLS = ['lifetime giving', 'lifetime giving amount', 'total giving', 'total gifts', 'total given', 'total gift amount', 'total amount', 'lifetime total', 'total'];
const COUNT_COLS = ['number of gifts', 'gift count', '# of gifts', 'total number of gifts', 'no of gifts', 'gifts'];
const FIRST_DATE_COLS = ['first gift date', 'first gift'];
const INDIVIDUAL = /^(individual|person|household|family member|i)$/i;

/** Excel serials, Date objects and the usual US date strings → YYYY-MM-DD. */
export function toIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})$/); if (m) return `${m[1]}-12-31`;
  const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
export const toAmount = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return Number.isFinite(n) ? n : null; };

/** Read a donor-system export: one row per funder (summary export) or per gift (gift export, rolled up by funder). */
export function parseDonorExport(buffer: Buffer): DonorParse {
  const wb = readWorkbook(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The workbook has no sheets');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
  // The header is the first of the top rows that names a funder column (exports often carry a title row or two).
  let hi = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i++) if (pick((grid[i] ?? []).map(String), ...NAME_COLS) >= 0) { hi = i; break; }
  if (hi < 0) throw new Error(`No funder name column found. Expected one of: ${NAME_COLS.slice(0, 8).map(c => `"${c}"`).join(', ')}.`);
  const header = (grid[hi] ?? []).map(String);
  // Prefer an organization column over a generic name column when both exist.
  const nameIx = pick(header, ...NAME_COLS);
  const ix = { type: pick(header, ...TYPE_COLS), last: pick(header, ...LAST_DATE_COLS), amount: pick(header, ...AMOUNT_COLS), total: pick(header, ...TOTAL_COLS), count: pick(header, ...COUNT_COLS), first: pick(header, ...FIRST_DATE_COLS) };
  const giftLevel = ix.total < 0 && ix.count < 0 && /^(gift date|date)$/.test(norm(header[ix.last] ?? ''));
  const by = new Map<string, DonorRow>();
  let fileRows = 0, skipped = 0;
  for (const r of grid.slice(hi + 1)) {
    const name = String(r[nameIx] ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    fileRows++;
    const type = ix.type >= 0 ? String(r[ix.type] ?? '').trim() || null : null;
    if (type && INDIVIDUAL.test(type)) { skipped++; continue; }
    const normalized = normalizeOrgName(name);
    if (!normalized) continue;
    const last = ix.last >= 0 ? toIsoDate(r[ix.last]) : null;
    const amount = ix.amount >= 0 ? toAmount(r[ix.amount]) : null;
    const cur = by.get(normalized) ?? { name, normalized, type, last_gift_date: null, last_gift_amount: null, total_given: null, gift_count: null, first_gift_date: null };
    if (last && (!cur.last_gift_date || last > cur.last_gift_date)) { cur.last_gift_date = last; cur.last_gift_amount = amount ?? cur.last_gift_amount; }
    else if (!cur.last_gift_date && amount != null && cur.last_gift_amount == null) cur.last_gift_amount = amount;
    if (giftLevel) { cur.total_given = (cur.total_given ?? 0) + (amount ?? 0); cur.gift_count = (cur.gift_count ?? 0) + 1; }
    else {
      const t = ix.total >= 0 ? toAmount(r[ix.total]) : null; if (t != null) cur.total_given = Math.max(cur.total_given ?? 0, t);
      const c = ix.count >= 0 ? toAmount(r[ix.count]) : null; if (c != null) cur.gift_count = Math.max(cur.gift_count ?? 0, Math.round(c));
    }
    const first = ix.first >= 0 ? toIsoDate(r[ix.first]) : null; if (first && (!cur.first_gift_date || first < cur.first_gift_date)) cur.first_gift_date = first;
    by.set(normalized, cur);
  }
  const col = (i: number) => (i >= 0 ? header[i] : null);
  return { rows: [...by.values()], file_rows: fileRows, skipped_individuals: skipped, columns: { name: header[nameIx], type: col(ix.type), last_date: col(ix.last), amount: col(ix.amount), total: col(ix.total), count: col(ix.count) } };
}

/** Current when the last gift is inside the window; otherwise past (including no date). */
export function relationshipFor(lastGift: string | null, now = new Date()): KnownRelationship {
  if (!lastGift) return 'past';
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - CURRENT_WINDOW_MONTHS);
  return new Date(lastGift + 'T00:00:00') >= cutoff ? 'current' : 'past';
}

export interface DonorPreview {
  file_rows: number; funders: number; skipped_individuals: number; columns: DonorParse['columns'];
  current: number; past: number; in_graph: number; already_recorded: number; kept_manual: number;
  leads_relabelled: number; leads_closed: number;
  sample: Array<{ name: string; relationship: KnownRelationship; last_gift: string | null; total: number | null; in_graph: boolean }>;
}

async function planDonors(db: Db, orgId: string, buffer: Buffer) {
  const parsed = parseDonorExport(buffer);
  const existing = await listKnownFunders(db, orgId);
  const byName = new Map(existing.map(e => [e.normalized_name, e]));
  // Resolve names against the graph in bulk.
  const names = parsed.rows.map(r => r.normalized);
  const nodes = new Map<string, { id: string; name: string; funder_id: string | null }[]>();
  for (let i = 0; i < names.length; i += 200) {
    const { data } = await db.from('network_organizations').select('id, name, normalized_name, funder_id').in('normalized_name', names.slice(i, i + 200));
    for (const o of data ?? []) { const k = o.normalized_name as string; const a = nodes.get(k) ?? []; a.push({ id: o.id as string, name: o.name as string, funder_id: o.funder_id as string | null }); nodes.set(k, a); }
  }
  const nodeFor = (k: string) => { const a = nodes.get(k) ?? []; if (a.length === 1) return a[0]; const f = a.filter(x => x.funder_id); return f.length === 1 ? f[0] : null; };
  const plan = parsed.rows.map(r => {
    const prior = byName.get(r.normalized);
    const manual = prior && prior.source !== 'raisers_edge';
    // A relationship the team set by hand wins over the export; the export still fills the gift history.
    const relationship: KnownRelationship = manual ? prior!.relationship : relationshipFor(r.last_gift_date);
    return { row: r, relationship, node: nodeFor(r.normalized), prior, manual: !!manual };
  });
  const nodeIds = plan.map(p => p.node?.id).filter((x): x is string => !!x);
  const openLeads = new Map<string, { insight: string | null }[]>();
  for (let i = 0; i < nodeIds.length; i += 200) {
    const { data } = await db.from('network_leads').select('target_org_id, insight_type').eq('org_id', orgId).in('target_org_id', nodeIds.slice(i, i + 200)).not('pipeline_status', 'in', '(WON,LOST,NOT_A_FIT)');
    for (const l of data ?? []) { const a = openLeads.get(l.target_org_id as string) ?? []; a.push({ insight: l.insight_type as string | null }); openLeads.set(l.target_org_id as string, a); }
  }
  return { parsed, plan, openLeads };
}

export async function previewDonorExport(db: Db, orgId: string, buffer: Buffer): Promise<DonorPreview> {
  const { parsed, plan, openLeads } = await planDonors(db, orgId, buffer);
  let relabelled = 0, closed = 0;
  for (const p of plan) {
    const ls = p.node ? openLeads.get(p.node.id) ?? [] : [];
    relabelled += ls.length;
    if (p.relationship === 'current') closed += ls.filter(l => l.insight === 'Untapped Funder').length;
  }
  const sorted = [...plan].sort((a, b) => Number(!!b.node) - Number(!!a.node) || (b.row.last_gift_date ?? '').localeCompare(a.row.last_gift_date ?? ''));
  return {
    file_rows: parsed.file_rows, funders: plan.length, skipped_individuals: parsed.skipped_individuals, columns: parsed.columns,
    current: plan.filter(p => p.relationship === 'current').length, past: plan.filter(p => p.relationship === 'past').length,
    in_graph: plan.filter(p => p.node).length, already_recorded: plan.filter(p => p.prior).length, kept_manual: plan.filter(p => p.manual).length,
    leads_relabelled: relabelled, leads_closed: closed,
    sample: sorted.slice(0, 12).map(p => ({ name: p.row.name, relationship: p.relationship, last_gift: p.row.last_gift_date, total: p.row.total_given, in_graph: !!p.node })),
  };
}

export interface DonorCommit { recorded: number; linked: number; leads_closed: number; preview: DonorPreview }

export async function commitDonorExport(db: Db, orgId: string, buffer: Buffer, actor: string | null): Promise<DonorCommit> {
  const preview = await previewDonorExport(db, orgId, buffer);
  const { plan } = await planDonors(db, orgId, buffer);
  const ctx = { ownNode: await ownOrgNodeId(db, orgId), own: await ownShort(db, orgId) };
  let recorded = 0, linked = 0, closedN = 0;
  for (const p of plan) {
    const year = p.row.last_gift_date ? Number(p.row.last_gift_date.slice(0, 4)) : null;
    const res = await recordKnownFunder(db, orgId, {
      name: p.prior?.name ?? p.row.name, network_org_id: p.node?.id ?? p.prior?.network_org_id ?? null, relationship: p.relationship,
      last_gift_year: year ?? p.prior?.last_gift_year ?? null, last_gift_date: p.row.last_gift_date, last_gift_amount: p.row.last_gift_amount,
      total_given: p.row.total_given, gift_count: p.row.gift_count, notes: p.prior?.notes ?? null,
      source: p.manual ? p.prior!.source : 'raisers_edge',
    }, actor, ctx);
    recorded++; if (res.linked) linked++; closedN += res.closed;
  }
  return { recorded, linked, leads_closed: closedN, preview };
}
