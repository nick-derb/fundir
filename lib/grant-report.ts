// The organization's grant report workbook → Fundir.
//
// CYC keeps a curated report for each fiscal year: one row per application,
// with its status (awarded, declined, pending), funding type (restricted or
// unrestricted), purpose, ask type (new, renewal, re-engagement), requested
// and awarded amounts and notes. It is cleaner than the Instrumentl export,
// so for the year it covers it is the source of truth:
//   - the dashboard's funding numbers and breakdowns come from it (the
//     "Breakdowns" sheet, computed instead of typed);
//   - awarded funders go on the funder record as current funders, and a
//     re-engagement ask marks a funder that gave before as a past funder;
//   - open network leads for these funders move to the matching stage:
//     pending → Awaiting decision, awarded → Won (with the amount),
//     declined → Lost. Every move is logged on the lead.
// An upload replaces that fiscal year's rows; earlier years are kept.

import * as XLSX from 'xlsx';
import type { createServerClient } from '@/lib/supabase';
import { readWorkbook } from '@/lib/instrumentl-import';
import { normalizeOrgName } from '@/lib/network/normalize';
import { toAmount, listKnownFunders, recordKnownFunder, ownOrgNodeId, type KnownFunder } from '@/lib/known-funders';

type Db = ReturnType<typeof createServerClient>;

export type ReportStatus = 'awarded' | 'declined' | 'pending';
export interface ReportRow {
  funder: string; normalized: string; status: ReportStatus;
  funding: string | null; purpose: string | null; purpose_group: string | null; ask_type: string | null;
  requested: number | null; requested_text: string | null; awarded: number | null; notes: string | null; row_order: number;
}
export interface ReportParse { fiscal_year: number | null; rows: ReportRow[]; sheet: string; skipped: number; columns: Record<string, string | null> }

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cell = (v: unknown) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s || null; };

/** "FY27", "FY 2027", "fy-27" → 2027. */
export function fiscalYearFrom(...texts: Array<string | null | undefined>): number | null {
  for (const t of texts) {
    const m = String(t ?? '').match(/\bFY\s*[-_ ]?\s*(\d{4}|\d{2})\b/i);
    if (m) { const n = Number(m[1]); return n < 100 ? 2000 + n : n; }
  }
  return null;
}

/** The fiscal year a date falls in, for a year that starts in `startMonth` (0 = January; CYC's starts in July). */
export const fiscalYearOf = (d: Date, startMonth = 6) => (startMonth === 0 ? d.getFullYear() : d.getMonth() >= startMonth ? d.getFullYear() + 1 : d.getFullYear());

export function statusOf(v: string | null): ReportStatus | null {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s || /^total/.test(s)) return null;
  if (/award|funded|won|granted|received|approved/.test(s) && !/not funded/.test(s)) return 'awarded';
  if (/declin|denied|reject|not funded|lost|unsuccessful/.test(s)) return 'declined';
  if (/pend|submit|review|await|applied|tentativ|in progress|open/.test(s)) return 'pending';
  return null;
}

const COLS = {
  status: ['status', 'grant status', 'stage'],
  funder: ['funder', 'funder name', 'foundation', 'organization', 'grantor', 'funding source'],
  funding: ['funding', 'funding type', 'restricted unrestricted', 'restriction', 'restricted'],
  purpose: ['purpose', 'program', 'project', 'use of funds'],
  ask: ['ask type', 'type of ask', 'request type', 'ask', 'type'],
  requested: ['requested', 'amount requested', 'request', 'ask amount', 'request amount'],
  awarded: ['awarded', 'amount awarded', 'award', 'award amount', 'granted', 'amount received'],
  notes: ['notes', 'note', 'comments'],
};
const pick = (h: string[], cands: string[]) => { for (const c of cands) { const i = h.indexOf(c); if (i >= 0) return i; } return -1; };

