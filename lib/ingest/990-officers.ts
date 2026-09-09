// Officers, directors and trustees from an e-filed 990 / 990-PF — the public,
// structured board roster the foundation-board cross-reference runs on.
//
//   990-PF: /Return/ReturnData/IRS990PF/OfficerDirTrstKeyEmplInfoGrp/
//             OfficerDirTrstKeyEmplGrp[]  { PersonNm | BusinessName, TitleTxt, … }
//   990:    /Return/ReturnData/IRS990/Form990PartVIISectionAGrp[]
//             { PersonNm, TitleTxt, IndividualTrusteeOrDirectorInd, OfficerInd, … }
//
// Same defensive posture as 990pf-parser.ts: alias-tolerant, skips rows it
// can't read, never throws on a shape it doesn't recognize. Only names and
// titles are taken — compensation and hours exist in the filing but are not a
// relationship signal and are deliberately not stored.

import { XMLParser } from 'fast-xml-parser';

export interface FilingOfficer {
  name: string;
  title: string | null;
  /** trustee = director/trustee seat; officer = corporate officer; employee = key/highest-paid employee */
  role: 'trustee' | 'officer' | 'employee';
  /** The row named a firm (e.g. a trust company as trustee) rather than a person. */
  isOrganization: boolean;
}

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

const arr = (v: unknown): Record<string, unknown>[] => (v == null ? [] : Array.isArray(v) ? v : [v]) as Record<string, unknown>[];
const first = (o: Record<string, unknown> | undefined, ...keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return undefined;
};
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const flag = (v: unknown): boolean => v === 'X' || v === 'true' || v === '1' || v === true;

// Many 990-PF filers put officers' personal names inside BusinessName (verified
// on 2024 filings: "Ellen Alberding" under BusinessNameLine1Txt). Decide
// person-vs-organization from the name itself, not from the tag it sat in.
const ORG_TOKENS = /\b(inc|incorporated|llc|llp|lp|ltd|co|corp|corporation|company|trust(?:ees)?|bank|foundation|fund|associates|partners|group|advisors|management|services|capital|holdings|institute|university|church|council|committee|n\.?a\.?)\b|&/i;

export function looksLikeOrganization(name: string): boolean {
  if (ORG_TOKENS.test(name)) return true;
  const words = name.trim().split(/\s+/);
  return words.length < 2 || words.length > 5;
}

function personName(row: Record<string, unknown>): { name: string; isOrganization: boolean } | null {
  const person = text(first(row, 'PersonNm', 'PersonName', 'NamePerson'));
  if (person) return { name: cleanName(person), isOrganization: false };
  const biz = first(row, 'BusinessName', 'BusinessNameLine1Txt') as Record<string, unknown> | string | undefined;
  const bizName = typeof biz === 'string' ? biz : text(first(biz as Record<string, unknown>, 'BusinessNameLine1Txt', 'BusinessNameLine1'));
  if (!bizName) return null;
  const name = cleanName(bizName);
  return { name, isOrganization: looksLikeOrganization(name) };
}

/** IRS filings shout: "SCOTT C SMITH" → "Scott C Smith". Keeps initials and suffixes readable. */
export function cleanName(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-'’.])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Jr|Sr|Cpa|Cfa|Md|Phd|Esq)\b/g, m => m.toUpperCase().replace('JR', 'Jr').replace('SR', 'Sr'))
    .replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase());
}

function roleOf(row: Record<string, unknown>, form: '990PF' | '990'): FilingOfficer['role'] {
  const title = (text(first(row, 'TitleTxt', 'Title')) ?? '').toLowerCase();
  if (form === '990') {
    if (flag(first(row, 'IndividualTrusteeOrDirectorInd', 'InstitutionalTrusteeInd'))) return 'trustee';
    if (flag(first(row, 'OfficerInd'))) return 'officer';
    if (flag(first(row, 'KeyEmployeeInd', 'HighestCompensatedEmployeeInd', 'FormerOfcrDirectorTrusteeInd'))) return 'employee';
  }
  if (/director|trustee|board|chair/.test(title)) return 'trustee';
  if (/president|ceo|chief|executive|officer|treasurer|secretary|vice|vp|managing/.test(title)) return 'officer';
  return 'employee';
}

/** Extract every officer/director/trustee row from a raw e-file XML string. */
export function parseOfficers(xml: string): { form: '990PF' | '990' | 'other'; officers: FilingOfficer[] } {
  let doc: Record<string, unknown>;
  try { doc = parser.parse(xml) as Record<string, unknown>; } catch { return { form: 'other', officers: [] }; }
  const ret = (doc.Return ?? doc) as Record<string, unknown>;
  const data = (ret.ReturnData ?? {}) as Record<string, unknown>;
  const officers: FilingOfficer[] = [];
  const seen = new Set<string>();

  const push = (row: Record<string, unknown>, form: '990PF' | '990') => {
    const who = personName(row); if (!who) return;
    const key = who.name.toLowerCase();
    if (seen.has(key)) return; seen.add(key);
    officers.push({ name: who.name, title: text(first(row, 'TitleTxt', 'Title')), role: roleOf(row, form), isOrganization: who.isOrganization });
  };

  const pf = data.IRS990PF as Record<string, unknown> | undefined;
  if (pf) {
    const grp = pf.OfficerDirTrstKeyEmplInfoGrp as Record<string, unknown> | undefined;
    for (const row of arr(first(grp ?? pf, 'OfficerDirTrstKeyEmplGrp', 'OfficerDirTrstKeyEmplInfoGrp'))) push(row, '990PF');
    return { form: '990PF', officers };
  }
  const f990 = data.IRS990 as Record<string, unknown> | undefined;
  if (f990) {
    for (const row of arr(first(f990, 'Form990PartVIISectionAGrp', 'Form990PartVIISectionA'))) push(row, '990');
    return { form: '990', officers };
  }
  return { form: 'other', officers };
}
