// Smoke: build the Reports read model against live data and print it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
function loadEnv() {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (!m) continue;
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
async function main() {
  loadEnv();
  const { createServerClient } = await import('@/lib/supabase');
  const { buildReportsIntel } = await import('@/lib/network/reports');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  const t0 = Date.now();
  const r = await buildReportsIntel(db, org!.id as string);
  console.log(`built in ${Date.now() - t0} ms`);
  console.log('reach', r.reach.funders_reachable, r.reach.high_confidence, r.reach.doors.map(d => `${d.name} ${d.funders}`).join(' | '));
  console.log('white space', r.white_space.funders, Math.round(r.white_space.peer_dollars), r.white_space.top.slice(0, 3).map(t => `${t.name} $${Math.round(t.dollars)}`).join(' | '), r.white_space.by_year);
  console.log('evidence', r.evidence);
  console.log('coverage', r.coverage.own_total, r.coverage.with_url, r.coverage.read, r.coverage.with_paths, r.coverage.missing.length);
  console.log('pipeline', r.pipeline.stages.filter(s => s.count).map(s => `${s.label} ${s.count} (${s.avg_days}d)`).join(' | '), 'overdue', r.pipeline.overdue);
  console.log('ledger', r.ledger);
  console.log('grants', r.grants);
}
main().catch(e => { console.error('FAILED:', e); process.exit(1); });
