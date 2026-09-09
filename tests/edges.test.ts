import { describe, it, expect } from 'vitest';
import { computeEdges, dedupeEdges, type GraphInput } from '@/lib/network/edges';

const ORG = { tribune: 'o-tribune', mccormick: 'o-mccormick', gtcr: 'o-gtcr', cyc: 'o-cyc', uiuc: 'o-uiuc' };
const SRC = 's-page';

function base(): GraphInput {
  return {
    cycOrgId: ORG.cyc,
    people: [
      { id: 'p-doherty', kind: 'board',   name: 'Phil Doherty',   organization_id: ORG.tribune, source_id: SRC },
      { id: 'p-smith',   kind: 'trustee', name: 'Scott C. Smith', organization_id: ORG.mccormick, source_id: SRC },
      { id: 'p-heh',     kind: 'board',   name: 'Jeff Heh',       organization_id: ORG.gtcr, source_id: SRC },
      { id: 'p-romic',   kind: 'auxiliary', name: 'Justin Romic', organization_id: ORG.gtcr, source_id: SRC },
      { id: 'p-lead',    kind: 'lead',    name: 'Some Lead',      organization_id: ORG.gtcr, source_id: null },
      { id: 'p-lead2',   kind: 'lead',    name: 'Other Lead',     organization_id: ORG.gtcr, source_id: null },
    ],
    employments: [],
    educations: [],
    boards: [
      { person_id: 'p-doherty', organization_id: ORG.cyc, title: 'Chair', is_current: true, source_id: SRC, confidence: 0.95 },
      { person_id: 'p-heh',     organization_id: ORG.cyc, title: 'Member', is_current: true, source_id: SRC, confidence: 0.95 },
      { person_id: 'p-smith',   organization_id: ORG.mccormick, title: 'Chairman', is_current: true, source_id: SRC, confidence: 0.85 },
    ],
    orgs: new Map([
      [ORG.tribune,   { id: ORG.tribune,   name: 'Chicago Tribune', organization_type: 'corporation' }],
      [ORG.mccormick, { id: ORG.mccormick, name: 'Robert R. McCormick Foundation', organization_type: 'foundation' }],
      [ORG.gtcr,      { id: ORG.gtcr,      name: 'GTCR', organization_type: 'corporation' }],
      [ORG.cyc,       { id: ORG.cyc,       name: 'Chicago Youth Centers', organization_type: 'nonprofit' }],
      [ORG.uiuc,      { id: ORG.uiuc,      name: 'University of Illinois', organization_type: 'university' }],
    ]),
  };
}

const of = (edges: ReturnType<typeof computeEdges>, type: string) => edges.filter(e => e.relationship_type === type);

describe('computeEdges', () => {
  it('derives a dated former-colleague edge (the McCormick example) as verified', () => {
    const g = base();
    g.employments = [
      { person_id: 'p-doherty', organization_id: ORG.tribune, org_name: 'Chicago Tribune', start_year: 1998, end_year: 2016, is_current: false, source_id: SRC },
      { person_id: 'p-smith',   organization_id: ORG.tribune, org_name: 'Chicago Tribune', start_year: 2005, end_year: 2012, is_current: false, source_id: SRC },
    ];
    const e = of(computeEdges(g), 'former_colleague');
    expect(e).toHaveLength(1);
    expect(e[0].verification).toBe('verified');
    expect(e[0].relationship_strength).toBe(25);
    expect([e[0].source_person_id, e[0].target_person_id].sort()).toEqual(['p-doherty', 'p-smith']);
    expect(String(e[0].evidence.summary)).toContain('Chicago Tribune');
  });

  it('falls back to shared_employer (probable) when tenure dates are missing', () => {
    const g = base();
    g.employments = [
      { person_id: 'p-doherty', organization_id: ORG.tribune, org_name: 'Chicago Tribune', start_year: null, end_year: null, is_current: false, source_id: SRC },
      { person_id: 'p-smith',   organization_id: ORG.tribune, org_name: 'Chicago Tribune', start_year: null, end_year: null, is_current: false, source_id: SRC },
    ];
    const e = of(computeEdges(g), 'shared_employer');
    expect(e).toHaveLength(1);
    expect(e[0].verification).toBe('probable');
    expect(e[0].relationship_strength).toBe(18);
  });

  it('uses the page affiliation as a current span → current_colleague', () => {
    const e = of(computeEdges(base()), 'current_colleague');
    // Heh + Romic (both CYC people at GTCR) and each of them with the two leads.
    const pairs = e.map(x => [x.source_person_id, x.target_person_id].sort().join('+'));
    expect(pairs).toContain('p-heh+p-romic');
    expect(pairs).toContain('p-heh+p-lead');
  });

  it('never links two leads to each other (an edge must touch CYC or a trustee)', () => {
    const e = computeEdges(base());
    expect(e.some(x => [x.source_person_id, x.target_person_id].sort().join('+') === 'p-lead+p-lead2')).toBe(false);
  });

  it("does not treat CYC's own board as a shared board, but does emit foundation seats", () => {
    const e = computeEdges(base());
    expect(of(e, 'shared_board')).toHaveLength(0);
    const f = of(e, 'foundation_connection');
    expect(f).toHaveLength(1);
    expect(f[0].source_person_id).toBe('p-smith');
    expect(f[0].target_organization_id).toBe(ORG.mccormick);
  });

  it('emits corporate_connection for CYC people at corporations, not for leads', () => {
    const c = of(computeEdges(base()), 'corporate_connection');
    const who = c.map(x => x.source_person_id);
    expect(who).toContain('p-doherty');
    expect(who).toContain('p-heh');
    expect(who).not.toContain('p-lead');
  });

  it('derives shared_university with overlap-aware verification', () => {
    const g = base();
    g.educations = [
      { person_id: 'p-doherty', organization_id: ORG.uiuc, school_name: 'University of Illinois', start_year: 1980, end_year: 1984, source_id: SRC },
      { person_id: 'p-smith',   organization_id: ORG.uiuc, school_name: 'University of Illinois', start_year: 1982, end_year: 1986, source_id: SRC },
      { person_id: 'p-heh',     organization_id: null,     school_name: 'University of Illinois', start_year: null, end_year: null, source_id: null },
    ];
    const u = of(computeEdges(g), 'shared_university');
    const ds = u.find(x => [x.source_person_id, x.target_person_id].includes('p-smith') && [x.source_person_id, x.target_person_id].includes('p-doherty'));
    expect(ds?.verification).toBe('verified');
    // Heh's school lacks an org id and a source — grouped by normalized name, so an inferred edge, not a merge.
    expect(u.length).toBe(1);
  });

  it('collapses a trustee with two seats at one foundation into one foundation_connection', () => {
    const g = base();
    g.boards.push({ person_id: 'p-smith', organization_id: ORG.mccormick, title: 'Director', is_current: false, source_id: SRC, confidence: 0.85 });
    const raw = of(computeEdges(g), 'foundation_connection');
    expect(raw).toHaveLength(2);
    const d = of(dedupeEdges(computeEdges(g)), 'foundation_connection');
    expect(d).toHaveLength(1);
    expect(Array.isArray(d[0].evidence.also)).toBe(true);
  });

  it('is deterministic about pair ordering', () => {
    const a = computeEdges(base()), b = computeEdges(base());
    expect(a.map(x => `${x.relationship_type}:${x.source_person_id}:${x.target_person_id}`))
      .toEqual(b.map(x => `${x.relationship_type}:${x.source_person_id}:${x.target_person_id}`));
  });
});
