import { describe, it, expect } from 'vitest';
import { scoreLead, describeUntapped, evidenceConfidence, NO_CYC_FUNDING, type LeadSignals, type FundingSignal } from '@/lib/network/scoring';

const noFunding: FundingSignal = { peerGrants: 0, peerRecipients: 0, avgSimilarity: 0, chicagoShare: 0, programHits: 0, populationHits: 0, latestYear: null, medianAmount: null, fundedCyc: false, cited: false, evidenceIds: [] };
const richFunding: FundingSignal = { peerGrants: 6, peerRecipients: 4, avgSimilarity: 0.85, chicagoShare: 0.8, programHits: 3, populationHits: 2, latestYear: 2025, medianAmount: 50_000, fundedCyc: false, cited: true, evidenceIds: ['g1', 'g2'] };
const noAccess = { programOfficer: false, localPresence: false, publicContact: false, corporateLeadership: false };
const base: LeadSignals = { relationships: [], funding: noFunding, access: noAccess, sourceTypes: [], asOfYear: 2026 };

describe('scoreLead', () => {
  it('scores a dated former-colleague path to a Chicago youth funder highly, capped at 100', () => {
    const r = scoreLead({
      ...base,
      relationships: [{ type: 'former_colleague', verification: 'verified', confidence: 0.9, current: false, edge_id: 'e1', source_id: 's1' }],
      funding: richFunding, access: { programOfficer: true, localPresence: true, publicContact: true, corporateLeadership: false },
      sourceTypes: ['irs_990_xml', 'linkedin_api'],
    });
    expect(r.opportunity_score).toBeGreaterThanOrEqual(85);
    expect(r.opportunity_score).toBeLessThanOrEqual(100);
    expect(r.evidence_confidence).toBe('High');
    expect(r.breakdown.relationship[0].points).toBe(25);
    expect(r.breakdown.relationship[0].evidence).toEqual(['e1', 's1']);
    expect(r.breakdown.funding_fit.map(c => c.key)).toEqual(expect.arrayContaining(['funds_similar', 'geographic_fit', 'program_fit', 'population_fit', 'grant_size']));
  });

  it('separates attractiveness from evidence: an inferred link scores lower AND is Low confidence', () => {
    const verified = scoreLead({ ...base, relationships: [{ type: 'shared_employer', verification: 'verified', confidence: 0.9, current: false }], sourceTypes: ['public_bio'] });
    const inferred = scoreLead({ ...base, relationships: [{ type: 'shared_employer', verification: 'inferred', confidence: 0.5, current: false }], sourceTypes: ['public_bio'] });
    expect(inferred.opportunity_score).toBeLessThan(verified.opportunity_score);
    expect(inferred.evidence_confidence).toBe('Low');
    expect(inferred.breakdown.penalties.some(p => p.key === 'inferred_only')).toBe(true);
  });

  it('discounts uncited (seed) funding and records the penalty', () => {
    const cited = scoreLead({ ...base, funding: richFunding, sourceTypes: ['irs_990_xml'] });
    const seed = scoreLead({ ...base, funding: { ...richFunding, cited: false }, sourceTypes: ['seed'] });
    expect(seed.opportunity_score).toBeLessThan(cited.opportunity_score);
    expect(seed.breakdown.penalties.find(p => p.key === 'uncited_funding')?.points).toBeLessThan(0);
    expect(seed.evidence_confidence).not.toBe('High');
  });

  it('does not let ten shared-board edges outscore one real colleague tie', () => {
    const many = scoreLead({ ...base, relationships: Array.from({ length: 10 }, (_, i) => ({ type: 'shared_board', verification: 'verified' as const, confidence: 0.9, current: false, edge_id: `b${i}` })) });
    const one = scoreLead({ ...base, relationships: [{ type: 'former_colleague', verification: 'verified', confidence: 0.9, current: false }] });
    expect(many.breakdown.subtotals.relationship).toBeLessThanOrEqual(one.breakdown.subtotals.relationship);
  });

  it('penalises apparently inactive funders and rewards current ties', () => {
    const stale = scoreLead({ ...base, funding: { ...richFunding, latestYear: 2021 } });
    expect(stale.breakdown.recency.some(c => c.key === 'apparently_inactive')).toBe(true);
    const current = scoreLead({ ...base, relationships: [{ type: 'current_colleague', verification: 'verified', confidence: 0.9, current: true }] });
    expect(current.breakdown.recency.find(c => c.key === 'current_relationship')?.points).toBe(10);
  });

  it('is zero-ish with nothing behind it', () => {
    const r = scoreLead(base);
    expect(r.opportunity_score).toBe(0);
    expect(r.evidence_confidence).toBe('Low');
  });
});

describe('evidenceConfidence', () => {
  it('needs independent sources and documented facts for High', () => {
    expect(evidenceConfidence({ ...base, relationships: [{ type: 'former_colleague', verification: 'verified', confidence: 0.9, current: false }], sourceTypes: ['linkedin_api'] }).confidence).toBe('Medium');
    expect(evidenceConfidence({ ...base, relationships: [{ type: 'former_colleague', verification: 'verified', confidence: 0.9, current: false }], funding: richFunding, sourceTypes: ['linkedin_api', 'irs_990_xml'] }).confidence).toBe('High');
  });
});

describe('describeUntapped', () => {
  it('uses the mandated hedge and never claims the funder has never funded CYC', () => {
    const w = describeUntapped({ funder: 'Example Foundation', peerNames: ['After School Matters', 'Youth Guidance', 'BUILD Inc', 'Umoja'], grants: 5, firstYear: 2023, latestYear: 2024, latestAmount: 75_000, chicagoShare: 0.8, programHits: 2, path: null });
    expect(w).toContain(NO_CYC_FUNDING);
    expect(w).not.toMatch(/never funded/i);
    expect(w).toContain('4 organizations comparable to CYC');
    expect(w).toContain('and 1 more');
    expect(w).toContain('$75k');
    expect(w).toContain('research lead');
  });
  it('names the warm path when one exists, still hedged', () => {
    const w = describeUntapped({ funder: 'Example Foundation', peerNames: ['A', 'B'], grants: 2, firstYear: 2024, latestYear: 2024, latestAmount: null, chicagoShare: 0, programHits: 0, path: 'an introduction through Phil Doherty' });
    expect(w).toContain('Potential path: an introduction through Phil Doherty; no personal relationship is asserted.');
  });
});
