// Local IRS 990 / 990-PF ingester (D2, approved 2026-09-09).
//
// Runs on a laptop, never on Vercel: streams the IRS index for each year,
// range-reads only the filings for the funders in scope, parses grants paid
// (990-PF Part XV / 990 Schedule I) and the officer/trustee roster, resolves
// every grantee with the existing EIN-first identity layer (Claude adjudication
// only for the ambiguous gray band, cost-capped), and writes cited funding
// events + board seats into the graph.
//
// Scope = CYC's research queue ∪ cultivation list ∪ existing seed funders ∪
// top Chicago-metro 990-PF filers ∪ corporate foundations of board employers.
//
//   npx tsx scripts/ingest-990-local.ts --smoke                 # 3 EINs, dry run, no writes
//   npx tsx scripts/ingest-990-local.ts --years 2024,2025       # dry run
//   npx tsx scripts/ingest-990-local.ts --years 2024,2025 --commit --cost-cap-cents 2000
//
// Spend is printed after every filing; the run stops itself at the cap.
// Idempotent: filings already recorded in ingest_state are skipped.

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
const usd = (microCents: number) => `$${(microCents / 1_000_000).toFixed(3)}`;

const ADAPTER = 'irs_bulk_local';
const SMOKE_EINS = ['366079185', '363689171', '366108293']; // Joyce, McCormick, Polk Bros.

