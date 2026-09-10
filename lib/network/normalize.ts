// The one normalization module for the relationship graph.
//
// Replaces the four funder-type classifiers and two incompatible name
// normalizers found during inspection with a single set of pure functions.
// Everything here is deterministic and side-effect free, which is what makes
// identity decisions testable — and testable is what "never merge two people
// on a name match" requires.

// ── Text repair ─────────────────────────────────────────────────────────────

// cp1252's 0x80-0x9F block: the glyphs mojibake shows where a UTF-8
// continuation byte was decoded as Windows-1252. They map back by cp1252 BYTE,
// not by Unicode code point (the euro sign is U+20AC but the byte was 0x80).
const CP1252: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87,
  '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c, '\u017D': 0x8e, '\u2018': 0x91,
  '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u02DC': 0x98,
  '\u2122': 0x99, '\u0161': 0x9a, '\u203A': 0x9b, '\u0153': 0x9c, '\u017E': 0x9e, '\u0178': 0x9f,
};

/** Repair double-encoded UTF-8 (â€™ → ’). Keeps the fix only if it decodes cleanly. */
export function fixMojibake(s: string | null | undefined): string | null {
  if (!s) return s ?? null;
  // A UTF-8 lead byte shown as a Latin-1 glyph (0xC2-0xF0) followed by a cp1252 glyph or 0x80-0xBF glyph.
  if (!/[\u00C2-\u00F0](?:[\u0080-\u00BF]|[\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178])/.test(s)) return s;
  try {
    const bytes = new Uint8Array([...s].map(c => {
      const code = c.charCodeAt(0);
      if (code < 0x100) return code;
      const b = CP1252[c];
      if (b == null) throw new Error('not mojibake');
      return b;
    }));
    const fixed = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return fixed.length > 0 ? fixed : s;
  } catch {
    return s;
  }
}

export const clean = (v: unknown): string => fixMojibake(typeof v === 'string' ? v : v == null ? '' : String(v))?.trim() ?? '';

// ── Identifiers ─────────────────────────────────────────────────────────────

/** Canonical https://www.linkedin.com/in/<slug> — the identity key for a profile. */
export function canonicalLinkedInUrl(raw: string | null | undefined): string | null {
  const m = String(raw || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).replace(/\/+$/, '').toLowerCase();
  return slug ? `https://www.linkedin.com/in/${slug}` : null;
}

/** 9-digit EIN string (zero-padded, no hyphen) or null. Accepts numbers, "36-2344429", "36 2344429". */
export function normalizeEin(v: unknown): string | null {
  if (v == null || v === '') return null;
  const digits = String(v).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length > 9) return null;
  const padded = digits.padStart(9, '0');
  return /^0{9}$/.test(padded) ? null : padded;
}

export const formatEin = (ein: string | null | undefined): string =>
  ein && ein.length === 9 ? `${ein.slice(0, 2)}-${ein.slice(2)}` : (ein ?? '');

// ── Organization names ──────────────────────────────────────────────────────

/** Legal / generic tokens that carry no identity. Superset of graph/identity.ts's set. */
export const ORG_STOPWORDS = new Set([
  'the', 'of', 'and', '&', 'a', 'an', 'for',
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'llc', 'llp', 'lp', 'ltd', 'plc', 'na', 'n.a',
  'foundation', 'fdn', 'fund', 'funds', 'trust', 'charitable', 'philanthropies', 'philanthropy',
  'org', 'organization', 'group', 'holdings',
]);

/**
 * Curated employer aliases → one canonical display name. Chicago's corporate
 * and civic set as it appears on CYC's board page, funder rosters and 990s.
 * Keys are matched against the normalized form of the input.
 */
const EMPLOYER_ALIASES: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: 'JPMorgan Chase',        patterns: [/^jp ?morgan( chase)?( bank)?$/, /^chase( bank)?$/] },
  { canonical: 'BMO',                   patterns: [/^bmo( harris)?( bank)?( financial)?( group)?$/, /^bank of montreal$/, /^harris bank$/] },
  { canonical: 'Northern Trust',        patterns: [/^northern trust( corporation| company| bank)?$/] },
  { canonical: 'Huntington Bank',       patterns: [/^huntington( national)?( bank| bancshares)?$/] },
  { canonical: 'Bank of America',       patterns: [/^bank of america( corporation| bank)?$/, /^bofa$/, /^merrill( lynch)?$/] },
  { canonical: 'Wintrust',              patterns: [/^wintrust( financial)?( corporation)?$/] },
  { canonical: 'Fifth Third Bank',      patterns: [/^fifth third( bank| bancorp)?$/] },
  { canonical: 'Chicago Tribune',       patterns: [/^(chicago )?tribune( publishing| media| company)?$/] },
  { canonical: 'Kirkland & Ellis',      patterns: [/^kirkland( ellis)?$/] },
  { canonical: 'GTCR',                  patterns: [/^gtcr$/] },
  { canonical: 'PwC',                   patterns: [/^pwc$/, /^pricewaterhousecoopers$/, /^price ?waterhouse ?coopers$/] },
  { canonical: 'Deloitte',              patterns: [/^deloitte( consulting| touche| tohmatsu)?$/] },
  { canonical: 'Abbott',                patterns: [/^abbott( laboratories| labs)?$/] },
  { canonical: 'Grainger',              patterns: [/^(w ?w )?grainger$/] },
  { canonical: 'Discover Financial Services', patterns: [/^discover( financial( services)?)?$/] },
  { canonical: 'Morgan Stanley',        patterns: [/^morgan stanley$/] },
  { canonical: 'IBM',                   patterns: [/^ibm( consulting)?$/] },
  { canonical: 'Salesforce',            patterns: [/^sales ?force$/] },
  { canonical: 'University of Illinois Chicago', patterns: [/^university of illinois( at)? chicago$/, /^uic$/] },
  { canonical: 'Associated Bank',       patterns: [/^associated( bank| banc-?corp)?$/] },
  { canonical: 'First Merchants Bank',  patterns: [/^first merchants( bank| corporation)?$/] },
];

