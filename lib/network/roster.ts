// Phase 4 — public roster/bio harvesting for high-value foundations.
//
// Given a foundation's website, find the pages that plausibly hold board or
// leadership bios (link text/href heuristics + common paths), then run the
// D4 bio extractor ONLY for trustees whose surname actually appears on the
// page text. Bounded per foundation so a run can never balloon in Claude
// spend; every stored fact cites the page URL.

import { createServerClient } from '@/lib/supabase';
import { fetchPublicText, extractBio, applyBio } from '@/lib/network/bio';
import { normalizeOrgName } from '@/lib/network/normalize';

type Db = ReturnType<typeof createServerClient>;
const UA = 'FundirBot/1.0 (+https://www.fundir.ai; nonprofit research)';

/** Public websites of foundations that recur in CYC's world; applied to org nodes by name. */
export const KNOWN_FOUNDATION_SITES: Record<string, string> = {
  'joyce foundation': 'https://www.joycefdn.org',
  'robert r mccormick foundation': 'https://www.mccormickfoundation.org',
  'polk bros foundation': 'https://www.polkbrosfdn.org',
  'chicago community trust': 'https://www.cct.org',
  'crown family philanthropies': 'https://www.crownfamilyphilanthropies.org',
  'steans family foundation': 'https://www.steansfamilyfoundation.org',
  'pritzker traubert foundation': 'https://www.ptfound.org',
  'john d and catherine t macarthur foundation': 'https://www.macfound.org',
  'builders initiative': 'https://www.buildersinitiative.org',
  'woods fund chicago': 'https://www.woodsfund.org',
  'alphawood foundation': 'https://www.alphawoodfoundation.org',
  'field foundation of illinois': 'https://www.fieldfoundation.org',
  'lloyd a fry foundation': 'https://www.fryfoundation.org',
  'grand victoria foundation': 'https://www.grandvictoriafdn.org',
  'wieboldt foundation': 'https://www.wieboldt.org',
  'michael reese health trust': 'https://www.michaelreesetrust.org',
  'northern trust foundation': 'https://www.northerntrust.com/united-states/about-us/corporate-social-responsibility',
  'exelon foundation': 'https://www.exeloncorp.com/community/exelon-foundation',
  'wintrust financial foundation': 'https://www.wintrust.com/about-us/community',
};

/** Fill network_organizations.website from the curated map where empty. */
export async function applyKnownSites(db: Db): Promise<number> {
  let n = 0;
  for (const [key, site] of Object.entries(KNOWN_FOUNDATION_SITES)) {
    const { data } = await db.from('network_organizations').select('id, website').eq('normalized_name', key).limit(3);
    for (const o of data ?? []) if (!o.website) { await db.from('network_organizations').update({ website: site }).eq('id', o.id); n++; }
  }
  return n;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const ROSTER_HINT = /board|trustee|director|leadership|our-team|our_team|team|people|who-we-are|staff|about/i;
const GUESS_PATHS = ['/about/board', '/about-us/board', '/about/board-of-directors', '/about-us/board-of-directors', '/board', '/board-of-directors', '/leadership', '/about/leadership', '/about-us/leadership', '/our-team', '/about/our-team', '/about-us/our-team', '/who-we-are', '/about/staff', '/about-us/our-people', '/people'];

/** Candidate pages likely to hold roster bios: linked from the homepage, plus common paths. */
export async function findRosterPages(website: string, max = 8): Promise<string[]> {
  const base = new URL(website);
  const found = new Set<string>();
  try {
    const html = await fetchHtml(website);
    for (const m of html.matchAll(/<a[^>]+href=["']([^"'#?]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
      const href = m[1], text = m[2].replace(/<[^>]+>/g, ' ');
      if (!ROSTER_HINT.test(href) && !ROSTER_HINT.test(text)) continue;
      try { const u = new URL(href, base); if (u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '')) found.add(u.href.replace(/\/$/, '')); } catch { /* skip */ }
    }
  } catch { /* homepage unreachable: fall through to guesses */ }
  for (const p of GUESS_PATHS) found.add(new URL(p, base).href.replace(/\/$/, ''));
  // Prefer explicit roster words in the path.
  return [...found].sort((a, b) => Number(ROSTER_HINT.test(new URL(b).pathname)) - Number(ROSTER_HINT.test(new URL(a).pathname))).slice(0, max);
}

const surname = (name: string) => name.replace(/\(.*?\)|,.*$/g, '').trim().split(/\s+/).filter(w => w.length > 1).pop()?.replace(/[^A-Za-z'-]/g, '') ?? '';

export interface HarvestReport { foundation: string; pagesTried: number; matched: number; extracted: number; claudeCalls: number; details: string[] }

/**
 * For one foundation: try roster pages; for each trustee whose surname
 * appears on a page, extract and store their bio. `maxCalls` bounds Claude.
 */
export async function harvestFoundationBios(
  db: Db, orgId: string, foundation: { id: string; name: string; website: string | null },
  trustees: Array<{ id: string; name: string }>, maxCalls = 12,
): Promise<HarvestReport> {
  const rep: HarvestReport = { foundation: foundation.name, pagesTried: 0, matched: 0, extracted: 0, claudeCalls: 0, details: [] };
  if (!foundation.website || !trustees.length) { rep.details.push('no website or no roster'); return rep; }
  const pending = new Map(trustees.map(t => [t.id, t]));
  let pages: string[] = [];
  try { pages = await findRosterPages(foundation.website); } catch (e) { rep.details.push(`discovery failed: ${e instanceof Error ? e.message : e}`); return rep; }

  for (const url of pages) {
    if (!pending.size || rep.claudeCalls >= maxCalls) break;
    let page: { text: string; title: string | null };
    try { page = await fetchPublicText(url); } catch { continue; }
    rep.pagesTried++;
    const lower = page.text.toLowerCase();
    for (const [id, t] of [...pending]) {
      const sn = surname(t.name).toLowerCase();
      if (sn.length < 3 || !lower.includes(sn)) continue;
      // Bios shorter than a sentence aren't worth a call.
      const idx = lower.indexOf(sn);
      if (page.text.slice(idx, idx + 600).split(/[.!?]/).length < 2) continue;
      rep.matched++;
      if (rep.claudeCalls >= maxCalls) break;
      rep.claudeCalls++;
      try {
        const bio = await extractBio({ url, text: page.text, personName: t.name });
        if (!bio) { rep.details.push(`${t.name}: not described on ${new URL(url).pathname}`); continue; }
        const r = await applyBio(orgId, id, bio, { url, title: page.title });
        rep.extracted++; pending.delete(id);
        rep.details.push(`${t.name}: ${r.employments} employments, ${r.educations} schools, ${r.boards} boards ← ${new URL(url).pathname}`);
      } catch (e) { rep.details.push(`${t.name}: ${e instanceof Error ? e.message : 'extraction failed'}`); }
    }
  }
  if (pending.size) rep.details.push(`${pending.size} trustee(s) not found on ${rep.pagesTried} page(s)`);
  return rep;
}

/** Convenience: the site for a foundation, from the node or the curated map. */
export function siteFor(name: string, website: string | null): string | null {
  return website || KNOWN_FOUNDATION_SITES[normalizeOrgName(name)] || null;
}
