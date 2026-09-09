// Re-score CYC's peer set with the component similarity model and attach each
// peer's known funders. No API calls.
//
//   npx tsx scripts/refresh-peers.ts
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
  const { refreshPeerSimilarity } = await import('@/lib/network/peers');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const r = await refreshPeerSimilarity(org.id as string);
  console.log(`scored ${r.scored} peers · ${r.withFunders} have known funders`);
  for (const t of r.top) console.log(`  ${t.similarity.toFixed(3)}  ${t.name.padEnd(40)} ${t.reasons.join(' · ')}`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
