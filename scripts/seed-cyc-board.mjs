// Seed CYC's full board roster from its PUBLIC boards page — the LinkedIn-
// independent career source approved as D4. Source of every row:
//   https://www.chicagoyouthcenters.org/cyc-boards  (retrieved 2026-09-09)
//
// Writes network_people (kind board | auxiliary | council | staff) with the
// affiliation shown on the page, the CYC organization node, and one
// network_boards seat per person → CYC. Idempotent: matches existing people by
// exact name within CYC's own kinds, never creates duplicates, never
// overwrites a LinkedIn-enriched employer with the page's coarser affiliation.
//
//   node scripts/seed-cyc-board.mjs            # dry run
//   node scripts/seed-cyc-board.mjs --commit   # write

import { loadEnv, getSupabase, getOrgId, COMMIT } from './_import-lib.mjs';

const SOURCE_REF = 'public roster page';
const CYC_EIN = '362344429';

// [name, kind, board role, affiliation org (null if none), title (when the page shows a role instead of an org), retired?]
const ROSTER = [
  // ── Governing Board of Directors ──
  ['Phil Doherty',              'board', 'Chair',              'Chicago Tribune',                              null, true],
  ['Cathy Main',                'board', 'Vice Chair',         'University of Illinois at Chicago',            null, false],
  ['Devin Maddox',              'board', 'Secretary',          'Rivers Casino',                                null, false],
  ['Thomas D. Vander Veen',     'board', 'Treasurer',          'Epsilon Economics',                            null, false],
  ['Tina Ayala',                'staff', 'President and CEO',  'Chicago Youth Centers',                        'President and CEO', false],
  ['Dixie Adams Erwin',         'board', 'Member',             'IBM Consulting',                               null, false],
  ['Scott Bachmann',            'board', 'Member',             'Associated Bank',                              null, false],
  ['Richard G. Baer, Jr.',      'board', 'Member',             'First Merchants Bank',                         null, false],
  ['Gabor Balassa',             'board', 'Member',             'Kirkland & Ellis, LLP',                        null, false],
  ['Jay Beidler',               'board', 'Member',             'Distillate Capital',                           null, false],
  ['Charles G. Denison',        'board', 'Member',             'Moelis & Company',                             null, false],
  ['Eugene DeRamus',            'board', 'Member',             'BMO Harris Bank',                              null, true],
  ['Daniel M. Feeney',          'board', 'Member',             'Miller Shakman Levine & Feldman LLP',          null, false],
  ['Stephanie Feeney',          'board', 'Member',             'Inspire 11',                                   null, false],
  ['Michael Fenstermacher',     'board', 'Member',             'HPS Investment Partners LLC',                  null, false],
  ['Catherine Goldhaber',       'board', 'Member',             'Lathrop GPM LLP',                              null, false],
  ['Mike Gottlieb',             'board', 'Member',             'ShipTech Logistics',                           null, false],
  ['Jeff Heh',                  'board', 'Member',             'GTCR',                                         null, false],
  ['John B. Hillman',           'board', 'Member',             'Fiduciary Financial Partners LLC',             null, false],
  ['Natalie Holden',            'board', 'Member',             'Fox Swibel Levin & Carroll LLP',               null, false],
  ['Marcia Ingram',             'board', 'Member',             null,                                           'Consultant', false],
  ['Craig Jeffrey',             'board', 'Member',             'Nixon Peabody LLP',                            null, false],
  ['William J. Kelley, Jr.',    'board', 'Member',             'Utz Brands, Inc.',                             null, false],
  ['Kristin Krogstie',          'board', 'Member',             'PwC',                                          null, false],
  ['Laurie Epstein Lawton',     'board', 'Member',             'Lutheran Child and Family Services of Illinois', null, false],
  ['KJ McConnell',              'board', 'Member',             'GTCR',                                         null, false],
  ['Betsy McKenna',             'board', 'Member',             'Exponential Returns',                          null, false],
  ['Amy Weiss Narea',           'board', 'Member',             null,                                           'Education Leadership Consultant', false],
  ['Adon Navarette',            'board', 'Member',             null,                                           'Business Development Executive', false],
  ['Adam Olalde',               'board', 'Member',             'Xtreme Xperience',                             null, false],
  ['Nilay Parikh',              'board', 'Member',             null,                                           'Entrepreneur', false],
  ['Sean Ramsey',               'board', 'Member',             'Grainger',                                     null, false],
  ['Mariah Schroeder',          'board', 'Member',             'Thrive Scholars',                              null, false],
  ['Mark Shulman',              'board', 'Member',             'BMO Harris Bank',                              null, false],
  ['Michelle Speller-Thurman',  'board', 'Member',             'Abbott Laboratories',                          null, false],
  ['Joseph Steinfels',          'board', 'Member',             "Cook County State's Attorney Office",          null, false],
  ['Malcom Tucker',             'board', 'Member',             null,                                           'Associate Attorney', false],
  ['Amy Waldron',               'board', 'Member',             'Northern Trust Corporation',                   null, false],
  ['Edward A. Wiertel, Jr.',    'board', 'Member',             'National Material L.P.',                       null, false],
  ['Henry Wisniewski',          'board', 'Member',             null,                                           'Investment Banking Professional', true],
  // ── Auxiliary Board ──
  ['Zack Audy',                 'auxiliary', 'Member', 'Westbourne Capital Partners',      null, false],
  ['Audrey Baer',               'auxiliary', 'Member', 'Metropolitan Planning Council',    null, false],
  ['Kevin Baer',                'auxiliary', 'Member', 'Piper Sandler',                    null, false],
  ['David Barger',              'auxiliary', 'Member', 'Sprout Social',                    null, false],
  ['Adella Bass',               'auxiliary', 'Member', null,                               'Community Organizer', false],
  ['Gabriella Bomben',          'auxiliary', 'Member', 'Michael Symber Studios',           null, false],
  ['Abhinav Brahmamdam',        'auxiliary', 'Member', 'Morgan Stanley',                   null, false],
  ['Jack Brockhaus',            'auxiliary', 'Member', 'Huntington Bank',                  null, false],
  ['Josh Burday',               'auxiliary', 'Member', 'Neal Gerber & Eisenberg',          null, false],
  ['Shaena Burke',              'auxiliary', 'Member', 'Salesforce',                       null, false],
  ['Emily Cooper',              'auxiliary', 'Member', 'Chicagoland Chamber of Commerce',  null, false],
  ['Natasha Cooper',            'auxiliary', 'Member', 'Merrill Lynch',                    null, false],
  ['Courtney Cregan',           'auxiliary', 'Member', 'Cross Street Realty',              null, false],
  ['Matt Diehl',                'auxiliary', 'Member', 'Compass',                          null, false],
  ['Theodore Donnelley',        'auxiliary', 'Member', 'CMT',                              null, false],
  ['Patrick Falnnery',          'auxiliary', 'Member', "Cook County Sheriff's Office",     null, false],
  ['Ish Goomar',                'auxiliary', 'Member', 'Heitman',                          null, false],
  ['Karl Grant',                'auxiliary', 'Member', 'Slalom',                           null, false],
  ['Xavier Gutter',             'auxiliary', 'Member', null,                               null, false],
  ['Erik Hansen',               'auxiliary', 'Member', 'Cars.com',                         null, false],
  ['Clare Hardiman',            'auxiliary', 'Member', null,                               null, false],
  ['Rebekkah Hurley',           'auxiliary', 'Member', null,                               null, false],
  ['Nicki LaCognata',           'auxiliary', 'Member', 'Elgin Community College',          null, false],
  ['Nate Nemer',                'auxiliary', 'Member', 'Huntington Bank',                  null, false],
  ['Emily Nolan',               'auxiliary', 'Member', 'BMO Harris Bank',                  null, false],
  ['Jeremy Padorr',             'auxiliary', 'Member', 'Peak Realty Chicago',              null, false],
  ['Vivek Patel',               'auxiliary', 'Member', 'Deloitte',                         null, false],
  ['Justin Romic',              'auxiliary', 'Member', 'GTCR',                             null, false],
  ['Victoria Rudd',             'auxiliary', 'Member', 'Discover Financial Services',      null, false],
  ['Eshawn Sharma',             'auxiliary', 'Member', 'Angi',                             null, false],
  ['Jack Silverman',            'auxiliary', 'Member', 'Kirkland & Ellis',                 null, false],
  ['Nikki Zayner',              'auxiliary', 'Member', null,                               null, false],
  // ── CYC Leadership Council ──
  ['Frank Beidler',             'council', 'Member', null, null, false],
  ['Mark Florian',              'council', 'Member', null, null, false],
  ['Al Reid',                   'council', 'Member', null, null, false],
  ['Raymond Rusnak',            'council', 'Member', null, null, false],
  ['Mark Sander',               'council', 'Member', null, null, false],
  ['Greg Thomas',               'council', 'Member', null, null, false],
  ['Patti Van Cleave',          'council', 'Member', null, null, false],
];

