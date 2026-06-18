/**
 * CRA Intelligence — Workstream A data layer.
 *
 * `loadCraIntelligence(orgId)` is the panel's single hot read. It walks
 * the (org → tract → bank_assessment_areas → funders) graph already
 * built by Phase 4, joins each bank with the org's
 * org_funder_relationships row (defaulting to 'prospect' when absent),
 * and pulls peer-funding evidence from grants_made for the warm-lead
 * signal.
 *
 * Sort order (highest-value rows first):
 *   1. Prospect WITH peer signal       ← the warm prospects
 *   2. Existing WITH peer signal       ← deepen-and-cross-leverage
 *   3. Existing without peer signal    ← steady-state donor relationships
 *   4. Prospect without peer signal    ← longer-term outreach
 * Within each band, descending by (peer_count, peer_amount, recency).
 *
 * No Claude calls. No external APIs. One DB round-trip per call.
 */

import { createServerClient } from '@/lib/supabase';
import type { BankAaSource } from './types';

export type FunderRelationshipStatus = 'existing' | 'prospect' | 'declined' | 'dormant';
export type SuggestedAction          = 'deepen' | 'open' | 'monitor';

export interface PeerEdge {
  /** The peer's display name (e.g. "After School Matters"). */
  name:        string;
  /** The peer's recipient row id — useful for ProPublica deep-links. */
  recipient_id: string;
  /** Peer's EIN (where known) — feeds ProPublica nonprofit page link. */
  ein:         string | null;
  /** Sum of disclosed grants from this bank to this peer across recent years. */
  total_amount: number;
  /** Most recent disclosed fiscal year. */
  most_recent_year: number;
  /** Confidence on the edge from grants_made (0..1). */
  max_confidence: number;
}

export interface BankIntelligenceRow {
  funder_id:        string;
  bank_name:        string;
  fdic_id:          string | null;
  ein:              string | null;
  ein_verified:     boolean;
  /** Org-asserted relationship; defaults to 'prospect' when no
   *  org_funder_relationships row exists for this (org, funder). */
  relationship:     FunderRelationshipStatus;
  /** Member-editable note on the relationship row, if any. */
  notes:            string | null;
  /** Suggested action verb the UI surfaces.
   *    existing                       → 'deepen'
   *    prospect with peer signal      → 'open'
   *    prospect without peer signal   → 'monitor' */
  action:           SuggestedAction;
  /** Per-peer breakdown of disclosed funding edges from this bank. */
  peer_signal:      PeerEdge[];
  /** Convenience aggregates. */
  peer_signal_count: number;
  peer_total_amount: number;
  most_recent_year:  number | null;
  /** Provenance of the bank's AA coverage of the org's tract. */
  aa_source:        BankAaSource;
  /** Composite confidence 0..1: blends AA-source quality and peer-edge
   *  confidence. UI rows below 0.5 are hidden, not falsified. */
  confidence:       number;
  /** One-line rationale composed by the helper (no Claude). */
  rationale:        string;
  /** Outbound evidence links. */
  evidence_links:   Array<{ label: string; url: string }>;
}

/** Map relationship + peer signal → suggested action verb. */
function decideAction(relationship: FunderRelationshipStatus, peerCount: number): SuggestedAction {
  if (relationship === 'existing') return 'deepen';
  if (peerCount > 0)               return 'open';
  return 'monitor';
}

/** Confidence model: AA source carries the base; peer-edge confidence lifts
 *  it (or keeps it where it was if no peer signal). */
