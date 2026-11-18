import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseGrantReport, summarizeReport, fiscalYearFrom, fiscalYearOf, statusOf, matchLeads, looseFunderKey } from '@/lib/grant-report';

const book = (name: string, rows: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['FY27 Grant Funding Breakdowns'], ['Category', 'Amount Requested']]), 'Breakdowns');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

// The shape of CYC's workbook: running-total columns, a non-cash ask, TOTAL rows under the data.
const REPORT = book('FY27 Grant Report', [
  ['Status ', 'Funder', 'Funding', 'Purpose', 'Ask Type', 'Requested', 'Running Requested', 'Awarded', 'Running Awarded', 'Notes'],
  ['Awarded', 'BlackRock Gives', 'Restricted', 'OST', 'New', 20000, 20000, 12000, 12000, 'Michael Fenstermacher is the nominator'],
  ['Awarded', 'Polk Bros. Foundation', 'Unrestricted', 'General Operating', 'Renewal', '', 20000, 90000, 102000, ''],
  ['Declined', 'Audible', 'Restricted', 'OST - Podcast', 'New', 25933, 20000, 0, 102000, ''],
  ['Pending', 'Barker Welfare Foundation', 'Unrestricted', 'General Operating', 'Renewal', 50000, 70000, '', 102000, '2 yr grant'],
  ['Pending', 'On My Way to Kindergarten (The Molina Foundation)', 'Restricted', 'Early Learning - In-Kind', 'New', '200 books', 70000, '', 102000, ''],
  ['Pending', 'TJX Foundation', 'Restricted', 'OST', 'Re-engagement', 10000, 80000, '', 102000, 'Last funded us $10k in 2018'],
  ['TOTAL', '', '', '', '', '', 80000, '', 102000, ''],
  ['Total Pending ', 3],
]);

describe('grant report parser', () => {
  it('reads the rows and skips running totals and TOTAL lines', () => {
    const p = parseGrantReport(REPORT, 'FY27_Grant_Report_Workbook.xlsx');
    expect(p.sheet).toBe('FY27 Grant Report');
    expect(p.fiscal_year).toBe(2027);
    expect(p.rows).toHaveLength(6);
    expect(p.skipped).toBe(2);
    expect(p.rows[0]).toMatchObject({ funder: 'BlackRock Gives', status: 'awarded', funding: 'Restricted', purpose: 'OST', ask_type: 'New', requested: 20000, awarded: 12000, notes: 'Michael Fenstermacher is the nominator' });
    expect(p.rows[1]).toMatchObject({ requested: null, awarded: 90000 });
    expect(p.rows.find(r => r.funder.startsWith('On My Way'))).toMatchObject({ requested: null, requested_text: '200 books', purpose_group: 'Early Learning' });
    expect(p.rows.find(r => r.funder === 'Audible')?.purpose_group).toBe('OST');
  });
  it('says what it needs when the columns are missing', () => {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Amount'], ['x', 1]]), 'S');
    expect(() => parseGrantReport(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)).toThrow(/Status/);
  });
});

describe('totals and breakdowns', () => {
  it('counts pending and awarded asks, as the Breakdowns sheet does', () => {
    const s = summarizeReport(parseGrantReport(REPORT).rows, 2027);
    expect(s.counts).toEqual({ awarded: 2, declined: 1, pending: 3 });
    expect(s.requested).toBe(80000);        // 20,000 + 50,000 + 10,000; Polk had no ask amount, declined excluded
    expect(s.awarded).toBe(102000);
    expect(s.pending_requested).toBe(60000);
    expect(s.declined_requested).toBe(25933);
    expect(s.win_rate).toBeCloseTo(2 / 3);
    expect(s.by_funding.map(b => [b.label, b.requested, b.awarded])).toEqual([['Unrestricted', 50000, 90000], ['Restricted', 30000, 12000]]);
    expect(s.by_ask.find(b => b.label === 'Re-engagement')).toMatchObject({ requested: 10000, count: 1 });
    expect(s.largest_pending[0]).toMatchObject({ funder: 'Barker Welfare Foundation', requested: 50000 });
  });
});

describe('fiscal years and statuses', () => {
  it('reads the fiscal year from names and dates', () => {
    expect(fiscalYearFrom('FY27 Grant Report')).toBe(2027);
    expect(fiscalYearFrom(null, 'Report FY 2026.xlsx')).toBe(2026);
    expect(fiscalYearFrom('Grant report')).toBeNull();
    expect(fiscalYearOf(new Date('2026-11-18T12:00:00'))).toBe(2027);
    expect(fiscalYearOf(new Date('2026-03-01T12:00:00'))).toBe(2026);
    expect(fiscalYearOf(new Date('2026-03-01T12:00:00'), 0)).toBe(2026);
  });
  it('maps the usual status words', () => {
    expect(statusOf('Awarded')).toBe('awarded');
    expect(statusOf('Declined ')).toBe('declined');
    expect(statusOf('Pending')).toBe('pending');
    expect(statusOf('LOI submitted')).toBe('pending');
    expect(statusOf('Not funded')).toBe('declined');
    expect(statusOf('TOTAL')).toBeNull();
    expect(statusOf('')).toBeNull();
  });
});

describe('report funders → leads', () => {
  const rows = parseGrantReport(REPORT).rows;
  it('matches exact names, then an unambiguous loose name', () => {
    expect(looseFunderKey('associated bank foundation')).toBe('associated bank');
    const leads = [
      { id: 'l1', pipeline_status: 'NEW', target_org_id: 'o1', target_name: 'BlackRock Gives' },
      { id: 'l2', pipeline_status: 'NEW', target_org_id: 'o2', target_name: 'Barker Welfare Foundation, Inc.' },
      { id: 'l3', pipeline_status: 'NEW', target_org_id: 'o3', target_name: 'TJX Foundation' },
      { id: 'l4', pipeline_status: 'NEW', target_org_id: 'o4', target_name: 'TJX Companies' },
    ];
    const m = matchLeads(rows, leads);
    const by = (funder: string) => m.get(rows.find(r => r.funder === funder)!)?.map(l => l.id);
    expect(by('BlackRock Gives')).toEqual(['l1']);
    expect(by('Barker Welfare Foundation')).toEqual(['l2']);
    expect(by('TJX Foundation')).toEqual(['l3']);
    expect(by('Audible')).toBeUndefined();
  });
});
