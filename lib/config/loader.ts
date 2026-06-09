/**
 * Config loader — DB-backed, in-process cached.
 *
 * Regions/segments/grant_sources rarely change at runtime; loading them once
 * per cold start is fine. Cache invalidates on process restart, which is
 * already how Vercel handles deploys. If a row changes mid-process and the
 * stale read matters, call `invalidateConfigCache()`.
 *
 * Every business-logic call site that used to branch on a string literal
 * ('CYC2025', 'IL', 'youth') should go through here instead.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  Region, Segment, GrantSourceRow, OrgConfigShape,
} from './types';

let regionCache:  Map<string, Region>          | null = null;
let segmentCache: Map<string, Segment>         | null = null;
let sourceCache:  Map<string, GrantSourceRow>  | null = null;

let regionInflight:  Promise<Map<string, Region>>          | null = null;
let segmentInflight: Promise<Map<string, Segment>>         | null = null;
let sourceInflight:  Promise<Map<string, GrantSourceRow>>  | null = null;

export function invalidateConfigCache(): void {
  regionCache  = null;
  segmentCache = null;
  sourceCache  = null;
}

async function loadRegions(): Promise<Map<string, Region>> {
  if (regionCache)  return regionCache;
  if (regionInflight) return regionInflight;
  regionInflight = (async () => {
    const db = createServerClient();
    const { data, error } = await db.from('regions').select('*');
    if (error) throw new Error(`loadRegions: ${error.message}`);
    const map = new Map<string, Region>();
    for (const row of (data ?? []) as Region[]) {
      map.set(row.id, row);
      map.set(row.slug, row);
    }
    regionCache  = map;
    regionInflight = null;
    return map;
  })();
  return regionInflight;
}

async function loadSegments(): Promise<Map<string, Segment>> {
  if (segmentCache)  return segmentCache;
  if (segmentInflight) return segmentInflight;
  segmentInflight = (async () => {
    const db = createServerClient();
    const { data, error } = await db.from('segments').select('*');
    if (error) throw new Error(`loadSegments: ${error.message}`);
    const map = new Map<string, Segment>();
    for (const row of (data ?? []) as Segment[]) {
      map.set(row.id, row);
      map.set(row.slug, row);
    }
    segmentCache  = map;
    segmentInflight = null;
    return map;
  })();
  return segmentInflight;
}

async function loadSources(): Promise<Map<string, GrantSourceRow>> {
  if (sourceCache)  return sourceCache;
  if (sourceInflight) return sourceInflight;
  sourceInflight = (async () => {
    const db = createServerClient();
    const { data, error } = await db.from('grant_sources').select('*');
    if (error) throw new Error(`loadSources: ${error.message}`);
    const map = new Map<string, GrantSourceRow>();
    for (const row of (data ?? []) as GrantSourceRow[]) {
      map.set(row.id, row);
      map.set(row.adapter_key, row);
    }
    sourceCache  = map;
    sourceInflight = null;
    return map;
  })();
  return sourceInflight;
}

export async function getRegion(idOrSlug: string): Promise<Region | null> {
  const map = await loadRegions();
  return map.get(idOrSlug) ?? null;
}

export async function getSegment(idOrSlug: string): Promise<Segment | null> {
  const map = await loadSegments();
  return map.get(idOrSlug) ?? null;
}

export async function getGrantSource(idOrKey: string): Promise<GrantSourceRow | null> {
  const map = await loadSources();
  return map.get(idOrKey) ?? null;
}

export async function listEnabledSources(opts?: { source_type?: string; region_id?: string | null }): Promise<GrantSourceRow[]> {
  const map = await loadSources();
  // De-duplicate (the map double-keys by id and adapter_key)
  const seen = new Set<string>();
  const out: GrantSourceRow[] = [];
  for (const row of map.values()) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!row.enabled) continue;
    if (opts?.source_type && row.source_type !== opts.source_type) continue;
    if (opts?.region_id !== undefined && row.region_id !== opts.region_id) continue;
    out.push(row);
  }
  return out;
}

/**
 * Fetch an organization's region + segment in one call. Returns null when
 * the org doesn't exist or isn't yet pinned to a region/segment (allowed
 * during the Phase 1 transition — callers should fall back gracefully).
 */
export async function getOrgConfig(orgIdOrCode: string): Promise<{
  org_id:   string;
  org_code: string;
  config:   OrgConfigShape;
  region:   Region  | null;
  segment:  Segment | null;
} | null> {
  const db = createServerClient();
  const isUuid = /^[0-9a-f-]{36}$/.test(orgIdOrCode);
  const { data, error } = await db
    .from('organizations')
    .select('id, org_code, region_id, segment_id, ntee_code, budget_band, census_tract, lmi_flag')
    .eq(isUuid ? 'id' : 'org_code', orgIdOrCode)
    .single();
  if (error || !data) return null;

  const region  = data.region_id  ? await getRegion(data.region_id)   : null;
  const segment = data.segment_id ? await getSegment(data.segment_id) : null;

  return {
    org_id:   data.id,
    org_code: data.org_code,
    config: {
      region_id:    data.region_id,
      segment_id:   data.segment_id,
      ntee_code:    data.ntee_code,
      budget_band:  data.budget_band,
      census_tract: data.census_tract,
      lmi_flag:     data.lmi_flag,
    },
    region,
    segment,
  };
}
