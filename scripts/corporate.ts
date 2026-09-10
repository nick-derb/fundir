// Phase 5 — corporate philanthropy layer, end to end:
//   1. corporate universe = board/staff employers ∪ parents of corporate foundations
//      (each foundation linked to its parent with a foundation_connection edge)
//   2. (optional) harvest each company's public giving page (bounded Claude spend)
//   3. score + persist "Corporate Giving Opportunity" leads and insights, report
//
//   npx tsx scripts/corporate.ts                 # no Claude spend
//   npx tsx scripts/corporate.ts --pages 15      # harvest up to 15 giving pages (≈ $0.03 each)
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
  const pages = Number(arg('--pages')) || 0;
  const { createServerClient } = await import('@/lib/supabase');
  const { buildCorporateUniverse, givingPageFor, harvestGivingProgram, computeCorporateLeads } = await import('@/lib/network/corporate');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const orgId = org.id as string;

  const { corporations, linked } = await buildCorporateUniverse(db, orgId);
  console.log(`corporate universe: ${corporations.length} companies · ${linked} new corporation→foundation links`);

  let calls = 0;
  if (pages > 0) {
    // Prefer companies that already have a page mapped and no program stored yet.
    const todo = corporations.filter(c => givingPageFor(c.name, c.website, c.metadata) && !c.metadata.philanthropy).slice(0, pages);
    console.log(`\nHarvesting giving pages for ${todo.length} companies …`);
    for (const c of todo) {
      const url = givingPageFor(c.name, c.website, c.metadata)!;
      try {
        const p = await harvestGivingProgram(db, c, url);
        calls++; // Claude is only called once the page fetched — a 403/404 costs nothing
        console.log(`  ${p ? '✓' : '–'} ${c.name}: ${p ? `${p.focus_areas.slice(0, 4).join(', ') || 'no focus stated'} · ${p.chicago_named ? 'Chicago named' : 'no Chicago'} · ${p.youth_named ? 'youth named' : 'no youth'} · ${p.named_recipients.length} recipients · ${p.leadership.length} leaders` : 'page not about giving'}`);
      } catch (e) { console.log(`  ✗ ${c.name}: ${e instanceof Error ? e.message.slice(0, 100) : e}`); }
    }
    // Reload metadata after harvest.
    const ids = corporations.map(c => c.id);
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db.from('network_organizations').select('id, metadata, website').in('id', ids.slice(i, i + 300));
      for (const o of data ?? []) { const c = corporations.find(x => x.id === o.id); if (c) { c.metadata = (o.metadata ?? {}) as Record<string, unknown>; c.website = o.website as string | null; } }
    }
  }

  const r = await computeCorporateLeads(db, orgId, corporations);
  console.log(`\nCORPORATE — ${r.corporations} companies · ${r.withPeople} with CYC people · ${r.withFoundation} with a linked foundation → ${r.leads} leads, ${r.insights} insights`);
  for (const t of r.top) console.log(`  [${t.confidence.padEnd(6)} ${String(t.score).padStart(3)}] ${t.wording}`);
  console.log(`\nClaude calls this run: ${calls} (giving-page extraction) ≈ $${(calls * 0.03).toFixed(2)}. RapidAPI: 0.`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
