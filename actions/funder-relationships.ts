'use server';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';

export type RelationshipStatus = 'existing' | 'prospect' | 'declined' | 'dormant';
export type RelationshipSource = 'self_reported' | 'derived_990' | 'manual';

const VALID_STATUSES: readonly RelationshipStatus[] = ['existing','prospect','declined','dormant'];

// ── Read ─────────────────────────────────────────────────────────────────────

export interface FunderRelationshipRow {
  funder_id:    string;
  funder_name:  string;
  funder_type:  string;
  ein:          string | null;
  status:       RelationshipStatus;
  source:       RelationshipSource;
  notes:        string | null;
  recorded_at:  string;
}

export async function listRelationships(): Promise<{ rows: FunderRelationshipRow[] }> {
  const ctx = await getAuthContext();
  if (!ctx) return { rows: [] };
  const db = createServerClient();
  const { data } = await db.from('org_funder_relationships')
    .select('funder_id, status, source, notes, recorded_at, funder:funders(name, ein, funder_type)')
    .eq('organization_id', ctx.orgId)
    .order('recorded_at', { ascending: false });

  const rows: FunderRelationshipRow[] = (data ?? []).map(r => {
    const f = Array.isArray(r.funder) ? r.funder[0] : r.funder;
    return {
      funder_id:   r.funder_id as string,
      funder_name: (f?.name as string) ?? '(unknown)',
      funder_type: (f?.funder_type as string) ?? '',
      ein:         (f?.ein as string | null) ?? null,
      status:      r.status as RelationshipStatus,
      source:      r.source as RelationshipSource,
      notes:       (r.notes as string | null) ?? null,
      recorded_at: r.recorded_at as string,
    };
  });
  return { rows };
}

// ── Funder search ───────────────────────────────────────────────────────────

export interface FunderSearchHit {
  funder_id:   string;
  name:        string;
  ein:         string | null;
  funder_type: string;
  city:        string | null;
  state:       string | null;
}

export async function searchFunders(query: string): Promise<{ hits: FunderSearchHit[] }> {
  const q = query.trim();
  if (q.length < 2) return { hits: [] };
  const ctx = await getAuthContext();
  if (!ctx) return { hits: [] };
  const db = createServerClient();

  // ILIKE on name first; EIN substring also covered when q is digits.
  const isEin = /^\d{6,9}$/.test(q.replace(/\D/g, ''));
  const builder = db.from('funders')
    .select('id, name, ein, funder_type, metadata')
    .limit(8);
  const { data } = isEin
    ? await builder.or(`ein.eq.${q.replace(/\D/g, '').padStart(9, '0')},name.ilike.%${q}%`)
    : await builder.ilike('name', `%${q}%`);

  return {
    hits: (data ?? []).map(f => {
      const meta = (f.metadata ?? {}) as { city?: unknown; state?: unknown };
      return {
        funder_id:   f.id as string,
        name:        f.name as string,
        ein:         (f.ein as string | null) ?? null,
        funder_type: (f.funder_type as string) ?? '',
        city:        typeof meta.city  === 'string' ? meta.city  : null,
        state:       typeof meta.state === 'string' ? meta.state : null,
      };
    }),
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function upsertRelationship(input: {
  funder_id: string;
  status:    RelationshipStatus;
  notes?:    string;
  source?:   RelationshipSource;
}): Promise<{ success: boolean; error?: string }> {
  if (!VALID_STATUSES.includes(input.status)) return { success: false, error: 'invalid status' };
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: 'unauthenticated' };
  const db = createServerClient();
  const { error } = await db.from('org_funder_relationships').upsert({
    organization_id: ctx.orgId,
    funder_id:       input.funder_id,
    status:          input.status,
    source:          input.source ?? 'self_reported',
    notes:           input.notes  ?? null,
    recorded_at:     new Date().toISOString(),
  }, { onConflict: 'organization_id,funder_id' });
  if (error) return { success: false, error: error.message };
  revalidatePath('/org/relationships');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function removeRelationship(funder_id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: 'unauthenticated' };
  const db = createServerClient();
  const { error } = await db.from('org_funder_relationships')
    .delete()
    .eq('organization_id', ctx.orgId)
    .eq('funder_id', funder_id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/org/relationships');
  revalidatePath('/dashboard');
  return { success: true };
}
