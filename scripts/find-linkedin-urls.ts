// Find LinkedIn profile URLs for CYC's own people WITHOUT guessing.
//
// Identity rule: a profile is accepted only when TWO independent signals agree
// — the person's name AND the employer shown on CYC's public board page —
// via the provider's company-scoped employee search. Exactly one matching hit
// → stored (verification 'verified', source: provider). Zero or several hits →
// left for a manual paste, never guessed. Retired members are searched as
// former employees of the firm they retired from.
//
//   npx tsx scripts/find-linkedin-urls.ts --limit 4          # pilot (officers first)
//   npx tsx scripts/find-linkedin-urls.ts --limit 4 --dry    # no writes
//   npx tsx scripts/find-linkedin-urls.ts --max-calls 400    # the rest of the board
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
  if (!process.env.RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY missing');
  const limit = Number(arg('--limit')) || Infinity;
  const maxCalls = Number(arg('--max-calls')) || 120;
  const DRY = has('--dry');

  const { createServerClient } = await import('@/lib/supabase');
  const { CallBudget, searchEmployees } = await import('@/lib/network/linkedin');
  const { resolveCompanyMemo } = await import('@/lib/network/refresh');
  const { ensureSource } = await import('@/lib/network/bridge');
  const { personNameKey, canonicalEmployer } = await import('@/lib/network/normalize');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');

  // Officers first, then directors, then the rest — value order.
  const { data: people } = await db.from('network_people')
    .select('id, name, kind, board_role, current_org, note')
    .eq('org_id', org.id).in('kind', ['board', 'staff', 'auxiliary', 'council']).is('linkedin_url', null)
    .not('current_org', 'is', null);
  const rank = (p: { board_role: string | null; kind: string }) => (/chair|treasurer|secretary|president/i.test(p.board_role ?? '') ? 0 : p.kind === 'board' ? 1 : p.kind === 'staff' ? 2 : 3);
  const todo = (people ?? []).sort((a, b) => rank(a) - rank(b)).slice(0, limit);
  const budget = new CallBudget(maxCalls);
  const source = DRY ? null : await ensureSource(db, { source_type: 'linkedin_api', source_name: 'LinkedIn profile URL discovered via company-scoped search (name + employer corroborated)', raw_reference: 'linkedin_api:url-discovery', confidence: 0.85 });

  let found = 0, ambiguous = 0, none = 0, unresolvable = 0;
  console.log(`${DRY ? 'DRY RUN' : 'COMMIT'} · ${todo.length} people · call cap ${maxCalls}`);
  for (const p of todo) {
    const retired = /retired/i.test(p.note ?? '') || /\(retired\)/i.test(p.current_org ?? '');
    const employer = canonicalEmployer(p.current_org)?.display;
    if (!employer) { unresolvable++; console.log(`  – ${p.name}: no employer on the board page`); continue; }
    try {
      const before = budget.used;
      const company = await resolveCompanyMemo(db, employer, budget);
      if (!company) { unresolvable++; console.log(`  – ${p.name}: employer "${employer}" not found on LinkedIn (${budget.used - before} calls)`); continue; }
      let hits = await searchEmployees(company, { budget, maxResults: 10, keywords: p.name, pastCompany: retired });
      const key = personNameKey(p.name);
      // Keyword search can miss; for small firms a plain scan of the roster is cheap and exact.
      if (!hits.some(h => h.name && personNameKey(h.name) === key) && (company.employeeCount ?? 0) > 0 && (company.employeeCount ?? 0) <= 300) {
        hits = await searchEmployees(company, { budget, maxResults: 25, pastCompany: retired });
      }
      const matches = hits.filter(h => h.name && personNameKey(h.name) === key);
      const used = budget.used - before;
      if (matches.length === 1) {
        found++;
        console.log(`  ✓ ${p.name} @ ${company.name}${retired ? ' (former)' : ''} → ${matches[0].url} · "${matches[0].title ?? matches[0].headline ?? ''}" (${used} calls)`);
        if (!DRY) await db.from('network_people').update({
          linkedin_url: matches[0].url, verification: 'verified', enriched_at: null,
          note: `${p.note ? p.note + ' ' : ''}LinkedIn URL matched by name + employer (${company.name}) via provider search.`,
        }).eq('id', p.id);
      } else if (matches.length > 1) { ambiguous++; console.log(`  ? ${p.name} @ ${company.name}: ${matches.length} same-name hits — left for manual paste (${used} calls)`); }
      else { none++; console.log(`  ✗ ${p.name} @ ${company.name}${retired ? ' (former)' : ''}: no matching hit among ${hits.length} (${used} calls)`); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ! ${p.name}: ${msg.slice(0, 140)}`);
      if (/budget exhausted/i.test(msg)) break;
    }
  }
  console.log(`\nDone — ${found} URLs stored (name + employer corroborated), ${ambiguous} ambiguous, ${none} not found, ${unresolvable} employer unresolvable. ${budget.used} API calls${source ? ` · source ${source}` : ''}.`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
