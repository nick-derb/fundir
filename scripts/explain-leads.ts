// Phase 7 — "Why this lead?" explanations + Network Insights.
//
//   npx tsx scripts/explain-leads.ts --dry                 # cost estimate, no calls, no writes
//   npx tsx scripts/explain-leads.ts --top 25 --max-cost 1.00
//   npx tsx scripts/explain-leads.ts --insights            # multi-hop insights only (no model)
//   npx tsx scripts/explain-leads.ts --show "McCormick"    # print a stored explanation
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
const has = (k: string) => process.argv.includes(k);

async function main() {
  loadEnv();
  const { createServerClient } = await import('@/lib/supabase');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const orgId = org.id as string;

  if (arg('--show')) {
    const pat = arg('--show')!.toLowerCase();
    const { data: all } = await db.from('network_leads').select('id, via_org, opportunity_score, explanation, network_organizations!network_leads_target_org_id_fkey(name)').eq('org_id', orgId).not('explanation', 'is', null).order('opportunity_score', { ascending: false });
    const alt = (all ?? []).find(l => ((l.network_organizations as unknown as { name: string } | null)?.name ?? '').toLowerCase().includes(pat) || (l.via_org ?? '').toLowerCase().includes(pat));
    if (!alt) { console.log(`no stored explanation matches "${arg('--show')}"`); return; }
    const x = alt.explanation as import('@/lib/network/explain').Explanation;
    console.log(`WHY FUNDIR RECOMMENDS THIS — ${(alt.network_organizations as unknown as { name: string } | null)?.name ?? ''} (${x.method}${x.model ? `, ${x.model}` : ''}; ${x.validation.bullets_kept}/${x.validation.bullets_total} claims validated; $${x.cost_usd.toFixed(3)})\n`);
    console.log(`${x.thesis}\n`);
    for (const s of x.sections) { console.log(s.heading); for (const b of s.bullets) console.log(`  • ${b.text}  [${b.evidence.join(', ')}]`); console.log(); }
    console.log(`Recommended action\n  • ${x.recommended_action.text}  [${x.recommended_action.evidence.join(', ')}]\n`);
    console.log(`Confidence: ${x.confidence} — ${x.confidence_note}\nSources: ${x.sources.length} evidence items, ${new Set(x.sources.map(s => s.source_type).filter(Boolean)).size} source types`);
    if (x.validation.dropped.length) { console.log('\nDropped by validator:'); for (const d of x.validation.dropped) console.log(`  ✗ ${d.reason}: ${d.text.slice(0, 120)}`); }
    return;
  }

  if (has('--insights')) {
    const { generateInsights } = await import('@/lib/network/insights');
    const r = await generateInsights(db, orgId);
    console.log(`NETWORK INSIGHTS — ${r.written} written: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    for (const s of r.sample) console.log(`  ${s}`);
    console.log('\nClaude calls this run: 0.');
    return;
  }

  const { explainLeads } = await import('@/lib/network/explain');
  const top = Number(arg('--top')) || 25, minScore = Number(arg('--min-score')) || 30, maxCost = Number(arg('--max-cost')) || 1.0;
  const dry = has('--dry');
  // --only "<substring>" limits the run to leads whose target/employer name matches (a cheap single-lead test).
  let leadIds: string[] | undefined;
  if (arg('--only')) {
    const { data } = await db.from('network_leads').select('id, via_org, network_organizations!network_leads_target_org_id_fkey(name)').eq('org_id', orgId);
    const pat = arg('--only')!.toLowerCase();
    leadIds = (data ?? []).filter(l => ((l.network_organizations as unknown as { name: string } | null)?.name ?? l.via_org ?? '').toLowerCase().includes(pat) || (l.via_org ?? '').toLowerCase().includes(pat)).map(l => l.id as string);
    console.log(`--only "${arg('--only')}": ${leadIds.length} lead(s)`);
  }
  // --revalidate re-runs the validator over stored model drafts (no calls); leads whose evidence changed still regenerate.
  const r = await explainLeads(db, orgId, { modelTop: top, minScore, maxCostUsd: maxCost, force: has('--force'), dry, leadIds, revalidate: has('--revalidate') });
  console.log(`${dry ? 'DRY RUN — ' : ''}EXPLANATIONS — ${r.considered} leads considered · ${r.generated} model${dry ? ' (planned)' : ''} · ${r.deterministic} deterministic · ${r.unchanged} unchanged (evidence hash)`);
  console.log(`claim-to-evidence validation: ${r.validation.bullets_kept}/${r.validation.bullets_total} claims kept, ${r.validation.dropped.length} dropped`);
  for (const d of r.validation.dropped.slice(0, 20)) console.log(`  ✗ [${d.lead}] ${d.reason}: ${d.text.slice(0, 110)}`);
  console.log(`\nClaude calls this run: ${r.claude_calls} (${MODEL_LABEL}) ${dry ? '≈ estimated' : 'actual'} $${r.cost_usd.toFixed(3)}. RapidAPI: 0.`);
}
const MODEL_LABEL = 'claude-sonnet-4-6';

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
