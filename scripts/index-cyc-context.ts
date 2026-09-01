// Build/rebuild CYC's advisor RAG index (cyc_context_chunks). Needs Supabase +
// OpenAI creds from .env.local. Run after new outcomes/notes land.
//   npx tsx scripts/index-cyc-context.ts
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
  const db = createServerClient();
  const { data, error } = await db.from('organizations').select('id, org_code').eq('org_code', 'CYC2026').single();
  if (error || !data) throw new Error('CYC org not found: ' + (error?.message ?? ''));

  console.log('Indexing CYC advisor context …');
  const { indexCycContext } = await import('@/lib/cyc-context/build');
  const result = await indexCycContext(data.id as string, data.org_code as string);
  console.log(`Done — ${result.chunks} chunks embedded and stored.`);
}

main().catch(e => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
