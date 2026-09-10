// Phase 6 — deterministic opportunity scoring.
//
// Two different questions, two different numbers (the brief insists on this):
//   opportunity_score   "How attractive does this prospect appear?"   0–100
//   evidence_confidence "How well-supported is the evidence?"         Low / Medium / High
//
// Every point comes from a named component with the evidence ids that earned
// it, and the whole breakdown is stored on the lead so a reader can audit the
// number without re-running anything. No model is involved anywhere here.

export type Verification = 'verified' | 'probable' | 'inferred';
export type Confidence = 'Low' | 'Medium' | 'High';

export interface RelationshipSignal {
  type: string;                 // relationship_type from network_relationships
  verification: Verification;
  confidence: number;           // 0–1 as stored on the edge
  current: boolean;             // still-active tie (current colleague, live CYC relationship)
  edge_id?: string | null;
  source_id?: string | null;
  label?: string;               // "Phil Doherty ↔ Scott C. Smith (Chicago Tribune)"
}

export interface FundingSignal {
  peerGrants: number;           // grants to organizations in CYC's peer set
  peerRecipients: number;       // distinct peer organizations funded
  avgSimilarity: number;        // mean peer similarity of those recipients (0–1)
  chicagoShare: number;         // share of peer grants that are Chicago / Illinois
  programHits: number;          // grants whose stated purpose overlaps CYC's programs
  populationHits: number;       // grants whose stated purpose names CYC's population
  latestYear: number | null;    // most recent grant year seen
  medianAmount: number | null;  // median peer grant
  fundedCyc: boolean;           // a funding event to CYC itself is on record
  cited: boolean;               // grants carry a filing / page citation (not the uncited seed)
  evidenceIds: string[];        // grants_made ids behind the numbers (capped)
}

export interface AccessSignal {
  programOfficer: boolean;      // a program officer / grants manager is named on the roster
  localPresence: boolean;       // Chicago / Illinois address
  publicContact: boolean;       // public philanthropy contact or application path
  corporateLeadership: boolean; // community-affairs leadership named
}

export interface LeadSignals {
  relationships: RelationshipSignal[];
  funding: FundingSignal;
  access: AccessSignal;
  sourceTypes: string[];        // distinct network_sources.source_type behind the facts
  asOfYear: number;
}

export interface ScoreComponent { key: string; label: string; points: number; evidence?: string[] }

export interface ScoreBreakdown {
  generator: 'scoring:v1';
  relationship: ScoreComponent[];
  funding_fit: ScoreComponent[];
  accessibility: ScoreComponent[];
  recency: ScoreComponent[];
  penalties: ScoreComponent[];
  subtotals: { relationship: number; funding_fit: number; accessibility: number; recency: number; penalties: number };
  confidence_reasons: string[];
  source_types: string[];
}

export interface ScoreResult { opportunity_score: number; evidence_confidence: Confidence; breakdown: ScoreBreakdown }

// ── The rubric (from the brief; points are the maximum each line can earn) ──
export const RELATIONSHIP_POINTS: Record<string, number> = {
  former_colleague: 25, former_manager: 25, former_direct_report: 25, current_colleague: 25,
  shared_employer: 18, shared_board: 15, shared_nonprofit: 15, shared_university: 12,
  existing_cyc_relationship: 10, second_degree: 10, corporate_connection: 10,
  foundation_connection: 8, geographic_overlap: 8,
};
const VERIFICATION_FACTOR: Record<Verification, number> = { verified: 1, probable: 0.8, inferred: 0.5 };
const RELATIONSHIP_CAP = 40;
const FUNDING_CAP = 50;          // the six funding lines sum to 80; capped so money alone cannot max the score
const UNCITED_FUNDING_FACTOR = 0.6;

