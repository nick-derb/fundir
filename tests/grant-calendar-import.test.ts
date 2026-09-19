import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseGrantCalendar, isoDate } from '@/lib/grant-calendar-import';

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const FY27_HEADER = ['', 'Status', 'Funder', 'Portal', 'Internal Due Date', 'Due Date', 'Type', 'Ask Type', 'Format', 'Funding', 'CYC', 'Amount', 'Notes'];
const FY26_HEADER = ['RE ID', 'Lead', 'Status', 'Funder', 'Due Date', 'Type', 'Ask Type', 'Format', 'Funding', 'CYC', 'Anticipated Gift Date', 'LY Award', 'Planned Ask', 'Projection (High)', 'Projection (Low)', 'Outcome', 'Amount', 'Date', 'Notes:', 'Things to put into RE', 'Actions'];

describe('parseGrantCalendar', () => {
  const buf = workbook({
    'FY27 Grant Calendar': [
      FY27_HEADER,
      ['STANDARDIZED VALUES', ', Planned, Drafted, Submitted, Awarded, Declined, N/A', '', '', '', 'Unconfirmed ', ', Proposal, LOI, Report', '', '', '', '', '', ''],
      ['INSTRUCTIONS', 'Use dropdown (leave blank initially)', 'Use consistent naming', '', '', 'Confirmed ', 'Use dropdown', '', '', '', '', '', ''],
      ['July', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Awarded', 'Katz Amsterdam Charitable Trust', '', '', '7/15/26', 'Proposal', 'Renewal', 'Online Portal', 'Restricted', 'OST Skiing Program', '$30,007.00', ''],
      ['', 'Planned', 'KFC Wishes', '', '', 'Rolling ', 'proposal ', 'New', 'Online Portal', 'Restricted', 'OST', '', 'Roberta contacting connection'],
      ['August', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Submitted', 'Barker Welfare Foundation', '', '7/28/26', '8/1/26', 'Proposal', 'Renewal', 'Email', 'Unrestricted', 'Genops', '', 'Should hear back in Nov.'],
      ['Misc. Rolling', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Planned', 'Jewel-Osco Foundation', '', '', 'Rolling', 'Proposal', 'New', 'Online Portal', 'Restricted', 'Programs', '', ''],
    ],
    'Sheet1': [
      FY27_HEADER,
      ['July', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Awarded', 'Katz Amsterdam Charitable Trust', '', '', '7/15/26', 'Proposal', '', '', '', '', '', ''],
    ],
    'Considered & Rejected': [
      ['Funder', 'Notes'],
      ['Alfred Bersted Foundation', 'CYC not in geo area'],
      ['G. A. Ackermann Memorial Fund', 'CYC not eligible '],
    ],
    'check email': [['Jaques Pepin Foundation- we are not eligible']],
  });
  const out = parseGrantCalendar(buf, 'FY27_Grant_Calendar.xlsx');
  const items = out.rows.filter(r => r.item_type !== 'Considered');

  it('reads the month sections and the items under them', () => {
    expect(items.map(r => [r.month_label, r.funder])).toEqual([
      ['July', 'Katz Amsterdam Charitable Trust'], ['July', 'KFC Wishes'], ['August', 'Barker Welfare Foundation'], ['Misc. Rolling', 'Jewel-Osco Foundation'],
    ]);
    expect(items[0]).toMatchObject({ fiscal_year: 'FY27', status: 'Awarded', item_type: 'Proposal', due_date: '2026-07-15', amount: 30007, program: 'OST Skiing Program' });
  });
  it('keeps "Rolling" as text, reads the internal due date, and tidies casing', () => {
    expect(items[1]).toMatchObject({ due_date: null, due_text: 'Rolling', item_type: 'Proposal', notes: 'Roberta contacting connection' });
    expect(items[2]).toMatchObject({ internal_due_date: '2026-07-28', due_date: '2026-08-01' });
  });
  it('drops the legend rows and the duplicate working sheet, keeps the rejected list', () => {
    expect(out.sheets.map(s => `${s.name}:${s.kind}:${s.rows}`)).toEqual(['FY27 Grant Calendar:calendar:4', 'Considered & Rejected:rejected:2']);
    expect(out.skipped.some(s => s.startsWith('Sheet1: duplicate FY27'))).toBe(true);
    expect(out.skipped.some(s => s.startsWith('check email'))).toBe(true);
    const rejected = out.rows.filter(r => r.item_type === 'Considered');
    expect(rejected.map(r => r.funder)).toEqual(['Alfred Bersted Foundation', 'G. A. Ackermann Memorial Fund']);
    expect(rejected[0]).toMatchObject({ fiscal_year: 'FY27', status: 'Rejected', notes: 'CYC not in geo area' });
  });
  it('reads the FY26 layout with RE id, lead, projections and outcome date', () => {
    const b = workbook({ 'FY26 Grant Calendar': [
      FY26_HEADER,
      ['FY26 GRANT CALENDAR', '', '', 'July 1, 2025 - June 30, 2026', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['August', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['1144', 'Elisa', 'Submitted', 'Abbott ', '8/1/25', 'Proposal', 'Renewal', 'Email', 'Restricted', 'STEM', '', '25,000.00', '51,000.00', '51,000.00', '25,000.00', 'Awarded', '$51,000.00', '9/30/25', 'Proposal from Tricia', 'update RE', 'send thanks'],
      ['3663019', '', 'Planned', 'William G McGowan Charitable Fund', '8/1/25', 'Outreach', 'New', '', '', '', '', '', 'NA', 'NA', 'NA', '', '', '', '', '', ''],
    ] });
    const r = parseGrantCalendar(b, 'FY26_Grant_Calendar.xlsx').rows;
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ fiscal_year: 'FY26', re_id: '1144', lead: 'Elisa', funder: 'Abbott', due_date: '2025-08-01', ly_award: 25000, planned_ask: 51000, projection_high: 51000, projection_low: 25000, outcome: 'Awarded', amount: 51000, outcome_date: '2025-09-30', notes: 'Proposal from Tricia', re_notes: 'update RE', actions: 'send thanks', month_label: 'August' });
    expect(r[1]).toMatchObject({ planned_ask: null, projection_high: null });
  });
  it('takes the fiscal year from a title cell when the sheet name has none', () => {
    const b = workbook({ 'Sheet1': [FY26_HEADER, ['FY26 GRANT CALENDAR', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], ['', '', 'Planned', 'X', '7/1/25', 'LOI', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']] });
    expect(parseGrantCalendar(b).rows[0].fiscal_year).toBe('FY26');
  });
});

describe('redaction', () => {
  it('never lets a portal password typed into Notes reach the rows', () => {
    const b = workbook({ 'FY27 Grant Calendar': [FY27_HEADER, ['', 'Planned', 'Lawrence Foundation', '', '', '4/30/27', 'Proposal', '', '', '', '', '', 'UN:grants@example.org PW: Secret123& check portal']] });
    const r = parseGrantCalendar(b, 'FY27_Grant_Calendar.xlsx').rows[0];
    expect(r.notes).toBe('UN:grants@example.org [password removed] check portal');
    expect(JSON.stringify(r)).not.toContain('Secret123');
  });
});

describe('isoDate', () => {
  it('parses CYC date spellings', () => {
    expect(isoDate('7/12/25')).toBe('2025-07-12');
    expect(isoDate('12/3/2026')).toBe('2026-12-03');
    expect(isoDate('2026-07-15')).toBe('2026-07-15');
    expect(isoDate('Rolling')).toBeNull();
    expect(isoDate('')).toBeNull();
  });
});
