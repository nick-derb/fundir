// Peer-nonprofit similarity — deterministic, component-scored, explainable.
//
// Replaces the workbook's placeholder similarity (0.6 / 0.4 by "same NTEE")
// with four components the brief names: program, geography, size and
// population. Each is a 0–1 score with a stated reason, and the overall
// similarity is a fixed weighted blend, so every peer can say WHY it is a
// peer. No model output is involved; the mission-embedding component is left
// null until organizational descriptions (not just names) are available.

import { createServerClient } from '@/lib/supabase';

export interface PeerCandidate {
  organization_id: string;
  name: string;
  ntee_code: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  revenue: number | null;
  total_assets: number | null;
  peer_category: string | null;
}

export interface PeerProfile {
  ntee: string;              // 'O20'
  revenue: number;           // annual revenue, dollars
  city: string;
  state: string;
  /** ZIP prefixes that fall inside the home county (Cook: 600–608; Chicago proper is 606–608). */
  cookCountyZipPrefixes: string[];
  keywords: RegExp;          // program vocabulary
}

/** CYC as the reference: youth centers (NTEE O20), ~$13.4M revenue, Chicago. */
export const CYC_PEER_PROFILE: PeerProfile = {
  ntee: 'O20',
  revenue: 13_400_000,
  city: 'Chicago',
  state: 'IL',
  cookCountyZipPrefixes: ['600', '601', '602', '603', '604', '605', '606', '607', '608'],
  keywords: /youth|boys|girls|children|child|teen|student|school|education|learning|mentor|after.?school|stem|science|workforce|career|financial literacy|entrepreneur|community center|settlement|family/i,
};

export interface PeerScore {
  similarity: number;
  components: { program: number; geography: number; size: number; population: number; mission: null };
  reasons: string[];
}

// NTEE major letters that are natural neighbors of youth development (O):
// B education, P human services, N recreation/sports, S community improvement.
const RELATED_MAJORS: Record<string, number> = { O: 0.75, B: 0.55, P: 0.5, N: 0.45, S: 0.35 };

export function scorePeer(c: PeerCandidate, p: PeerProfile = CYC_PEER_PROFILE): PeerScore {
  const reasons: string[] = [];
  const ntee = (c.ntee_code ?? '').toUpperCase().trim();
  const major = ntee[0] ?? '';

  // ── Program (0.40) ──
  let program: number;
  if (ntee && ntee === p.ntee) { program = 1; reasons.push(`Same NTEE code ${ntee} (youth centers)`); }
  else if (major && major === p.ntee[0]) { program = 0.8; reasons.push(`Same NTEE group ${major} (youth development)`); }
  else if (major && RELATED_MAJORS[major] != null) { program = RELATED_MAJORS[major]; reasons.push(`Related NTEE group ${major}`); }
  else program = ntee ? 0.15 : 0.3;
  if (p.keywords.test(c.name)) { program = Math.min(1, program + 0.15); reasons.push('Program vocabulary in name'); }

  // ── Geography (0.25) ──
  let geography: number;
  const city = (c.city ?? '').trim().toLowerCase();
  if (city === p.city.toLowerCase()) { geography = 1; reasons.push(`Based in ${p.city}`); }
  else if (p.cookCountyZipPrefixes.some(z => (c.zip ?? '').startsWith(z))) { geography = 0.9; reasons.push('Cook County'); }
  else if ((c.state ?? 'IL').toUpperCase() === p.state) { geography = 0.5; reasons.push(`${p.state}, outside ${p.city}`); }
  else geography = 0.15;

  // ── Size (0.15) — revenue band closeness; unknown revenue is neutral ──
  let size: number;
  const rev = Number(c.revenue) || Number(c.total_assets) || 0;
  if (!rev) size = 0.5;
  else {
    const ratio = Math.min(rev, p.revenue) / Math.max(rev, p.revenue);
    size = ratio >= 0.33 ? 1 : ratio >= 0.1 ? 0.7 : ratio >= 0.02 ? 0.4 : 0.2;
    if (size >= 0.7) reasons.push('Comparable budget size');
  }

  // ── Population (0.20) ──
  let population: number;
  const cat = (c.peer_category ?? '').toLowerCase();
  if (cat.includes('youth development')) { population = 1; reasons.push('Youth development category'); }
  else if (cat.includes('children') || cat.includes('youth')) { population = 0.9; reasons.push('Children & youth services'); }
  else if (/youth|children|child|teen|student|kids|boys|girls/i.test(c.name)) { population = 0.8; reasons.push('Serves young people (by name)'); }
  else population = 0.3;

  const similarity = Math.round((0.4 * program + 0.25 * geography + 0.15 * size + 0.2 * population) * 1000) / 1000;
  return { similarity, components: { program, geography, size, population, mission: null }, reasons };
}

