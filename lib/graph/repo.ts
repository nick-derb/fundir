/**
 * 990 graph repository — typed read/write over funders / recipients /
 * grants_made. Uses the service-role client because writes are
 * service-only (RLS denies all writes; SELECT is open to authenticated).
 *
 * Identity resolution (Phase 2C) for recipients lives in
 * `lib/graph/identity.ts`; this file is the dumb data layer.
 */

import { createServerClient } from '@/lib/supabase';
import type { FunderRow, RecipientRow, GrantsMadeRow, FunderType } from './types';

// ── funders ─────────────────────────────────────────────────────────────────

export async function findFunderByEin(ein: string): Promise<FunderRow | null> {
  if (!ein) return null;
  const db = createServerClient();
  const { data, error } = await db
    .from('funders')
    .select('*')
    .eq('ein', ein)
    .maybeSingle();
  if (error) throw new Error(`findFunderByEin: ${error.message}`);
  return (data as FunderRow) ?? null;
}

export interface UpsertFunderInput {
  ein:         string | null;
  name:        string;
  funder_type: FunderType;
  metadata?:   Record<string, unknown>;
}

/**
 * UPSERT semantics on EIN when present; INSERT-and-return when EIN is
 * null (federal agencies). Returns the row.
 */
export async function upsertFunder(input: UpsertFunderInput): Promise<FunderRow> {
  const db = createServerClient();

  if (input.ein) {
    const { data, error } = await db
      .from('funders')
      .upsert(
        {
          ein:         input.ein,
          name:        input.name,
          funder_type: input.funder_type,
          metadata:    input.metadata ?? {},
        },
        { onConflict: 'ein' },
      )
      .select('*')
      .single();
    if (error) throw new Error(`upsertFunder(${input.ein}): ${error.message}`);
    return data as FunderRow;
  }

  // No EIN — federal agency case. We can't UPSERT; INSERT and rely on the
  // caller having checked existence first.
  const { data, error } = await db
    .from('funders')
    .insert({
      ein:         null,
      name:        input.name,
      funder_type: input.funder_type,
      metadata:    input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error) throw new Error(`upsertFunder(no-ein, ${input.name}): ${error.message}`);
  return data as FunderRow;
}

// ── recipients ─────────────────────────────────────────────────────────────

export async function findRecipientByEin(ein: string): Promise<RecipientRow | null> {
  if (!ein) return null;
  const db = createServerClient();
  const { data, error } = await db
    .from('recipients')
    .select('*')
    .eq('ein', ein)
    .maybeSingle();
  if (error) throw new Error(`findRecipientByEin: ${error.message}`);
  return (data as RecipientRow) ?? null;
}

export interface UpsertRecipientInput {
  ein:             string | null;
  name:            string;
  ntee_code?:      string | null;
  organization_id?: string | null;
  metadata?:       Record<string, unknown>;
}

export async function upsertRecipient(input: UpsertRecipientInput): Promise<RecipientRow> {
  const db = createServerClient();

  if (input.ein) {
    const { data, error } = await db
      .from('recipients')
      .upsert(
        {
          ein:             input.ein,
          name:            input.name,
          ntee_code:       input.ntee_code ?? null,
          organization_id: input.organization_id ?? null,
          metadata:        input.metadata ?? {},
        },
        { onConflict: 'ein' },
      )
      .select('*')
      .single();
    if (error) throw new Error(`upsertRecipient(${input.ein}): ${error.message}`);
    return data as RecipientRow;
  }

  // No EIN — most 990-PF grant-schedule entries land here. INSERT a fresh
  // row; the identity layer is responsible for dedupe-by-fuzzy-match.
  const { data, error } = await db
    .from('recipients')
    .insert({
      ein:             null,
      name:            input.name,
      ntee_code:       input.ntee_code ?? null,
      organization_id: input.organization_id ?? null,
      metadata:        input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error) throw new Error(`upsertRecipient(no-ein, ${input.name}): ${error.message}`);
  return data as RecipientRow;
}

/**
 * Trigram-based fuzzy candidate search for the identity-resolution layer.
 * Returns the top N by name similarity, optionally narrowed by state
 * (matched against recipients.metadata->>'state') or NTEE prefix.
 *
 * Cheap — pg_trgm + the GIN index on recipients.name make this an
 * indexed lookup, not a sequential scan.
 */
export async function findRecipientCandidates(
  name: string,
  opts?: { state?: string | null; ntee_prefix?: string | null; limit?: number },
): Promise<RecipientRow[]> {
  const limit = opts?.limit ?? 10;
  const db = createServerClient();

  // pg_trgm similarity threshold is implicit — we sort by similarity
  // and let the caller decide the score cutoff. Postgres returns rows
  // ordered by `name <-> $1` (trigram distance, smaller = closer).
  const sql = `
    SELECT r.*, similarity(r.name, $1) AS sim
      FROM recipients r
      WHERE r.name % $1
        ${opts?.state       ? `AND r.metadata->>'state' = $2` : ''}
        ${opts?.ntee_prefix ? `AND r.ntee_code LIKE $${opts?.state ? 3 : 2} || '%'` : ''}
      ORDER BY r.name <-> $1
      LIMIT ${limit}
  `;
  const params: string[] = [name];
  if (opts?.state)       params.push(opts.state);
  if (opts?.ntee_prefix) params.push(opts.ntee_prefix);

  const { data, error } = await db.rpc('exec_sql', { sql, params });
  if (error) {
    // exec_sql RPC may not exist on a fresh project; fall back to the
    // standard query builder with an `ilike` prefix (less precise but
    // works against any Supabase project without extra RPCs).
    const { data: fb, error: fbErr } = await db
      .from('recipients')
      .select('*')
      .ilike('name', `${name.slice(0, 12)}%`)
      .limit(limit);
    if (fbErr) throw new Error(`findRecipientCandidates fallback: ${fbErr.message}`);
    return (fb as RecipientRow[]) ?? [];
  }
  return (data as RecipientRow[]) ?? [];
}

// ── grants_made ────────────────────────────────────────────────────────────

export interface UpsertGrantsMadeInput {
  funder_id:      string;
  recipient_id:   string;
  amount:         number;
  fiscal_year:    number;
  purpose?:       string | null;
  source:         string;            // adapter_key
  data_freshness: string;            // ISO date
  confidence?:    number;
  raw?:           Record<string, unknown> | null;
}

/**
 * Upsert one edge keyed by (funder, recipient, year, source). Re-runs
 * are no-ops for unchanged edges; amount/purpose updates land on top.
 */
export async function upsertGrantsMade(input: UpsertGrantsMadeInput): Promise<GrantsMadeRow> {
  const db = createServerClient();
  const { data, error } = await db
    .from('grants_made')
    .upsert(
      {
        funder_id:      input.funder_id,
        recipient_id:   input.recipient_id,
        amount:         input.amount,
        fiscal_year:    input.fiscal_year,
        purpose:        input.purpose ?? null,
        source:         input.source,
        data_freshness: input.data_freshness,
        confidence:     input.confidence ?? 1.0,
        raw:            input.raw ?? null,
      },
      { onConflict: 'funder_id,recipient_id,fiscal_year,source' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`upsertGrantsMade: ${error.message}`);
  return data as GrantsMadeRow;
}

// ── ingest_state (Phase 2D) ────────────────────────────────────────────────

export interface IngestStateRow {
  adapter_key:  string;
  batch_key:    string;
  cursor:       string | null;
  last_run_at:  string;
  records_seen: number;
  records_kept: number;
  errors:       number;
  last_error:   string | null;
}

export async function readIngestState(adapterKey: string, batchKey: string): Promise<IngestStateRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from('ingest_state')
    .select('*')
    .eq('adapter_key', adapterKey)
    .eq('batch_key', batchKey)
    .maybeSingle();
  if (error) throw new Error(`readIngestState: ${error.message}`);
  return (data as IngestStateRow) ?? null;
}

export async function writeIngestState(row: Omit<IngestStateRow, 'last_run_at'>): Promise<void> {
  const db = createServerClient();
  const { error } = await db.from('ingest_state').upsert({
    ...row,
    last_run_at: new Date().toISOString(),
  }, { onConflict: 'adapter_key,batch_key' });
  if (error) throw new Error(`writeIngestState: ${error.message}`);
}
