import { describe, it, expect } from 'vitest';
import { validateBullet, validateExplanation, composeExplanation, numbersIn, namesIn, splitCitations, parseDraft } from '@/lib/network/explain';
import type { EvidencePack, EvidenceItem } from '@/lib/network/evidence';

const items: EvidenceItem[] = [
  { id: 'E1', kind: 'relationship', text: 'Phil Doherty and Scott C. Smith overlapped at Chicago Tribune (Phil Doherty 2001–2013; Scott C. Smith 2004–2008) — verified with dates, per LinkedIn profile.', verification: 'verified', source_type: 'linkedin_api', source_url: null, source_id: 's1', ref: { table: 'network_relationships', id: 'r1' } },
  { id: 'E2', kind: 'seat', text: 'Scott C. Smith is Chairman at Robert R. McCormick Foundation, per foundation website.', verification: 'verified', source_type: 'foundation_site', source_url: 'https://example.org', source_id: 's2', ref: { table: 'network_boards', id: 'b1' } },
  { id: 'E3', kind: 'funding_summary', text: "In IRS 990 filings 2023–2024, Robert R. McCormick Foundation made 54 grants to 33 organizations in CYC's peer set, median $50,000; 42 of 54 in Illinois; 15 with a stated purpose overlapping CYC programs and 12 naming youth, children or families.", verification: 'verified', source_type: 'irs_990_xml', source_url: null, source_id: null, ref: { table: 'grants_made', id: null } },
  { id: 'E4', kind: 'cyc_funding', text: 'No CYC funding relationship identified in available data. (IRS filings in scope, CYC records.)', verification: null, source_type: null, source_url: null, source_id: null, ref: { table: 'grants_made', id: null } },
  { id: 'E5', kind: 'relationship', text: 'Sean Ramsey and Jane Roe both worked at Grainger — inferred, not documented, per IRS 990 filing.', verification: 'inferred', source_type: 'irs_990_xml', source_url: null, source_id: 's3', ref: { table: 'network_relationships', id: 'r2' } },
  { id: 'E6', kind: 'score', text: "Fundir's deterministic score for this lead is 100/100 with High evidence confidence (relationship 29, funding fit 50, accessibility 8, recency 20, penalties 0).", verification: null, source_type: null, source_url: null, source_id: null, ref: { table: 'network_leads', id: 'l1' } },
];
const map = new Map(items.map(i => [i.id, i]));
const allowed = ['CYC', 'Robert R. McCormick Foundation', 'Phil Doherty', 'Scott C. Smith'];
const pack: EvidencePack = {
  lead_id: 'l1', lead_type: 'organization', insight_type: 'Warm Introduction',
  target: { id: 't1', name: 'Robert R. McCormick Foundation', type: 'foundation' },
  via: { id: 'p1', name: 'Phil Doherty', role: 'Chair' }, trustee: { id: 'p2', name: 'Scott C. Smith', title: 'Chairman' },
  items, score: { opportunity_score: 100, evidence_confidence: 'High', subtotals: { relationship: 29, funding_fit: 50, accessibility: 8, recency: 20, penalties: 0 } },
  funding_to_cyc_identified: false, hash: 'abc',
};

describe('validateBullet', () => {
  it('accepts a bullet whose numbers and names are all in the cited evidence', () => {
    expect(validateBullet({ text: 'Robert R. McCormick Foundation made 54 grants to 33 peer organizations in 2023–2024, median $50k.', evidence: ['E3'] }, map, allowed)).toEqual({ ok: true });
  });
  it('rejects an uncited bullet', () => {
    expect(validateBullet({ text: 'It funds many youth organizations.', evidence: [] }, map, allowed)).toMatchObject({ ok: false, reason: 'no valid evidence citation' });
  });
  it('rejects a fabricated number', () => {
    expect(validateBullet({ text: 'The foundation made 60 grants to peers.', evidence: ['E3'] }, map, allowed)).toMatchObject({ ok: false, reason: expect.stringContaining('number 60') });
  });
  it('rejects a name that is not in the cited evidence', () => {
    expect(validateBullet({ text: 'Trustee Jane Doe is a former colleague.', evidence: ['E1'] }, map, allowed)).toMatchObject({ ok: false, reason: expect.stringContaining('Jane Doe') });
  });
  it('rejects claims of personal relationship, promises and "never funded"', () => {
    expect(validateBullet({ text: 'Phil Doherty is close friends with Scott C. Smith.', evidence: ['E1'] }, map, allowed)).toMatchObject({ ok: false, reason: expect.stringContaining('forbidden') });
    expect(validateBullet({ text: 'Phil Doherty will introduce CYC.', evidence: ['E1'] }, map, allowed)).toMatchObject({ ok: false });
    expect(validateBullet({ text: 'The foundation has never funded CYC.', evidence: ['E4'] }, map, allowed)).toMatchObject({ ok: false });
  });
  it('requires a hedge when the only evidence is inferred', () => {
    expect(validateBullet({ text: 'Sean Ramsey and Jane Roe worked together at Grainger.', evidence: ['E5'] }, map, allowed)).toMatchObject({ ok: false, reason: expect.stringContaining('inferred') });
    expect(validateBullet({ text: 'Sean Ramsey and Jane Roe may have overlapped at Grainger; this link is inferred and not documented.', evidence: ['E5'] }, map, allowed)).toEqual({ ok: true });
  });
  it('rejects a citation to an id that does not exist', () => {
    expect(validateBullet({ text: 'Something.', evidence: ['E1', 'E99'] }, map, allowed)).toMatchObject({ ok: false, reason: expect.stringContaining('E99') });
  });
});