/** CYC's program vocabulary, applied to a grant's stated purpose. Deliberately narrow. */
export const PROGRAM_TERMS = /after.?school|out.?of.?school|early childhood|pre-?k|head start|educat|mentor|workforce|career|literacy|stem|college|tutor|enrichment|summer|youth development|leadership/i;
export const POPULATION_TERMS = /\byouth\b|\bchildren\b|\bchild\b|\bteens?\b|young people|young adults|\bstudents?\b|\bkids\b|adolescen|\bfamilies\b/i;
export const CHICAGO_TERMS = /chicago|illinois|\bil\b|cook county/i;
export const PROGRAM_OFFICER_TITLES = /program officer|program director|director of programs|grants? (manager|director|officer)|senior program|executive director|foundation (director|manager)/i;

const round = (n: number) => Math.round(n);

function relationshipSection(rels: RelationshipSignal[]): ScoreComponent[] {
  const scored = rels
    // Verification carries the uncertainty; a stored edge confidence below 0.5 is a second, smaller discount.
    .map(r => ({ r, pts: (RELATIONSHIP_POINTS[r.type] ?? 0) * VERIFICATION_FACTOR[r.verification] * (r.confidence < 0.5 ? 0.8 : 1) }))
    .filter(x => x.pts > 0)
    .sort((a, b) => b.pts - a.pts);
  if (!scored.length) return [];
  const best = scored[0];
  const out: ScoreComponent[] = [{
    key: best.r.type, label: `${humanize(best.r.type)} (${best.r.verification})`, points: round(best.pts),
    evidence: [best.r.edge_id, best.r.source_id].filter(Boolean) as string[],
  }];
  // Additional, DIFFERENT kinds of tie add a little; ten more shared_board edges do not.
  const seen = new Set([best.r.type]);
  let extra = 0;
  for (const x of scored.slice(1)) {
    if (seen.has(x.r.type) || extra >= 12) continue;
    seen.add(x.r.type); extra += 4;
    out.push({ key: `also_${x.r.type}`, label: `Also ${humanize(x.r.type).toLowerCase()} (${x.r.verification})`, points: 4, evidence: [x.r.edge_id].filter(Boolean) as string[] });
  }
  return out;
}

function fundingSection(f: FundingSignal): ScoreComponent[] {
  const out: ScoreComponent[] = [];
  const ev = f.evidenceIds.slice(0, 12);
  if (f.peerRecipients > 0) {
    const sim = Math.min(1, Math.max(0.5, f.avgSimilarity || 0.7));
    out.push({ key: 'funds_similar', label: `Funds ${f.peerRecipients} organization${f.peerRecipients === 1 ? '' : 's'} similar to CYC`, points: Math.min(20, round((6 + 4 * Math.min(f.peerRecipients, 4)) * sim)), evidence: ev });
  }
  if (f.peerGrants > 0 && f.chicagoShare > 0) out.push({ key: 'geographic_fit', label: `Chicago / Illinois giving (${round(f.chicagoShare * 100)}% of peer grants)`, points: f.chicagoShare >= 0.5 ? 15 : 8, evidence: ev });
  if (f.programHits > 0) out.push({ key: 'program_fit', label: `${f.programHits} grant${f.programHits === 1 ? '' : 's'} with a purpose overlapping CYC programs`, points: f.programHits >= 2 ? 15 : 8, evidence: ev });
  if (f.populationHits > 0) out.push({ key: 'population_fit', label: `${f.populationHits} grant${f.populationHits === 1 ? '' : 's'} naming youth / children / families`, points: 10, evidence: ev });
  // Recency of funding is scored in recencySection against asOfYear.
  if (f.medianAmount !== null && f.peerGrants > 0) {
    const m = f.medianAmount;
    const pts = m >= 10_000 && m <= 500_000 ? 10 : (m >= 5_000 && m < 10_000) || (m > 500_000 && m <= 1_000_000) ? 5 : 0;
    if (pts) out.push({ key: 'grant_size', label: `Typical peer grant $${fmt(m)} fits CYC's ask range`, points: pts, evidence: ev });
  }
  if (f.fundedCyc) out.push({ key: 'funded_cyc', label: 'Funding to CYC on record', points: 10, evidence: ev });
  return out;
}

