// Extract a person's professional history from a PUBLIC bio page (D4) and
// store it against their graph node, citing the URL. Claude reads the page
// text under a strict "only what the page states" contract.
//
//   npx tsx scripts/extract-bio.ts --person "Scott C. Smith" --url https://example.org/board/scott-smith
//   npx tsx scripts/extract-bio.ts --url <roster page> --people "Name A;Name B;Name C"   # one page, several bios
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
  const url = arg('--url'); if (!url) throw new Error('--url is required');
  const names = (arg('--people') ?? arg('--person') ?? '').split(';').map(s => s.trim()).filter(Boolean);
  if (!names.length) throw new Error('--person or --people is required');

  const { createServerClient } = await import('@/lib/supabase');
  const { fetchPublicText, extractBio, applyBio } = await import('@/lib/network/bio');
  const { personNameKey } = await import('@/lib/network/normalize');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');

  const page = await fetchPublicText(url);
  console.log(`Fetched ${url} (${page.text.length} chars) — "${page.title ?? ''}"`);
  const { data: people } = await db.from('network_people').select('id, name, kind').eq('org_id', org.id);
  const byKey = new Map<string, { id: string; name: string; kind: string }[]>();
  for (const p of people ?? []) { const k = personNameKey(p.name as string); byKey.set(k, [...(byKey.get(k) ?? []), p as { id: string; name: string; kind: string }]); }

  for (const name of names) {
    const matches = byKey.get(personNameKey(name)) ?? [];
    if (matches.length !== 1) { console.log(`  ✗ ${name}: ${matches.length === 0 ? 'not on the roster' : 'ambiguous — ' + matches.map(m => m.kind).join(', ')}`); continue; }
    const bio = await extractBio({ url, text: page.text, personName: name });
    if (!bio) { console.log(`  – ${name}: page does not describe this person`); continue; }
    const r = await applyBio(org.id as string, matches[0].id, bio, { url, title: page.title });
    console.log(`  ✓ ${name}: ${r.employments} employments, ${r.educations} schools, ${r.boards} boards${bio.gaps.length ? ` · gaps: ${bio.gaps.join('; ')}` : ''}`);
    for (const e of bio.employments) console.log(`      ${e.org}${e.title ? ` — ${e.title}` : ''}${e.start_year || e.end_year ? ` (${e.start_year ?? '?'}–${e.is_current ? 'present' : e.end_year ?? '?'})` : ''}`);
  }
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
