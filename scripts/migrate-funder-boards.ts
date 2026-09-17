// Re-sync CYC's recorded foundation trustees (funder_board_members + the
// cultivation list's BMF EINs) into the relationship graph.
//
// The logic lives in the database function network_sync_funder_boards
// (supabase/migrations/20260917_network_sync_funder_boards.sql) so the in-app
// cultivation importer and this hand-run refresh cannot drift apart:
//   • each foundation → its canonical org (BMF EIN, else a unique exact name),
//   • each trustee → network_people (kind 'trustee'), • a network_boards seat,
//   • an existing_cyc_relationship edge whenever CYC recorded a connection, plus
//     an inferred person↔person edge to the CYC person named as knowing them.
// Emails on the sheet are personal contact data and are deliberately NOT copied.
// Idempotent: re-running adds only what is new.
//
//   npx tsx scripts/migrate-funder-boards.ts
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
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const { data, error } = await db.rpc('network_sync_funder_boards', { p_org_id: org.id as string });
  if (error) throw new Error(error.message);
  const r = data as { organizations: number; people: number; seats: number; edges: number; links: number };
  console.log(`Done — ${r.organizations} foundations added, ${r.people} trustees added, ${r.seats} seats, ${r.edges} CYC-connection edges, ${r.links} who-knows-them links. Emails were not migrated.`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