function recencySection(f: FundingSignal, rels: RelationshipSignal[], asOf: number): ScoreComponent[] {
  const out: ScoreComponent[] = [];
  const current = rels.filter(r => r.current);
  if (current.length) out.push({ key: 'current_relationship', label: 'Current relationship in the graph', points: 10, evidence: current.map(r => r.edge_id).filter(Boolean) as string[] });
  if (f.latestYear !== null && f.peerGrants > 0) {
    const age = asOf - f.latestYear;
    if (age <= 2) out.push({ key: 'recent_funding', label: `Relevant funding as recent as ${f.latestYear}`, points: 10, evidence: f.evidenceIds.slice(0, 6) });
    else if (age === 3) out.push({ key: 'recent_funding', label: `Most recent relevant funding ${f.latestYear}`, points: 5, evidence: f.evidenceIds.slice(0, 6) });
    if (age <= 1) out.push({ key: 'recent_activity', label: `Active in ${f.latestYear}`, points: 5 });
    if (age >= 4 && !current.length) out.push({ key: 'apparently_inactive', label: `No relevant funding after ${f.latestYear} in available filings, and no current tie`, points: -10 });
  }
  return out;
}

function accessSection(a: AccessSignal): ScoreComponent[] {
  const out: ScoreComponent[] = [];
  if (a.programOfficer) out.push({ key: 'program_officer', label: 'Identifiable program officer / grants staff', points: 10 });
  if (a.localPresence) out.push({ key: 'local_presence', label: 'Chicago / Illinois presence', points: 8 });
  if (a.publicContact) out.push({ key: 'public_contact', label: 'Public philanthropy contact or application path', points: 7 });
  if (a.corporateLeadership) out.push({ key: 'corporate_leadership', label: 'Relevant corporate / community leadership identified', points: 5 });
  return out;
}

function penaltySection(s: LeadSignals, fundingPts: number): ScoreComponent[] {
  const out: ScoreComponent[] = [];
  const rels = s.relationships;
  if (rels.length && rels.every(r => r.verification === 'inferred')) out.push({ key: 'inferred_only', label: 'Every relationship link is inferred, none documented', points: -5 });
  if (!s.funding.cited && fundingPts > 0) out.push({ key: 'uncited_funding', label: 'Funding evidence is uncited (hand-curated seed), discounted', points: -round(fundingPts * (1 - UNCITED_FUNDING_FACTOR)) });
  if (!rels.length && s.funding.peerGrants === 0 && !s.funding.fundedCyc) out.push({ key: 'no_evidence', label: 'No relationship and no funding evidence', points: -10 });
  return out;
}

export function evidenceConfidence(s: LeadSignals): { confidence: Confidence; reasons: string[] } {
  const reasons: string[] = [];
  let pts = 0;
  const distinct = new Set(s.sourceTypes.filter(Boolean));
  if (distinct.size >= 2) { pts += 2; reasons.push(`${distinct.size} independent source types`); }
  else if (distinct.size === 1) { pts += 1; reasons.push('single source type'); }
  const best = [...s.relationships].sort((a, b) => (RELATIONSHIP_POINTS[b.type] ?? 0) - (RELATIONSHIP_POINTS[a.type] ?? 0))[0];
  if (best?.verification === 'verified') { pts += 2; reasons.push('strongest relationship is documented with dates'); }
  else if (best?.verification === 'probable') { pts += 1; reasons.push('strongest relationship is documented but undated'); }
  else if (best) { pts -= 1; reasons.push('relationship links are inferred'); }
  if (s.funding.cited && s.funding.peerGrants >= 3) { pts += 3; reasons.push(`${s.funding.peerGrants} cited funding events`); }
  else if (s.funding.cited && s.funding.peerGrants >= 1) { pts += 2; reasons.push(`${s.funding.peerGrants} cited funding event${s.funding.peerGrants === 1 ? '' : 's'}`); }
  else if (s.funding.peerGrants >= 1) { reasons.push('funding evidence is uncited'); }
  if (s.relationships.length && s.relationships.every(r => r.verification === 'inferred') && !s.funding.cited) { pts -= 1; }
  const confidence: Confidence = pts >= 5 ? 'High' : pts >= 2 ? 'Medium' : 'Low';
  return { confidence, reasons };
}