async function main() {
  loadEnv();
  const COMMIT = has('--commit');
  const SMOKE = has('--smoke');
  const years = (arg('--years') ?? '2024,2025').split(',').map(Number).filter(Boolean);
  const limit = Number(arg('--limit')) || (SMOKE ? 3 : Infinity);
  const costCap = (Number(arg('--cost-cap-cents')) || 2000) * 10_000; // micro-cents

  const { createServerClient } = await import('@/lib/supabase');
  const { fetchIndexRows, readZipEntries, readZipMember, findEntry, zipUrl, memberName } = await import('@/lib/ingest/irs-bulk');
  const { parse990Xml } = await import('@/lib/ingest/990pf-parser');
  const { parseOfficers } = await import('@/lib/ingest/990-officers');
  const { resolveRecipient } = await import('@/lib/graph/identity');
  const { upsertFunder, upsertGrantsMade, readIngestState, writeIngestState } = await import('@/lib/graph/repo');
  const { ensureOrganization, ensureSource } = await import('@/lib/network/bridge');
  const { normalizeEin, orgTypeOf, personNameKey } = await import('@/lib/network/normalize');
  const db = createServerClient();

  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const orgId = org.id as string;

  // ── Scope ──
  const eins = new Set<string>();
  const add = (v: unknown) => { const e = normalizeEin(v); if (e) eins.add(e); };
  if (SMOKE) SMOKE_EINS.forEach(add);
  else {
    const [q, c, m, cf] = await Promise.all([
      db.from('cyc_research_queue').select('ein').eq('org_id', orgId).not('ein', 'is', null),
      db.from('cyc_cultivation').select('bmf_ein').eq('org_id', orgId).not('bmf_ein', 'is', null),
      db.from('cyc_funder_prospects').select('ein').eq('org_id', orgId).eq('list_source', 'chicago_metro_funders').ilike('files_990pf', 'y%').order('total_assets', { ascending: false, nullsFirst: false }).limit(60),
      db.from('network_organizations').select('ein, normalized_name').eq('organization_type', 'corporate_foundation').not('ein', 'is', null),
    ]);
    (q.data ?? []).forEach(r => add(r.ein)); (c.data ?? []).forEach(r => add(r.bmf_ein)); (m.data ?? []).forEach(r => add(r.ein));
    const corp = /(bmo|northern trust|huntington|grainger|abbott|discover|morgan stanley|pwc|deloitte|ibm|salesforce|kirkland|gtcr|associated bank|first merchants|allstate|exelon|comed|boeing|motorola|cme|jpmorgan|bank of america|wintrust|fifth third|utz|ernst)/;
    (cf.data ?? []).filter(r => corp.test(r.normalized_name as string)).forEach(r => add(r.ein));
    const { data: seeds } = await db.from('grants_made').select('funder:funders(ein)');
    (seeds ?? []).forEach(r => add((r.funder as unknown as { ein: string | null } | null)?.ein));
  }
  const scope = [...eins].slice(0, limit);
  console.log(`${COMMIT ? 'COMMIT' : 'DRY RUN'} · ${scope.length} funder EIN(s) · years ${years.join(', ')} · Claude cap ${usd(costCap)}`);

  const irsSource = COMMIT ? await ensureSource(db, { source_type: 'irs_990_xml', source_name: 'IRS Form 990 series e-file XML (bulk publication)', raw_reference: 'irs:990:bulk', source_url: 'https://www.irs.gov/charities-non-profits/form-990-series-downloads', confidence: 0.95 }) : null;

  let filings = 0, grants = 0, seats = 0, skipped = 0, costMicro = 0;
  const breakdown = { ein_exact: 0, fuzzy: 0, claude: 0, inserted: 0 };
  const zipCache = new Map<string, Awaited<ReturnType<typeof readZipEntries>>>();

  for (const year of years) {
    process.stdout.write(`\n[${year}] streaming index … `);
    const rows = await fetchIndexRows(year, new Set(scope), new Set(['990PF', '990']), n => process.stdout.write(`${Math.round(n / 1000)}k `));
    console.log(`→ ${rows.length} filing(s) in scope`);
    const byBatch = new Map<string, typeof rows>();
    for (const r of rows) byBatch.set(r.batchId, [...(byBatch.get(r.batchId) ?? []), r]);

    for (const [batchId, batchRows] of byBatch) {
      const url = zipUrl(year, batchId);
      let zip = zipCache.get(url);
      if (!zip) { zip = await readZipEntries(url); zipCache.set(url, zip); console.log(`  ${batchId}.zip · ${zip.entries.size.toLocaleString()} members`); }

      for (const r of batchRows) {
        const fy = Number(r.taxPeriod.slice(0, 4));
        const batchKey = `${r.ein}:${fy}:${r.objectId}`;
        if (COMMIT && (await readIngestState(ADAPTER, batchKey))) { skipped++; continue; }
        const entry = findEntry(zip.entries, r.objectId);
        if (!entry) { console.log(`    ! ${r.ein} ${r.objectId}: member not in ${batchId}`); continue; }

        const xml = await readZipMember(url, entry);
        const parsed = parse990Xml(xml);
        const officers = parseOfficers(xml).officers.filter(o => !o.isOrganization && o.role !== 'employee');
        filings++;
        console.log(`  ${r.taxpayerName.slice(0, 44).padEnd(44)} FY${parsed.fiscal_year} ${parsed.form_type.padEnd(5)} grants ${String(parsed.grants.length).padStart(4)} · board ${officers.length}${parsed.warnings.length ? ` · ${parsed.warnings.length} warn` : ''}`);
        if (!COMMIT) continue;

        // Source row per filing (cited by every grant + seat from it).
        const sourceUrl = `${url}#${memberName(r.objectId)}`;
        const filingSource = await ensureSource(db, {
          source_type: 'irs_990_xml', source_name: `IRS e-file ${parsed.form_type} — ${parsed.funder_name} FY${parsed.fiscal_year}`,
          raw_reference: `irs:${r.objectId}`, source_url: sourceUrl, confidence: 0.95,
        });

        // Funder node (990 graph + canonical org).
        const funderRow = await upsertFunder({
          ein: parsed.funder_ein, name: parsed.funder_name,
          funder_type: /community (trust|foundation)/i.test(parsed.funder_name) ? 'community_foundation' : parsed.form_type === '990PF' ? 'private_foundation' : 'private_foundation',
          metadata: { source: 'irs_bulk_local', last_filing_year: parsed.fiscal_year, last_seen_at: new Date().toISOString(), filing_object_id: r.objectId },
        });
        const funderOrg = await ensureOrganization(db, { name: parsed.funder_name, ein: parsed.funder_ein, type: orgTypeOf(parsed.funder_name, { funderType: 'private_foundation' }), funderId: funderRow.id, sourceId: filingSource, confidence: 0.95 });

        // Grants → cited funding events.
        const source = `990xml:${parsed.funder_ein}:${parsed.fiscal_year}`;
        for (const g of parsed.grants) {
          if (costMicro > costCap) { console.log(`\n  ⛔ Claude cost cap reached (${usd(costMicro)} > ${usd(costCap)}) — stopping before further adjudication.`); await finish(); return; }
          const resolved = await resolveRecipient({ ein: g.recipient_ein, name: g.recipient_name, state: g.recipient_state, purpose: g.purpose, metadata: { city: g.recipient_city, ...(g.irc_section ? { irc_section: g.irc_section } : {}) } });
          breakdown[resolved.source === 'ein-exact' ? 'ein_exact' : resolved.source] += 1;
          if (resolved.adjudication) { costMicro += resolved.adjudication.cost_micro_cents; }
          const recipientOrg = await ensureOrganization(db, { name: resolved.recipient.name, ein: resolved.recipient.ein, type: 'nonprofit', recipientId: resolved.recipient.id, sourceId: filingSource, confidence: Math.min(0.95, resolved.confidence) });
          const row = await upsertGrantsMade({
            funder_id: funderRow.id, recipient_id: resolved.recipient.id, amount: g.amount, fiscal_year: parsed.fiscal_year, purpose: g.purpose,
            source, data_freshness: new Date().toISOString().slice(0, 10), confidence: resolved.confidence,
            raw: { recipient_state: g.recipient_state, recipient_city: g.recipient_city, irc_section: g.irc_section, source_url: sourceUrl, object_id: r.objectId, resolution: resolved.source },
          });
          await db.from('grants_made').update({ source_url: sourceUrl, source_id: filingSource, funder_org_id: funderOrg.id, recipient_org_id: recipientOrg.id, geography: g.recipient_state ?? null }).eq('id', row.id);
          grants++;
        }

        // Officers / trustees → people + seats (public filing = verified).
        for (const o of officers) {
          const { data: seated } = await db.from('network_boards').select('person_id, network_people!inner(id, name, kind, org_id)').eq('organization_id', funderOrg.id);
          const existing = (seated ?? []).map(s => s.network_people as unknown as { id: string; name: string; kind: string; org_id: string })
            .find(p => p.org_id === orgId && personNameKey(p.name) === personNameKey(o.name));
          let personId = existing?.id;
          if (!personId) {
            const { data: ins, error } = await db.from('network_people').insert({
              org_id: orgId, kind: o.role === 'trustee' ? 'trustee' : 'executive', name: o.name, status: 'new',
              current_title: o.title, current_org: parsed.funder_name, organization_id: funderOrg.id,
              note: `${o.title ?? 'Board'} of ${parsed.funder_name} per IRS ${parsed.form_type} FY${parsed.fiscal_year}.`,
              source_id: filingSource, verification: 'verified',
            }).select('id').single();
            if (error || !ins) continue;
            personId = ins.id as string;
          }
          const title = o.title ?? (o.role === 'trustee' ? 'Director' : 'Officer');
          const { data: seat } = await db.from('network_boards').select('id').eq('person_id', personId).eq('organization_id', funderOrg.id).eq('title', title).maybeSingle();
          if (!seat) {
            await db.from('network_boards').insert({ person_id: personId, organization_id: funderOrg.id, title, started: String(parsed.fiscal_year), is_current: parsed.fiscal_year >= new Date().getFullYear() - 2, source_id: filingSource, confidence: 0.95 });
            seats++;
          }
        }

        await writeIngestState({ adapter_key: ADAPTER, batch_key: batchKey, cursor: r.objectId, records_seen: parsed.grants.length, records_kept: parsed.grants.length, errors: parsed.warnings.length, last_error: parsed.warnings[0] ?? null });
        console.log(`    ↳ ${parsed.grants.length} events · ${officers.length} seats · Claude so far ${usd(costMicro)}`);
      }
    }
  }
  await finish();

  async function finish() {
    console.log(`\nDone — ${filings} filing(s) read, ${grants} funding events written, ${seats} board seats, ${skipped} already ingested.`);
    console.log(`Recipient resolution: ${breakdown.ein_exact} EIN-exact · ${breakdown.fuzzy} fuzzy · ${breakdown.claude} Claude · ${breakdown.inserted} new recipients`);
    console.log(`Claude spend this run: ${usd(costMicro)} (cap ${usd(costCap)}). RapidAPI: 0 calls. IRS/ProPublica: $0.`);
    if (COMMIT && irsSource) console.log(`Provenance: every event cites its IRS ZIP member URL; source row ${irsSource}.`);
  }
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
