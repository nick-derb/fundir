// Import CYC's Instrumentl pipeline export into cyc_grant_submissions.
// Dry run:  node scripts/import-instrumentl.mjs
// Commit:   node scripts/import-instrumentl.mjs --commit
// Optional: pass a file path as the first non-flag arg (defaults below).

import { loadEnv, getSupabase, getOrgId, readSheet, num, isoDate, str, upsertAll, COMMIT } from './_import-lib.mjs';

const FILE = process.argv.find(a => a.endsWith('.xlsx')) ?? 'C:/Users/nickd/Downloads/Instrumentl Data.xlsx';

// Status → terminal outcome label. Per decision: "Abandoned" is CYC's own
// choice not to pursue, NOT a funder decision, so it is excluded from labels.
function outcomeOf(status) {
  const s = (status || '').toLowerCase();
  if (s.startsWith('awarded')) return 'awarded';
  if (s === 'declined') return 'rejected';
  return null; // submitted / in progress / researching / planned / abandoned
}

// Normalized pipeline stage (for display / future integration).
function stageOf(status) {
  const s = (status || '').toLowerCase();
  if (s.startsWith('awarded')) return 'awarded';
  if (s === 'declined') return 'rejected';
  if (s === 'abandoned') return 'abandoned';
  if (s.includes('submitted')) return 'submitted';
  if (s.includes('in progress')) return 'drafting';
  if (s === 'planned') return 'planned';
  return 'researching';
}

async function main() {
  loadEnv();
  const raw = readSheet(FILE);
  console.log(`Read ${raw.length} rows from ${FILE}`);

  const rows = raw
    .filter(r => str(r['Opportunity name']) || str(r['Funder name']))
    .map(r => ({
      project:               str(r['Project']),
      opportunity_name:      str(r['Opportunity name']) ?? '(untitled)',
      funder_name:           str(r['Funder name']) ?? '(unknown funder)',
      owner:                 str(r['Owner']),
      status:                str(r['Status']),
      outcome:               outcomeOf(r['Status']),
      stage:                 stageOf(r['Status']),
      opportunity_amount:    num(r['Opportunity Amount']),
      amount_requested:      num(r['Amount requested']),
      amount_awarded:        num(r['Amount awarded']),
      loi_deadline:          isoDate(r['Funder LOI deadline']),
      preproposal_deadline:  isoDate(r['Funder Pre-proposal deadline']),
      fullproposal_deadline: isoDate(r['Funder Full proposal deadline']),
      notes:                 str(r['Notes']),
      source:                'instrumentl',
    }));

  const awarded = rows.filter(r => r.outcome === 'awarded').length;
  const rejected = rows.filter(r => r.outcome === 'rejected').length;
  const labeled = awarded + rejected;
  const funders = new Set(rows.map(r => r.funder_name)).size;
  console.log(`Mapped ${rows.length} submissions · ${funders} funders · labels: ${awarded} awarded / ${rejected} rejected (${labeled} total)`);

  if (!COMMIT) {
    console.log('\nDRY RUN — no writes. Re-run with --commit to load. Sample:');
    console.log(JSON.stringify(rows[0], null, 2));
    return;
  }

  const db = getSupabase();
  const orgId = await getOrgId(db);
  // Collapse duplicate (opportunity_name, funder_name) rows to satisfy the
  // unique index, KEEPING the most complete one — a terminal outcome and/or a
  // real awarded/requested amount wins over a blank prospecting duplicate, so
  // awards are never lost to dedup ordering.
  const rank = r => (r.outcome ? 4 : 0) + ((Number(r.amount_awarded) || 0) > 0 ? 2 : 0) + ((Number(r.amount_requested) || 0) > 0 ? 1 : 0);
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.opportunity_name}|||${r.funder_name}`;
    const prev = byKey.get(k);
    if (!prev || rank(r) > rank(prev)) byKey.set(k, r);
  }
  const deduped = [...byKey.values()].map(r => ({ ...r, org_id: orgId }));
  if (deduped.length !== rows.length) console.log(`Collapsed ${rows.length - deduped.length} duplicate (opportunity, funder) rows, keeping the most complete.`);

  const written = await upsertAll(db, 'cyc_grant_submissions', deduped, 'org_id,opportunity_name,funder_name');
  console.log(`Done — ${written} submissions written. Labels: ${awarded} awarded / ${rejected} rejected.`);
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
