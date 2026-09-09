// Re-derive the relationship graph for CYC from current rows. Idempotent —
// replaces every derived:* edge; edges from other sources (cyc_workbook,
// manual) are untouched.
//
//   npx tsx scripts/derive-edges.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

async function main() {
  loadEnv();
  const { createServerClient } = await import('@/lib/supabase');
  const { resolveEmployers } = await import('@/lib/network/bridge');
  const { deriveRelationships } = await import('@/lib/network/edges');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');

  const emp = await resolveEmployers(db, org.id as string);
  console.log(`employers resolved: ${emp.people} people, ${emp.employments} employments (${emp.created} new org nodes)`);
  const r = await deriveRelationships(org.id as string);
  console.log(`edges written: ${r.written} (${r.computed} from people/employment/boards/schools, ${r.crossTable} from CYC records, CRA, peer funding, leads)`);
  for (const [t, n] of Object.entries(r.byType).sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(28)} ${n}`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
