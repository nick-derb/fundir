import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCultivation, bmfNameKey } from '@/lib/cultivation-import';
import { parseInstrumentl } from '@/lib/instrumentl-import';

const HEADER = ['Foundation Name', 'Funding Focus', 'Funding Range', 'Board Member Title', 'Board Member Name', 'Foundation Address', 'Phone', 'Email', 'Connection?', 'Notes'];

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseCultivation', () => {
  const buf = workbook({
    'Foundation Cultivation List': [
      HEADER,
      ['Flanagan Family Foundation', '', '', '', '', '', '', '', '', ''],
      ['', 'Genops', 'New grantees: $1,722 average', '', '', '333 W Wacker Dr, Chicago, IL 60606', '312-332-1111', '', '', 'Invite only but good alignment.'],
      ['', '', '', 'President and Director', 'Larkin Flanagan', '', '', '', '', ''],
      ['', 1, '', 'Director', 'Kelly Flanagan ', '', '', '', '', ''],
      ['George H Marie S & Lou Zendt Ch\r\n', '', '', '', '', '', '', '', '', ''],
      ['', 'Genops', '', '', '', 'Po Box 653067, Dallas, TX 752653067', '', '', '', 'Invite only.'],
      ['', '', '', 'Trustee', 'Bank of America N A', '', '', '', '', ''],
      ['IMC Chicago Charitable Foundation', '', '', '', '', '', '', '', '', ''],
      ['', '', '', 'Executive Director', 'Lisa Wiersma', '', '', '', 'Cathy Main', ''],
    ],
    'Rejected or Reconsider': [
      HEADER,
      ['W.P. & H.B. White Foundation', '', '', '', '', '', '', '', '', ''],
      ['', 'Genops', '', '', '', '540 Frontage Road, Northfield, IL 60093 USA', ' 847-446-1441', '', '', 'We were denied in March 2026.'],
      ['', '', '', 'President', 'Steven R. White', '', '', 'srwhite@example.net ', '', ''],
    ],
  });
  const out = parseCultivation(buf);

  it('reads the stacked layout: a name row, a details row, then one row per member', () => {
    expect(out.sheets).toEqual(['Foundation Cultivation List', 'Rejected or Reconsider']);
    expect(out.missing_columns).toEqual([]);
    expect(out.foundations.map(f => f.foundation_name)).toEqual(['Flanagan Family Foundation', 'George H Marie S & Lou Zendt Ch', 'IMC Chicago Charitable Foundation', 'W.P. & H.B. White Foundation']);
    const flanagan = out.foundations[0];
    expect(flanagan.funding_focus).toBe('Genops');
    expect(flanagan.address).toBe('333 W Wacker Dr, Chicago, IL 60606');
    expect(flanagan.notes).toBe('Invite only but good alignment.');
    expect(flanagan.board_members_listed).toBe('2');
  });
  it('trims names and ignores a stray number in the focus column of a member row', () => {
    const names = out.members.filter(m => m.foundation_name === 'Flanagan Family Foundation').map(m => m.member_name);
    expect(names).toEqual(['Larkin Flanagan', 'Kelly Flanagan']);
    expect(out.foundations[0].funding_focus).toBe('Genops');
  });
  it('keeps a member-level connection and email on the member', () => {
    const lisa = out.members.find(m => m.member_name === 'Lisa Wiersma');
    expect(lisa?.connection_to_cyc).toBe('Cathy Main');
    const steven = out.members.find(m => m.member_name === 'Steven R. White');
    expect(steven?.email).toBe('srwhite@example.net');
    expect(steven?.title).toBe('President');
  });
  it('labels the parked sheet in the notes', () => {
    expect(out.foundations[3].notes).toBe('Rejected or Reconsider: We were denied in March 2026.');
    expect(out.foundations[3].list).toBe('Rejected or Reconsider');
  });
  it('rejects a workbook without the expected header', () => {
    const bad = workbook({ Sheet1: [['Name', 'Amount'], ['x', 1]] });
    const r = parseCultivation(bad);
    expect(r.foundations).toEqual([]);
    expect(r.missing_columns.length).toBeGreaterThan(0);
  });
});

describe('bmfNameKey', () => {
  it('matches CYC spellings to IRS master-file spellings', () => {
    expect(bmfNameKey('The Clayco Foundation')).toBe(bmfNameKey('CLAYCO FOUNDATION THE'));
    expect(bmfNameKey('Joseph & Bessie Feinberg Foundation')).toBe(bmfNameKey('THE JOSEPH AND BESSIE FEINBERG FOUNDATION'));
    expect(bmfNameKey('W.P. & H.B. White Foundation')).toBe(bmfNameKey('W P & H B WHITE FOUNDATION'));
    expect(bmfNameKey('Sumac Foundation Tr')).toBe(bmfNameKey('SUMAC FOUNDATION TR'));
    expect(bmfNameKey('Sacks Family Foundation')).not.toBe(bmfNameKey('SACHS FAMILY FOUNDATION'));
  });
});

describe('parseInstrumentl with a UTF-8 CSV export', () => {
  it('keeps curly apostrophes and dashes intact (SheetJS would read a bare buffer as Windows-1252)', () => {
    const csv = 'Project,Opportunity name,Funder name,Owner,Status,Opportunity Amount,Amount requested,Amount awarded,Funder LOI deadline,Funder Pre-proposal deadline,Funder Full proposal deadline,Notes\n'
      + 'Genops,Jack’s Community Grants,Jack In The Box Foundation,,Researching,"US $5,000 - US $25,000 ",,,"Oct 31, 2026",,"Oct 31, 2026",\n'
      + 'Restricted,ANCHOR Grants – Health,Northwestern University,,Application Submitted,,15000,,,,"Mar 20, 2027",Note\n';
    const out = parseInstrumentl(Buffer.from(csv, 'utf8'));
    expect(out.rows.map(r => r.opportunity_name)).toEqual(['Jack’s Community Grants', 'ANCHOR Grants – Health']);
    expect(out.rows[0].stage).toBe('researching');
    expect(out.rows[0].fullproposal_deadline).toBe('2026-10-31');
    expect(out.rows[1].stage).toBe('submitted');
    expect(out.rows[1].amount_requested).toBe(15000);
  });
});
