/**
 * Phase 3B — one-shot hand-curated CYC graph seed runner.
 *
 * Reads CYC_PEERS + CYC_FUNDER_EDGES (lib/graph/seed-cyc-graph.ts),
 * upserts each peer into `recipients` via the Phase 2C identity
 * resolver, links them to CYC's organization_id via `peer_orgs`, then
 * walks the edge list and upserts each (funder, peer, year) into
 * `grants_made`.
 *
 * Idempotent — every UPSERT honors its natural key, so re-running over
 * an already-seeded state is a cheap no-op on unchanged rows. Returns a
 * summary the admin endpoint surfaces.
 */

import { createServerClient } from '@/lib/supabase';
import { findFunderByEin, upsertGrantsMade } from './repo';
import { resolveRecipient } from './identity';
import { CYC_PEERS, CYC_FUNDER_EDGES, type PeerRecipientSeed } from './seed-cyc-graph';

const CYC_ORG_CODE = 'CYC2025';

function normEin(ein: string): string {
  return ein.replace(/\D/g, '');
}

export interface SeedCycGraphResult {
  org_id:           string | null;
  peers_seeded:     number;
  peer_links:       number;
  edges_seen:       number;
  edges_inserted:   number;
  edges_skipped:    number;
  warnings:         string[];
  errors:           string[];
}

export async function seedCycGraph(): Promise<SeedCycGraphResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const db = createServerClient();

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id')
    .eq('org_code', CYC_ORG_CODE)
    .maybeSingle();
  if (orgErr || !org) {
    return {
      org_id: null,
      peers_seeded: 0, peer_links: 0,
      edges_seen: 0, edges_inserted: 0, edges_skipped: 0,
      warnings, errors: [`CYC org not found: ${orgErr?.message ?? 'no row'}`],
    };
  }
  const orgId = org.id as string;

  // ── 1. Resolve each peer to a recipient row + link via peer_orgs ─────────
  let peers_seeded = 0;
  let peer_links   = 0;
  const peerByName = new Map<string, string>(); // peer name → recipient_id

  for (const p of CYC_PEERS) {
    try {
      const resolved = await resolveRecipient({
        ein:       p.ein ? normEin(p.ein) : null,
        name:      p.name,
        state:     p.state,
        ntee_code: p.ntee_code,
        metadata:  { source: 'cyc_peer_seed_v1' },
      });
      peerByName.set(p.name, resolved.recipient.id);
      peers_seeded += 1;

      const { error: linkErr } = await db
        .from('peer_orgs')
        .upsert(
          {
            organization_id:   orgId,
            peer_recipient_id: resolved.recipient.id,
            similarity:        p.similarity,
            basis:             { rationale: p.basis, source: 'cyc_peer_seed_v1', resolved: resolved.source },
          },
          { onConflict: 'organization_id,peer_recipient_id' },
        );
      if (linkErr) {
        errors.push(`peer_orgs link ${p.name}: ${linkErr.message}`);
      } else {
        peer_links += 1;
      }
    } catch (err) {
      errors.push(`resolve ${p.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 2. Walk the edge list and UPSERT each grants_made row ────────────────
  let edges_inserted = 0;
  let edges_skipped  = 0;

  for (const e of CYC_FUNDER_EDGES) {
    const ein = normEin(e.funder_ein);
    let funder = await findFunderByEin(ein);
    if (!funder) {
      warnings.push(`unknown funder EIN ${ein} for edge → ${e.peer_name} — skipped`);
      edges_skipped += 1;
      continue;
    }
    const recipientId = peerByName.get(e.peer_name);
    if (!recipientId) {
      warnings.push(`unknown peer ${e.peer_name} in edge from ${ein} — skipped`);
      edges_skipped += 1;
      continue;
    }
    try {
      await upsertGrantsMade({
        funder_id:      funder.id,
        recipient_id:   recipientId,
        amount:         e.amount,
        fiscal_year:    e.fiscal_year,
        purpose:        e.purpose,
        source:         'cyc_graph_seed_v1',
        data_freshness: `${e.fiscal_year}-12-31`,
        confidence:     e.confidence,
      });
      edges_inserted += 1;
    } catch (err) {
      errors.push(`edge ${ein}→${e.peer_name} FY${e.fiscal_year}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    org_id: orgId,
    peers_seeded, peer_links,
    edges_seen: CYC_FUNDER_EDGES.length,
    edges_inserted, edges_skipped,
    warnings, errors,
  };
}

/** Convenience export so a future test/UI surface can introspect the seed. */
export function describeCycPeers(): readonly PeerRecipientSeed[] {
  return CYC_PEERS;
}