describe('validateExplanation', () => {
  it('keeps valid bullets, drops invalid ones, records why, and requires an ask-style action', () => {
    const v = validateExplanation({
      thesis: 'McCormick funds 33 of CYC\'s peers [E3] and Phil Doherty overlapped with its chairman Scott C. Smith at Chicago Tribune [E1][E2].',
      sections: [
        { heading: 'Funding fit', bullets: [{ text: '54 grants to 33 peer organizations in 2023–2024.', evidence: ['E3'] }, { text: 'It gave $2M to youth causes.', evidence: ['E3'] }] },
        { heading: 'Relationship', bullets: [{ text: 'Phil Doherty and Scott C. Smith overlapped at Chicago Tribune from 2004 to 2008.', evidence: ['E1'] }] },
        { heading: 'Made-up section', bullets: [{ text: 'x', evidence: ['E1'] }] },
      ],
      recommended_action: { text: 'Phil Doherty will introduce CYC to Scott C. Smith.', evidence: ['E1'] },
      confidence_note: 'Well supported.',
    }, pack);
    expect(v.sections.map(s => s.heading)).toEqual(['Funding fit', 'Relationship']);
    expect(v.sections[0].bullets).toHaveLength(1);
    expect(v.thesis).toContain('[E3]');
    expect(v.recommended_action.text).toBe('');
    expect(v.validation.dropped.map(d => d.reason)).toEqual(expect.arrayContaining([expect.stringContaining('number 2000000'), expect.stringContaining('unknown section'), expect.stringContaining('forbidden')]));
  });
});

describe('composeExplanation (deterministic)', () => {
  it('cites every bullet, always includes risks when no CYC funding is identified, and hashes the input', () => {
    const x = composeExplanation(pack);
    for (const s of x.sections) for (const b of s.bullets) expect(b.evidence.length).toBeGreaterThan(0);
    expect(x.sections.some(s => s.heading === 'Risks and unknowns')).toBe(true);
    expect(x.recommended_action.text).toMatch(/^Ask Phil Doherty/);
    expect(x.input_hash).toBe('abc');
    expect(x.validation.dropped).toHaveLength(0);
    // Every composed bullet passes the same validator the model output faces.
    for (const s of x.sections) for (const b of s.bullets) expect(validateBullet(b, map, allowed)).toEqual({ ok: true });
  });
});

describe('citations and parsing', () => {
  it('lifts every inline citation style out of the prose so digits are not read as numbers', () => {
    expect(splitCitations('54 grants [E3]. Range $25k–$610k (E5; E7) and [E9–E11], see E12.')).toEqual({ text: '54 grants. Range $25k–$610k and, see.', ids: ['E3', 'E5', 'E7', 'E9', 'E10', 'E11', 'E12'] });
    expect(validateBullet({ text: '54 grants to 33 peers, median $50k [E3].', evidence: [] }, map, allowed)).toEqual({ ok: true });
    expect(validateBullet({ text: "Robert R. McCormick Foundation's grants total 54 [E3].", evidence: [] }, map, allowed)).toEqual({ ok: true });
  });
  it('does not mistake surname pairs, sentence boundaries, titles or "IRS 990 data" for new facts', () => {
    expect(validateBullet({ text: 'The overlap between Doherty and Smith at Chicago Tribune is verified by dates; whether they know each other is unconfirmed.', evidence: ['E1'] }, map, allowed)).toEqual({ ok: true });
    expect(validateBullet({ text: 'Scott C. Smith chairs the board. No CYC funding relationship identified in available data.', evidence: ['E2', 'E4'] }, map, allowed)).toEqual({ ok: true });
    expect(validateBullet({ text: 'Vice President Scott C. Smith is a named contact; only one year of 990 data is in scope.', evidence: ['E2'] }, map, allowed)).toEqual({ ok: true });
    expect(validateBullet({ text: 'Ask Phil Doherty whether they are willing to introduce CYC to Scott C. Smith.', evidence: ['E1', 'E2'] }, map, allowed)).toEqual({ ok: true });
    expect(namesIn('Robert R. McCormick Foundation, led by President and CEO Timothy P. Knight, made grants.')).toEqual(['Robert R. McCormick Foundation', 'Timothy P. Knight']);
  });
  it('recovers JSON from fences, comments and trailing commas, and reports the unrecoverable', () => {
    expect(parseDraft('```json\n{"thesis": "x", // note\n "sections": [],}\n```').draft).toEqual({ thesis: 'x', sections: [] });
    expect(parseDraft('no json here').parseError).toBe('no JSON object found');
  });
});

describe('helpers', () => {
  it('reads numbers the way people write them', () => {
    expect(numbersIn('54 grants, median $50k, $1.2M in 2023–2024')).toEqual([54, 50_000, 1_200_000, 2023, 2024]);
  });
  it('extracts multi-word proper names and ignores generic capitalised words', () => {
    expect(namesIn('Ask Phil Doherty about Robert R. McCormick Foundation in Chicago.')).toEqual(['Phil Doherty', 'Robert R. McCormick Foundation']);
  });
});
