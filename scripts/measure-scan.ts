// Phase 2 gate: measure the REAL cost and response shape of one employer scan
// before any batch runs. One company, hard budget, prints calls used and what
// came back. Spends Pro-plan credits — run deliberately.
//
//   npx tsx scripts/measure-scan.ts "GTCR"
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
  const company = process.argv[2] || 'GTCR';
  const { searchEmployees, resolveCompany, CallBudget } = await import('@/lib/network/linkedin');
  const budget = new CallBudget(25);
  const t0 = Date.now();
  try {
    const match = await resolveCompany(company, budget);
    if (!match) { console.log(`"${company}": no matching LinkedIn company (${budget.used} calls)`); return; }
    console.log(`resolved "${company}" → ${match.name} (id ${match.companyId}, ${match.domain ?? 'no domain'}, ${match.employeeCount ?? '?'} employees) in ${budget.used} calls`);
    const before = budget.used;
    const hits = await searchEmployees(match, { budget, maxResults: 10 });
    console.log(`"${company}": ${hits.length} hits in ${budget.used - before} search calls (${budget.used} total, ${Math.round((Date.now() - t0) / 1000)}s)`);
    for (const h of hits.slice(0, 5)) console.log(`  - ${h.name ?? '(no name)'} · ${h.title ?? h.headline ?? '—'} · ${h.location ?? ''} · ${h.url}`);
    if (!hits.length) console.log('  (no hits — if calls > 0 the search ran but the result shape may differ; see raw shape below)');
  } catch (e) {
    console.log(`FAILED after ${budget.used} calls: ${e instanceof Error ? e.message : e}`);
  }
}

main();