/** Read the report: the first sheet with a Status and a Funder column; running-total columns and TOTAL rows are ignored. */
export function parseGrantReport(buffer: Buffer, fileName?: string): ReportParse {
  const wb = readWorkbook(buffer);
  for (const sheet of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: '', raw: true });
    let hi = -1;
    for (let i = 0; i < Math.min(grid.length, 12); i++) { const h = (grid[i] ?? []).map(norm); if (pick(h, COLS.status) >= 0 && pick(h, COLS.funder) >= 0) { hi = i; break; } }
    if (hi < 0) continue;
    const h = (grid[hi] ?? []).map(norm);
    const ix = Object.fromEntries(Object.entries(COLS).map(([k, c]) => [k, pick(h, c)])) as Record<keyof typeof COLS, number>;
    const title = grid.slice(0, hi).map(r => (r ?? []).map(cell).filter(Boolean).join(' ')).join(' ');
    const rows: ReportRow[] = [];
    let skipped = 0;
    grid.slice(hi + 1).forEach((r, i) => {
      const funder = cell(r[ix.funder]);
      const status = statusOf(cell(r[ix.status]));
      if (!funder || !status) { if (funder || cell(r[ix.status])) skipped++; return; }
      const normalized = normalizeOrgName(funder);
      if (!normalized) { skipped++; return; }
      const reqRaw = ix.requested >= 0 ? r[ix.requested] : null;
      const requested = toAmount(reqRaw);
      const purpose = ix.purpose >= 0 ? cell(r[ix.purpose]) : null;
      rows.push({
        funder, normalized, status,
        funding: ix.funding >= 0 ? cell(r[ix.funding]) : null,
        purpose, purpose_group: purpose ? purpose.split(/\s+[-–—]\s+/)[0].trim() || purpose : null,
        ask_type: ix.ask >= 0 ? cell(r[ix.ask]) : null,
        requested, requested_text: requested == null ? cell(reqRaw) : null,
        awarded: ix.awarded >= 0 ? toAmount(r[ix.awarded]) : null,
        notes: ix.notes >= 0 ? cell(r[ix.notes]) : null, row_order: i,
      });
    });
    if (!rows.length) continue;
    const col = (i: number) => (i >= 0 ? String(grid[hi][i] ?? '').trim() : null);
    return { fiscal_year: fiscalYearFrom(sheet, title, fileName), rows, sheet, skipped, columns: { status: col(ix.status), funder: col(ix.funder), funding: col(ix.funding), purpose: col(ix.purpose), ask_type: col(ix.ask), requested: col(ix.requested), awarded: col(ix.awarded) } };
  }
  throw new Error('No grant rows found. The report needs a "Status" column (Awarded, Declined or Pending) and a "Funder" column; "Requested" and "Awarded" amounts are read when present.');
}

// ── Totals and breakdowns (pure; the dashboard and the preview both use it) ──

export interface Breakdown { label: string; requested: number; awarded: number; count: number }
export interface ReportSummary {
  fiscal_year: number;
  counts: Record<ReportStatus, number>;
  /** Pending and awarded asks only, as the workbook's Breakdowns sheet counts them. */
  requested: number; awarded: number; pending_requested: number; declined_requested: number;
  /** Awarded ÷ (awarded + declined), by count; null until something is decided. */
  win_rate: number | null;
  by_funding: Breakdown[]; by_ask: Breakdown[]; by_purpose: Breakdown[];
  largest_pending: Array<{ funder: string; requested: number; purpose: string | null }>;
}

const label = (s: string | null, fallback: string) => { const t = (s ?? '').trim(); return t ? t[0].toUpperCase() + t.slice(1) : fallback; };
function group(rows: Array<Pick<ReportRow, 'requested' | 'awarded'>>, key: (r: never) => string): Breakdown[] {
  const m = new Map<string, Breakdown>();
  for (const r of rows) { const k = key(r as never); const b = m.get(k) ?? { label: k, requested: 0, awarded: 0, count: 0 }; b.requested += r.requested ?? 0; b.awarded += r.awarded ?? 0; b.count++; m.set(k, b); }
  return [...m.values()].sort((a, b) => b.requested + b.awarded - (a.requested + a.awarded));
}

export function summarizeReport(rows: Array<Pick<ReportRow, 'funder' | 'status' | 'funding' | 'purpose' | 'purpose_group' | 'ask_type' | 'requested' | 'awarded'>>, fiscal_year: number): ReportSummary {
  const live = rows.filter(r => r.status !== 'declined');
  const counts = { awarded: 0, declined: 0, pending: 0 } as Record<ReportStatus, number>;
  for (const r of rows) counts[r.status]++;
  const sum = (xs: typeof rows, f: (r: (typeof rows)[number]) => number | null) => xs.reduce((a, r) => a + (f(r) ?? 0), 0);
  const decided = counts.awarded + counts.declined;
  return {
    fiscal_year, counts,
    requested: sum(live, r => r.requested), awarded: sum(rows, r => r.awarded),
    pending_requested: sum(rows.filter(r => r.status === 'pending'), r => r.requested), declined_requested: sum(rows.filter(r => r.status === 'declined'), r => r.requested),
    win_rate: decided ? counts.awarded / decided : null,
    by_funding: group(live, (r: ReportRow) => label(r.funding, 'Not stated')),
    by_ask: group(live, (r: ReportRow) => label(r.ask_type, 'Not stated')),
    by_purpose: group(live, (r: ReportRow) => label(r.purpose_group, 'Not stated')),
    largest_pending: rows.filter(r => r.status === 'pending' && r.requested).sort((a, b) => (b.requested ?? 0) - (a.requested ?? 0)).slice(0, 5).map(r => ({ funder: r.funder, requested: r.requested ?? 0, purpose: r.purpose })),
  };
}

