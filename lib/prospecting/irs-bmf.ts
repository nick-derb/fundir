// Pure helpers for replacing the IRS Business Master File (BMF) sheet.
//
// Runs in the browser: the dropped file is parsed client-side (so a 20 MB
// eo_il.csv never has to fit through a serverless request body), normalized
// into the shape of the irs_bmf_il table, and posted to the API in batches.
// No DB access here; everything is testable in isolation.

export interface BmfRow {
  ein: string;
  name: string | null;
  ico: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  subsection: string | null;
  classification: string | null;
  ruling: string | null;
  deductibility: string | null;
  foundation: string | null;
  activity: string | null;
  organization: string | null;
  status: string | null;
  tax_period: string | null;
  asset_cd: string | null;
  income_cd: string | null;
  filing_req_cd: string | null;
  pf_filing_req_cd: string | null;
  asset_amt: number | null;
  income_amt: number | null;
  revenue_amt: number | null;
  ntee_cd: string | null;
  sort_name: string | null;
}

/** IRS header → irs_bmf_il column. Extra IRS columns (GROUP, AFFILIATION, ACCT_PD) are ignored. */
export const BMF_HEADER_TO_FIELD: Record<string, keyof BmfRow> = {
  EIN: 'ein', NAME: 'name', ICO: 'ico', STREET: 'street', CITY: 'city', STATE: 'state', ZIP: 'zip',
  SUBSECTION: 'subsection', CLASSIFICATION: 'classification', RULING: 'ruling', DEDUCTIBILITY: 'deductibility',
  FOUNDATION: 'foundation', ACTIVITY: 'activity', ORGANIZATION: 'organization', STATUS: 'status',
  TAX_PERIOD: 'tax_period', ASSET_CD: 'asset_cd', INCOME_CD: 'income_cd', FILING_REQ_CD: 'filing_req_cd',
  PF_FILING_REQ_CD: 'pf_filing_req_cd', ASSET_AMT: 'asset_amt', INCOME_AMT: 'income_amt',
  REVENUE_AMT: 'revenue_amt', NTEE_CD: 'ntee_cd', SORT_NAME: 'sort_name',
};

export const BMF_FIELDS = Object.values(BMF_HEADER_TO_FIELD) as (keyof BmfRow)[];
const NUMERIC_FIELDS = new Set<keyof BmfRow>(['asset_amt', 'income_amt', 'revenue_amt']);

/** Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const n = text.length;
  let i = 0;
  // Skip a UTF-8 BOM.
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

/** Header row + data rows → records keyed by the upper-cased, trimmed header. */
export function rowsToRecords(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim().toUpperCase());
  const records = rows.slice(1).map(r => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = r[i] ?? ''; });
    return rec;
  });
  return { headers, records };
}

export type FormatCheck = { ok: true } | { ok: false; reason: string };

/** Is this the IRS BMF (eo_*.csv) and not some other IRS extract? */
export function detectBmfFormat(headers: string[]): FormatCheck {
  const H = new Set(headers.map(h => String(h ?? '').trim().toUpperCase()));
  if (H.has('TOTASSETSEND') || H.has('TOTREVENUE') || H.has('TAX_PD')) {
    return { ok: false, reason: 'This looks like an IRS Form 990 extract. Fundir replaces the Business Master File today. Drop the exempt-organization file for Illinois (eo_il.csv) from the IRS BMF download page.' };
  }
  if (!H.has('EIN')) return { ok: false, reason: 'No EIN column found. Drop the IRS Exempt Organizations Business Master File (eo_il.csv) in its raw format.' };
  if (!H.has('NAME')) return { ok: false, reason: 'No NAME column found. Drop the IRS Exempt Organizations Business Master File (eo_il.csv) in its raw format.' };
  return { ok: true };
}

/** EIN as a 9-digit string; tolerates 12-3456789, numbers, and dropped leading zeros. */
export function normalizeEin(v: unknown): string | null {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length > 9) return null;
  return digits.padStart(9, '0');
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export interface NormalizeResult {
  rows: BmfRow[];
  skippedNoEin: number;
  skippedOtherState: number;
  duplicates: number;
}

/**
 * Records → irs_bmf_il rows. Keeps one row per EIN (last wins), drops rows
 * without an EIN and, when `state` is given, rows filed in another state
 * (so a multi-state region file still yields the Illinois sheet).
 */
export function normalizeBmfRows(records: Record<string, unknown>[], opts: { state?: string } = {}): NormalizeResult {
  const byEin = new Map<string, BmfRow>();
  let skippedNoEin = 0, skippedOtherState = 0, duplicates = 0;
  const want = opts.state?.toUpperCase();
  for (const rec of records) {
    const upper: Record<string, unknown> = {};
    for (const k of Object.keys(rec)) upper[k.trim().toUpperCase()] = rec[k];
    const ein = normalizeEin(upper.EIN);
    if (!ein) { skippedNoEin++; continue; }
    const state = str(upper.STATE)?.toUpperCase() ?? null;
    if (want && state && state !== want) { skippedOtherState++; continue; }
    const row = { ein } as BmfRow;
    for (const [header, field] of Object.entries(BMF_HEADER_TO_FIELD)) {
      if (field === 'ein') continue;
      const raw = upper[header];
      (row as unknown as Record<string, unknown>)[field] = NUMERIC_FIELDS.has(field) ? num(raw) : str(raw);
    }
    if (byEin.has(ein)) duplicates++;
    byEin.set(ein, row);
  }
  return { rows: [...byEin.values()], skippedNoEin, skippedOtherState, duplicates };
}

/** Keep only known columns on a row that came over the wire. */
export function pickBmfFields(input: Record<string, unknown>): BmfRow | null {
  const ein = normalizeEin(input.ein);
  if (!ein) return null;
  const row = { ein } as BmfRow;
  for (const field of BMF_FIELDS) {
    if (field === 'ein') continue;
    const raw = input[field];
    (row as unknown as Record<string, unknown>)[field] = NUMERIC_FIELDS.has(field) ? num(raw) : str(raw);
  }
  return row;
}
