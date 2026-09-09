// Full network refresh from the terminal — the quarterly run, without clicking
// "Continue refresh" in the UI. Same code path as the button (bounded steps,
// spend recorded per step in network_refresh_runs), looped until done or until
// the step budget stops progress. Needs .env.local with RAPIDAPI_KEY +
// Supabase service creds.
//
//   npx tsx scripts/refresh-network.ts            # loop to completion
//   npx tsx scripts/refresh-network.ts --steps 1  # one bounded step (smoke)
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
  if (!process.env.RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY missing from .env.local');
  const stepsArg = process.argv.indexOf('--steps');
  const maxSteps = stepsArg > -1 ? Math.max(1, Number(process.argv[stepsArg + 1]) || 1) : 12;

  const { createServerClient } = await import('@/lib/supabase');
  const { runRefreshStep } = await import('@/lib/network/refresh');
  const db = createServerClient();
  const { data: orgRow, error } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (error || !orgRow) throw new Error('CYC org not found: ' + (error?.message ?? ''));

  let totalCalls = 0;
  for (let i = 1; i <= maxSteps; i++) {
    console.log(`\n— step ${i} —`);
    const r = await runRefreshStep(orgRow.id as string);
    totalCalls += r.apiCalls;
    if (r.enriched.length) console.log(`  read profiles: ${r.enriched.join(', ')}`);
    for (const s of r.scanned) console.log(`  scanned ${s.company}: ${s.leads} warm path${s.leads === 1 ? '' : 's'}`);
    for (const e of r.errors) console.log(`  ! ${e}`);
    console.log(`  ${r.apiCalls} API calls · pending: ${r.pendingEnrich} profiles, ${r.pendingScans} employers`);
    if (r.done) { console.log(`\nDone — network fully refreshed. Total API calls this run: ${totalCalls}.`); return; }
    if (!r.enriched.length && !r.scanned.length) {
      console.log('\nNo progress this step (see errors above) — stopping to protect the credit budget.');
      return;
    }
  }
  console.log(`\nStopped after ${maxSteps} steps (${totalCalls} calls). Re-run to continue.`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