// ── Matching report funders to network leads ────────────────────────────────

const SUFFIX = /\b(foundation|charitable|trust|fund|funds|giving|gives|community|engagement|company|corporation|corp|inc|the)\b/g;
/** "Associated Bank" and "Associated Bank Foundation" share a key; used only when it picks out one lead target. */
export const looseFunderKey = (normalized: string) => normalized.replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();

const OPEN = ['NEW', 'RESEARCHING', 'INTRODUCTION_NEEDED', 'INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'AWAITING_DECISION', 'DEFERRED'];
const BEFORE_DECISION = ['NEW', 'RESEARCHING', 'INTRODUCTION_NEEDED', 'INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'DEFERRED'];

interface LeadRef { id: string; pipeline_status: string; target_org_id: string; target_name: string }
type Move = { lead: LeadRef; row: ReportRow; to: 'AWAITING_DECISION' | 'WON' | 'LOST' };

async function openLeads(db: Db, orgId: string): Promise<LeadRef[]> {
  const { data } = await db.from('network_leads').select('id, pipeline_status, target_org_id, target:network_organizations!network_leads_target_org_id_fkey(name)').eq('org_id', orgId).in('pipeline_status', OPEN).not('target_org_id', 'is', null).limit(2000);
  return ((data ?? []) as unknown as Array<{ id: string; pipeline_status: string; target_org_id: string; target: { name: string } | null }>).filter(l => l.target).map(l => ({ id: l.id, pipeline_status: l.pipeline_status, target_org_id: l.target_org_id, target_name: l.target!.name }));
}

/** For each report row, the open leads whose target is that funder: exact name first, then the loose key when it is unambiguous. */
export function matchLeads(rows: ReportRow[], leads: LeadRef[]): Map<ReportRow, LeadRef[]> {
  const byExact = new Map<string, LeadRef[]>(), byLoose = new Map<string, Set<string>>();
  for (const l of leads) {
    const n = normalizeOrgName(l.target_name);
    (byExact.get(n) ?? byExact.set(n, []).get(n)!).push(l);
    const k = looseFunderKey(n); if (k) (byLoose.get(k) ?? byLoose.set(k, new Set()).get(k)!).add(l.target_org_id);
  }
  const out = new Map<ReportRow, LeadRef[]>();
  for (const r of rows) {
    let hit = byExact.get(r.normalized) ?? [];
    if (!hit.length) {
      const targets = byLoose.get(looseFunderKey(r.normalized));
      if (targets && targets.size === 1) { const t = [...targets][0]; hit = leads.filter(l => l.target_org_id === t); }
    }
    if (hit.length) out.set(r, hit);
  }
  return out;
}

function movesFor(rows: ReportRow[], leads: LeadRef[]): Move[] {
  const moves: Move[] = [];
  for (const [row, ls] of matchLeads(rows, leads)) for (const lead of ls) {
    if (row.status === 'awarded') moves.push({ lead, row, to: 'WON' });
    else if (row.status === 'declined') moves.push({ lead, row, to: 'LOST' });
    else if (BEFORE_DECISION.includes(lead.pipeline_status)) moves.push({ lead, row, to: 'AWAITING_DECISION' });
  }
  return moves;
}

const money = (n: number | null) => (n == null ? '' : `$${Math.round(n).toLocaleString('en-US')}`);
const outcomeText = (r: ReportRow, fy: number) => r.status === 'awarded'
  ? `${money(r.awarded)} awarded FY${String(fy).slice(2)}${r.purpose ? `, ${r.purpose}` : ''}${r.funding ? ` (${r.funding.toLowerCase()})` : ''}`
  : `Declined FY${String(fy).slice(2)}${r.requested ? ` (${money(r.requested)} requested)` : ''}`;

// ── Preview and commit ──────────────────────────────────────────────────────

export interface ReportPreview {
  fiscal_year: number; fiscal_year_source: 'file' | 'today'; sheet: string; columns: ReportParse['columns'];
  rows: number; skipped: number; replaces: number;
  summary: ReportSummary;
  funders_current: number; funders_past: number;
  lead_moves: Array<{ funder: string; to: Move['to'] }>;
}

async function plan(db: Db, orgId: string, buffer: Buffer, fileName: string | undefined, fyOverride: number | null) {
  const parsed = parseGrantReport(buffer, fileName);
  const fy = fyOverride ?? parsed.fiscal_year ?? fiscalYearOf(new Date());
  const [leads, known, { count }] = await Promise.all([
    openLeads(db, orgId), listKnownFunders(db, orgId),
    db.from('org_grant_report').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('fiscal_year', fy),
  ]);
  const knownBy = new Map(known.map(k => [k.normalized_name, k]));
  // Awarded → current. A re-engagement ask that has not (yet) been awarded means they gave before → past, unless already on record.
  const current = parsed.rows.filter(r => r.status === 'awarded');
  const past = parsed.rows.filter(r => r.status !== 'awarded' && /re.?engag/i.test(r.ask_type ?? '') && !knownBy.has(r.normalized) && !current.some(c => c.normalized === r.normalized));
  return { parsed, fy, leads, knownBy, current, past, moves: movesFor(parsed.rows, leads), replaces: count ?? 0 };
}

export async function previewGrantReport(db: Db, orgId: string, buffer: Buffer, fileName?: string, fyOverride: number | null = null): Promise<ReportPreview> {
  const p = await plan(db, orgId, buffer, fileName, fyOverride);
  return {
    fiscal_year: p.fy, fiscal_year_source: fyOverride || p.parsed.fiscal_year ? 'file' : 'today', sheet: p.parsed.sheet, columns: p.parsed.columns,
    rows: p.parsed.rows.length, skipped: p.parsed.skipped, replaces: p.replaces,
    summary: summarizeReport(p.parsed.rows, p.fy),
    funders_current: new Set(p.current.map(r => r.normalized)).size, funders_past: new Set(p.past.map(r => r.normalized)).size,
    lead_moves: p.moves.map(m => ({ funder: m.row.funder, to: m.to })),
  };
}

export interface ReportCommit { fiscal_year: number; rows: number; funders_recorded: number; leads_moved: number; preview: ReportPreview }

export async function commitGrantReport(db: Db, orgId: string, buffer: Buffer, actor: string | null, fileName?: string, fyOverride: number | null = null): Promise<ReportCommit> {
  const preview = await previewGrantReport(db, orgId, buffer, fileName, fyOverride);
  const p = await plan(db, orgId, buffer, fileName, fyOverride);
  const fy = p.fy, fyTag = `FY${String(fy).slice(2)}`;
  const nodeFor = new Map<string, string>();
  for (const [row, ls] of matchLeads(p.parsed.rows, p.leads)) nodeFor.set(row.normalized, ls[0].target_org_id);

  // 1. The rows: replace this fiscal year.
  await db.from('org_grant_report').delete().eq('org_id', orgId).eq('fiscal_year', fy);
  const now = new Date().toISOString();
  for (let i = 0; i < p.parsed.rows.length; i += 200) {
    const { error } = await db.from('org_grant_report').insert(p.parsed.rows.slice(i, i + 200).map(r => ({
      org_id: orgId, fiscal_year: fy, funder: r.funder, normalized_funder: r.normalized, network_org_id: nodeFor.get(r.normalized) ?? null, status: r.status,
      funding: r.funding, purpose: r.purpose, purpose_group: r.purpose_group, ask_type: r.ask_type, requested: r.requested, requested_text: r.requested_text,
      awarded: r.awarded, notes: r.notes?.slice(0, 2000) ?? null, row_order: r.row_order, imported_at: now, imported_by: actor,
    })));
    if (error) throw new Error(`report rows: ${error.message}`);
  }

  // 2. Leads first (so a funder's win is a Won lead, not a closed white-space one), then the funder record.
  let moved = 0;
  for (const m of p.moves) {
    const patch: Record<string, unknown> = { pipeline_status: m.to, updated_at: now };
    if (m.to !== 'AWAITING_DECISION') { patch.outcome = outcomeText(m.row, fy).slice(0, 500); patch.next_action = null; patch.next_action_date = null; }
    const { error } = await db.from('network_leads').update(patch).eq('id', m.lead.id).eq('org_id', orgId);
    if (error) continue;
    await db.from('network_actions').insert({ org_id: orgId, lead_id: m.lead.id, actor: actor ?? 'fundir', action: m.to === 'AWAITING_DECISION' ? 'status_change' : 'outcome', status: m.to,
      notes: m.to === 'AWAITING_DECISION' ? `Application pending per the ${fyTag} grant report${m.row.requested ? ` (${money(m.row.requested)} requested)` : ''}` : `${outcomeText(m.row, fy)}, per the ${fyTag} grant report` });
    moved++;
  }
  const ctx = { ownNode: await ownOrgNodeId(db, orgId), own: (await import('@/lib/org-label')).orgShortName(((await db.from('organizations').select('name').eq('id', orgId).maybeSingle()).data?.name as string | null) ?? null) };
  const year = Math.min(new Date().getFullYear(), fy);
  let recorded = 0;
  const seen = new Set<string>();
  for (const r of p.current) {
    if (seen.has(r.normalized)) continue; seen.add(r.normalized);
    const prior: KnownFunder | undefined = p.knownBy.get(r.normalized);
    const awards = p.current.filter(x => x.normalized === r.normalized);
    const total = awards.reduce((a, x) => a + (x.awarded ?? 0), 0);
    await recordKnownFunder(db, orgId, {
      name: prior?.name ?? r.funder, network_org_id: nodeFor.get(r.normalized) ?? prior?.network_org_id ?? null, relationship: 'current',
      last_gift_year: Math.max(year, prior?.last_gift_year ?? 0) || year, last_gift_amount: total || prior?.last_gift_amount || null,
      total_given: prior?.total_given ?? null, gift_count: prior?.gift_count ?? null, last_gift_date: prior?.last_gift_date ?? null,
      notes: [`${fyTag} award ${money(total)}${r.purpose ? ` · ${r.purpose}` : ''}${r.funding ? ` · ${r.funding}` : ''}`, prior?.notes && !prior.notes.startsWith(fyTag) ? prior.notes : null].filter(Boolean).join(' | ').slice(0, 1000),
      source: prior && prior.source !== 'grant_report' ? prior.source : 'grant_report',
    }, actor, ctx);
    recorded++;
  }
  for (const r of p.past) {
    if (seen.has(r.normalized)) continue; seen.add(r.normalized);
    await recordKnownFunder(db, orgId, { name: r.funder, network_org_id: nodeFor.get(r.normalized) ?? null, relationship: 'past', notes: `Re-engagement ask in ${fyTag}${r.notes ? `: ${r.notes}` : ''}`.slice(0, 1000), source: 'grant_report' }, actor, ctx);
    recorded++;
  }
  return { fiscal_year: fy, rows: p.parsed.rows.length, funders_recorded: recorded, leads_moved: moved, preview };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export interface StoredReportRow extends ReportRow { fiscal_year: number; network_org_id: string | null; imported_at: string }

export async function loadReport(db: Db, orgId: string, fy: number): Promise<{ rows: StoredReportRow[]; imported_at: string | null }> {
  const { data, error } = await db.from('org_grant_report').select('fiscal_year, funder, normalized_funder, network_org_id, status, funding, purpose, purpose_group, ask_type, requested, requested_text, awarded, notes, row_order, imported_at').eq('org_id', orgId).eq('fiscal_year', fy).order('row_order');
  if (error) throw new Error(`grant report: ${error.message}`);
  const rows = (data ?? []).map(d => ({ ...d, normalized: d.normalized_funder as string, requested: d.requested == null ? null : Number(d.requested), awarded: d.awarded == null ? null : Number(d.awarded) })) as unknown as StoredReportRow[];
  return { rows, imported_at: rows[0]?.imported_at ?? null };
}

export async function reportYears(db: Db, orgId: string): Promise<Array<{ fiscal_year: number; rows: number; imported_at: string }>> {
  const { data } = await db.from('org_grant_report').select('fiscal_year, imported_at').eq('org_id', orgId);
  const m = new Map<number, { fiscal_year: number; rows: number; imported_at: string }>();
  for (const r of data ?? []) { const y = r.fiscal_year as number; const c = m.get(y) ?? { fiscal_year: y, rows: 0, imported_at: r.imported_at as string }; c.rows++; m.set(y, c); }
  return [...m.values()].sort((a, b) => b.fiscal_year - a.fiscal_year);
}
