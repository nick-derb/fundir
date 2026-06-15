/**
 * Adapter registry — single source of truth for dispatching by adapter_key.
 *
 * Adding a new source = (1) write an adapter module that exports a
 * GrantSourceAdapter, (2) register it here, (3) insert a row into
 * `grant_sources` with the same adapter_key. Nothing in the discovery
 * pipeline needs to change.
 *
 * Phase 1B ships two adapters: grants_gov (federal) and foundation_seed
 * (transitional in-process list). Phase 2 swaps foundation_seed's data
 * source for the `funders` table. Phase 5 lands four state/local adapters.
 */

import type { GrantSourceAdapter } from './types';
import { grantsGovAdapter }        from './grants-gov-adapter';
import { foundationSeedAdapter }   from './foundation-seed-adapter';
import { chicagoDfssAdapter }      from './chicago-dfss-adapter';
import { cookCountyAdapter }       from './cook-county-adapter';
import { illinoisGataAdapter }     from './illinois-gata-adapter';
import { isbeAdapter }             from './isbe-adapter';

const ADAPTERS: Record<string, GrantSourceAdapter> = {
  [grantsGovAdapter.adapterKey]:      grantsGovAdapter,
  [foundationSeedAdapter.adapterKey]: foundationSeedAdapter,
  // Phase 5: Chicago Metro region-scoped state/local sources. Each one is
  // a hand-curated seed of recurring funding streams today; Phase 5B
  // upgrades each adapter's fetch() to a real scrape against its source
  // website without changing the registry or downstream pipeline.
  [chicagoDfssAdapter.adapterKey]:    chicagoDfssAdapter,
  [cookCountyAdapter.adapterKey]:     cookCountyAdapter,
  [illinoisGataAdapter.adapterKey]:   illinoisGataAdapter,
  [isbeAdapter.adapterKey]:           isbeAdapter,
};

export function getAdapter(adapterKey: string): GrantSourceAdapter | null {
  return ADAPTERS[adapterKey] ?? null;
}

export function listAdapterKeys(): string[] {
  return Object.keys(ADAPTERS);
}
