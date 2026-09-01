// Shared helpers for the one-time CYC data importers. Run with plain node from
// the repo root; reads Supabase creds from .env.local. Every importer defaults
// to DRY RUN (parse + summarize, no writes) and only writes with --commit.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const COMMIT = process.argv.includes('--commit');

/** Load .env.local into process.env (KEY=VALUE, quotes stripped, # comments). */
export function loadEnv() {
  let raw;
  try { raw = readFileSync(join(ROOT, '.env.local'), 'utf8'); }
  catch { throw new Error('.env.local not found at repo root'); }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getOrgId(db, orgCode = 'CYC2026') {
  const { data, error } = await db.from('organizations').select('id').eq('org_code', orgCode).single();
  if (error || !data) throw new Error(`org ${orgCode} not found: ${error?.message ?? 'no row'}`);
  return data.id;
}

export function readSheet(path, sheetName) {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: true });
  const name = sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet "${name}" not found in ${path} (have: ${wb.SheetNames.join(', ')})`);
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

/** Parse a currency/number cell → number | null. */
export function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Parse a date cell (Date from cellDates, or Excel serial) → 'YYYY-MM-DD' | null. */
export function isoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); // Excel serial → epoch
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Chunked upsert with progress. Returns total rows written. */
export async function upsertAll(db, table, rows, onConflict, chunk = 500) {
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await db.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table} upsert failed at row ${i}: ${error.message}`);
    done += slice.length;
    process.stdout.write(`\r   ${table}: ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
  return done;
}

export function summarize(label, rows, sample) {
  console.log(`\n${label}: ${rows.length} rows`);
  if (sample && rows[0]) console.log('   sample:', JSON.stringify(rows[0]).slice(0, 300));
}
