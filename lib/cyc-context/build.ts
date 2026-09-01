import { createServerClient } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';
import { fetchFunderWinRateSummary } from '@/lib/funder-win-rates';
import { getOrgFinancialProfile } from '@/lib/org-financials';

export interface ContextChunk { kind: string; title: string | null; text: string; }

function splitText(s: string, size = 1400): string[] {
  const clean = s.replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += size) out.push(clean.slice(i, i + size));
  return out;
}

/**
 * Assemble CYC's proprietary knowledge into small, self-contained, retrievable
 * chunks: real win/loss history (overall + per funder), board connections,
 * cultivation notes, the financial profile, and a peer summary.
 */
export async function buildCycContextChunks(orgId: string, orgCode: string): Promise<ContextChunk[]> {
  const db = createServerClient();
  const chunks: ContextChunk[] = [];

  // 1. Real grant track record.
  const track = await fetchFunderWinRateSummary(orgId);
  if (track.total > 0) {
    chunks.push({
      kind: 'track_record', title: 'Overall grant track record',
      text: `CYC has applied to ${track.total} foundations with a final decision: ${track.overall.wins} awarded, ${track.overall.losses} declined (${Math.round(track.overall.rawRate * 100)}% raw win rate; Bayesian-smoothed ${Math.round(track.foundationRate * 100)}%).`,
    });
    for (const f of track.byFunder) {
      chunks.push({
        kind: 'track_record', title: f.funder,
        text: `CYC's history with ${f.funder}: ${f.wins} awarded, ${f.losses} declined (smoothed win-rate ${Math.round(f.rate * 100)}%).`,
      });
    }
  }

  // 2. Board-member connections.
  const { data: board } = await db
    .from('funder_board_members')
    .select('foundation_name, member_name, title, connection_to_cyc, connection_type, who_knows_them, outreach_status')
    .eq('org_id', orgId);
  for (const b of board ?? []) {
    chunks.push({
      kind: 'board', title: `${b.foundation_name} — ${b.member_name}`,
      text: `Board connection at ${b.foundation_name}: ${b.member_name}${b.title ? `, ${b.title}` : ''}. Connection to CYC: ${b.connection_to_cyc ?? 'unknown'}${b.connection_type ? ` (${b.connection_type})` : ''}.${b.who_knows_them ? ` Known by: ${b.who_knows_them}.` : ''}${b.outreach_status ? ` Outreach status: ${b.outreach_status}.` : ''}`,
    });
  }

  // 3. Cultivation targets + CYC's own notes.
  const { data: cult } = await db
    .from('cyc_cultivation')
    .select('foundation_name, funder_type, total_assets, funding_focus, funding_range, notes')
    .eq('org_id', orgId);
  for (const c of cult ?? []) {
    chunks.push({
      kind: 'cultivation', title: c.foundation_name,
      text: `Cultivation target ${c.foundation_name}${c.funder_type ? ` (${c.funder_type})` : ''}${c.total_assets ? `, ~$${Math.round(Number(c.total_assets) / 1e6)}M assets` : ''}.${c.funding_focus ? ` Focus: ${c.funding_focus}.` : ''}${c.funding_range ? ` Typical range: ${c.funding_range}.` : ''}${c.notes ? ` CYC notes: ${c.notes}` : ''}`,
    });
  }

  // 4. Financial profile (chunked).
  const fin = await getOrgFinancialProfile(orgCode);
  const intel = fin?.buildIntelligenceContext?.() ?? '';
  splitText(intel).forEach((t, i) => chunks.push({ kind: 'financial', title: `Financial profile (${i + 1})`, text: t }));

  // 5. Peer set summary.
  const { data: peers } = await db.from('cyc_peer_orgs').select('peer_category').eq('org_id', orgId);
  if (peers?.length) {
    const cats: Record<string, number> = {};
    for (const p of peers) { const c = (p.peer_category as string) || 'Uncategorized'; cats[c] = (cats[c] ?? 0) + 1; }
    const catStr = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).join(', ');
    chunks.push({
      kind: 'peers', title: 'Peer youth organizations',
      text: `CYC's peer set spans ${peers.length} youth/out-of-school-time organizations. Categories: ${catStr}. Funders who support these peers are strong prospects for CYC.`,
    });
  }

  return chunks.filter(c => c.text.trim().length > 0);
}

/** Rebuild the whole CYC context index (clear + re-embed). Returns chunk count. */
export async function indexCycContext(orgId: string, orgCode: string): Promise<{ chunks: number }> {
  const chunks = await buildCycContextChunks(orgId, orgCode);
  const db = createServerClient();
  await db.from('cyc_context_chunks').delete().eq('org_id', orgId);

  let n = 0;
  for (const c of chunks) {
    const embedding = await generateEmbedding(`${c.title ? c.title + '. ' : ''}${c.text}`);
    const { error } = await db.from('cyc_context_chunks').insert({
      org_id: orgId, kind: c.kind, title: c.title, text: c.text, embedding,
    });
    if (!error) n++;
  }
  return { chunks: n };
}