const BOARD_LABEL = { board: 'Board of Directors', auxiliary: 'Auxiliary Board', council: 'Leadership Council', staff: 'Board of Directors (ex officio)' };

async function main() {
  loadEnv();
  const db = getSupabase();
  const orgId = await getOrgId(db, 'CYC2026');

  const { data: src } = await db.from('network_sources').select('id').eq('raw_reference', SOURCE_REF).maybeSingle();
  if (!src) throw new Error('Run the relationship_graph_phase1 migration first (network_sources seed missing).');
  const sourceId = src.id;

  console.log(`Roster: ${ROSTER.length} people (${ROSTER.filter(r => r[1] === 'board').length} directors, ${ROSTER.filter(r => r[1] === 'auxiliary').length} auxiliary, ${ROSTER.filter(r => r[1] === 'council').length} council, 1 staff)`);
  if (!COMMIT) { console.log('\nDRY RUN — re-run with --commit to write.'); return; }

  // ── CYC organization node ──
  let { data: cyc } = await db.from('network_organizations').select('id').eq('ein', CYC_EIN).maybeSingle();
  if (!cyc) {
    const { data: rec } = await db.from('recipients').select('id').eq('ein', CYC_EIN).maybeSingle();
    const { data: ins, error } = await db.from('network_organizations').insert({
      name: 'Chicago Youth Centers', normalized_name: 'chicago youth centers', organization_type: 'nonprofit',
      ein: CYC_EIN, website: 'https://www.chicagoyouthcenters.org', city: 'Chicago', state: 'IL', ntee_code: 'O20',
      recipient_id: rec?.id ?? null, source_id: sourceId, confidence: 0.95, last_verified_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw new Error(`CYC org insert failed: ${error.message}`);
    cyc = ins;
    console.log('Created CYC organization node');
  }

  // ── People ──
  const { data: existing } = await db.from('network_people')
    .select('id, name, kind, enriched_at').eq('org_id', orgId).in('kind', ['board', 'staff', 'auxiliary', 'council']);
  const byName = new Map((existing ?? []).map(p => [p.name.trim().toLowerCase(), p]));

  let inserted = 0, updated = 0, seats = 0;
  for (const [name, kind, role, org, title, retired] of ROSTER) {
    const found = byName.get(name.toLowerCase());
    const affiliation = org ? (retired ? `${org} (retired)` : org) : null;
    const patch = {
      kind, board_role: role, source_id: sourceId, verification: 'verified',
      note: `Listed on CYC's public boards page (${BOARD_LABEL[kind]})${retired ? ' — retired' : ''}.`,
    };
    // The page's affiliation is coarse; a LinkedIn-enriched employer is finer — keep it.
    if (!found?.enriched_at) {
      patch.current_org = affiliation;
      patch.current_title = title ?? (org ? null : undefined);
    }
    let personId = found?.id;
    if (personId) {
      const { error } = await db.from('network_people').update(patch).eq('id', personId);
      if (error) throw new Error(`${name}: ${error.message}`);
      updated++;
    } else {
      const { data: ins, error } = await db.from('network_people')
        .insert({ org_id: orgId, name, status: 'new', ...patch }).select('id').single();
      if (error) throw new Error(`${name}: ${error.message}`);
      personId = ins.id; inserted++;
    }

    // Board seat at CYC (person → CYC org), one per (person, org, title).
    const seatTitle = `${BOARD_LABEL[kind]} — ${role}`;
    const { data: seat } = await db.from('network_boards').select('id')
      .eq('person_id', personId).eq('organization_id', cyc.id).eq('title', seatTitle).maybeSingle();
    if (!seat) {
      const { error } = await db.from('network_boards').insert({
        person_id: personId, organization_id: cyc.id, title: seatTitle,
        is_current: true, source_id: sourceId, confidence: 0.95,
      });
      if (error) throw new Error(`seat ${name}: ${error.message}`);
      seats++;
    }
  }
  console.log(`Done — ${inserted} people added, ${updated} updated, ${seats} board seats recorded. Source: ${SOURCE_REF}.`);
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
