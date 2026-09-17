// Instrumentl export → cyc_grant_submissions, from inside the app.
//
// The same mapping the one-time importer script used (scripts/import-instrumentl.mjs),
// made re-runnable: upload the latest export, see exactly what would change
// (new, updated, unchanged, and rows no longer in the file), then replace.
// "Abandoned" is CYC's own choice, not a funder decision, so it never becomes an
// outcome label. Duplicate (opportunity, funder) rows collapse to the most complete.

import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase';

type Db = ReturnType<typeof createServerClient>;

export interface SubmissionRow {
  project: string | null; opportunity_name: string; funder_name: string; owner: string | null; status: string | null;
  outcome: 'awarded' | 'rejected' | null; stage: string; opportunity_amount: number | null; amount_requested: number | null; amount_awarded: number | null;
  loi_deadline: string | null; preproposal_deadline: string | null; fullproposal_deadline: string | null; notes: string | null; source: 'instrumentl';
}
export interface ImportPreview {
  file_rows: number; mapped: number; collapsed: number; funders: number; awarded: number; rejected: number;
  new: number; updated: number; unchanged: number; removed: number;
  sample_new: Array<{ opportunity: string; funder: string; status: string | null }>;
  sample_updated: Array<{ opportunity: string; funder: string; changes: string[] }>;
  sample_removed: Array<{ opportunity: string; funder: string; status: string | null }>;
  missing_columns: string[];
}

const REQUIRED = ['Opportunity name', 'Funder name', 'Status'];
const num = (v: unknown) => { if (v == null || v === '') return null; if (typeof v === 'number') return v; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
const str = (v: unknown) => { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s; };
const isoDate = (v: unknown) => { if (v == null || v === '') return null; if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10); if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); } const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const outcomeOf = (status: string | null): SubmissionRow['outcome'] => { const s = (status ?? '').toLowerCase(); return s.startsWith('awarded') ? 'awarded' : s === 'declined' ? 'rejected' : null; };
const stageOf = (status: string | null) => { const s = (status ?? '').toLowerCase(); return s.startsWith('awarded') ? 'awarded' : s === 'declined' ? 'rejected' : s === 'abandoned' ? 'abandoned' : s.includes('submitted') ? 'submitted' : s.includes('in progress') ? 'drafting' : s === 'planned' ? 'planned' : 'researching'; };
const keyOf = (r: { opportunity_name: string; funder_name: string }) => `${r.opportunity_name}|||${r.funder_name}`;

/** Parse the workbook and map rows; returns the mapped rows plus what the parser noticed. */
export function parseInstrumentl(buffer: Buffer): { rows: SubmissionRow[]; file_rows: number; collapsed: number; missing_columns: string[] } {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The workbook has no sheets');
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const header = raw.length ? Object.keys(raw[0]) : (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] ?? []) as string[];
  const missing_columns = REQUIRED.filter(c => !header.includes(c));
  if (missing_columns.length === REQUIRED.length) throw new Error(`This does not look like an Instrumentl export (expected columns: ${REQUIRED.join(', ')})`);
  const mapped: SubmissionRow[] = raw.filter(r => str(r['Opportunity name']) || str(r['Funder name'])).map(r => ({
    project: str(r['Project']), opportunity_name: str(r['Opportunity name']) ?? '(untitled)', funder_name: str(r['Funder name']) ?? '(unknown funder)', owner: str(r['Owner']),
    status: str(r['Status']), outcome: outcomeOf(str(r['Status'])), stage: stageOf(str(r['Status'])),
    opportunity_amount: num(r['Opportunity Amount']), amount_requested: num(r['Amount requested']), amount_awarded: num(r['Amount awarded']),
    loi_deadline: isoDate(r['Funder LOI deadline']), preproposal_deadline: isoDate(r['Funder Pre-proposal deadline']), fullproposal_deadline: isoDate(r['Funder Full proposal deadline']),
    notes: str(r['Notes']), source: 'instrumentl',
  }));
  // Keep the most complete of duplicate (opportunity, funder) rows: outcomes and real amounts win.
  const rank = (r: SubmissionRow) => (r.outcome ? 4 : 0) + ((r.amount_awarded ?? 0) > 0 ? 2 : 0) + ((r.amount_requested ?? 0) > 0 ? 1 : 0);
  const byKey = new Map<string, SubmissionRow>();
  for (const r of mapped) { const k = keyOf(r); const prev = byKey.get(k); if (!prev || rank(r) > rank(prev)) byKey.set(k, r); }
  return { rows: [...byKey.values()], file_rows: raw.length, collapsed: mapped.length - byKey.size, missing_columns };
}

