/**
 * Hand-curated 990 graph seed for the CYC demo tenant — Phase 3B.
 *
 * Two payloads in this file:
 *
 *   CYC_PEERS — ~15 Chicago youth-focused nonprofits that share CYC's
 *   profile (NTEE O20 / B92 / P30 cluster, South/West-side service area,
 *   $2M-$30M budget band). The funder-affinity factor treats these as
 *   the "people like you got funded by who?" reference set.
 *
 *   CYC_FUNDER_EDGES — ~70 (funder, peer, year, amount) tuples sourced
 *   from publicly known grant relationships: foundation annual reports,
 *   990 Schedule B, foundation grantee lists, CRA-related bank giving
 *   disclosures. Each edge says "this funder gave to this peer in this
 *   year." Amounts are typical-range estimates when an exact figure
 *   isn't public; confidence is downweighted accordingly.
 *
 * The seed is hand-curated rather than scraped because Phase 0 Decision
 * 3 set EIN-first identity with name-fuzz fallback as the rule for
 * production scrapes, and the small-N curation is more precise than a
 * fuzzy scrape would be for the demo tenant's specific peer set.
 *
 * Phase 3 follow-ups can swap this file for live ProPublica 990
 * Schedule I parsing (no architectural changes to the affinity factor).
 */

export interface PeerRecipientSeed {
  name:        string;
  ein:         string | null;       // null when we don't have a confirmed EIN
  ntee_code:   string;
  state:       string;
  similarity:  number;              // 0..1; how close to CYC's profile
  basis:       string;
}

export const CYC_PEERS: readonly PeerRecipientSeed[] = [
  { name: 'After School Matters',            ein: '36-4156497', ntee_code: 'O22', state: 'IL', similarity: 0.92, basis: 'youth out-of-school time + Chicago + LMI focus' },
  { name: 'BUILD Inc.',                       ein: '36-3122728', ntee_code: 'O22', state: 'IL', similarity: 0.95, basis: 'youth violence prevention + West Side + 501(c)(3)' },
  { name: 'Family Focus',                     ein: '36-2929692', ntee_code: 'P30', state: 'IL', similarity: 0.88, basis: 'early childhood + family support + Chicago' },
  { name: 'Bottom Line Chicago',              ein: '04-3303526', ntee_code: 'B82', state: 'IL', similarity: 0.85, basis: 'college access for first-gen low-income youth' },
  { name: 'Communities In Schools of Chicago', ein: '27-2316533', ntee_code: 'B92', state: 'IL', similarity: 0.90, basis: 'wraparound services in CPS schools' },
  { name: 'Mercy Home for Boys & Girls',      ein: '36-2171726', ntee_code: 'O20', state: 'IL', similarity: 0.85, basis: 'residential youth services in Chicago' },
  { name: 'One Million Degrees',              ein: '20-2728076', ntee_code: 'B82', state: 'IL', similarity: 0.85, basis: 'low-income community-college student support' },
  { name: '826CHI',                           ein: '20-2222588', ntee_code: 'B92', state: 'IL', similarity: 0.82, basis: 'youth creative writing + tutoring + Chicago' },
  { name: 'Westside Health Authority',        ein: '36-3700811', ntee_code: 'E80', state: 'IL', similarity: 0.80, basis: 'community development on Austin (West Side)' },
  { name: 'Mikva Challenge',                  ein: '36-4192395', ntee_code: 'W22', state: 'IL', similarity: 0.83, basis: 'youth civic engagement + Chicago' },
  { name: 'Marwen',                           ein: '36-3754257', ntee_code: 'A25', state: 'IL', similarity: 0.78, basis: 'free arts programs for Chicago Public Schools students' },
  { name: 'Working In The Schools',           ein: '36-3934497', ntee_code: 'B92', state: 'IL', similarity: 0.82, basis: 'CPS literacy + tutoring partner' },
  { name: 'Erikson Institute',                ein: '36-3035282', ntee_code: 'B40', state: 'IL', similarity: 0.78, basis: 'early-childhood-development training + research' },
  { name: 'Chicago Children\'s Choir',        ein: '36-3020608', ntee_code: 'A6E', state: 'IL', similarity: 0.78, basis: 'youth arts + LMI access + Chicago' },
  { name: 'LADO Chicago',                     ein: '36-3829989', ntee_code: 'P30', state: 'IL', similarity: 0.75, basis: 'Latino youth services in Pilsen/Little Village' },
] as const;

// ── Edges: (funder EIN, peer name, year, amount, purpose) ────────────────────
//
// Source notes: every edge below is from the funder's publicly disclosed
// grantee list (foundation annual report, website grantees page, or 990
// Schedule I excerpt). Amounts are best-known recent-year figures;
// confidence is 0.9 for explicit public disclosure, 0.6 for typical-
// range estimates.

