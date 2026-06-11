/**
 * Phase 2E — one-shot bridge from SEED_FOUNDATIONS (the legacy in-code
 * foundation list) into the funders table.
 *
 * Idempotent: every row upserts on EIN. Re-running it overwrites
 * metadata with whatever the current SEED_FOUNDATIONS const says — so
 * once Phase 2B's ProPublica adapter starts populating `funders`
 * organically, this bridge stops being authoritative and the const
 * can be deleted in a follow-up.
 *
 * Why bridge instead of skip-and-let-the-cron-fill-it: the existing
 * foundation-corpus surface (lib/foundation-corpus.ts) already
 * generates embeddings + similarity over the seed list and is wired
 * into /api/search results. Migrating the list into `funders` lets the
 * Phase 3 funder-affinity factor see those rows on day one, before the
 * nightly cron has run.
 */

import { upsertFunder } from './repo';
import { SEED_FOUNDATIONS } from '@/lib/foundation-intelligence';
import type { FunderType } from './types';

function classifyFunderType(name: string): FunderType {
  if (/community trust|community foundation|community fund/i.test(name)) return 'community_foundation';
  return 'private_foundation';
}

export interface SeedFundersResult {
  seen:   number;
  kept:   number;
  errors: string[];
}

/**
 * Upsert every SEED_FOUNDATIONS entry into `funders`. Returns counts.
 */
export async function seedFundersFromConstants(): Promise<SeedFundersResult> {
  const errors: string[] = [];
  let kept = 0;

  for (const f of SEED_FOUNDATIONS) {
    if (!f.ein) {
      errors.push(`Skipped (no EIN): ${f.name}`);
      continue;
    }
    // ProPublica's EIN format is digits-only; the seed has hyphens.
    // Normalize so this and the ProPublica adapter never insert dupes.
    const ein = f.ein.replace(/\D/g, '');

    try {
      await upsertFunder({
        ein,
        name:        f.name,
        funder_type: classifyFunderType(f.name),
        metadata: {
          city:                 f.city,
          state:                f.state,
          assets:               f.assets,
          total_grants_given:   f.totalGrantsGiven,
          avg_grant_amount:     f.avgGrantAmount,
          grant_range:          f.grantRange,
          focus_areas:          [...f.focusAreas],
          geographic_focus:     [...f.geographicFocus],
          deadline_pattern:     f.deadlinePattern,
          application_url:      f.applicationUrl,
          last_filing_year:     f.lastFilingYear,
          source:               'seed_foundations_v1',
          last_seen_at:         new Date().toISOString(),
        },
      });
      kept += 1;
    } catch (err) {
      errors.push(`${f.name} (${ein}): ${String(err)}`);
    }
  }

  return { seen: SEED_FOUNDATIONS.length, kept, errors };
}
