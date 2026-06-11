/**
 * CRA seed bridge — Phase 4C.
 *
 * Bootstraps the funders + census_tracts + bank_assessment_areas tables
 * from the curated CHICAGO_BANK_FUNDERS and COOK_COUNTY_LMI_TRACTS
 * constants. Idempotent — every row upserts on its natural key.
 *
 * Run once via POST /api/admin/seed-cra after applying
 * supabase/phase4_cra_layer.sql; subsequent runs are safe but
 * unnecessary unless you've edited the constants.
 */

import { upsertFunder } from '@/lib/graph/repo';
import { upsertTract, upsertBankAa } from './repo';
import {
  CHICAGO_BANK_FUNDERS, COOK_COUNTY_LMI_TRACTS,
} from './seed-data';
import { createServerClient } from '@/lib/supabase';

export interface SeedCraResult {
  banks_seen:     number;
  banks_kept:     number;
  tracts_seen:    number;
  tracts_kept:    number;
  bank_aa_links:  number;
  errors:         string[];
}

export async function seedCraFromConstants(): Promise<SeedCraResult> {
  const errors: string[] = [];
  let banks_kept    = 0;
  let tracts_kept   = 0;
  let bank_aa_links = 0;

  // Resolve the Chicago Metro region_id so the seeded tracts carry it
  // for region-scoped queries.
  const db = createServerClient();
  const { data: region } = await db
    .from('regions')
    .select('id')
    .eq('slug', 'chicago-metro')
    .maybeSingle();
  const chicagoMetroId = (region?.id as string) ?? null;

  // ── 1. Banks → funders ──────────────────────────────────────────────────
  const bankFunderIds = new Map<string, string>();   // ein → funder_id

  for (const b of CHICAGO_BANK_FUNDERS) {
    try {
      const row = await upsertFunder({
        ein:         b.ein,
        name:        b.name,
        funder_type: 'bank',
        metadata: {
          fdic_id:      b.fdic_id,
          presence:     [...b.presence],
          note:         b.note,
          source:       'cra_seed_chicago_v1',
          last_seen_at: new Date().toISOString(),
        },
      });
      bankFunderIds.set(b.ein, row.id);
      banks_kept += 1;
    } catch (err) {
      errors.push(`bank ${b.name} (${b.ein}): ${String(err)}`);
    }
  }

  // ── 2. LMI tracts → census_tracts ───────────────────────────────────────
  for (const t of COOK_COUNTY_LMI_TRACTS) {
    try {
      await upsertTract({
        tract_id:   t.tract_id,
        region_id:  chicagoMetroId,
        lmi_status: t.lmi_status,
        metadata: {
          community:    t.community,
          source:       'cra_seed_chicago_v1',
          last_seen_at: new Date().toISOString(),
        },
      });
      tracts_kept += 1;
    } catch (err) {
      errors.push(`tract ${t.tract_id} (${t.community}): ${String(err)}`);
    }
  }

  // ── 3. Bank AA links ────────────────────────────────────────────────────
  // Every seeded bank covers Cook County, and every seeded tract is in
  // Cook County, so the AA matrix is bank × tract. Real bank AAs vary
  // tract-by-tract; for these 9 specific banks the county-level
  // approximation is correct (their FFIEC-disclosed AAs all include
  // 17031). Phase 4b refines this from the FFIEC AA file.
  for (const [, funderId] of bankFunderIds) {
    for (const t of COOK_COUNTY_LMI_TRACTS) {
      try {
        await upsertBankAa({
          funder_id: funderId,
          tract_id:  t.tract_id,
          source:    'manual_seed',
        });
        bank_aa_links += 1;
      } catch (err) {
        errors.push(`AA ${funderId}→${t.tract_id}: ${String(err)}`);
      }
    }
  }

  return {
    banks_seen:    CHICAGO_BANK_FUNDERS.length,
    banks_kept,
    tracts_seen:   COOK_COUNTY_LMI_TRACTS.length,
    tracts_kept,
    bank_aa_links,
    errors,
  };
}