/** Score one lead from its gathered signals. Pure; safe to unit-test. */
export function scoreLead(s: LeadSignals): ScoreResult {
  const relationship = relationshipSection(s.relationships);
  const funding_fit = fundingSection(s.funding);
  const accessibility = accessSection(s.access);
  const recency = recencySection(s.funding, s.relationships, s.asOfYear);
  const sum = (c: ScoreComponent[]) => c.reduce((n, x) => n + x.points, 0);
  const relPts = Math.min(RELATIONSHIP_CAP, sum(relationship));
  if (sum(relationship) > RELATIONSHIP_CAP) relationship.push({ key: 'relationship_cap', label: `Relationship points capped at ${RELATIONSHIP_CAP}`, points: RELATIONSHIP_CAP - sum(relationship) });
  if (sum(funding_fit) > FUNDING_CAP) funding_fit.push({ key: 'funding_cap', label: `Funding-fit points capped at ${FUNDING_CAP}`, points: FUNDING_CAP - sum(funding_fit) });
  const fundPts = sum(funding_fit);
  const penalties = penaltySection(s, fundPts);
  const subtotals = { relationship: relPts, funding_fit: fundPts, accessibility: sum(accessibility), recency: sum(recency), penalties: sum(penalties) };
  const raw = subtotals.relationship + subtotals.funding_fit + subtotals.accessibility + subtotals.recency + subtotals.penalties;
  const opportunity_score = Math.max(0, Math.min(100, round(raw)));
  const conf = evidenceConfidence(s);
  return {
    opportunity_score, evidence_confidence: conf.confidence,
    breakdown: { generator: 'scoring:v1', relationship, funding_fit, accessibility, recency, penalties, subtotals, confidence_reasons: conf.reasons, source_types: [...new Set(s.sourceTypes)] },
  };
}

// ── White space: "Untapped Funder" wording (mandated hedge) ─────────────────
export interface UntappedFacts {
  funder: string;
  peerNames: string[];          // comparable organizations funded (display names)
  grants: number;
  firstYear: number; latestYear: number;
  latestAmount: number | null;
  chicagoShare: number;
  programHits: number;
  path: string | null;          // "an introduction through Phil Doherty (former Tribune colleague of trustee …)"
}

export const NO_CYC_FUNDING = 'No CYC funding relationship identified in available data.';

export function describeUntapped(u: UntappedFacts): string {
  const names = u.peerNames.slice(0, 3).join(', ') + (u.peerNames.length > 3 ? ` and ${u.peerNames.length - 3} more` : '');
  const span = u.firstYear === u.latestYear ? `in ${u.latestYear}` : `across ${u.firstYear}–${u.latestYear}`;
  const recent = `most recent ${u.latestYear}${u.latestAmount ? `, $${fmt(u.latestAmount)}` : ''}`;
  const fit = [u.chicagoShare >= 0.5 ? 'largely Chicago-area giving' : null, u.programHits > 0 ? `${u.programHits} grant${u.programHits === 1 ? '' : 's'} with youth / education purposes` : null].filter(Boolean).join('; ');
  const path = u.path ? ` Potential path: ${u.path}; no personal relationship is asserted.` : ' No warm path identified yet — a research lead.';
  return `${u.funder} funded ${u.peerNames.length} organization${u.peerNames.length === 1 ? '' : 's'} comparable to CYC (${names}) ${span}: ${u.grants} grant${u.grants === 1 ? '' : 's'} in IRS filings, ${recent}.${fit ? ` ${fit[0].toUpperCase()}${fit.slice(1)}.` : ''} ${NO_CYC_FUNDING}${path}`;
}

function humanize(type: string): string {
  return type.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).replace('cyc', 'CYC');
}
function fmt(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : String(Math.round(n));
}
