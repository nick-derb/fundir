/**
 * Live refresh of funder + recipient metadata from ProPublica's
 * Nonprofit Explorer.
 *
 * The seed bridge (lib/graph/seed-foundations.ts + seed-cyc-graph) gave
 * us baseline rows with name + EIN. ProPublica adds the time-sensitive
 * fields the panels surface:
 *   - last_filing_year (drives the "FY2024" labels on funder cards)
 *   - total_assets / total_revenue (drives the funder-type narrative)
 *   - city + state + NTEE (drives geographic + segment matching)
 *
 * This runner walks every funder + recipient with an EIN, pulls the
 * current ProPublica record, and merges fresh fields into the row's
 * jsonb metadata. Stable fields (name, ein, funder_type) are preserved;
 * we only overwrite the time-sensitive fields. Rows with `ein_verified=false`
 * are skipped (their EIN may resolve to a wrong org on ProPublica's side).
 *
 * Rate-limited to 1 req/s — ProPublica's unofficial limit. Sequential by
 * design.
 *
 * No Claude. No embeddings. $0.
 *
 * Triggered:
 *   - GET /api/cron/refresh-propublica (Vercel cron, nightly 04:00 UTC)
 *   - POST /api/admin/refresh-propublica (manual)
 */

import { createServerClient } from '@/lib/supabase';

const PP_BASE = 'https://projects.propublica.org/nonprofits/api/v2';
const UA      = 'FundirBot/1.0 (+https://www.fundir.ai)';
const RATE_DELAY_MS = 1100;

let lastReqAt = 0;
async function rateLimit() {
  const elapsed = Date.now() - lastReqAt;
  if (elapsed < RATE_DELAY_MS) await new Promise(r => setTimeout(r, RATE_DELAY_MS - elapsed));
  lastReqAt = Date.now();
}

interface PPOrg {
  ein:           number;
  name:          string;
  city:          string;
  state:         string;
  ntee_code:     string | null;
  income_amount: number | null;
  asset_amount:  number | null;
  revenue_amount: number | null;
}

interface PPFiling {
  tax_prd_yr:   number;
  totrevenue?:  number;
  totassetsend?:number;
}

interface PPOrgResponse {
  organization?:        PPOrg;
  filings_with_data?:   PPFiling[];
  error?:               string;
}

