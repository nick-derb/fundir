// Write today's snapshot (thirteen-sheet .xlsx + .json) to a local folder —
// the copy CYC keeps regardless of the website. Default folder is
// ../../exports next to the repo; pass --out <dir> to change it.
//
//   npx tsx scripts/snapshot.ts [--out "C:\path\to\folder"]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

function loadEnv() {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };

async function main() {
  loadEnv();
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const out = resolve(arg('--out') ?? join(ROOT, '..', '..', 'exports'));
  mkdirSync(out, { recursive: true });
  const { createServerClient } = await import('@/lib/supabase');
  const { buildSnapshot, workbookFromSnapshot, workbookBuffer, snapshotJson, snapshotNames } = await import('@/lib/network/snapshot');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  const t0 = Date.now();
  const snap = await buildSnapshot(db, org!.id as string);
  const names = snapshotNames();
  const xlsx = workbookBuffer(workbookFromSnapshot(snap));
  const json = snapshotJson(snap);
  writeFileSync(join(out, names.xlsx), xlsx);
  writeFileSync(join(out, names.json), json);
  console.log(`Snapshot written to ${out}`);
  console.log(`  ${names.xlsx}  ${(xlsx.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ${names.json}  ${(json.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  rows: ${Object.entries(snap.meta.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  built in ${((Date.now() - t0) / 1000).toFixed(1)} s · Claude calls 0 · RapidAPI 0`);
}
main().catch(e => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
