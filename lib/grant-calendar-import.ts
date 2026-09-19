// CYC's grant calendar workbook → cyc_grant_calendar, from inside the app.
//
// The workbook has one sheet per fiscal year ("FY27 Grant Calendar"): a header
// row, two rows of dropdown legends, then month section rows ("July") each
// followed by one row per item (proposal, LOI, report, outreach…). Some
// workbooks also carry a "Considered & Rejected" sheet (funder + reason) and
// stray working sheets ("Sheet1", "…Enhanced", "check email") that duplicate
// or annotate the main one. The parser keeps, per fiscal year, the sheet with
// the most items, reads the rejected list, and ignores the rest.
//
// Dates come in as m/d/yy text; anything that is not a date ("Rolling", "TBD")
// is kept verbatim in due_text so nothing CYC wrote is lost. A fiscal year is
// replaced whole on commit.

import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase';
import { readWorkbook } from '@/lib/instrumentl-import';

type Db = ReturnType<typeof createServerClient>;

export interface CalendarRow {
  fiscal_year: string; sheet: string; row_order: number; month_label: string | null;
  funder: string; status: string | null; item_type: string | null; ask_type: string | null; format: string | null; funding: string | null; program: string | null;
  portal: string | null; lead: string | null; re_id: string | null;
  due_date: string | null; due_text: string | null; internal_due_date: string | null; anticipated_gift_date: string | null;
  ly_award: number | null; planned_ask: number | null; projection_high: number | null; projection_low: number | null;
  outcome: string | null; amount: number | null; outcome_date: string | null; notes: string | null; re_notes: string | null; actions: string | null;
}
export interface SheetSummary { name: string; fiscal_year: string; rows: number; kind: 'calendar' | 'rejected' }
export interface CalendarParse { rows: CalendarRow[]; sheets: SheetSummary[]; skipped: string[] }

