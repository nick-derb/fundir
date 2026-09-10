// Phase 6 — generate white-space leads, then re-score every lead with the
// deterministic rubric and print the audit table (the phase gate).
//
//   npx tsx scripts/score-leads.ts                 # untapped + rescore, audit top 25
//   npx tsx scripts/score-leads.ts --no-untapped   # rescore only
//   npx tsx scripts/score-leads.ts --audit 40
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
  const auditN = Number(arg('--audit')) || 25;
  const { createServerClient } = await import('@/lib/supabase');
  const { generateUntappedFunders, rescoreLeads } = await import('@/lib/network/opportunity');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const orgId = org.id as string;

  if (!has('--no-untapped')) {
    const u = await generateUntappedFunders(db, orgId);
    console.log(`UNTAPPED FUNDERS — ${u.candidates} funders fund ≥2 CYC peers with no CYC funding identified → ${u.leads} leads, ${u.insights} insights`);
    for (const t of u.top.slice(0, 8)) console.log(`  · ${t.wording}`);
  }

  const r = await rescoreLeads(db, orgId);
  console.log(`\nRESCORED ${r.scored} leads (${r.skipped} skipped: target not resolvable)\n`);
  console.log('  score conf    R   F   A  Rec Pen  type                          target                                   via');
  for (const a of r.audit.slice(0, auditN)) {
    const s = a.subtotals;
    console.log(`  ${String(a.score).padStart(5)} ${a.confidence.padEnd(6)} ${String(s.relationship).padStart(3)} ${String(s.funding_fit).padStart(3)} ${String(s.accessibility).padStart(3)} ${String(s.recency).padStart(4)} ${String(s.penalties).padStart(3)}  ${(a.insight_type ?? a.lead_type).padEnd(29).slice(0, 29)} ${a.target.padEnd(40).slice(0, 40)} ${a.via ?? ''}${a.before !== null && a.before !== a.score ? `  (was ${a.before})` : ''}`);
  }
  const dist = { High: 0, Medium: 0, Low: 0 } as Record<string, number>;
  for (const a of r.audit) dist[a.confidence] = (dist[a.confidence] ?? 0) + 1;
  console.log(`\nconfidence: High ${dist.High} · Medium ${dist.Medium} · Low ${dist.Low} · score range ${r.audit.at(-1)?.score ?? 0}–${r.audit[0]?.score ?? 0}`);
  console.log('Claude calls this run: 0. RapidAPI: 0.');
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
