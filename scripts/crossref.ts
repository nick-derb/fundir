// Phase 4 — foundation board cross-reference, end to end:
//   1. corporate-foundation officers → [inferred] employment at the parent
//   2. (optional) harvest public bios for the top-N foundations' trustees
//   3. re-derive the relationship graph
//   4. rank foundations, compute warm paths, persist leads + insights, report
//
//   npx tsx scripts/crossref.ts                    # steps 1, 3, 4 — no Claude spend
//   npx tsx scripts/crossref.ts --bios 10          # also harvest bios for the top 10 (bounded Claude spend)
//   npx tsx scripts/crossref.ts --bios 10 --max-calls 8
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
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };

async function main() {
  loadEnv();
  const bios = Number(arg('--bios')) || 0;
  const maxCalls = Number(arg('--max-calls')) || 12;
  const { createServerClient } = await import('@/lib/supabase');
  const { inferCorporateEmployment, rankFoundations, computeWarmPaths } = await import('@/lib/network/crossref');
  const { applyKnownSites, harvestFoundationBios, siteFor } = await import('@/lib/network/roster');
  const { deriveRelationships } = await import('@/lib/network/edges');
  const { resolveEmployers } = await import('@/lib/network/bridge');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const orgId = org.id as string;

  const sites = await applyKnownSites(db);
  const corp = await inferCorporateEmployment(db, orgId);
  console.log(`websites applied: ${sites} · corporate-foundation officers → [inferred] employment: ${corp.inferred} across ${corp.corporations} corporations`);

  let ranked = await rankFoundations(db, orgId, 40);
  console.log(`\nTop foundations by relevance (peer events · queue · cultivation · funded CYC · trustees):`);
  for (const f of ranked.slice(0, 15)) console.log(`  ${String(f.relevance).padStart(3)}  ${f.name.slice(0, 44).padEnd(44)} ${f.peerEvents}·${f.onQueue ? 'Q' : '-'}·${f.onCultivation ? 'C' : '-'}·${f.fundedCyc ? '$' : '-'}·${f.trustees}`);

  let claudeCalls = 0;
  if (bios > 0) {
    console.log(`\nHarvesting public bios for the top ${bios} foundations (≤ ${maxCalls} Claude calls each) …`);
    for (const f of ranked.slice(0, bios)) {
      const { data: seats } = await db.from('network_boards').select('person_id, network_people!inner(id, name, kind, org_id)').eq('organization_id', f.id);
      const trustees = (seats ?? []).map(s => s.network_people as unknown as { id: string; name: string; kind: string; org_id: string })
        .filter(p => p.org_id === orgId && (p.kind === 'trustee' || p.kind === 'executive'));
      const site = siteFor(f.name, f.website);
      const r = await harvestFoundationBios(db, orgId, { id: f.id, name: f.name, website: site }, trustees, maxCalls);
      claudeCalls += r.claudeCalls;
      console.log(`  ${f.name}: ${r.extracted}/${trustees.length} bios (${r.pagesTried} pages, ${r.claudeCalls} calls)${site ? '' : ' — no website'}`);
      for (const d of r.details.slice(0, 4)) console.log(`      ${d}`);
    }
    await resolveEmployers(db, orgId);
  }

  const d = await deriveRelationships(orgId);
  console.log(`\ngraph re-derived: ${d.written} edges`);
  ranked = await rankFoundations(db, orgId, 40);
  const r = await computeWarmPaths(db, orgId, ranked);
  console.log(`\nWARM PATHS — ${r.pathsFound} found across ${r.foundations} foundations → ${r.leads} leads, ${r.insights} insights` +
    (r.debug ? ` (trustees ${r.debug.trustees} · CYC people ${r.debug.own} · person↔person edges ${r.debug.edges})` : ''));
  for (const p of r.top) console.log(`  [${p.confidence.padEnd(6)} ${String(p.strength).padStart(3)}] ${p.wording}`);
  console.log(`\nClaude calls this run: ${claudeCalls} (bio extraction only; ≈ $${(claudeCalls * 0.02).toFixed(2)}). RapidAPI: 0.`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
