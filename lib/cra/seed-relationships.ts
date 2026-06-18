/**
 * Phase 7 — org → funder relationships seed.
 *
 * Workstream A acceptance data: CYC's four known existing bank
 * relationships per the project brief (Northern Trust, BMO,
 * Wintrust, Huntington). These rows feed the CRA Intelligence Panel
 * so each bank renders as "Existing → Deepen" instead of
 * "Prospect → Open" by default.
 *
 * Idempotent — every UPSERT honors the (organization_id, funder_id)
 * primary key. Re-running is safe.
 *
 * Future: when a member edits a relationship through the panel UI,
 * the write goes through the same `org_funder_relationships` table
 * directly via the member-write RLS policy. This file only
 * bootstraps the day-one demo state.
 */

import { createServerClient } from '@/lib/supabase';

const CYC_ORG_CODE = 'CYC2025';

/**
 * The seeded set. Each row identifies the funder by FDIC ID (more
 * stable than EIN, since Huntington's EIN is still pending
 * verification). The runner resolves FDIC → funder.id via the
 * funders.metadata.fdic_id field populated by the CRA seed.
 */
export interface OrgFunderRelationshipSeed {
  /** Bank's FDIC institution ID — matches the metadata field on the
   *  funder row populated by `lib/cra/seed-data.ts`. */
  bank_fdic_id:  string;
  bank_name:     string;
  status:        'existing' | 'prospect' | 'declined' | 'dormant';
  notes:         string;
}

export const CYC_RELATIONSHIP_SEED: readonly OrgFunderRelationshipSeed[] = [
  {
    bank_fdic_id: '913',
    bank_name:    'The Northern Trust Company',
    status:       'existing',
    notes:        'Longstanding community-impact partner; supports CYC programs in South-side LMI tracts.',
  },
  {
    bank_fdic_id: '16571',
    bank_name:    'BMO Bank N.A.',
    status:       'existing',
    notes:        'CRA partner since BMO Harris consolidation; supports CYC out-of-school-time programming.',
  },
  {
    bank_fdic_id: '35583',
    bank_name:    'Wintrust Financial Corporation',
    status:       'existing',
    notes:        'Cook County community-bank CRA program; longstanding CYC supporter.',
  },
  {
    bank_fdic_id: '6560',
    bank_name:    'Huntington National Bank',
    status:       'existing',
    notes:        'Inherited from TCF Financial post-2021 acquisition; CYC relationship pre-dates the merger.',
  },
] as const;

export interface SeedRelationshipsResult {
  org_id:          string | null;
  rows_seen:       number;
  rows_kept:       number;
  rows_skipped:    number;
  warnings:        string[];
  errors:          string[];
}

export async function seedOrgFunderRelationships(): Promise<SeedRelationshipsResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const db = createServerClient();

  // ── Resolve CYC org_id ───────────────────────────────────────────────────
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id')
    .eq('org_code', CYC_ORG_CODE)
    .maybeSingle();
  if (orgErr || !org) {
    return {
      org_id: null, rows_seen: 0, rows_kept: 0, rows_skipped: 0,
      warnings,
      errors: [`CYC org not found: ${orgErr?.message ?? 'no row'}`],
    };
  }
  const orgId = org.id as string;

  // ── Look up funder.id by FDIC ID (stored in metadata.fdic_id) ───────────
  // We can't filter on metadata.fdic_id via PostgREST cleanly (json field
  // ops), so we pull all bank funders and resolve in-process. The set is
  // tiny (~10 rows) so this is fine.
  const { data: banks, error: banksErr } = await db
    .from('funders')
    .select('id, name, metadata')
    .eq('funder_type', 'bank');
  if (banksErr || !banks) {
    return {
      org_id: orgId, rows_seen: CYC_RELATIONSHIP_SEED.length, rows_kept: 0, rows_skipped: 0,
      warnings,
      errors: [`bank funders lookup failed: ${banksErr?.message ?? 'no data'}`],
    };
  }

  const funderIdByFdic = new Map<string, string>();
  for (const b of banks) {
    const fdic = ((b.metadata as { fdic_id?: unknown } | null)?.fdic_id) ?? null;
    if (typeof fdic === 'string') funderIdByFdic.set(fdic, b.id as string);
  }

  // ── UPSERT each seeded relationship ─────────────────────────────────────
  let rows_kept = 0;
  let rows_skipped = 0;

  for (const r of CYC_RELATIONSHIP_SEED) {
    const funderId = funderIdByFdic.get(r.bank_fdic_id);
    if (!funderId) {
      warnings.push(`bank ${r.bank_name} (FDIC ${r.bank_fdic_id}) not in funders table — did you run the CRA seed first?`);
      rows_skipped += 1;
      continue;
    }

    const { error: upErr } = await db
      .from('org_funder_relationships')
      .upsert(
        {
          organization_id: orgId,
          funder_id:       funderId,
          status:          r.status,
          source:          'self_reported',
          notes:           r.notes,
        },
        { onConflict: 'organization_id,funder_id' },
      );
    if (upErr) {
      errors.push(`relationship ${r.bank_name}: ${upErr.message}`);
    } else {
      rows_kept += 1;
    }
  }

  return {
    org_id:      orgId,
    rows_seen:   CYC_RELATIONSHIP_SEED.length,
    rows_kept,
    rows_skipped,
    warnings,
    errors,
  };
}