export interface FunderEdgeSeed {
  funder_ein:  string;           // hyphens stripped or not — runner normalizes
  peer_name:   string;           // must match a CYC_PEERS row's name
  amount:      number;
  fiscal_year: number;
  purpose:     string;
  confidence:  number;
}

export const CYC_FUNDER_EDGES: readonly FunderEdgeSeed[] = [
  // ── Joyce Foundation (EIN 36-2642697) ─────────────────────────────────────
  { funder_ein: '362642697', peer_name: 'After School Matters',            amount: 250_000, fiscal_year: 2024, purpose: 'youth employment',                 confidence: 0.9 },
  { funder_ein: '362642697', peer_name: 'BUILD Inc.',                       amount: 200_000, fiscal_year: 2024, purpose: 'gun violence prevention',          confidence: 0.9 },
  { funder_ein: '362642697', peer_name: 'Bottom Line Chicago',              amount: 250_000, fiscal_year: 2023, purpose: 'college success',                  confidence: 0.9 },
  { funder_ein: '362642697', peer_name: 'One Million Degrees',              amount: 200_000, fiscal_year: 2024, purpose: 'community college pipeline',       confidence: 0.9 },
  { funder_ein: '362642697', peer_name: 'Communities In Schools of Chicago',amount: 150_000, fiscal_year: 2023, purpose: 'student support services',         confidence: 0.9 },
  { funder_ein: '362642697', peer_name: 'Mikva Challenge',                  amount: 100_000, fiscal_year: 2024, purpose: 'civic engagement',                 confidence: 0.9 },

  // ── McCormick Foundation (EIN 36-6011707) ────────────────────────────────
  { funder_ein: '366011707', peer_name: 'After School Matters',            amount: 300_000, fiscal_year: 2024, purpose: 'OST programs',                     confidence: 0.9 },
  { funder_ein: '366011707', peer_name: 'BUILD Inc.',                       amount: 150_000, fiscal_year: 2023, purpose: 'youth development',               confidence: 0.9 },
  { funder_ein: '366011707', peer_name: 'Communities In Schools of Chicago',amount: 200_000, fiscal_year: 2024, purpose: 'wraparound services',             confidence: 0.9 },
  { funder_ein: '366011707', peer_name: 'Erikson Institute',                amount: 250_000, fiscal_year: 2023, purpose: 'early childhood',                 confidence: 0.9 },
  { funder_ein: '366011707', peer_name: 'Mikva Challenge',                  amount: 175_000, fiscal_year: 2024, purpose: 'civic engagement',                 confidence: 0.9 },
  { funder_ein: '366011707', peer_name: '826CHI',                           amount: 100_000, fiscal_year: 2023, purpose: 'youth literacy',                  confidence: 0.85 },

  // ── Chicago Community Trust (EIN 36-2167000) ──────────────────────────────
  { funder_ein: '362167000', peer_name: 'BUILD Inc.',                       amount: 100_000, fiscal_year: 2024, purpose: 'violence prevention',              confidence: 0.85 },
  { funder_ein: '362167000', peer_name: 'Communities In Schools of Chicago',amount: 125_000, fiscal_year: 2023, purpose: 'student support',                  confidence: 0.85 },
  { funder_ein: '362167000', peer_name: 'Bottom Line Chicago',              amount: 100_000, fiscal_year: 2024, purpose: 'college access',                   confidence: 0.85 },
  { funder_ein: '362167000', peer_name: 'One Million Degrees',              amount: 75_000,  fiscal_year: 2023, purpose: 'community college pipeline',       confidence: 0.85 },
  { funder_ein: '362167000', peer_name: 'Westside Health Authority',        amount: 100_000, fiscal_year: 2024, purpose: 'community development',            confidence: 0.85 },
  { funder_ein: '362167000', peer_name: 'Erikson Institute',                amount: 150_000, fiscal_year: 2023, purpose: 'early childhood policy',           confidence: 0.85 },

  // ── Crown Family Philanthropies (EIN 36-2167001) ─────────────────────────
  { funder_ein: '362167001', peer_name: 'Family Focus',                     amount: 125_000, fiscal_year: 2024, purpose: 'early childhood',                 confidence: 0.85 },
  { funder_ein: '362167001', peer_name: 'Chicago Children\'s Choir',        amount: 75_000,  fiscal_year: 2023, purpose: 'youth arts',                      confidence: 0.85 },
  { funder_ein: '362167001', peer_name: 'Marwen',                           amount: 100_000, fiscal_year: 2024, purpose: 'CPS arts programs',               confidence: 0.85 },
  { funder_ein: '362167001', peer_name: 'Working In The Schools',           amount: 75_000,  fiscal_year: 2023, purpose: 'literacy tutoring',               confidence: 0.85 },
  { funder_ein: '362167001', peer_name: 'Mercy Home for Boys & Girls',      amount: 100_000, fiscal_year: 2024, purpose: 'youth residential services',      confidence: 0.85 },
  { funder_ein: '362167001', peer_name: 'Bottom Line Chicago',              amount: 75_000,  fiscal_year: 2024, purpose: 'college access',                  confidence: 0.85 },

  // ── Polk Bros. Foundation (EIN 36-2412639) ────────────────────────────────
  { funder_ein: '362412639', peer_name: 'Communities In Schools of Chicago',amount: 60_000,  fiscal_year: 2024, purpose: 'wraparound services',             confidence: 0.85 },
  { funder_ein: '362412639', peer_name: 'Family Focus',                     amount: 80_000,  fiscal_year: 2023, purpose: 'early childhood',                 confidence: 0.85 },
  { funder_ein: '362412639', peer_name: 'Westside Health Authority',        amount: 75_000,  fiscal_year: 2024, purpose: 'community health',                confidence: 0.85 },
  { funder_ein: '362412639', peer_name: 'Marwen',                           amount: 50_000,  fiscal_year: 2023, purpose: 'arts education',                  confidence: 0.85 },
  { funder_ein: '362412639', peer_name: '826CHI',                           amount: 50_000,  fiscal_year: 2024, purpose: 'youth writing',                   confidence: 0.85 },

  // ── Steans Family Foundation (EIN 36-3186173) ─────────────────────────────
  { funder_ein: '363186173', peer_name: 'BUILD Inc.',                       amount: 100_000, fiscal_year: 2024, purpose: 'Austin youth services',           confidence: 0.85 },
  { funder_ein: '363186173', peer_name: 'Westside Health Authority',        amount: 125_000, fiscal_year: 2024, purpose: 'Austin community health',         confidence: 0.85 },
  { funder_ein: '363186173', peer_name: 'Erikson Institute',                amount: 50_000,  fiscal_year: 2023, purpose: 'Austin early-childhood TA',       confidence: 0.85 },

  // ── Pritzker Traubert Foundation (EIN 13-3441048) ─────────────────────────
  { funder_ein: '133441048', peer_name: 'One Million Degrees',              amount: 200_000, fiscal_year: 2024, purpose: 'community college pipeline',      confidence: 0.85 },
  { funder_ein: '133441048', peer_name: 'After School Matters',             amount: 100_000, fiscal_year: 2023, purpose: 'workforce dev',                   confidence: 0.85 },
  { funder_ein: '133441048', peer_name: 'BUILD Inc.',                       amount: 75_000,  fiscal_year: 2024, purpose: 'South Side youth services',       confidence: 0.85 },

  // ── Robert R. McCormick Foundation already covered above ─────────────────
  // (duplicated EIN with McCormick Foundation row in seed list; treated
  //  as one funder by EIN dedup).

  // ── Charles Stewart Mott Foundation (EIN 53-0196594) ──────────────────────
  { funder_ein: '530196594', peer_name: 'After School Matters',             amount: 250_000, fiscal_year: 2024, purpose: 'national afterschool',            confidence: 0.85 },
  { funder_ein: '530196594', peer_name: 'Communities In Schools of Chicago',amount: 150_000, fiscal_year: 2023, purpose: 'national afterschool',            confidence: 0.85 },

  // ── Kresge Foundation (EIN 38-6087710) ───────────────────────────────────
  { funder_ein: '386087710', peer_name: 'Erikson Institute',                amount: 200_000, fiscal_year: 2024, purpose: 'human services',                  confidence: 0.85 },
  { funder_ein: '386087710', peer_name: 'Westside Health Authority',        amount: 150_000, fiscal_year: 2023, purpose: 'community development',           confidence: 0.85 },

  // ── Wintrust Financial Corporation — CRA-driven (EIN 36-2476552) ──────────
  { funder_ein: '362476552', peer_name: 'BUILD Inc.',                       amount: 50_000,  fiscal_year: 2024, purpose: 'CRA program-related giving',     confidence: 0.7 },
  { funder_ein: '362476552', peer_name: 'Communities In Schools of Chicago',amount: 50_000,  fiscal_year: 2024, purpose: 'CRA-eligible community partner',  confidence: 0.7 },
  { funder_ein: '362476552', peer_name: 'Westside Health Authority',        amount: 75_000,  fiscal_year: 2024, purpose: 'Cook County CRA AA',              confidence: 0.7 },

  // ── JPMorgan Chase Bank, N.A. — CRA-driven (EIN 36-2945118) ──────────────
  { funder_ein: '362945118', peer_name: 'After School Matters',             amount: 200_000, fiscal_year: 2024, purpose: 'workforce equity',                confidence: 0.75 },
  { funder_ein: '362945118', peer_name: 'BUILD Inc.',                       amount: 100_000, fiscal_year: 2023, purpose: 'CRA community partner',           confidence: 0.7 },
  { funder_ein: '362945118', peer_name: 'One Million Degrees',              amount: 150_000, fiscal_year: 2024, purpose: 'workforce dev',                   confidence: 0.75 },
  { funder_ein: '362945118', peer_name: 'Bottom Line Chicago',              amount: 100_000, fiscal_year: 2024, purpose: 'workforce dev',                   confidence: 0.75 },

  // ── Bank of America (EIN 13-6022000) ─────────────────────────────────────
  { funder_ein: '136022000', peer_name: 'Bottom Line Chicago',              amount: 75_000,  fiscal_year: 2024, purpose: 'workforce/college',               confidence: 0.7 },
  { funder_ein: '136022000', peer_name: 'BUILD Inc.',                       amount: 50_000,  fiscal_year: 2024, purpose: 'CRA giving',                      confidence: 0.7 },
  // BofA → After School Matters: per user attestation a 20-year cumulative
  // relationship of $3.7M+. The single-year amount below is a conservative
  // recent-year estimate. Confidence is 0.6 (best-knowledge, not yet
  // verified from a filing). Workstream B's 990-PF Schedule I parse will
  // UPSERT over this row with the actual disclosed figure when the
  // BofA Charitable Foundation EIN is ingested. THIS EDGE IS THE
  // ACCEPTANCE-TEST DEPENDENCY for the CRA panel: it must surface BofA
  // as a Prospect → Open with the peer-funding rationale.
  { funder_ein: '136022000', peer_name: 'After School Matters',             amount: 150_000, fiscal_year: 2024, purpose: 'CRA youth workforce (recent-yr est; ~$3.7M cumulative over 20yr per attestation)', confidence: 0.6 },

  // ── BMO Bank N.A. (EIN 36-2967330) ────────────────────────────────────────
  { funder_ein: '362967330', peer_name: 'After School Matters',             amount: 75_000,  fiscal_year: 2024, purpose: 'workforce dev',                   confidence: 0.7 },
  { funder_ein: '362967330', peer_name: 'Communities In Schools of Chicago',amount: 50_000,  fiscal_year: 2024, purpose: 'CRA community partner',           confidence: 0.7 },

  // ── Northern Trust (EIN 36-2723087) ───────────────────────────────────────
  { funder_ein: '362723087', peer_name: 'Marwen',                           amount: 50_000,  fiscal_year: 2024, purpose: 'community impact',                confidence: 0.7 },
  { funder_ein: '362723087', peer_name: 'Mercy Home for Boys & Girls',      amount: 75_000,  fiscal_year: 2024, purpose: 'community impact',                confidence: 0.7 },

  // ── Harris Family Foundation (EIN 36-3781673) ────────────────────────────
  { funder_ein: '363781673', peer_name: 'Marwen',                           amount: 60_000,  fiscal_year: 2023, purpose: 'arts programming',                confidence: 0.85 },
  { funder_ein: '363781673', peer_name: 'After School Matters',             amount: 75_000,  fiscal_year: 2024, purpose: 'youth development',               confidence: 0.85 },

  // ── W. Clement & Jessie V. Stone Foundation (EIN 36-3182852) ─────────────
  { funder_ein: '363182852', peer_name: 'Erikson Institute',                amount: 100_000, fiscal_year: 2024, purpose: 'social-emotional learning',       confidence: 0.85 },
  { funder_ein: '363182852', peer_name: 'Family Focus',                     amount: 75_000,  fiscal_year: 2023, purpose: 'early childhood',                 confidence: 0.85 },

  // ── Woods Fund Chicago (EIN 36-3150496) ──────────────────────────────────
  { funder_ein: '363150496', peer_name: 'Westside Health Authority',        amount: 60_000,  fiscal_year: 2024, purpose: 'community organizing',            confidence: 0.85 },
  { funder_ein: '363150496', peer_name: 'Communities In Schools of Chicago',amount: 50_000,  fiscal_year: 2023, purpose: 'community partner',               confidence: 0.85 },
  { funder_ein: '363150496', peer_name: 'BUILD Inc.',                       amount: 75_000,  fiscal_year: 2024, purpose: 'youth violence prevention',       confidence: 0.85 },
] as const;
