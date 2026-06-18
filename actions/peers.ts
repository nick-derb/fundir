'use server';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import { upsertRecipient } from '@/lib/graph/repo';
import { scoreFunderIntelForOrg } from '@/lib/funder-intel/score';

const PP_BASE = 'https://projects.propublica.org/nonprofits/api/v2';
const UA      = 'FundirBot/1.0 (+https://www.fundir.ai)';

// ── Read ─────────────────────────────────────────────────────────────────────

export interface PeerListRow {
  peer_recipient_id: string;
  name:              string;
  ein:               string | null;
  ntee_code:         string | null;
  state:             string | null;
  city:              string | null;
  similarity:        number;
  basis:             string;
  added_at:          string;
}

export async function listPeers(): Promise<{ rows: PeerListRow[] }> {
  const ctx = await getAuthContext();
  if (!ctx) return { rows: [] };
  const db = createServerClient();
  const { data } = await db.from('peer_orgs')
    .select('peer_recipient_id, similarity, basis, computed_at, recipient:recipients(name, ein, ntee_code, metadata)')
    .eq('organization_id', ctx.orgId)
    .order('similarity', { ascending: false });

  const rows: PeerListRow[] = (data ?? []).map(r => {
    const rec = Array.isArray(r.recipient) ? r.recipient[0] : r.recipient;
    const meta = (rec?.metadata ?? {}) as { state?: unknown; city?: unknown };
    return {
      peer_recipient_id: r.peer_recipient_id as string,
      name:              (rec?.name as string) ?? '(unknown)',
      ein:               (rec?.ein as string | null) ?? null,
      ntee_code:         (rec?.ntee_code as string | null) ?? null,
      state:             typeof meta.state === 'string' ? meta.state : null,
      city:              typeof meta.city  === 'string' ? meta.city  : null,
      similarity:        Number(r.similarity),
      basis:             ((r.basis as { text?: unknown } | null)?.text as string) ?? (typeof r.basis === 'string' ? r.basis : ''),
      added_at:          r.computed_at as string,
    };
  });
  return { rows };
}

// ── ProPublica search ────────────────────────────────────────────────────────

export interface PeerSearchHit {
  ein:       string;
  name:      string;
  city:      string;
  state:     string;
  ntee_code: string | null;
}

export async function searchPeerCandidates(query: string, stateFilter?: string): Promise<{ hits: PeerSearchHit[] }> {
  const q = query.trim();
  if (q.length < 3) return { hits: [] };
  const ctx = await getAuthContext();
  if (!ctx) return { hits: [] };

  const url = `${PP_BASE}/search.json?q=${encodeURIComponent(q)}${stateFilter ? `&state%5Bid%5D=${stateFilter}` : ''}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) return { hits: [] };
  const j = (await res.json()) as { organizations?: Array<{ ein: number; name: string; city: string; state: string; ntee_code?: string | null }> };
  return {
    hits: (j.organizations ?? []).slice(0, 6).map(o => ({
      ein:       String(o.ein).padStart(9, '0'),
      name:      o.name,
      city:      o.city ?? '',
      state:     o.state ?? '',
      ntee_code: o.ntee_code ?? null,
    })),
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function addPeer(input: {
  ein:        string;
  name:       string;
  ntee_code?: string | null;
  state?:     string | null;
  city?:      string | null;
  similarity?: number;
  basis?:     string;
}): Promise<{ success: boolean; error?: string; peer_recipient_id?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: 'unauthenticated' };
  const cleanEin = input.ein.replace(/\D/g, '');
  if (cleanEin.length !== 9) return { success: false, error: 'invalid EIN' };

  // 1. Find-or-create the recipient row.
  let recipient;
  try {
    recipient = await upsertRecipient({
      ein:       cleanEin,
      name:      input.name,
      ntee_code: input.ntee_code ?? null,
      metadata:  {
        ...(input.state ? { state: input.state } : {}),
        ...(input.city  ? { city:  input.city  } : {}),
        source:    'peer_editor_v1',
        added_by:  ctx.email,
      },
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Insert / upsert the peer_orgs link.
  const db = createServerClient();
  const { error } = await db.from('peer_orgs').upsert({
    organization_id:   ctx.orgId,
    peer_recipient_id: recipient.id,
    similarity:        Math.min(1, Math.max(0.01, input.similarity ?? 0.80)),
    basis:             input.basis ? { text: input.basis, edited_by: ctx.email, edited_at: new Date().toISOString() } : { text: '', edited_by: ctx.email },
  }, { onConflict: 'organization_id,peer_recipient_id' });

  if (error) return { success: false, error: error.message };

  // 3. Rescore funder_intel — adding a peer changes prospect scores across
  //    every funder. Cheap (~17 funders × pure DB compute = <2 seconds).
  try { await scoreFunderIntelForOrg(ctx.orgCode); } catch { /* non-fatal */ }

  revalidatePath('/org/peers');
  revalidatePath('/dashboard');
  return { success: true, peer_recipient_id: recipient.id };
}

export async function removePeer(peer_recipient_id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: 'unauthenticated' };
  const db = createServerClient();
  const { error } = await db.from('peer_orgs')
    .delete()
    .eq('organization_id', ctx.orgId)
    .eq('peer_recipient_id', peer_recipient_id);
  if (error) return { success: false, error: error.message };

  try { await scoreFunderIntelForOrg(ctx.orgCode); } catch { /* non-fatal */ }
  revalidatePath('/org/peers');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updatePeerBasis(peer_recipient_id: string, basis: string, similarity?: number): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: 'unauthenticated' };
  const db = createServerClient();
  const patch: { basis: { text: string; edited_by: string; edited_at: string }; similarity?: number } = {
    basis: { text: basis, edited_by: ctx.email, edited_at: new Date().toISOString() },
  };
  if (typeof similarity === 'number') patch.similarity = Math.min(1, Math.max(0.01, similarity));
  const { error } = await db.from('peer_orgs')
    .update(patch)
    .eq('organization_id', ctx.orgId)
    .eq('peer_recipient_id', peer_recipient_id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/org/peers');
  return { success: true };
}
