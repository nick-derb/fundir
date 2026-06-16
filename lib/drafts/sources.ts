/**
 * Source-of-truth assembly for draft generation — Phase 6 cont.
 *
 * Pulls every cite-able fact about the org into a numbered list the
 * generator hands to Claude. The contract with Claude is strict:
 *   - Every factual claim about the org in the draft body MUST cite a
 *     source by id ({{cite:N}}).
 *   - If a needed fact isn't in the source list, the draft must say
 *     "[TODO: confirm from org]" instead of inventing.
 *
 * Sources by type:
 *   profile        organizations.profile_data fields (mission,
 *                  programs, populations, sites, accreditations,
 *                  strategic priorities)
 *   financial      organizations.financial_data computed +
 *                  hand-audited fixtures (CYC) — annual revenue,
 *                  govt %, reserves, months of runway
 *   document       document_analyses rows (uploaded narratives or
 *                  Google Drive/OneDrive synced docs)
 *   tract          census_tracts entries for the org's primary tract
 *                  (LMI status, community label) — Phase 4 evidence
 */

import { createServerClient } from '@/lib/supabase';
import { getOrgFinancialProfile } from '@/lib/org-financials';
import { loadOrgCraSnapshot } from '@/lib/cra/repo';
import type { ComputedFinancials } from '@/lib/propublica';

export type SourceType = 'profile' | 'financial' | 'document' | 'tract';

export interface DraftSource {
  /** 1-indexed citation id. Body uses {{cite:N}} to reference. */
  id:           number;
  source_type:  SourceType;
  /** Stable handle for the underlying datum — e.g. 'profile.mission',
   *  'financial.govt_dependency_pct', 'document:<id>'. */
  source_key:   string;
  /** The exact quote or paraphrase Claude is allowed to cite. */
  quote:        string;
  /** Human-readable location, e.g. 'Profile · mission statement',
   *  'Audited FY25 financials · liquidity', 'Uploaded narrative
   *  "Joyce 2024 LOI" · paragraph 3'. */
  location:     string;
}

export interface SourceBundle {
  org_id:    string;
  org_name:  string;
  sources:   DraftSource[];
}

interface ProfileData {
  mission_statement?:          string;
  current_annual_budget?:      number;
  current_annual_revenue?:     number;
  current_govt_revenue_pct?:   number;
  current_private_grants_pct?: number;
  current_months_reserves?:    number;
  num_full_time_staff?:        number;
  num_part_time_staff?:        number;
  num_program_sites?:          number;
  participants_served_annually?: number;
  primary_ntee?:               string;
  program_descriptions?:       string[];
  geographic_service_area?:    string;
  accreditations?:             string[];
  strategic_priorities?:       string[];
  capacity_notes?:             string;
  awarded_grants?:             Array<{ funder?: string; amount?: number; year?: number; program?: string }>;
}

/**
 * Build the source bundle for one org. Pulls profile_data, financial
 * fixture/data, recent document_analyses, and the CRA tract. Sources
 * are numbered in a stable order so re-runs over unchanged inputs
 * produce the same citation ids.
 */