function deriveConfidence(aaSource: BankAaSource, peerEdges: PeerEdge[]): number {
  const base = aaSource === 'ffiec_aa'   ? 0.95
             : aaSource === 'cra_pe_pdf' ? 0.85
                                         : 0.70; // manual_seed
  if (peerEdges.length === 0) return base;
  const maxPeer = Math.max(...peerEdges.map(p => p.max_confidence));
  // Bias toward the lower of the two so we don't overstate when the AA
  // is hand-seeded.
  return Math.min(1, 0.6 * base + 0.4 * maxPeer);
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

/** Compose the one-line "why it qualifies" rationale. */
function composeRationale(
  relationship: FunderRelationshipStatus,
  community:    string | null,
  peerEdges:    PeerEdge[],
  bankName:     string,
): string {
  const peerCount = peerEdges.length;
  const tract     = community ?? 'service-area';

  if (relationship === 'existing' && peerCount > 0) {
    const names = peerEdges.slice(0, 2).map(p => p.name).join(', ');
    return `Existing supporter; also funds ${peerCount} of your peers (${names}). Cross-leverage the relationship for a larger ask.`;
  }
  if (relationship === 'existing') {
    return `${bankName}'s CRA assessment area covers your ${tract} tract. Existing relationship — steady-state.`;
  }
  if (peerCount > 0) {
    const top = peerEdges.slice(0, 2).map(p => `${p.name} (${fmtMoney(p.total_amount)})`).join(', ');
    return `Funds ${peerCount} of your peers — ${top}. CRA AA covers your ${tract} tract: credible peer-anchored entry.`;
  }
  return `${bankName}'s CRA AA covers your ${tract} tract. No peer-funding signal yet — longer-term outreach candidate.`;
}

/** Build the outbound evidence-link list for one bank row. */
function buildEvidenceLinks(
  fdicId:        string | null,
  bankName:      string,
  peerEdges:     PeerEdge[],
): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];
  if (fdicId) {
    // FFIEC institution lookup — authoritative CRA assessment-area
    // disclosure. Filing-year specific exam reports live one click in.
    links.push({
      label: 'FFIEC institution profile',
      url:   `https://ffiec.cfpb.gov/data-browser/institutions/${fdicId}`,
    });
  } else {
    links.push({
      label: `Search ${bankName} on FFIEC`,
      url:   `https://ffiec.cfpb.gov/data-browser/data/institutions?search=${encodeURIComponent(bankName)}`,
    });
  }
  // For the top peer, link to its ProPublica nonprofit page so the team
  // can confirm the funding relationship from the peer's own filings.
  const topPeer = peerEdges[0];
  if (topPeer?.ein) {
    const einDigits = topPeer.ein.replace(/\D/g, '');
    links.push({
      label: `${topPeer.name} 990 filings (ProPublica)`,
      url:   `https://projects.propublica.org/nonprofits/organizations/${einDigits}`,
    });
  }
  return links;
}

