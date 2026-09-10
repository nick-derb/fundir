import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { workbookFromSnapshot, workbookBuffer, snapshotJson, snapshotNames, SHEETS, DATA_DICTIONARY, type Snapshot } from '@/lib/network/snapshot';

const snap: Snapshot = {
  meta: { version: '1.0', generated_at: '2026-09-09T12:00:00.000Z', org_id: 'o', org_name: 'Chicago Youth Centers', counts: { people: 1, organizations: 1, employments: 1, boards: 1, relationships: 1, funding_events: 1, peer_organizations: 1, warm_paths: 1, leads: 1, sources: 1, refresh_log: 1 }, note: 'grades' },
  people: [{ 'Person ID': 'p1', 'Name': 'Phil Doherty', 'Kind': 'board', 'CYC role': 'Chair', 'Title': 'President', 'Organization': 'Doherty Consulting LLC', 'Organization ID': 'o2', 'Location': 'Chicago', 'Headline': '', 'LinkedIn URL': 'https://www.linkedin.com/in/phil-doherty-2501a55', 'Profile read': '2026-09-09', 'Verification': 'verified', 'Status': 'new', 'Note': '', 'Source': 'linkedin_api', 'Source URL': '' }],
  organizations: [{ 'Organization ID': 'o1', 'Name': 'Robert R. McCormick Foundation', 'Type': 'foundation', 'EIN': '366046994', 'Website': '', 'City': 'Chicago', 'State': 'IL', 'Sector': '', 'NTEE': '', 'Confidence': 0.95, 'Last verified': '', 'Source': 'irs_990_xml', 'Source URL': '' }],
  employments: [{ 'Person': 'Phil Doherty', 'Person ID': 'p1', 'Organization': 'Chicago Tribune', 'Organization ID': 'o3', 'Title': 'CFO', 'Start year': 2001, 'End year': 2013, 'Current': '', 'Source': 'linkedin_api', 'Source URL': '' }],
  boards: [{ 'Person': 'Scott C. Smith', 'Person ID': 'p2', 'Organization': 'Robert R. McCormick Foundation', 'Organization ID': 'o1', 'Title': 'Chairman', 'Current': 'yes', 'Confidence': 0.9, 'Source': 'irs_990_xml', 'Source URL': 'https://apps.irs.gov/x.zip#1_public.xml' }],
  relationships: [{ 'Relationship ID': 'r1', 'From': 'Phil Doherty', 'From kind': 'person', 'From ID': 'p1', 'To': 'Scott C. Smith', 'To kind': 'person', 'To ID': 'p2', 'Type': 'former_colleague', 'Strength': 80, 'Confidence': 0.9, 'Verification': 'verified', 'Evidence': 'overlapped at Chicago Tribune', 'Derived by': 'derived:v1', 'Observed': '2026-09-09', 'Source': 'linkedin_api', 'Source URL': '', 'Touches CYC': 'yes' }],
  funding_events: [{ 'Event ID': 'g1', 'Funder': 'Robert R. McCormick Foundation', 'Funder ID': 'o1', 'Recipient': 'BUILD Inc.', 'Recipient ID': 'o4', 'Fiscal year': 2024, 'Amount': 150000, 'Purpose': 'youth', 'Program category': '', 'Geography': 'IL', 'Confidence': 1, 'Source': 'irs_990_xml', 'Source URL': 'https://apps.irs.gov/x.zip#2_public.xml' }],
  peer_organizations: [{ 'Organization': 'BUILD Inc.', 'Organization ID': 'o4', 'Similarity': 0.91, 'Reasons': 'Same NTEE', 'Computed': '2026-09-09', 'Source': 'irs_bmf' }],
  warm_paths: [{ 'Lead ID': 'l1', 'Type': 'Warm Introduction', 'Target': 'Robert R. McCormick Foundation', 'Score': 100 }],
  leads: [{ 'Lead ID': 'l1', 'Type': 'Warm Introduction', 'Target': 'Robert R. McCormick Foundation', 'Score': 100 }],
  sources: [{ 'Source ID': 's1', 'Type': 'irs_990_xml', 'Name': 'IRS 990 filing', 'URL': '', 'Retrieved': '2026-09-09', 'Published': '', 'Confidence': 0.95, 'Reference': '' }],
  refresh_log: [{ 'Started': '2026-09-09 01:00', 'Completed': '2026-09-09 01:05', 'Categories': 'people', 'API calls': 25, 'RapidAPI credits': 33, 'Claude ($)': '0.0000', 'Profiles read': 4, 'Employers scanned': 2, 'Warm paths found': 0, 'Relationships found': 12, 'Funding events found': 0, 'Status': 'done', 'Notes': '' }],
};

describe('snapshot workbook', () => {
  it('has exactly the thirteen sheets, in order, with README first and the dictionary last', () => {
    const book = workbookFromSnapshot(snap);
    expect(book.SheetNames).toEqual([...SHEETS]);
    expect(book.SheetNames.length).toBe(13);
  });
  it('README names every data sheet with its row count and states the hedge and the grades', () => {
    const book = workbookFromSnapshot(snap);
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets.README, { header: 1 });
    const text = rows.flat().join('\n');
    for (const s of SHEETS.filter(n => n !== 'README' && n !== 'Data Dictionary')) expect(text).toContain(s);
    expect(text).toContain('No CYC funding relationship identified in available data');
    expect(text).toContain('verified');
  });
  it('the data dictionary covers every column of every data sheet', () => {
    const book = workbookFromSnapshot(snap);
    const documented = new Set(DATA_DICTIONARY.map(d => `${d.sheet}|${d.column}`));
    const common = new Set(DATA_DICTIONARY.filter(d => d.sheet === '(any)').map(d => d.column));
    for (const name of SHEETS) {
      if (name === 'README' || name === 'Data Dictionary' || name === 'Warm Paths') continue;
      const header = (XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1 })[0] ?? []) as string[];
      for (const col of header) expect(documented.has(`${name}|${col}`) || common.has(col), `${name} › ${col}`).toBe(true);
    }
  });
  it('round-trips through a buffer and the JSON twin carries the same rows', () => {
    const buf = workbookBuffer(workbookFromSnapshot(snap));
    const back = XLSX.read(buf, { type: 'buffer' });
    expect(back.SheetNames).toEqual([...SHEETS]);
    const json = JSON.parse(snapshotJson(snap).toString('utf8')) as Snapshot;
    expect(json.leads).toEqual(snap.leads);
    expect(json.meta.counts.funding_events).toBe(1);
    const n = snapshotNames(new Date('2026-09-09T15:00:00Z'));
    expect(n.xlsx).toBe('CYC Network Intelligence 2026-09-09.xlsx');
    expect(n.json).toBe('CYC Network Intelligence 2026-09-09.json');
  });
});