/** Portal passwords occasionally get typed into the Notes column. They never reach the database. */
const redact = (s: string) => s.replace(/\b(pw|pwd|password|passcode)\s*[:=]\s*\S+/gi, '[password removed]');
const str = (v: unknown) => { if (v == null) return null; const s = redact(String(v).replace(/\s+/g, ' ').trim()); return s === '' ? null : s; };
const num = (v: unknown) => { const s = str(v); if (!s) return null; const n = Number(s.replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
const pad = (n: number) => String(n).padStart(2, '0');
/** m/d/yy, m/d/yyyy, yyyy-mm-dd or a Date → ISO date; otherwise null. */
export function isoDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = str(v); if (!s) return null;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) { const y = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]); const m = Number(us[1]), d = Number(us[2]); if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad(m)}-${pad(d)}`; }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}
const MONTHS = /^(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const FY = (s: string | null | undefined) => { const m = (s ?? '').match(/(?<![a-z])FY\s?'?(\d{2})(?!\d)/i); return m ? `FY${m[1]}` : null; };
const normHeader = (s: unknown) => String(s ?? '').toLowerCase().replace(/[:*]/g, '').replace(/\s+/g, ' ').trim();

/** Header labels as CYC writes them → row fields. Exact after normalization; "date" alone is the outcome date. */
const HEADERS: Record<string, keyof CalendarRow | 'date_raw'> = {
  'status': 'status', 'funder': 'funder', 'portal': 'portal', 'internal due date': 'internal_due_date', 'due date': 'due_date',
  'type': 'item_type', 'ask type': 'ask_type', 'format': 'format', 'funding': 'funding', 'cyc': 'program', 'amount': 'amount',
  'notes': 'notes', 'lead': 'lead', 're id': 're_id', 'anticipated gift date': 'anticipated_gift_date', 'ly award': 'ly_award',
  'planned ask': 'planned_ask', 'projection (high)': 'projection_high', 'projection (low)': 'projection_low', 'outcome': 'outcome',
  'date': 'outcome_date', 'things to put into re': 're_notes', 'actions': 'actions',
};
const DATE_FIELDS = new Set<keyof CalendarRow>(['due_date', 'internal_due_date', 'anticipated_gift_date', 'outcome_date']);
const NUM_FIELDS = new Set<keyof CalendarRow>(['ly_award', 'planned_ask', 'projection_high', 'projection_low', 'amount']);

/** Read a sheet as a grid, capped so a sheet with stray formatting out to column XFC stays cheap. */
function grid(ws: XLSX.WorkSheet): unknown[][] {
  if (!ws['!ref']) return [];
  const r = XLSX.utils.decode_range(ws['!ref']);
  r.e.c = Math.min(r.e.c, 30); r.e.r = Math.min(r.e.r, 5000);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, range: XLSX.utils.encode_range(r) });
}

export function parseGrantCalendar(buffer: Buffer, fileName = ''): CalendarParse {
  const wb = readWorkbook(buffer);
  const fileFY = FY(fileName);
  const skipped: string[] = [];
  const candidates: Array<{ name: string; fy: string; rows: CalendarRow[] }> = [];
  const rejected: Array<{ name: string; rows: Array<{ funder: string; notes: string | null; order: number }> }> = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws) continue;
    const g = grid(ws);
    const hi = g.findIndex(r => r.some(c => normHeader(c) === 'funder'));
    if (hi < 0) { skipped.push(`${name}: no "Funder" column`); continue; }
    const header = g[hi].map(normHeader);
    const col = (label: string) => header.indexOf(label);
    if (col('due date') < 0) {
      if (col('notes') >= 0) {
        const rows = g.slice(hi + 1).map((r, i) => ({ funder: str(r[col('funder')]) ?? '', notes: str(r[col('notes')]), order: i })).filter(r => r.funder);
        rejected.push({ name, rows });
      } else skipped.push(`${name}: not a calendar sheet`);
      continue;
    }
    const fy = FY(name) ?? FY(g.slice(0, 6).flat().map(c => String(c ?? '')).join(' ')) ?? fileFY;
    if (!fy) { skipped.push(`${name}: could not tell which fiscal year it is`); continue; }
    // A workbook named for one year often carries a pasted copy of another year's
    // sheet. Only the named year is loaded, so the copy cannot overwrite the real
    // one; upload that year's own workbook to update it.
    if (fileFY && fy !== fileFY) { skipped.push(`${name}: a ${fy} sheet inside the ${fileFY} workbook — upload the ${fy} workbook to update ${fy}`); continue; }
    const fields = header.map(h => HEADERS[h] ?? null);
    const rows: CalendarRow[] = [];
    let month: string | null = null;
    for (const r of g.slice(hi + 1)) {
      const first = str(r[0]);
      const rest = r.slice(1).map(str);
      if (first && rest.every(c => c == null)) { month = first; continue; }
      if (first && /^(standardized values|instructions)$/i.test(first)) continue;
      if (first && /grant calendar/i.test(first)) continue;   // the "FY26 GRANT CALENDAR · July 1 – June 30" title row
      const funder = str(r[col('funder')]);
      if (!funder) continue;
      const row: CalendarRow = {
        fiscal_year: fy, sheet: name, row_order: rows.length, month_label: month, funder,
        status: null, item_type: null, ask_type: null, format: null, funding: null, program: null, portal: null, lead: null, re_id: null,
        due_date: null, due_text: null, internal_due_date: null, anticipated_gift_date: null,
        ly_award: null, planned_ask: null, projection_high: null, projection_low: null,
        outcome: null, amount: null, outcome_date: null, notes: null, re_notes: null, actions: null,
      };
      const rec = row as unknown as Record<string, unknown>;
      fields.forEach((f, i) => {
        if (!f || f === 'date_raw' || f === 'funder') return;
        const v = r[i];
        if (DATE_FIELDS.has(f)) {
          const d = isoDate(v);
          rec[f] = d;
          if (f === 'due_date' && !d) row.due_text = str(v);
        } else if (NUM_FIELDS.has(f)) rec[f] = num(v);
        else rec[f] = str(v);
      });
      // A legend row that slipped through (dropdown lists as values) is not an item.
      if (/^,/.test(row.status ?? '') || /^use dropdown/i.test(row.status ?? '')) continue;
      if (row.status && /^(planned|drafted|submitted|awarded|declined|n\/a)$/i.test(row.status)) row.status = row.status.replace(/^n\/a$/i, 'N/A').replace(/^\w/, c => c.toUpperCase());
      if (row.item_type) row.item_type = row.item_type.replace(/^\w/, c => c.toUpperCase());
      if (month && !MONTHS.test(month) && !/rolling|fy/i.test(month)) row.month_label = null;
      rows.push(row);
    }
    candidates.push({ name, fy, rows });
  }

  // One sheet per fiscal year: the fullest one wins; the others are working copies.
  const byFY = new Map<string, { name: string; fy: string; rows: CalendarRow[] }>();
  for (const c of candidates) {
    const cur = byFY.get(c.fy);
    if (!cur) { byFY.set(c.fy, c); continue; }
    const [keep, drop] = c.rows.length > cur.rows.length ? [c, cur] : [cur, c];
    byFY.set(c.fy, keep);
    skipped.push(`${drop.name}: duplicate ${drop.fy} sheet (${drop.rows.length} items); kept "${keep.name}" (${keep.rows.length})`);
  }
  const sheets: SheetSummary[] = [...byFY.values()].map(c => ({ name: c.name, fiscal_year: c.fy, rows: c.rows.length, kind: 'calendar' as const }));
  const rows = [...byFY.values()].flatMap(c => c.rows);

  // The rejected list belongs to the workbook's main fiscal year.
  const mainFY = fileFY ?? [...byFY.values()].sort((a, b) => b.rows.length - a.rows.length)[0]?.fy ?? null;
  for (const rj of rejected) {
    if (!mainFY) { skipped.push(`${rj.name}: no fiscal year to attach the rejected list to`); continue; }
    rows.push(...rj.rows.map(r => ({
      fiscal_year: mainFY, sheet: rj.name, row_order: 10_000 + r.order, month_label: null, funder: r.funder,
      status: 'Rejected', item_type: 'Considered', ask_type: null, format: null, funding: null, program: null, portal: null, lead: null, re_id: null,
      due_date: null, due_text: null, internal_due_date: null, anticipated_gift_date: null,
      ly_award: null, planned_ask: null, projection_high: null, projection_low: null,
      outcome: null, amount: null, outcome_date: null, notes: r.notes, re_notes: null, actions: null,
    })));
    sheets.push({ name: rj.name, fiscal_year: mainFY, rows: rj.rows.length, kind: 'rejected' });
  }
  return { rows, sheets, skipped };
}

export interface CalendarPreview {
  sheets: SheetSummary[]; skipped: string[];
  years: Array<{ fiscal_year: string; in_file: number; dated: number; undated: number; rejected: number; on_file_now: number; statuses: Record<string, number> }>;
  sample: Array<{ fiscal_year: string; funder: string; item_type: string | null; due: string }>;
}

async function build(db: Db, orgId: string, buffer: Buffer, fileName: string) {
  const parsed = parseGrantCalendar(buffer, fileName);
  if (!parsed.rows.length) throw new Error(`No calendar rows found (expected a sheet with "Funder" and "Due Date" columns and a fiscal year in its name, like "FY27 Grant Calendar")${parsed.skipped.length ? ` — ${parsed.skipped.join('; ')}` : ''}`);
  const fys = [...new Set(parsed.rows.map(r => r.fiscal_year))];
  const { data: existing } = await db.from('cyc_grant_calendar').select('fiscal_year').eq('org_id', orgId).in('fiscal_year', fys).limit(10000);
  const onFile = new Map<string, number>();
  for (const e of existing ?? []) onFile.set(e.fiscal_year as string, (onFile.get(e.fiscal_year as string) ?? 0) + 1);
  const years = fys.map(fy => {
    const rows = parsed.rows.filter(r => r.fiscal_year === fy);
    const items = rows.filter(r => r.item_type !== 'Considered');
    const statuses: Record<string, number> = {};
    for (const r of items) statuses[r.status ?? '—'] = (statuses[r.status ?? '—'] ?? 0) + 1;
    return { fiscal_year: fy, in_file: items.length, dated: items.filter(r => r.due_date).length, undated: items.filter(r => !r.due_date).length, rejected: rows.length - items.length, on_file_now: onFile.get(fy) ?? 0, statuses };
  });
  const today = new Date().toISOString().slice(0, 10);
  const sample = parsed.rows.filter(r => r.due_date && r.due_date >= today).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 6)
    .map(r => ({ fiscal_year: r.fiscal_year, funder: r.funder, item_type: r.item_type, due: r.due_date! }));
  const preview: CalendarPreview = { sheets: parsed.sheets, skipped: parsed.skipped, years, sample };
  return { rows: parsed.rows, fys, preview };
}

export async function previewGrantCalendar(db: Db, orgId: string, buffer: Buffer, fileName: string): Promise<CalendarPreview> {
  return (await build(db, orgId, buffer, fileName)).preview;
}

/** Replace every fiscal year the workbook carries with the workbook's rows. */
export async function commitGrantCalendar(db: Db, orgId: string, buffer: Buffer, fileName: string): Promise<{ written: number; replaced: number; years: string[]; preview: CalendarPreview }> {
  const { rows, fys, preview } = await build(db, orgId, buffer, fileName);
  const { data: gone, error: de } = await db.from('cyc_grant_calendar').delete().eq('org_id', orgId).in('fiscal_year', fys).select('id');
  if (de) throw new Error(de.message);
  const now = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const { data, error } = await db.from('cyc_grant_calendar').insert(rows.slice(i, i + 400).map(r => ({ ...r, org_id: orgId, imported_at: now }))).select('id');
    if (error) throw new Error(error.message);
    written += data?.length ?? 0;
  }
  return { written, replaced: gone?.length ?? 0, years: fys, preview };
}