export async function loadCraIntelligence(orgId: string): Promise<BankIntelligenceRow[]> {
  const db = createServerClient();

  // ── 1. Resolve org's tract ──────────────────────────────────────────────
  const { data: org } = await db
    .from('organizations')
    .select('id, census_tract')
    .eq('id', orgId)
    .single();
  if (!org?.census_tract) return [];
  const tractId = org.census_tract as string;

  // Community label for the rationale.
  const { data: tract } = await db
    .from('census_tracts')
    .select('metadata')
    .eq('tract_id', tractId)
    .maybeSingle();
  const community = (() => {
    const m = (tract?.metadata ?? {}) as { community?: unknown };
    return typeof m.community === 'string' ? m.community : null;
  })();

  // ── 2. Bank AAs covering this tract + funder details, in one query ──────
  const { data: aaRows } = await db
    .from('bank_assessment_areas')
    .select(`
      source,
      funder:funders ( id, name, ein, metadata )
    `)
    .eq('tract_id', tractId);

  if (!aaRows || aaRows.length === 0) return [];

  // Shape each row into a working record.
  type WorkingBank = {
    funder_id:    string;
    bank_name:    string;
    fdic_id:      string | null;
    ein:          string | null;
    ein_verified: boolean;
    aa_source:    BankAaSource;
  };
  // Supabase types nested FK as array OR object depending on cardinality;
  // declared up-front so the type assertions below have a stable target.
  type RawFunder = { id?: unknown; name?: unknown; ein?: unknown; metadata?: unknown };

  const workingBanks: WorkingBank[] = aaRows
    .map(row => {
      const r = row as { source: unknown; funder: unknown };
      let funderObj: RawFunder | null = null;
      if (Array.isArray(r.funder)) funderObj = (r.funder[0] ?? null) as RawFunder | null;
      else if (r.funder && typeof r.funder === 'object') funderObj = r.funder as RawFunder;
      if (!funderObj || typeof funderObj.id !== 'string') return null;

      const meta = (funderObj.metadata ?? {}) as { fdic_id?: unknown; ein_verified?: unknown };
      const fdic_id = typeof meta.fdic_id === 'string' ? meta.fdic_id : null;
      const ein_verified = meta.ein_verified === false ? false : true;

      return {
        funder_id:    funderObj.id,
        bank_name:    typeof funderObj.name === 'string' ? funderObj.name : '(unnamed bank)',
        fdic_id,
        ein:          typeof funderObj.ein === 'string' ? funderObj.ein : null,
        ein_verified,
        aa_source:    r.source as BankAaSource,
      };
    })
    .filter((x): x is WorkingBank => x !== null);

  const bankFunderIds = workingBanks.map(b => b.funder_id);
  if (bankFunderIds.length === 0) return [];

  // ── 3. Org-asserted relationships for these banks ───────────────────────
  const { data: relRows } = await db
    .from('org_funder_relationships')
    .select('funder_id, status, notes')
    .eq('organization_id', orgId)
    .in('funder_id', bankFunderIds);

  const relByFunder = new Map<string, { status: FunderRelationshipStatus; notes: string | null }>();
  for (const r of (relRows ?? [])) {
    relByFunder.set(r.funder_id as string, {
      status: r.status as FunderRelationshipStatus,
      notes:  (r.notes as string | null) ?? null,
    });
  }

  // ── 4. Peer signal: grants_made edges from these banks to org's peers ───
  // (a) Pull the org's peer recipient ids.
  const { data: peerRows } = await db
    .from('peer_orgs')
    .select('peer_recipient_id')
    .eq('organization_id', orgId);
  const peerRecipientIds = (peerRows ?? []).map(p => p.peer_recipient_id as string);

  // (b) Resolve recipient display names + EINs for the peers (one query).
  let peerById = new Map<string, { name: string; ein: string | null }>();
  if (peerRecipientIds.length > 0) {
    const { data: recs } = await db
      .from('recipients')
      .select('id, name, ein')
      .in('id', peerRecipientIds);
    for (const r of (recs ?? [])) {
      peerById.set(r.id as string, {
        name: (r.name as string) ?? '',
        ein:  (r.ein as string | null) ?? null,
      });
    }
  }

  // (c) Edges from these banks → these peers.
  type GraphEdge = {
    funder_id: string;
    recipient_id: string;
    amount: number;
    fiscal_year: number;
    confidence: number;
  };
  let edges: GraphEdge[] = [];
  if (peerRecipientIds.length > 0) {
    const { data: edgeRows } = await db
      .from('grants_made')
      .select('funder_id, recipient_id, amount, fiscal_year, confidence')
      .in('funder_id',    bankFunderIds)
      .in('recipient_id', peerRecipientIds);
    edges = (edgeRows ?? []).map(r => ({
      funder_id:    r.funder_id    as string,
      recipient_id: r.recipient_id as string,
      amount:       Number(r.amount ?? 0),
      fiscal_year:  Number(r.fiscal_year ?? 0),
      confidence:   Number(r.confidence ?? 0),
    }));
  }

  // (d) Roll up: per funder → per peer (summed across years).
  type PerPeerRollup = Map<string, { total: number; mostRecent: number; maxConf: number }>;
  const rollupByFunder = new Map<string, PerPeerRollup>();
  for (const e of edges) {
    if (!rollupByFunder.has(e.funder_id)) rollupByFunder.set(e.funder_id, new Map());
    const perPeer = rollupByFunder.get(e.funder_id)!;
    const prev = perPeer.get(e.recipient_id);
    if (prev) {
      perPeer.set(e.recipient_id, {
        total:      prev.total + e.amount,
        mostRecent: Math.max(prev.mostRecent, e.fiscal_year),
        maxConf:    Math.max(prev.maxConf, e.confidence),
      });
    } else {
      perPeer.set(e.recipient_id, {
        total:      e.amount,
        mostRecent: e.fiscal_year,
        maxConf:    e.confidence,
      });
    }
  }

  // ── 5. Assemble + sort ──────────────────────────────────────────────────
  const rows: BankIntelligenceRow[] = workingBanks.map(bank => {
    const rel = relByFunder.get(bank.funder_id);
    const relationship: FunderRelationshipStatus = rel?.status ?? 'prospect';
    const perPeer = rollupByFunder.get(bank.funder_id) ?? new Map();

    const peerEdges: PeerEdge[] = [];
    for (const [recipientId, agg] of perPeer.entries()) {
      const meta = peerById.get(recipientId);
      if (!meta) continue;
      peerEdges.push({
        name:             meta.name,
        recipient_id:     recipientId,
        ein:              meta.ein,
        total_amount:     agg.total,
        most_recent_year: agg.mostRecent,
        max_confidence:   agg.maxConf,
      });
    }
    // Sort peer edges by total amount desc — biggest funding first.
    peerEdges.sort((a, b) => b.total_amount - a.total_amount);

    const peerCount         = peerEdges.length;
    const peerTotalAmount   = peerEdges.reduce((s, p) => s + p.total_amount, 0);
    const mostRecent        = peerEdges.length > 0
      ? Math.max(...peerEdges.map(p => p.most_recent_year))
      : null;

    return {
      funder_id:        bank.funder_id,
      bank_name:        bank.bank_name,
      fdic_id:          bank.fdic_id,
      ein:              bank.ein,
      ein_verified:     bank.ein_verified,
      relationship,
      notes:            rel?.notes ?? null,
      action:           decideAction(relationship, peerCount),
      peer_signal:      peerEdges,
      peer_signal_count: peerCount,
      peer_total_amount: peerTotalAmount,
      most_recent_year: mostRecent,
      aa_source:        bank.aa_source,
      confidence:       deriveConfidence(bank.aa_source, peerEdges),
      rationale:        composeRationale(relationship, community, peerEdges, bank.bank_name),
      evidence_links:   buildEvidenceLinks(bank.fdic_id, bank.bank_name, peerEdges),
    };
  });

  // Hide sub-threshold confidence rows — the brief's "wrong claim is
  // worse than no claim" discipline. Threshold matches the funder-
  // affinity factor's fuzzy-accept threshold (0.50).
  const visible = rows.filter(r => r.confidence >= 0.50);

  // Sort: rank-band first, then within-band by peer signal strength.
  const bandFor = (r: BankIntelligenceRow): number => {
    if (r.relationship === 'prospect' && r.peer_signal_count > 0) return 0;
    if (r.relationship === 'existing' && r.peer_signal_count > 0) return 1;
    if (r.relationship === 'existing')                            return 2;
    return 3;
  };
  visible.sort((a, b) => {
    const ba = bandFor(a), bb = bandFor(b);
    if (ba !== bb)                          return ba - bb;
    if (a.peer_signal_count !== b.peer_signal_count) return b.peer_signal_count - a.peer_signal_count;
    if (a.peer_total_amount !== b.peer_total_amount) return b.peer_total_amount - a.peer_total_amount;
    return (b.most_recent_year ?? 0) - (a.most_recent_year ?? 0);
  });

  return visible;
}
