// Import CYC's eo_il.xlsx workbook (Fundir x Chicago Youth Centers) into the
// dedicated CYC tables + the IRS IL BMF reference.
// Dry run:  node scripts/import-eo-il.mjs
// Commit:   node scripts/import-eo-il.mjs --commit

import { loadEnv, getSupabase, getOrgId, readSheet, num, str, upsertAll, COMMIT } from './_import-lib.mjs';

const FILE = process.argv.find(a => a.endsWith('.xlsx')) ?? 'C:/Users/nickd/OneDrive/Documents/eo_il.xlsx';

/** EIN as a 9-char string, left-padded when Excel stored it as a number. */
function ein(v) {
  const s = str(v);
  if (!s) return null;
  return /^\d+$/.test(s) ? s.padStart(9, '0') : s;
}

/** Drop rows that collide on the upsert conflict key (last one wins). */
function dedupeBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    map.set(k, r);
  }
  return [...map.values()];
}

function build(orgId) {
  // 3. Cultivation List
  const cultivation = dedupeBy(readSheet(FILE, 'Cultivation List').map(r => ({
    org_id: orgId,
    foundation_name:      str(r['Foundation Name']),
    bmf_ein:              ein(r['BMF EIN']),
    in_il_bmf:            str(r['In IL BMF?']),
    bmf_legal_name:       str(r['BMF Legal Name']),
    funder_type:          str(r['Funder Type']),
    total_assets:         num(r['Total Assets ($)']),
    metro_area:           str(r['Metro Area']),
    address:              str(r['Foundation Address (CYC)']),
    funding_focus:        str(r['Funding Focus']),
    funding_range:        str(r['Funding Range']),
    email:                str(r['Email']),
    phone:                str(r['Phone']),
    board_members_listed: str(r['Board Members Listed']),
    notes:                str(r['Notes (CYC)']),
    lookup_url:           str(r['990 / Board Lookup']),
  })).filter(r => r.foundation_name), r => r.foundation_name);

  // 2. Board Members
  const board = dedupeBy(readSheet(FILE, 'Board Members').map(r => ({
    org_id: orgId,
    foundation_name:   str(r['Foundation Name']),
    member_name:       str(r['Board Member Name']),
    title:             str(r['Title']),
    email:             str(r['Email']),
    connection_to_cyc: str(r['Connection to CYC?']),
    connection_type:   str(r['Connection Type']),
    who_knows_them:    str(r['Who at CYC Knows Them']),
    source:            str(r['Source']),
    outreach_status:   str(r['Outreach Status']),
  })).filter(r => r.foundation_name && r.member_name), r => `${r.foundation_name}|||${r.member_name}`);

  // 6. Research Queue
  const research = dedupeBy(readSheet(FILE, 'Research Queue').map(r => ({
    org_id: orgId,
    priority:             str(r['Priority']),
    ein:                  ein(r['EIN']),
    organization_name:    str(r['Organization Name']),
    funder_type:          str(r['Funder Type']),
    city:                 str(r['City']),
    total_assets:         num(r['Total Assets ($)']),
    lookup_url:           str(r['990 / Board Lookup']),
    board_members_pulled: str(r['Board Members Pulled?']),
    peer_grantee_overlap: str(r['Peer Grantee Overlap?']),
    connection_found:     str(r['Connection Found?']),
    owner:                str(r['Owner']),
    next_action:          str(r['Next Action']),
    status:               str(r['Status']),
  })).filter(r => r.ein || r.organization_name), r => `${r.ein}|||${r.organization_name}`);

  // 4. Peer Youth Orgs
  const peers = dedupeBy(readSheet(FILE, 'Peer Youth Orgs').map(r => ({
    org_id: orgId,
    ein:              ein(r['EIN']),
    name:             str(r['Organization Name']),
    peer_category:    str(r['Peer Category']),
    ntee_code:        str(r['NTEE Code']),
    city:             str(r['City']),
    zip:              str(r['ZIP']),
    total_assets:     num(r['Total Assets ($)']),
    revenue:          num(r['Revenue ($)']),
    same_ntee_as_cyc: str(r['Same NTEE as CYC']),
    lookup_url:       str(r['990 Filings / Grantee Lookup']),
  })).filter(r => r.ein), r => r.ein);

  // 5. Funder Prospects — two sheets share a schema; tag by list_source.
  const prospectRow = (r, listSource) => ({
    org_id: orgId,
    ein:          ein(r['EIN']),
    name:         str(r['Organization Name']),
    funder_type:  str(r['Funder Type']),
    metro_area:   str(r['Metro Area']),
    contact:      str(r['Contact (c/o)']),
    street:       str(r['Street']),
    city:         str(r['City']),
    zip:          str(r['ZIP']),
    total_assets: num(r['Total Assets ($)']),
    income:       num(r['Income ($)']),
    ntee_code:    str(r['NTEE Code']),
    files_990pf:  str(r['Files 990-PF']),
    lookup_url:   str(r['990 Filings / Board Lookup']),
    list_source:  listSource,
  });
  const prospects = dedupeBy([
    ...readSheet(FILE, 'Chicago Metro Funders').map(r => prospectRow(r, 'chicago_metro_funders')),
    ...readSheet(FILE, 'Funder Prospects').map(r => prospectRow(r, 'funder_prospects')),
  ].filter(r => r.ein), r => `${r.ein}|||${r.list_source}`);

  // 7. IRS IL BMF reference (not org-scoped; keyed by EIN)
  const bmf = dedupeBy(readSheet(FILE, 'eo_il').map(r => ({
    ein:              ein(r['EIN']),
    name:             str(r['NAME']),
    ico:              str(r['ICO']),
    street:           str(r['STREET']),
    city:             str(r['CITY']),
    state:            str(r['STATE']),
    zip:              str(r['ZIP']),
    subsection:       str(r['SUBSECTION']),
    classification:   str(r['CLASSIFICATION']),
    ruling:           str(r['RULING']),
    deductibility:    str(r['DEDUCTIBILITY']),
    foundation:       str(r['FOUNDATION']),
    activity:         str(r['ACTIVITY']),
    organization:     str(r['ORGANIZATION']),
    status:           str(r['STATUS']),
    tax_period:       str(r['TAX_PERIOD']),
    asset_cd:         str(r['ASSET_CD']),
    income_cd:        str(r['INCOME_CD']),
    filing_req_cd:    str(r['FILING_REQ_CD']),
    pf_filing_req_cd: str(r['PF_FILING_REQ_CD']),
    asset_amt:        num(r['ASSET_AMT']),
    income_amt:       num(r['INCOME_AMT']),
    revenue_amt:      num(r['REVENUE_AMT']),
    ntee_cd:          str(r['NTEE_CD']),
    sort_name:        str(r['SORT_NAME']),
  })).filter(r => r.ein), r => r.ein);

  return { cultivation, board, research, peers, prospects, bmf };
}