/** Lowercase, punctuation-free, legal-suffix-free, single-spaced. Alias-aware. */
export function normalizeOrgName(name: string | null | undefined): string {
  const base = clean(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,'’"()]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  // Strip trailing legal forms only (keep "Foundation" inside names — it's identity for a funder).
  // Strip trailing legal forms (repeatedly: "& Co., Inc." -> "and co inc" -> "") and any
  // connector left dangling by that strip. "Foundation" stays: it is identity for a funder.
  let legal = base;
  for (;;) {
    const next = legal
      .replace(/\b(inc|incorporated|corp|corporation|llc|llp|lp|ltd|plc|co|company|n a)\s*$/g, '')
      .replace(/\b(and|of|the)\s*$/g, '')
      .trim();
    if (next === legal) break;
    legal = next;
  }
  const noThe = legal.replace(/^the\s+/, '');
  for (const a of EMPLOYER_ALIASES) {
    if (a.patterns.some(p => p.test(noThe))) return normalizeOrgName.aliasKey(a.canonical);
  }
  return noThe;
}
normalizeOrgName.aliasKey = (canonical: string) => canonical.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** The curated canonical display name when `name` matches a known employer alias; null otherwise. */
export function knownEmployerDisplay(name: string | null | undefined): string | null {
  const key = normalizeOrgName(name);
  if (!key) return null;
  const hit = EMPLOYER_ALIASES.find(a => a.patterns.some(p => p.test(key)) || normalizeOrgName.aliasKey(a.canonical) === key);
  return hit ? hit.canonical : null;
}

/** Display name + comparison key for an employer string as it appears in the wild. */
export function canonicalEmployer(name: string | null | undefined): { display: string; key: string } | null {
  // "Retired, Chicago Tribune" / "Chicago Tribune (retired)" / "BMO, retired" → the employer.
  const raw = clean(name)
    .replace(/^retired,?\s*(from\s+)?/i, '')
    .replace(/\s*[(\[]\s*retired\s*[)\]]\s*$/i, '')
    .replace(/,?\s+retired\s*$/i, '');
  if (!raw) return null;
  const key = normalizeOrgName(raw);
  if (!key) return null;
  const alias = EMPLOYER_ALIASES.find(a => a.patterns.some(p => p.test(key)) || normalizeOrgName.aliasKey(a.canonical) === key);
  return { display: alias ? alias.canonical : raw, key };
}

