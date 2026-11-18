import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDonorExport, relationshipFor, toIsoDate, toAmount, knownIndex, type KnownFunder } from '@/lib/known-funders';
import { parseRoster, kindFor } from '@/lib/board-roster';
import { parseSurvey, splitFoundations, truthyWilling } from '@/lib/board-survey';
import { directScore } from '@/lib/network/direct-paths';

const xlsx = (sheets: Record<string, unknown[][]>) => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};
const csv = (text: string) => Buffer.from(text, 'utf8');

describe("Raiser's Edge export", () => {
  it('reads a summary export, skips individuals and keeps gift history', () => {
    const p = parseDonorExport(xlsx({ Donors: [
      ['Constituent Gift Summary'],
      [],
      ['Constituent Name', 'Constituent Type', 'Last Gift Date', 'Last Gift Amount', 'Lifetime Giving'],
      ['Steans Family Foundation', 'Foundation', '06/15/2026', '$10,000', '$45,000'],
      ['Jane Doe', 'Individual', '01/02/2026', '250', '900'],
      ['The Crown Family', 'Foundation', '2019-07-01', '25000', '120000'],
    ] }));
    expect(p.file_rows).toBe(3);
    expect(p.skipped_individuals).toBe(1);
    expect(p.rows.map(r => r.name)).toEqual(['Steans Family Foundation', 'The Crown Family']);
    expect(p.rows[0]).toMatchObject({ last_gift_date: '2026-06-15', last_gift_amount: 10000, total_given: 45000 });
  });
  it('rolls a gift-level export up by funder', () => {
    const p = parseDonorExport(csv('Organization Name,Gift Date,Gift Amount\nPolk Bros Foundation,2024-03-01,5000\nPolk Bros. Foundation,2025-09-10,7500\nField Foundation,2018-01-05,2000\n'));
    const polk = p.rows.find(r => r.name.startsWith('Polk'))!;
    expect(p.rows).toHaveLength(2);
    expect(polk).toMatchObject({ last_gift_date: '2025-09-10', last_gift_amount: 7500, total_given: 12500, gift_count: 2 });
  });
  it('rejects a file with no funder column', () => {
    expect(() => parseDonorExport(csv('Amount,Date\n5,2024-01-01\n'))).toThrow(/funder name column/);
  });
  it('calls a gift inside 18 months current, anything older or undated past', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(relationshipFor('2026-01-10', now)).toBe('current');
    expect(relationshipFor('2025-06-01', now)).toBe('current');
    expect(relationshipFor('2025-04-01', now)).toBe('past');
    expect(relationshipFor(null, now)).toBe('past');
  });
  it('reads the date and amount shapes exports use', () => {
    expect(toIsoDate('7/1/26')).toBe('2026-07-01');
    expect(toIsoDate(46204)).toBe('2026-07-01');
    expect(toIsoDate('2024')).toBe('2024-12-31');
    expect(toIsoDate('')).toBeNull();
    expect(toAmount('$1,250.50')).toBe(1250.5);
    expect(toAmount('(300)')).toBe(-300);
  });
});

describe('known funder lookup', () => {
  const rec = (o: Partial<KnownFunder>): KnownFunder => ({ id: 'k', name: 'x', normalized_name: 'x', network_org_id: null, relationship: 'past', last_gift_year: null, last_gift_date: null, last_gift_amount: null, total_given: null, gift_count: null, source: 'manual', notes: null, recorded_by: null, updated_at: '', ...o });
  it('matches by graph node, then by normalized name', () => {
    const find = knownIndex([rec({ id: 'a', network_org_id: 'org-1', relationship: 'current' }), rec({ id: 'b', normalized_name: 'steans family foundation', last_gift_year: 2026 })]);
    expect(find({ id: 'org-1', name: 'Anything' })?.id).toBe('a');
    expect(find({ id: 'org-9', name: 'Steans Family Foundation' })).toMatchObject({ id: 'b', relationship: 'past', last_gift_year: 2026 });
    expect(find({ id: 'org-9', name: 'Polk Bros Foundation' })).toBeNull();
    expect(find(null)).toBeNull();
  });
});