export interface PeerRefreshReport { scored: number; top: Array<{ name: string; similarity: number; reasons: string[] }>; withFunders: number }

/** Re-score every peer row for the org and attach the funders known to fund each one. */
export async function refreshPeerSimilarity(orgId: string, profile: PeerProfile = CYC_PEER_PROFILE): Promise<PeerRefreshReport> {
  const db = createServerClient();
  const rows: Array<{ id: string; organization_id: string; org: { name: string; ntee_code: string | null; city: string | null; state: string | null; ein: string | null } | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('network_peer_orgs')
      .select('id, organization_id, org:network_organizations!network_peer_orgs_organization_id_fkey(name, ntee_code, city, state, ein)')
      .eq('org_id', orgId).order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as unknown as typeof rows));
    if (data.length < 1000) break;
  }

  // Workbook facts (category, revenue, zip) by EIN.
  const eins = rows.map(r => r.org?.ein).filter((e): e is string => !!e);
  const wb = new Map<string, { peer_category: string | null; revenue: number | null; total_assets: number | null; zip: string | null; city: string | null }>();
  for (let i = 0; i < eins.length; i += 500) {
    const { data } = await db.from('cyc_peer_orgs').select('ein, peer_category, revenue, total_assets, zip, city').eq('org_id', orgId).in('ein', eins.slice(i, i + 500));
    for (const r of data ?? []) wb.set(String(r.ein).padStart(9, '0'), r as never);
  }

  // Funders per peer from cited or seed funding events.
  const peerIds = rows.map(r => r.organization_id);
  const funders = new Map<string, Array<{ organization_id: string; name: string; events: number; last_year: number; cited: boolean }>>();
  for (let i = 0; i < peerIds.length; i += 300) {
    const { data } = await db.from('grants_made')
      .select('recipient_org_id, fiscal_year, source_url, funder:network_organizations!grants_made_funder_org_id_fkey(id, name)')
      .in('recipient_org_id', peerIds.slice(i, i + 300)).not('funder_org_id', 'is', null);
    for (const g of data ?? []) {
      const f = g.funder as unknown as { id: string; name: string } | null; if (!f) continue;
      const list = funders.get(g.recipient_org_id as string) ?? [];
      const cur = list.find(x => x.organization_id === f.id);
      if (cur) { cur.events++; cur.last_year = Math.max(cur.last_year, g.fiscal_year as number); cur.cited = cur.cited || !!g.source_url; }
      else list.push({ organization_id: f.id, name: f.name, events: 1, last_year: g.fiscal_year as number, cited: !!g.source_url });
      funders.set(g.recipient_org_id as string, list);
    }
  }

  let scored = 0, withFunders = 0;
  const top: PeerRefreshReport['top'] = [];
  for (const r of rows) {
    if (!r.org) continue;
    // The tenant is not its own peer (the workbook's peer sheet lists CYC too).
    if (r.org.ein === '362344429') { await db.from('network_peer_orgs').delete().eq('id', r.id); continue; }
    const w = r.org.ein ? wb.get(r.org.ein) : undefined;
    const s = scorePeer({
      organization_id: r.organization_id, name: r.org.name, ntee_code: r.org.ntee_code,
      city: w?.city ?? r.org.city, state: r.org.state, zip: w?.zip ?? null,
      revenue: w?.revenue ?? null, total_assets: w?.total_assets ?? null, peer_category: w?.peer_category ?? null,
    }, profile);
    const rf = funders.get(r.organization_id) ?? [];
    if (rf.length) withFunders++;
    const { error } = await db.from('network_peer_orgs').update({
      similarity: s.similarity,
      components: { ...s.components, reasons: s.reasons, model: 'peer_similarity_v1' },
      relevant_funders: rf.sort((a, b) => b.events - a.events || b.last_year - a.last_year).slice(0, 12),
      computed_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (!error) scored++;
    top.push({ name: r.org.name, similarity: s.similarity, reasons: s.reasons });
  }
  top.sort((a, b) => b.similarity - a.similarity);
  return { scored, top: top.slice(0, 10), withFunders };
}
