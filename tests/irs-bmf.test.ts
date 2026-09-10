import { describe, it, expect } from 'vitest';
import { parseCsv, rowsToRecords, detectBmfFormat, normalizeEin, normalizeBmfRows, pickBmfFields } from '@/lib/prospecting/irs-bmf';

describe('parseCsv', () => {
  it('handles quoted commas, doubled quotes, CRLF and a BOM', () => {
    const text = '﻿EIN,NAME,CITY\r\n"366006000","SMITH, JOHN ""JACK"" FUND",CHICAGO\r\n367000001,PLAIN ORG,PEORIA\r\n';
    expect(parseCsv(text)).toEqual([
      ['EIN', 'NAME', 'CITY'],
      ['366006000', 'SMITH, JOHN "JACK" FUND', 'CHICAGO'],
      ['367000001', 'PLAIN ORG', 'PEORIA'],
    ]);
  });
  it('drops blank lines and keeps a trailing row without a newline', () => {
    expect(parseCsv('A,B\n\n1,2')).toEqual([['A', 'B'], ['1', '2']]);
  });
});

describe('rowsToRecords', () => {
  it('keys records by the upper-cased trimmed header', () => {
    const { headers, records } = rowsToRecords([[' ein ', 'Name'], ['1', 'x']]);
    expect(headers).toEqual(['EIN', 'NAME']);
    expect(records).toEqual([{ EIN: '1', NAME: 'x' }]);
  });
});

describe('detectBmfFormat', () => {
  it('accepts the raw IRS BMF header', () => {
    expect(detectBmfFormat(['EIN', 'NAME', 'ICO', 'STREET', 'CITY', 'STATE', 'ZIP', 'GROUP', 'SUBSECTION']).ok).toBe(true);
  });
  it('rejects a 990 extract with a pointer to the right file', () => {
    const r = detectBmfFormat(['EIN', 'tax_pd', 'totrevenue', 'totassetsend']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/990 extract/);
  });
  it('rejects a sheet without an EIN column', () => {
    expect(detectBmfFormat(['Foundation Name', 'Notes']).ok).toBe(false);
  });
});

describe('normalizeEin', () => {
  it('pads, strips punctuation, and rejects garbage', () => {
    expect(normalizeEin('6006000')).toBe('006006000');
    expect(normalizeEin('36-6006000')).toBe('366006000');
    expect(normalizeEin(366006000)).toBe('366006000');
    expect(normalizeEin('')).toBeNull();
    expect(normalizeEin('1234567890')).toBeNull();
  });
});

describe('normalizeBmfRows', () => {
  const rec = (o: Record<string, unknown>) => ({ EIN: '366006000', NAME: 'X', STATE: 'IL', ASSET_AMT: '1,234', SUBSECTION: '03', ...o });
  it('maps IRS headers to table columns and parses money', () => {
    const { rows } = normalizeBmfRows([rec({})]);
    expect(rows[0]).toMatchObject({ ein: '366006000', name: 'X', state: 'IL', asset_amt: 1234, subsection: '03', income_amt: null, ntee_cd: null });
  });
  it('filters to the requested state but keeps rows with no state', () => {
    const { rows, skippedOtherState } = normalizeBmfRows([rec({}), rec({ EIN: '1', STATE: 'WI' }), rec({ EIN: '2', STATE: '' })], { state: 'IL' });
    expect(rows.map(r => r.ein)).toEqual(['366006000', '000000002']);
    expect(skippedOtherState).toBe(1);
  });
  it('drops rows without an EIN and dedupes on EIN, last wins', () => {
    const { rows, skippedNoEin, duplicates } = normalizeBmfRows([rec({ EIN: '' }), rec({ NAME: 'first' }), rec({ NAME: 'second' })]);
    expect(skippedNoEin).toBe(1);
    expect(duplicates).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('second');
  });
});

describe('pickBmfFields', () => {
  it('whitelists columns coming over the wire', () => {
    const row = pickBmfFields({ ein: '6006000', name: ' Y ', asset_amt: '5', run_id: 'evil', imported_at: 'evil' });
    expect(row).toEqual(expect.objectContaining({ ein: '006006000', name: 'Y', asset_amt: 5 }));
    expect(row && 'run_id' in row).toBe(false);
    expect(pickBmfFields({ name: 'no ein' })).toBeNull();
  });
});