/** Fetch and normalize one org record. null on 404 / error. */
async function fetchOrg(ein: string): Promise<{ org: PPOrg; latestFiling: PPFiling | null } | null> {
  const cleanEin = ein.replace(/\D/g, '');
  if (cleanEin.length !== 9) return null;

  await rateLimit();
  const res = await fetch(`${PP_BASE}/organizations/${cleanEin}.json`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const json = (await res.json()) as PPOrgResponse;
  if (!json.organization || json.error) return null;

  const filings = json.filings_with_data ?? [];
  const latest = filings[0] ?? null;
  return { org: json.organization, latestFiling: latest };
}

interface PPSearchHit {
  ein:       number;
  name:      string;
  city:      string;
  state:     string;
  ntee_code: string | null;
}

/**
 * Auto-discovery on 404. Search ProPublica by name (+ optional state)
 * and return the top hit IF it looks like a confident match — same name
 * tokens, IL or matching state, no obvious ambiguity. Returns null when
 * the result set is empty, conflicting, or unconfident.
 */
async function searchForOrg(name: string, state?: string | null): Promise<PPSearchHit | null> {
  // Normalize: strip common suffixes and punctuation that throw off the
  // search but aren't part of the actual org name.
  const cleanName = name
    .replace(/N\.A\.|Inc\.?|LLC|, ?N\.A\.|,/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanName.length < 4) return null;

  await rateLimit();
  const url = `${PP_BASE}/search.json?q=${encodeURIComponent(cleanName)}${state ? `&state%5Bid%5D=${state}` : ''}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const j = (await res.json()) as { organizations?: PPSearchHit[] };
  const hits = j.organizations ?? [];
  if (hits.length === 0) return null;

  // Confidence check: top hit's name must share at least one substantive
  // word with the query AND be the only one in the matching state, OR
  // be the only match overall.
  const tokens = cleanName.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const top = hits[0];
  const topShares = tokens.some(t => top.name.toLowerCase().includes(t));
  if (!topShares) return null;
  // If there are multiple hits in the same state with similar names, skip
  // (ambiguity → safer to leave the manual flag).
  const inState = state ? hits.filter(h => h.state === state) : hits;
  if (inState.length > 1) {
    const secondShares = tokens.some(t => inState[1].name.toLowerCase().includes(t));
    if (secondShares) return null;
  }
  return top;
}

// ── Funder refresh ─────────────────────────────────────────────────────────

export interface RefreshResult {
  funders_seen:    number;
  funders_refreshed: number;
  funders_skipped: number;
  funders_404:     number;
  funders_auto_corrected: number;
  recipients_seen: number;
  recipients_refreshed: number;
  recipients_skipped: number;
  recipients_404:  number;
  recipients_auto_corrected: number;
  errors:          string[];
}

export async function refreshFromPropublica(opts?: { funder_limit?: number; recipient_limit?: number }): Promise<RefreshResult> {
  const db = createServerClient();
  const errors: string[] = [];

  // ── Funders ──────────────────────────────────────────────────────────
  // Only refresh rows that have a non-null EIN and aren't flagged
  // ein_verified=false (which means the EIN is known-wrong). We also
  // skip rows whose metadata.ein_convention='bank_charter' — banks
  // intentionally use a non-ProPublica-discoverable EIN.
  const { data: funders } = await db.from('funders')
    .select('id, ein, name, funder_type, metadata')
    .not('ein', 'is', null)
    .neq('funder_type', 'federal_agency')
    .neq('funder_type', 'state_local');
  const eligible = (funders ?? []).filter(f => {
    const m = (f.metadata ?? {}) as { ein_verified?: unknown; ein_convention?: unknown };
    if (m.ein_verified === false)                return false;
    if (m.ein_convention === 'bank_charter')     return false;
    return true;
  });
  const funderTarget = opts?.funder_limit ? eligible.slice(0, opts.funder_limit) : eligible;

  let funders_refreshed = 0;
  let funders_skipped = 0;
  let funders_404 = 0;
  let funders_auto_corrected = 0;

  for (const f of funderTarget) {
    let result = await fetchOrg(f.ein as string);

    // 404 → try name-based auto-discovery before flagging.
    if (!result) {
      const hint = await searchForOrg(f.name as string, 'IL');
      if (hint) {
        const newEin = String(hint.ein).padStart(9, '0');
        // Update the EIN before re-fetching (so subsequent refreshes use the corrected EIN).
        // Check for collision against the unique index first.
        const { data: collision } = await db.from('funders').select('id').eq('ein', newEin).maybeSingle();
        if (!collision || collision.id === f.id) {
          await db.from('funders').update({ ein: newEin }).eq('id', f.id);
          result = await fetchOrg(newEin);
          if (result) funders_auto_corrected += 1;
        }
      }
    }

    if (!result) {
      funders_404 += 1;
      const newMeta = { ...(f.metadata ?? {}) as Record<string, unknown>, ein_verified: false, ein_404_at: new Date().toISOString() };
      await db.from('funders').update({ metadata: newMeta }).eq('id', f.id);
      continue;
    }
    const { org, latestFiling } = result;
    const oldMeta = (f.metadata ?? {}) as Record<string, unknown>;
    const newMeta = {
      ...oldMeta,
      ein_verified:        true,
      city:                org.city,
      state:               org.state,
      ntee_code:           org.ntee_code,
      total_assets:        org.asset_amount,
      total_revenue:       org.revenue_amount,
      total_income:        org.income_amount,
      last_filing_year:    latestFiling?.tax_prd_yr ?? null,
      last_revenue:        latestFiling?.totrevenue ?? null,
      last_assets:         latestFiling?.totassetsend ?? null,
      pp_last_refreshed:   new Date().toISOString(),
      source:              'propublica_refresh_v1',
    };
    const { error } = await db.from('funders').update({ metadata: newMeta }).eq('id', f.id);
    if (error) { errors.push(`funder ${f.name} (${f.ein}): ${error.message}`); continue; }
    funders_refreshed += 1;
  }
  funders_skipped = (eligible.length - funderTarget.length) + ((funders ?? []).length - eligible.length);

  // ── Recipients ────────────────────────────────────────────────────────
  // Same logic. Skipping recipients whose EIN is null (most 990-PF entries)
  // since we have nothing to refresh on.
  const { data: recipients } = await db.from('recipients')
    .select('id, ein, name, metadata')
    .not('ein', 'is', null);
  // Skip recipients flagged ein_verified=false (already-known-wrong).
  const recipientEligible = (recipients ?? []).filter(r => {
    const m = (r.metadata ?? {}) as { ein_verified?: unknown };
    return m.ein_verified !== false;
  });
  const recipientTarget = opts?.recipient_limit ? recipientEligible.slice(0, opts.recipient_limit) : recipientEligible;

  let recipients_refreshed = 0;
  let recipients_404 = 0;
  let recipients_auto_corrected = 0;
  for (const r of recipientTarget) {
    let result = await fetchOrg(r.ein as string);

    if (!result) {
      const meta = (r.metadata ?? {}) as { state?: unknown };
      const state = typeof meta.state === 'string' ? meta.state : null;
      const hint = await searchForOrg(r.name as string, state);
      if (hint) {
        const newEin = String(hint.ein).padStart(9, '0');
        const { data: collision } = await db.from('recipients').select('id').eq('ein', newEin).maybeSingle();
        if (!collision || collision.id === r.id) {
          await db.from('recipients').update({ ein: newEin }).eq('id', r.id);
          result = await fetchOrg(newEin);
          if (result) recipients_auto_corrected += 1;
        }
      }
    }

    if (!result) {
      recipients_404 += 1;
      const newMeta = { ...(r.metadata ?? {}) as Record<string, unknown>, ein_verified: false, ein_404_at: new Date().toISOString() };
      await db.from('recipients').update({ metadata: newMeta }).eq('id', r.id);
      continue;
    }
    const { org, latestFiling } = result;
    const oldMeta = (r.metadata ?? {}) as Record<string, unknown>;
    const newMeta = {
      ...oldMeta,
      ein_verified:      true,
      city:              org.city,
      state:             org.state,
      ntee_code:         org.ntee_code,
      total_assets:      org.asset_amount,
      total_revenue:     org.revenue_amount,
      last_filing_year:  latestFiling?.tax_prd_yr ?? null,
      pp_last_refreshed: new Date().toISOString(),
      source:            'propublica_refresh_v1',
    };
    const { error } = await db.from('recipients').update({ metadata: newMeta, ntee_code: org.ntee_code ?? r.metadata?.ntee_code ?? null }).eq('id', r.id);
    if (error) { errors.push(`recipient ${r.name} (${r.ein}): ${error.message}`); continue; }
    recipients_refreshed += 1;
  }

  return {
    funders_seen:        funderTarget.length,
    funders_refreshed,
    funders_skipped,
    funders_404,
    funders_auto_corrected,
    recipients_seen:     recipientTarget.length,
    recipients_refreshed,
    recipients_skipped:  (recipients ?? []).length - recipientTarget.length,
    recipients_404,
    recipients_auto_corrected,
    errors,
  };
}
