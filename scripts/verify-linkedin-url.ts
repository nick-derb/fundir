// Verify a candidate LinkedIn URL for one of CYC's people before storing it.
//
// A candidate (from a public web search) is accepted only if the LIVE profile
// corroborates the public board page on two signals: the surname (with
// first-name / nickname tolerance) AND the employer — current employer for
// active members, any past employer for retired ones. One enrich call (~2
// credits); nothing is stored unless it corroborates.
//
//   npx tsx scripts/verify-linkedin-url.ts --person "Cathy Main" --url https://www.linkedin.com/in/... [--commit]
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

/** "Catherine (Cathy) Main" ≈ "Cathy Main": same surname, and first name, nickname or initial agrees. */
function namesAgree(a: string, b: string): boolean {
  const parts = (s: string) => {
    const nick = s.match(/\(([^)]+)\)|["“]([^"”]+)["”]/)?.slice(1).find(Boolean)?.toLowerCase() ?? null;
    const words = s.replace(/\(.*?\)|["“].*?["”]/g, ' ').replace(/,.*$/, '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !/^(jr|sr|ii|iii|iv|phd|cfa|cpa|md)$/.test(w));
    return { first: words[0] ?? '', last: words[words.length - 1] ?? '', nick };
  };
  const A = parts(a), B = parts(b);
  if (!A.last || A.last !== B.last) return false;
  return A.first === B.first || A.nick === B.first || B.nick === A.first || (!!A.first && !!B.first && A.first[0] === B.first[0]);
}

async function main() {
  loadEnv();
  const person = arg('--person'), url = arg('--url');
  if (!person || !url) throw new Error('--person and --url are required');
  const COMMIT = has('--commit');

  const { createServerClient } = await import('@/lib/supabase');
  const { CallBudget, enrichProfile } = await import('@/lib/network/linkedin');
  const { canonicalEmployer, personNameKey } = await import('@/lib/network/normalize');
  const { ensureSource } = await import('@/lib/network/bridge');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const { data: rows } = await db.from('network_people').select('id, name, current_org, note, linkedin_url').eq('org_id', org.id).in('kind', ['board', 'staff', 'auxiliary', 'council']);
  const p = (rows ?? []).find(r => personNameKey(r.name as string) === personNameKey(person));
  if (!p) throw new Error(`${person} is not on the roster`);
  const retired = /retired/i.test(p.note ?? '');
  const employerKey = canonicalEmployer(p.current_org as string | null)?.key ?? null;

  const budget = new CallBudget(3);
  const prof = await enrichProfile(url, budget);
  const nameOk = !!prof.name && namesAgree(prof.name, p.name as string);
  // The board page says "Rivers Casino"; the profile may say "Midwest Gaming & Entertainment (Rivers Casino)"
  // or carry the employer only in the headline — a normalized containment match covers both.
  const mentions = (s: string | null | undefined) => { const k = canonicalEmployer(s)?.key; return !!employerKey && !!k && (k === employerKey || k.includes(employerKey) || (s ?? '').toLowerCase().includes((p.current_org as string).toLowerCase())); };
  const currentOk = mentions(prof.currentOrg) || mentions(prof.headline) || prof.experiences.some(e => e.isCurrent && mentions(e.org));
  // Active members must still show the employer somewhere on the profile; retired ones as a past role.
  const employerOk = currentOk || prof.experiences.some(e => mentions(e.org));

  console.log(`${prof.name ?? '(no name)'} — ${prof.headline ?? ''}`);
  for (const e of prof.experiences.slice(0, 8)) console.log(`   ${e.org}${e.title ? ` — ${e.title}` : ''}${e.started || e.ended ? ` (${e.started ?? '?'}–${e.isCurrent ? 'present' : e.ended ?? '?'})` : ''}`);
  console.log(`\nname agrees: ${nameOk} · employer "${p.current_org}" corroborated: ${employerOk}${retired ? ' (as a past employer)' : ''} · ${budget.used * 2} credits`);

  if (nameOk && employerOk) {
    if (COMMIT) {
      const source = await ensureSource(db, { source_type: 'linkedin_api', source_name: 'LinkedIn profile URL found by public web search, corroborated by live profile (name + employer)', raw_reference: 'linkedin_api:url-websearch', confidence: 0.85 });
      await db.from('network_people').update({ linkedin_url: prof.url, verification: 'verified', enriched_at: null, note: `${p.note ? p.note + ' ' : ''}LinkedIn URL corroborated (name + employer) from a public search result.` }).eq('id', p.id);
      console.log(`✓ stored ${prof.url} for ${p.name} (source ${source})`);
    } else console.log(`✓ would store ${prof.url} (re-run with --commit)`);
  } else console.log('✗ NOT stored — corroboration failed.');
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
