/**
 * CRA layer repository — typed read/write over census_tracts and
 * bank_assessment_areas. Service-role client because writes are
 * service-only (RLS denies all writes; SELECT is open to authenticated).
 */

import { createServerClient } from '@/lib/supabase';
import type {
  CensusTractRow, BankAssessmentAreaRow, LmiStatus, BankAaSource,
  OrgCraSnapshot,
} from './types';

// ── census_tracts ──────────────────────────────────────────────────────────

export async function getTract(tractId: string): Promise<CensusTractRow | null> {
  if (!tractId) return null;
  const db = createServerClient();
  const { data, error } = await db
    .from('census_tracts')
    .select('*')
    .eq('tract_id', tractId)
    .maybeSingle();
  if (error) throw new Error(`getTract: ${error.message}`);
  return (data as CensusTractRow) ?? null;
}

export interface UpsertTractInput {
  tract_id:   string;
  region_id?: string | null;
  lmi_status: LmiStatus;
  metadata?:  Record<string, unknown>;
}

export async function upsertTract(input: UpsertTractInput): Promise<CensusTractRow> {
  const db = createServerClient();
  const { data, error } = await db
    .from('census_tracts')
    .upsert(
      {
        tract_id:   input.tract_id,
        region_id:  input.region_id ?? null,
        lmi_status: input.lmi_status,
        metadata:   input.metadata ?? {},
      },
      { onConflict: 'tract_id' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`upsertTract(${input.tract_id}): ${error.message}`);
  return data as CensusTractRow;
}

// ── bank_assessment_areas ──────────────────────────────────────────────────

export interface UpsertBankAaInput {
  funder_id: string;
  tract_id:  string;
  source:    BankAaSource;
}

export async function upsertBankAa(input: UpsertBankAaInput): Promise<BankAssessmentAreaRow> {
  const db = createServerClient();
  const { data, error } = await db
    .from('bank_assessment_areas')
    .upsert(input, { onConflict: 'funder_id,tract_id' })
    .select('*')
    .single();
  if (error) throw new Error(`upsertBankAa: ${error.message}`);
  return data as BankAssessmentAreaRow;
}

// ── Hot-path matcher lookup ────────────────────────────────────────────────
//
// `loadOrgCraSnapshot` is what the matcher calls per org per discovery
// pass. One round trip via the bank-AA join. Cached one layer up (in
// actions/discovery.ts) so the cron doesn't repeat the lookup for each
// grant.

export async function loadOrgCraSnapshot(orgId: string): Promise<OrgCraSnapshot | null> {
  const db = createServerClient();

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, census_tract, lmi_flag')
    .eq('id', orgId)
    .single();
  if (orgErr || !org) return null;
  if (!org.census_tract) {
    return {
      org_id:       org.id,
      census_tract: null,
      lmi_status:   'unknown',
      community:    null,
      bank_funders: [],
    };
  }

  // Two parallel reads: the tract's LMI status + community name, and
  // the list of bank funders whose AA covers it.
  const [{ data: tract }, { data: banks }] = await Promise.all([
    db.from('census_tracts')
      .select('lmi_status, metadata')
      .eq('tract_id', org.census_tract)
      .maybeSingle(),
    db.from('bank_assessment_areas')
      .select('funder_id, source, funder:funders(name)')
      .eq('tract_id', org.census_tract),
  ]);

  const tractMeta = (tract?.metadata ?? {}) as { community?: unknown };
  const community = typeof tractMeta.community === 'string' ? tractMeta.community : null;

  // Supabase types the joined `funder` as an array even when the FK
  // resolves to a single row. Normalize both shapes here so callers
  // don't have to.
  const bank_funders = (banks ?? [])
    .map(row => {
      const r = row as { funder_id?: unknown; source?: unknown; funder?: unknown };
      if (typeof r.funder_id !== 'string') return null;
      let funderName = '';
      if (Array.isArray(r.funder)) {
        const first = r.funder[0] as { name?: unknown } | undefined;
        if (first && typeof first.name === 'string') funderName = first.name;
      } else if (r.funder && typeof r.funder === 'object') {
        const obj = r.funder as { name?: unknown };
        if (typeof obj.name === 'string') funderName = obj.name;
      }
      return {
        funder_id: r.funder_id,
        name:      funderName,
        source:    r.source as BankAaSource,
      };
    })
    .filter((x): x is { funder_id: string; name: string; source: BankAaSource } => x !== null);

  return {
    org_id:       org.id,
    census_tract: org.census_tract,
    lmi_status:   (tract?.lmi_status as LmiStatus) ?? 'unknown',
    community,
    bank_funders,
  };
}