describe('board roster', () => {
  it('maps board names to kinds', () => {
    expect(kindFor('Auxiliary Board')).toBe('auxiliary');
    expect(kindFor('CYC Leadership Council')).toBe('council');
    expect(kindFor('Board of Directors')).toBe('board');
    expect(kindFor('', 'auxiliary')).toBe('auxiliary');
  });
  it('reads a Board column, roles and a rolling-off status', () => {
    const p = parseRoster(xlsx({ Roster: [
      ['Name', 'Board', 'Role', 'Company', 'Status'],
      ['Cathy Main', 'Board of Directors', 'Chair', 'UIC', ''],
      ['Phil Doherty', 'Board of Directors', 'Member', '', 'Rolling off'],
      ['Zack Audy', 'Auxiliary Board', '', 'Westbourne', ''],
    ] }));
    expect(p.kinds).toEqual(['board', 'auxiliary']);
    expect(p.rows.find(r => r.name === 'Cathy Main')).toMatchObject({ kind: 'board', role: 'Chair', affiliation: 'UIC', leaving: false });
    expect(p.rows.find(r => r.name === 'Phil Doherty')?.leaving).toBe(true);
    expect(p.rows.find(r => r.name === 'Zack Audy')).toMatchObject({ kind: 'auxiliary', role: 'Member' });
  });
  it('takes the board from heading rows and sheet names', () => {
    const p = parseRoster(xlsx({
      'Board of Directors': [['Name', 'Title'], ['Devin Maddox', 'Secretary'], ['Auxiliary Board'], ['Audrey Baer', '']],
      'Leadership Council': [['First name', 'Last name'], ['Al', 'Reid']],
    }));
    expect(p.rows.find(r => r.name === 'Devin Maddox')).toMatchObject({ kind: 'board', role: 'Secretary' });
    expect(p.rows.find(r => r.name === 'Audrey Baer')?.kind).toBe('auxiliary');
    expect(p.rows.find(r => r.name === 'Al Reid')?.kind).toBe('council');
    expect(p.rows).toHaveLength(3);
  });
  it('marks whether the file itself named the board', () => {
    expect(parseRoster(csv('Name\nZack Audy\n')).rows[0]).toMatchObject({ kind: 'board', kindExplicit: false });
    expect(parseRoster(csv('Name,Board\nZack Audy,Auxiliary Board\n')).rows[0]).toMatchObject({ kind: 'auxiliary', kindExplicit: true });
  });
  it('treats the chief executive as ex officio staff, not a director to roll off', () => {
    const p = parseRoster(csv('Name,Role\nTina Ayala,President and CEO\n'));
    expect(p.rows[0].kind).toBe('staff');
  });
  it('explains what it needs when no name column is present', () => {
    expect(() => parseRoster(csv('Company,Role\nPwC,Member\n'))).toThrow(/Name/);
  });
});

describe('board connections survey', () => {
  it('splits a multi-select answer without breaking "Inc."', () => {
    expect(splitFoundations('Polk Bros. Foundation; Joyce Foundation\nField Foundation')).toEqual(['Polk Bros. Foundation', 'Joyce Foundation', 'Field Foundation']);
    expect(splitFoundations('Crown Family Philanthropies, Lloyd A. Fry Foundation')).toEqual(['Crown Family Philanthropies', 'Lloyd A. Fry Foundation']);
    expect(splitFoundations('Exelon Foundation, Inc.')).toEqual(['Exelon Foundation Inc.']);
    expect(splitFoundations('None')).toEqual([]);
  });
  it('reads yes, no and maybe for willingness', () => {
    expect(truthyWilling('Yes, happy to')).toBe(true);
    expect(truthyWilling('No')).toBe(false);
    expect(truthyWilling('Maybe')).toBeNull();
    expect(truthyWilling(null)).toBeNull();
  });
  it('reads the template (long shape)', () => {
    const p = parseSurvey(xlsx({ Answers: [
      ['Board member', 'Foundation', 'Who you know there', 'How you know them', 'Willing to introduce?', 'Notes'],
      ['Cathy Main', 'Polk Bros. Foundation; Joyce Foundation', 'L. Marsh', 'Former colleague', 'Yes', ''],
      ['Jeff Heh', 'Field Foundation', '', 'Acquaintance', 'Maybe', 'met once'],
    ] }));
    expect(p.shape).toBe('long');
    expect(p.respondents).toBe(2);
    expect(p.answers).toHaveLength(3);
    expect(p.answers[0]).toMatchObject({ member: 'Cathy Main', foundation: 'Polk Bros. Foundation', contact: 'L. Marsh', relationship: 'Former colleague', willing: true });
    expect(p.answers[2]).toMatchObject({ foundation: 'Field Foundation', willing: null, notes: 'met once' });
  });
  it('reads a forms export with question-text headers', () => {
    const p = parseSurvey(csv('ID,Start time,Name,Which foundations do you have a personal connection to?,How do you know them?,Would you be willing to make an introduction?\n1,11/19/2026,Sean Ramsey,Grainger Foundation;Joyce Foundation,Work,Yes\n'));
    expect(p.answers.map(a => a.foundation)).toEqual(['Grainger Foundation', 'Joyce Foundation']);
    expect(p.answers[0]).toMatchObject({ member: 'Sean Ramsey', relationship: 'Work', willing: true });
  });
  it('reads a matrix with one column per foundation', () => {
    const p = parseSurvey(xlsx({ Grid: [
      ['Board member', 'Polk Bros. Foundation', 'Joyce Foundation', 'Field Foundation'],
      ['Cathy Main', 'Yes', '', 'Close friend of a trustee'],
      ['Jeff Heh', 'No', 'x', ''],
    ] }));
    expect(p.shape).toBe('matrix');
    expect(p.answers.map(a => `${a.member}|${a.foundation}`)).toEqual(['Cathy Main|Polk Bros. Foundation', 'Cathy Main|Field Foundation', 'Jeff Heh|Joyce Foundation']);
    expect(p.answers[1].relationship).toBe('Close friend of a trustee');
  });
});

describe('direct-connection lead score', () => {
  it('ranks a willing introducer above an unknown one, and a former member lower', () => {
    const base = { relationship_strength: 60, evidence: {} };
    const willing = { relationship_strength: 60, evidence: { willing: true } };
    expect(directScore(willing, false)).toBeGreaterThan(directScore(base, false));
    expect(directScore(base, true)).toBeLessThan(directScore(base, false));
    expect(directScore({ relationship_strength: 100, evidence: { willing: true } }, false)).toBeLessThanOrEqual(95);
  });
});