/** Identity-bearing tokens (stopwords removed) for fuzzy comparison. */
export function tokenizeName(s: string | null | undefined): string[] {
  return normalizeOrgName(s).split(' ').filter(t => t && !ORG_STOPWORDS.has(t));
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// ── Organization type ───────────────────────────────────────────────────────

export type OrgType =
  | 'foundation' | 'community_foundation' | 'corporate_foundation' | 'corporation'
  | 'bank' | 'nonprofit' | 'university' | 'government' | 'unknown';

export interface OrgTypeHints {
  /** IRS BMF FOUNDATION code: 02–04 = private foundations; 09–18 = public charities. */
  foundationCode?: string | null;
  /** IRS subsection: '03' = 501(c)(3). */
  subsection?: string | null;
  ntee?: string | null;
  /** Existing funders.funder_type, when bridging Stack A. */
  funderType?: string | null;
}

/** Well-known corporations whose foundations recur in Chicago philanthropy (name-based; the
 *  officer→employee inference these enable is always graded 'inferred'). */
export const CORPORATE_NAMES = /\b(accenture|abbvie|abbott|motorola|cme group|boeing|exelon|comed|allstate|discover|grainger|walgreens|mcdonald'?s|kraft|deere|caterpillar|united airlines|baxter|northern trust|bmo|jpmorgan|chase|wintrust|fifth third|bank of america|huntington|state farm|aon|cna|zurich|adm|archer daniels|conagra|mondelez|kellogg|hyatt|marriott|nike|microsoft|google|amazon|apple|salesforce|ibm|deloitte|pwc|kpmg|morgan stanley|goldman sachs|citi(?:group|bank)?|wells fargo|us bank|byline|first midwest|old national|pnc|truist|capital one|american express|mastercard|visa|ulta|us foods|sysco|wm|waste management|nicor|peoples gas|ameren|com ?ed|blue cross|health care service|cigna|humana|unitedhealth|cvs|walmart|target|home depot|lowe'?s|kohl'?s|sears|molex|illinois tool works|itw|zebra|cdw|gogo|groupon|orbitz|sprout social|morningstar|nuveen|ariel|citadel|gtcr|madison dearborn|ares|kirkland|sidley|mayer brown|jenner|winston|latham|skadden|baker mckenzie)\b/;

/** One classifier for every path that used to have its own. */
export function orgTypeOf(name: string | null | undefined, hints: OrgTypeHints = {}): OrgType {
  const n = clean(name).toLowerCase();
  if (hints.funderType === 'bank') return 'bank';
  if (hints.funderType === 'community_foundation') return 'community_foundation';
  if (/community (trust|foundation|fund)\b/.test(n)) return 'community_foundation';
  if (/\b(bank|bancorp|bancshares|banc corp|trust company|savings|credit union)\b/.test(n) && !/foundation/.test(n)) return 'bank';
  if (/\b(university|college|institute of technology|school of|academy)\b/.test(n) && !/foundation/.test(n)) return 'university';
  if (/\b(county|city of|state of|department of|village of|public schools|park district|sheriff|state'?s attorney)\b/.test(n)) return 'government';
  if (/foundation|charitable trust|memorial (fund|trust)|family fund|philanthrop|giving fund|donor advised/.test(n)) {
    // A foundation named for a company is a corporate foundation — by generic
    // corporate vocabulary, or by a well-known corporate name.
    // Never for family/person funds, bank trustee accounts, or congregations —
    // the same exclusions the data was re-typed with.
    const excluded = /\b(family|fam)\b|church|chapel|mosque|ministr|camping|ttee|\btr\b|trust ua|\bua\b|bk n a|association|assoc|scholarship|in memory|school ?district|united way/.test(n);
    if (!excluded) {
      if (/\b(bank|bancorp|bancshares|industries|corporation|company|companies|technologies|solutions|petroleum|financial|insurance|energy|airlines|motors|railway|manufacturing|logistics)\b/.test(n)) return 'corporate_foundation';
      if (new RegExp(`^(the )?${CORPORATE_NAMES.source.replace(/^\\b|\\b$/g, '')}\\b`).test(n)) return 'corporate_foundation';
    }
    return 'foundation';
  }
  const fc = hints.foundationCode ?? '';
  if (['02', '03', '04'].includes(fc)) return 'foundation';
  if (hints.funderType === 'private_foundation') return 'foundation';
  if (hints.funderType === 'corporate') return 'corporation';
  if (/\b(inc|llc|llp|lp|ltd|plc|corp|corporation|company|partners|capital|holdings|group|associates|consulting|advisors|realty|logistics|brands|laboratories|studios)\b/.test(n)) return 'corporation';
  if (hints.subsection === '03' || hints.ntee || ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18'].includes(fc)) return 'nonprofit';
  return 'unknown';
}

// ── People identity ─────────────────────────────────────────────────────────

/** A lookup key for CANDIDATE retrieval only — never a merge decision. */
export function personNameKey(name: string | null | undefined): string {
  return clean(name)
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|cfa|cpa|esq|phd|md|mba|msw|med|m\.?s\.?w\.?|m\.?ed\.?)\b\.?/g, '')
    .replace(/\(.*?\)|["“”]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PersonMatchSignals {
  sameCanonicalUrl?: boolean;
  /** Same EIN-resolved employer with overlapping years. */
  sameEmployerWithDates?: boolean;
  /** A cited public bio naming both the person and that employer/board. */
  citedBioMatch?: boolean;
  sameBoardSeat?: boolean;
  sameLocation?: boolean;
  nameExact?: boolean;
}

/**
 * The rule the brief mandates: a name match is never sufficient. A canonical
 * URL match is sufficient alone; otherwise two independent corroborating
 * signals (beyond the name) are required.
 */
export function canMergePeople(s: PersonMatchSignals): boolean {
  if (s.sameCanonicalUrl) return true;
  const corroborating = [s.sameEmployerWithDates, s.citedBioMatch, s.sameBoardSeat].filter(Boolean).length
    + (s.sameLocation && s.nameExact ? 0.5 : 0);
  return corroborating >= 2;
}

// ── Misc ────────────────────────────────────────────────────────────────────

export function yearOf(v: unknown): number | null {
  const m = String(v ?? '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/** Do two [start,end] year ranges overlap (open-ended = still there)? */
export function yearsOverlap(aStart: number | null, aEnd: number | null, bStart: number | null, bEnd: number | null): boolean {
  if (aStart == null && aEnd == null) return false;
  if (bStart == null && bEnd == null) return false;
  const now = new Date().getFullYear();
  const as = aStart ?? 1900, ae = aEnd ?? now, bs = bStart ?? 1900, be = bEnd ?? now;
  return as <= be && bs <= ae;
}