const COMPARE: Array<keyof SubmissionRow> = ['project', 'owner', 'status', 'outcome', 'stage', 'opportunity_amount', 'amount_requested', 'amount_awarded', 'loi_deadline', 'preproposal_deadline', 'fullproposal_deadline', 'notes'];

/** Diff the parsed file against what the org currently has. */
export async function previewInstrumentl(db: Db, orgId: string, buffer: Buffer): Promise<ImportPreview & { rows: SubmissionRow[] }> {
  const parsed = parseInstrumentl(buffer);
  const { data: existing } = await db.from('cyc_grant_submissions').select('opportunity_name, funder_name, project, owner, status, outcome, stage, opportunity_amount, amount_requested, amount_awarded, loi_deadline, preproposal_deadline, fullproposal_deadline, notes, source').eq('org_id', orgId).limit(5000);
  const cur = new Map((existing ?? []).map(e => [keyOf(e as { opportunity_name: string; funder_name: string }), e as Record<string, unknown>]));
  const fileKeys = new Set(parsed.rows.map(keyOf));
  const sample_new: ImportPreview['sample_new'] = [], sample_updated: ImportPreview['sample_updated'] = [];
  let added = 0, updated = 0, unchanged = 0;
  for (const r of parsed.rows) {
    const e = cur.get(keyOf(r));
    if (!e) { added++; if (sample_new.length < 6) sample_new.push({ opportunity: r.opportunity_name, funder: r.funder_name, status: r.status }); continue; }
    const changes = COMPARE.filter(k => String(e[k] ?? '') !== String(r[k] ?? ''));
    if (changes.length) { updated++; if (sample_updated.length < 6) sample_updated.push({ opportunity: r.opportunity_name, funder: r.funder_name, changes }); }
    else unchanged++;
  }
  const removedRows = (existing ?? []).filter(e => (e.source ?? 'instrumentl') === 'instrumentl' && !fileKeys.has(keyOf(e as { opportunity_name: string; funder_name: string })));
  return {
    rows: parsed.rows, file_rows: parsed.file_rows, mapped: parsed.rows.length + parsed.collapsed, collapsed: parsed.collapsed,
    funders: new Set(parsed.rows.map(r => r.funder_name)).size, awarded: parsed.rows.filter(r => r.outcome === 'awarded').length, rejected: parsed.rows.filter(r => r.outcome === 'rejected').length,
    new: added, updated, unchanged, removed: removedRows.length,
    sample_new, sample_updated, sample_removed: removedRows.slice(0, 6).map(e => ({ opportunity: e.opportunity_name as string, funder: e.funder_name as string, status: (e.status as string | null) ?? null })),
    missing_columns: parsed.missing_columns,
  };
}

/** Replace the org's Instrumentl-sourced submissions with the file's rows. */
export async function commitInstrumentl(db: Db, orgId: string, buffer: Buffer): Promise<{ written: number; removed: number; preview: ImportPreview }> {
  const { rows, ...preview } = await previewInstrumentl(db, orgId, buffer);
  const fileKeys = new Set(rows.map(keyOf));
  // Remove instrumentl rows that the new export no longer carries (the file is the source of truth).
  const { data: existing } = await db.from('cyc_grant_submissions').select('id, opportunity_name, funder_name, source').eq('org_id', orgId).limit(5000);
  const gone = (existing ?? []).filter(e => (e.source ?? 'instrumentl') === 'instrumentl' && !fileKeys.has(keyOf(e as { opportunity_name: string; funder_name: string }))).map(e => e.id as string);
  for (let i = 0; i < gone.length; i += 200) await db.from('cyc_grant_submissions').delete().in('id', gone.slice(i, i + 200));
  let written = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const { error, data } = await db.from('cyc_grant_submissions').upsert(rows.slice(i, i + 400).map(r => ({ ...r, org_id: orgId })), { onConflict: 'org_id,opportunity_name,funder_name' }).select('id');
    if (error) throw new Error(error.message);
    written += data?.length ?? 0;
  }
  return { written, removed: gone.length, preview };
}
