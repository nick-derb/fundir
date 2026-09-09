// Run the organization bridge (Phase 1): resolve funders, recipients, CYC's
// workbook orgs, peers and every employer named by CYC's people into
// network_organizations, then link grants_made to canonical org ids.
// Idempotent — safe to re-run after any import.
//
//   npx tsx scripts/bridge-network.ts
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
  const { runBridge } = await import('@/lib/network/bridge');
  const db = createServerClient();
  const { data: org, error } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (error || !org) throw new Error('CYC org not found: ' + (error?.message ?? ''));

  console.log('Bridging organizations …');
  const t0 = Date.now();
  const r = await runBridge(org.id as string);
  console.log(`  Stack A  funders +${r.stackA.funders} · recipients +${r.stackA.recipients} · back-references attached ${r.stackA.backrefs}`);
  console.log(`  Stack B  cultivation +${r.stackB.cultivation} · research queue +${r.stackB.queue} · prospects +${r.stackB.prospects} · peer rows ${r.stackB.peers}`);
  console.log(`  grants_made linked to canonical orgs: ${r.grantsLinked}`);
  console.log(`  employers resolved: ${r.employers.people} people, ${r.employers.employments} employments (${r.employers.created} new org nodes)`);
  console.log(`\nnetwork_organizations now holds ${r.totalOrganizations.toLocaleString()} canonical orgs (${Math.round((Date.now() - t0) / 1000)}s).`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