export async function assembleSources(orgCode: string): Promise<SourceBundle | null> {
  const db = createServerClient();
  const { data: org } = await db
    .from('organizations')
    .select('id, name, profile_data')
    .eq('org_code', orgCode)
    .maybeSingle();
  if (!org) return null;

  const fin   = await getOrgFinancialProfile(orgCode);
  const cra   = await loadOrgCraSnapshot(org.id as string);
  const docs  = await loadDocumentSources(org.id as string);
  const profile = (org.profile_data ?? {}) as ProfileData;

  const sources: DraftSource[] = [];
  let nextId = 1;
  const add = (s: Omit<DraftSource, 'id'>) => sources.push({ id: nextId++, ...s });

  // ── Profile sources ─────────────────────────────────────────────────────
  if (profile.mission_statement) {
    add({
      source_type: 'profile', source_key: 'profile.mission',
      quote: profile.mission_statement,
      location: 'Self-reported profile · mission statement',
    });
  }
  if (profile.program_descriptions?.length) {
    profile.program_descriptions.slice(0, 4).forEach((p, i) => add({
      source_type: 'profile', source_key: `profile.program[${i}]`,
      quote: p, location: `Self-reported profile · program description ${i + 1}`,
    }));
  }
  if (profile.geographic_service_area) {
    add({
      source_type: 'profile', source_key: 'profile.geo',
      quote: profile.geographic_service_area,
      location: 'Self-reported profile · geographic service area',
    });
  }
  if (profile.participants_served_annually) {
    add({
      source_type: 'profile', source_key: 'profile.participants',
      quote: `${profile.participants_served_annually.toLocaleString()} participants served annually.`,
      location: 'Self-reported profile · annual participants',
    });
  }
  if (profile.num_program_sites) {
    add({
      source_type: 'profile', source_key: 'profile.sites',
      quote: `Operates ${profile.num_program_sites} program sites.`,
      location: 'Self-reported profile · program sites',
    });
  }
  if (profile.num_full_time_staff || profile.num_part_time_staff) {
    const ft = profile.num_full_time_staff ?? 0;
    const pt = profile.num_part_time_staff ?? 0;
    add({
      source_type: 'profile', source_key: 'profile.staff',
      quote: `${ft} full-time and ${pt} part-time staff.`,
      location: 'Self-reported profile · staff counts',
    });
  }
  if (profile.accreditations?.length) {
    add({
      source_type: 'profile', source_key: 'profile.accreditations',
      quote: `Accreditations / registrations: ${profile.accreditations.join(', ')}.`,
      location: 'Self-reported profile · accreditations',
    });
  }
  if (profile.strategic_priorities?.length) {
    add({
      source_type: 'profile', source_key: 'profile.priorities',
      quote: `Strategic priorities: ${profile.strategic_priorities.join('; ')}.`,
      location: 'Self-reported profile · strategic priorities',
    });
  }
  if (profile.capacity_notes) {
    add({
      source_type: 'profile', source_key: 'profile.capacity',
      quote: profile.capacity_notes,
      location: 'Self-reported profile · capacity notes',
    });
  }
  if (profile.awarded_grants?.length) {
    const sample = profile.awarded_grants.slice(0, 6).map(g =>
      `${g.funder ?? 'Funder'}${g.amount ? ` ($${g.amount.toLocaleString()})` : ''}${g.year ? ` in ${g.year}` : ''}`,
    ).join('; ');
    add({
      source_type: 'profile', source_key: 'profile.awarded',
      quote: `Recent awarded grants: ${sample}.`,
      location: 'Self-reported profile · grant history',
    });
  }

  // ── Financial sources ───────────────────────────────────────────────────
  if (fin) {
    const c: ComputedFinancials = fin.computed;
    add({
      source_type: 'financial', source_key: 'financial.total_revenue',
      quote: `Total revenue: $${(c.totalRevenue ?? 0).toLocaleString()}.`,
      location: `${fin.source === 'fixture' ? 'Audited financials' : 'Self-reported / 990'} · total revenue`,
    });
    if (c.governmentGrantsPct != null) add({
      source_type: 'financial', source_key: 'financial.govt_pct',
      quote: `Government grants make up ${c.governmentGrantsPct}% of revenue.`,
      location: `${fin.source === 'fixture' ? 'Audited financials' : '990'} · revenue mix`,
    });
    if (c.privateGrantsPct != null) add({
      source_type: 'financial', source_key: 'financial.private_pct',
      quote: `Private grants make up ${c.privateGrantsPct}% of revenue.`,
      location: `${fin.source === 'fixture' ? 'Audited financials' : '990'} · revenue mix`,
    });
    if (c.programRevenuePct != null) add({
      source_type: 'financial', source_key: 'financial.program_pct',
      quote: `Program service revenue makes up ${c.programRevenuePct}% of revenue.`,
      location: `${fin.source === 'fixture' ? 'Audited financials' : '990'} · revenue mix`,
    });
    if (c.netAssets != null) add({
      source_type: 'financial', source_key: 'financial.net_assets',
      quote: `Net assets: $${(c.netAssets).toLocaleString()}.`,
      location: `${fin.source === 'fixture' ? 'Audited financials' : '990'} · balance sheet`,
    });
    if (c.monthsOfReserves != null) add({
      source_type: 'financial', source_key: 'financial.reserves',
      quote: `Operating reserves equivalent to ${c.monthsOfReserves.toFixed(1)} months of expenses.`,
      location: `${fin.source === 'fixture' ? 'Audited financials' : '990'} · liquidity`,
    });
    if (c.programEfficiencyPct != null) add({
      source_type: 'financial', source_key: 'financial.program_efficiency',
      quote: `Program-expense ratio: ${c.programEfficiencyPct}% of total spending on programs.`,
      location: `${fin.source === 'fixture' ? 'Audited financials' : '990'} · functional expenses`,
    });
  }

  // ── Tract / CRA sources ──────────────────────────────────────────────
  if (cra && cra.lmi_status !== 'unknown') {
    const community = cra.community ? `the ${cra.community} community area` : `census tract ${cra.census_tract}`;
    add({
      source_type: 'tract', source_key: 'tract.lmi',
      quote: `Primary service area is in ${community}, which FFIEC designates as a ${cra.lmi_status}-income census tract under the Community Reinvestment Act.`,
      location: 'FFIEC LMI tract designation',
    });
    if (cra.bank_funders.length > 0) {
      const banks = cra.bank_funders.slice(0, 5).map(b => b.name).join(', ');
      add({
        source_type: 'tract', source_key: 'tract.bank_aa',
        quote: `${cra.bank_funders.length} regulated banks list this service tract within their CRA assessment areas: ${banks}.`,
        location: 'FFIEC CRA assessment-area data',
      });
    }
  }

  // ── Document sources ─────────────────────────────────────────────────
  for (const d of docs) add({
    source_type: 'document', source_key: `document:${d.id}`,
    quote: d.summary,
    location: `Uploaded document · ${d.file_name}`,
  });

  return {
    org_id:   org.id as string,
    org_name: org.name as string,
    sources,
  };
}

interface DocumentRow {
  id:       string;
  file_name:string;
  summary:  string;
}

async function loadDocumentSources(orgId: string): Promise<DocumentRow[]> {
  const db = createServerClient();
  const { data } = await db
    .from('document_analyses')
    .select('id, file_name, summary, analyzed_at')
    .eq('org_id', orgId)
    .order('analyzed_at', { ascending: false })
    .limit(6);
  return ((data ?? []) as DocumentRow[])
    .filter(r => r.summary && r.summary.length > 30);
}
