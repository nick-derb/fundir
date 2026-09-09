// Migrate CYC's recorded foundation trustees (funder_board_members — the
// "Board Members" sheet of the FY27 workbook) into the graph:
//   • each foundation → its canonical org (via the cultivation list's BMF EIN,
//     else exact name), • each trustee → network_people (kind 'trustee'),
//   • a network_boards seat, • an existing_cyc_relationship edge whenever CYC
//     recorded a connection, plus an INFERRED person↔person edge to the CYC
//     person named in "Who at CYC knows them" when that name resolves uniquely.
// Emails on the sheet are personal contact data and are deliberately NOT copied.
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

const isRecorded = (v: string | null) => {
  const s = (v ?? '').trim().toLowerCase();
  return s !== '' && !['unknown', 'no', 'none', 'not started', 'n/a', 'tbd'].includes(s);
};

async function main() {
  loadEnv();
  const { createServerClient } = await import('@/lib/supabase');
  const { ensureOrganization, ensureSource } = await import('@/lib/network/bridge');
  const { personNameKey, orgTypeOf } = await import('@/lib/network/normalize');
  const { OWN_KINDS } = await import('@/lib/network/edges');
  const db = createServerClient();

  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  if (!org) throw new Error('CYC org not found');
  const orgId = org.id as string;
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', '362344429').single();
  if (!cyc) throw new Error('CYC organization node missing — run seed-cyc-board first');
  const sourceId = await ensureSource(db, { source_type: 'cyc_workbook', source_name: 'Foundation Cultivation List FY27 (CYC)', raw_reference: 'Foundation Cultivation List FY27(Sheet1).csv', confidence: 0.85 });

  const { data: rows } = await db.from('funder_board_members')
    .select('foundation_name, member_name, title, connection_to_cyc, connection_type, who_knows_them, source, outreach_status')
    .eq('org_id', orgId);
  const { data: cult } = await db.from('cyc_cultivation').select('foundation_name, bmf_ein, funder_type').eq('org_id', orgId);
  const einByFoundation = new Map((cult ?? []).map(c => [String(c.foundation_name).trim().toLowerCase(), { ein: c.bmf_ein as string | null, type: c.funder_type as string | null }]));

  // CYC's own people, for "Who at CYC knows them" resolution (link by name = inferred, never a merge).
  const { data: own } = await db.from('network_people').select('id, name, kind').eq('org_id', orgId);
  const ownByKey = new Map<string, string[]>();
  for (const p of own ?? []) {
    if (!OWN_KINDS.has(p.kind as string)) continue;
    const k = personNameKey(p.name as string);
    ownByKey.set(k, [...(ownByKey.get(k) ?? []), p.id as string]);
  }

  let people = 0, seats = 0, edges = 0, links = 0;
  for (const r of rows ?? []) {
    const fname = String(r.foundation_name ?? '').trim(); const pname = String(r.member_name ?? '').trim();
    if (!fname || !pname) continue;
    const c = einByFoundation.get(fname.toLowerCase());
    const foundation = await ensureOrganization(db, { name: fname, ein: c?.ein ?? null, type: orgTypeOf(fname, { funderType: c?.type ?? null }), sourceId, confidence: 0.85 });

    // Trustee identity: same name AND an existing seat at this foundation → same person; otherwise new.
    const { data: seated } = await db.from('network_boards').select('person_id, network_people!inner(id, name, kind, org_id)').eq('organization_id', foundation.id);
    const existing = (seated ?? []).map(s => s.network_people as unknown as { id: string; name: string; kind: string; org_id: string })
      .find(p => p.org_id === orgId && p.kind === 'trustee' && personNameKey(p.name) === personNameKey(pname));
    let personId = existing?.id;
    if (!personId) {
      const { data: ins, error } = await db.from('network_people').insert({
        org_id: orgId, kind: 'trustee', name: pname, status: 'new',
        current_title: r.title || null, current_org: fname, organization_id: foundation.id,
        note: `Trustee of ${fname} per CYC's FY27 cultivation list${r.outreach_status ? ` · outreach: ${r.outreach_status}` : ''}.`,
        source_id: sourceId, verification: 'probable',
      }).select('id').single();
      if (error || !ins) throw new Error(`${pname}: ${error?.message}`);
      personId = ins.id as string; people++;
    }

    const title = r.title || 'Board member';
    const { data: seat } = await db.from('network_boards').select('id').eq('person_id', personId).eq('organization_id', foundation.id).eq('title', title).maybeSingle();
    if (!seat) {
      await db.from('network_boards').insert({ person_id: personId, organization_id: foundation.id, title, is_current: true, source_id: sourceId, confidence: 0.85 });
      seats++;
    }

    // CYC-recorded connection → trustee ↔ CYC edge (cyc_workbook source — survives re-derivation).
    if (isRecorded(r.connection_to_cyc as string | null)) {
      const { data: dupe } = await db.from('network_relationships').select('id')
        .eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship')
        .eq('source_person_id', personId).eq('target_organization_id', cyc.id).eq('source_type', 'cyc_workbook').maybeSingle();
      if (!dupe) {
        await db.from('network_relationships').insert({
          org_id: orgId, relationship_type: 'existing_cyc_relationship',
          source_person_id: personId, target_organization_id: cyc.id,
          relationship_strength: 10, confidence: 0.8, verification: 'probable',
          evidence: { summary: `CYC recorded a connection to ${pname} (${fname}): ${r.connection_to_cyc}${r.connection_type ? ` · ${r.connection_type}` : ''}`, connection_to_cyc: r.connection_to_cyc, connection_type: r.connection_type, who_knows_them: r.who_knows_them, outreach_status: r.outreach_status },
          source_id: sourceId, source_type: 'cyc_workbook',
        });
        edges++;
      }
      // "Who at CYC knows them" → person↔person edge when the name resolves to exactly one CYC person.
      const who = String(r.who_knows_them ?? '').trim();
      const ids = who ? ownByKey.get(personNameKey(who)) : undefined;
      if (ids && ids.length === 1) {
        const { data: dupe2 } = await db.from('network_relationships').select('id')
          .eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship')
          .eq('source_person_id', ids[0]).eq('target_person_id', personId).eq('source_type', 'cyc_workbook').maybeSingle();
        if (!dupe2) {
          await db.from('network_relationships').insert({
            org_id: orgId, relationship_type: 'existing_cyc_relationship',
            source_person_id: ids[0], target_person_id: personId,
            relationship_strength: 10, confidence: 0.6, verification: 'inferred',
            evidence: { summary: `${who} is recorded as knowing ${pname} (${r.connection_type || 'connection'}) — name-resolved from the FY27 sheet`, who_knows_them: who, connection_type: r.connection_type },
            source_id: sourceId, source_type: 'cyc_workbook',
          });
          links++;
        }
      }
    }
  }
  console.log(`Done — ${people} trustees added, ${seats} seats, ${edges} CYC-connection edges, ${links} who-knows-them links. Emails were not migrated.`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