async function main() {
  loadEnv();
  const sets = build('DRY');

  for (const [k, v] of Object.entries(sets)) console.log(`${k.padEnd(12)} ${v.length} rows`);

  if (!COMMIT) {
    console.log('\nDRY RUN — no writes. Re-run with --commit to load. Samples:');
    console.log('board  :', JSON.stringify(sets.board[0] ?? {}).slice(0, 260));
    console.log('cultv  :', JSON.stringify(sets.cultivation[0] ?? {}).slice(0, 260));
    console.log('bmf    :', JSON.stringify(sets.bmf[0] ?? {}).slice(0, 260));
    return;
  }

  const db = getSupabase();
  const orgId = await getOrgId(db);
  const real = build(orgId);

  await upsertAll(db, 'cyc_cultivation',       real.cultivation, 'org_id,foundation_name');
  await upsertAll(db, 'funder_board_members',  real.board,       'org_id,foundation_name,member_name');
  await upsertAll(db, 'cyc_research_queue',    real.research,    'org_id,ein,organization_name');
  await upsertAll(db, 'cyc_peer_orgs',         real.peers,       'org_id,ein');
  await upsertAll(db, 'cyc_funder_prospects',  real.prospects,   'org_id,ein,list_source');
  await upsertAll(db, 'irs_bmf_il',            real.bmf,         'ein', 1000);
  console.log('\nDone — eo_il workbook loaded.');
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
