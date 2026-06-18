/**
 * 990-PF + 990 Schedule I parser — Workstream B1.
 *
 * Parses the grants-paid sections of two IRS form variants into a single
 * normalized shape:
 *
 *   990-PF (private foundations):
 *     /Return/ReturnData/IRS990PF/SupplementaryInformationGrp/
 *       GrantOrContributionPdDuringYearGrp[]
 *
 *   990 Schedule I (public charities + community foundations):
 *     /Return/ReturnData/IRS990ScheduleI/RecipientTable[]
 *
 * The IRS e-file XML schema drifts year-over-year (tag names change
 * casing, new fields appear, old fields are removed). This parser is
 * deliberately defensive: it walks both shapes, accepts fields by
 * multiple alias names, and skips rows it can't normalize.
 *
 * No external API calls. No Claude. Pure XML → JS transformation.
 * Idempotent and side-effect-free.
 */

import { XMLParser } from 'fast-xml-parser';

// ── Output shape — what downstream Workstream B code consumes ──────────────

export interface ParsedGrant {
  /** Recipient display name. Always present. */
  recipient_name:    string;
  /** Recipient EIN if disclosed (9 digits, no hyphens). 990 Sched I usually
   *  has this; 990-PF Part XV rarely does. */
  recipient_ein:     string | null;
  /** Two-letter US state code if disclosable. Used by Tier 2 fuzzy match. */
  recipient_state:   string | null;
  /** Best-effort city, for display + future use. */
  recipient_city:    string | null;
  /** Grant amount in dollars. Required. */
  amount:            number;
  /** Grant purpose as written. Free text. */
  purpose:           string | null;
  /** Foundation-status / IRC-section text, useful as ER hint. */
  irc_section:       string | null;
}

export interface ParsedReturn {
  /** Filer EIN (the grantmaker). Always present in a valid return. */
  funder_ein:        string;
  /** Filer name as listed on the form. */
  funder_name:       string;
  /** Fiscal year the return covers. Best-effort from TaxYr / TaxPeriodEndDt. */
  fiscal_year:       number;
  /** Form variant — 990PF or 990. Used by the worker for source labelling. */
  form_type:         '990PF' | '990';
  /** Normalized recipient rows. May be empty (foundation gave nothing
   *  that year, or shape couldn't be parsed). */
  grants:            ParsedGrant[];
  /** Soft warnings — schema-drift cases we recovered from. */
  warnings:          string[];
}

// ── XML parser config ─────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes:  false,
  attributeNamePrefix: '@_',
  removeNSPrefix:    true,   // strip irs.gov/efile namespace prefixes
  parseTagValue:     true,
  trimValues:        true,
  // Treat the grant rows as arrays even when there's only one (one-grant
  // foundations would otherwise parse as a single object).
  isArray: (name) => GRANT_GROUP_ARRAY_TAGS.has(name),
});

const GRANT_GROUP_ARRAY_TAGS = new Set([
  'GrantOrContributionPdDuringYearGrp',
  'GrantOrContributionPdDuringYrGrp',         // some 990-PF years use this casing
  'RecipientTable',                             // 990 Schedule I
]);

// ── Helpers ───────────────────────────────────────────────────────────────

function getFirst<T>(obj: unknown, ...keys: string[]): T | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k] as T;
  }
  return null;
}

function getString(obj: unknown, ...keys: string[]): string | null {
  const v = getFirst<unknown>(obj, ...keys);
  if (v == null) return null;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
}

function getNumber(obj: unknown, ...keys: string[]): number | null {
  const v = getFirst<unknown>(obj, ...keys);
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cleanEin(raw: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length === 9 ? digits : null;
}

function extractRecipientName(rowObj: unknown): string | null {
  // 990-PF puts the recipient name in either BusinessNameLine1Txt or
  // RecipientPersonNm. 990 Sched I uses RecipientBusinessName.BusinessNameLine1Txt.
  const businessName = getFirst<Record<string, unknown>>(
    rowObj, 'RecipientBusinessName', 'BusinessName',
  );
  const fromBusiness = businessName
    ? getString(businessName, 'BusinessNameLine1Txt', 'BusinessNameLine1', 'BusinessNameLine2Txt')
    : null;
  const direct = getString(rowObj, 'RecipientPersonNm', 'BusinessNameLine1Txt', 'RecipientNm');
  return fromBusiness ?? direct;
}

function extractAddress(rowObj: unknown): { state: string | null; city: string | null } {
  const usAddr = getFirst<Record<string, unknown>>(rowObj, 'USAddress', 'RecipientUSAddress');
  if (usAddr) {
    return {
      state: getString(usAddr, 'StateAbbreviationCd', 'StateCd', 'State'),
      city:  getString(usAddr, 'CityNm', 'City'),
    };
  }
  // Foreign address — capture nothing for state (the matcher doesn't
  // use country codes); skip city for cleanliness.
  return { state: null, city: null };
}

function extractAmount(rowObj: unknown): number | null {
  // 990-PF: Amt. 990 Sched I: CashGrantAmt + NonCashAssistanceAmt. We sum
  // both for Sched I so a recipient that got cash + in-kind doesn't appear
  // twice or get under-counted.
  const direct = getNumber(rowObj, 'Amt', 'CashGrantAmt');
  const noncash = getNumber(rowObj, 'NonCashAssistanceAmt') ?? 0;
  if (direct != null) return direct + noncash;
  if (noncash > 0) return noncash;
  return null;
}

function extractPurpose(rowObj: unknown): string | null {
  return getString(
    rowObj,
    'GrantOrContributionPurposeTxt',
    'PurposeOfGrantTxt',
    'GrantPurposeTxt',
  );
}

function extractIrcSection(rowObj: unknown): string | null {
  return getString(
    rowObj,
    'IRCSectionDesc',
    'RecipientFoundationStatusTxt',
    'RecipientRelationshipTxt',
  );
}

function deriveFiscalYear(returnObj: unknown): number | null {
  // 990 forms expose TaxYr at the ReturnHeader. Fall back to TaxPeriodEndDt's
  // year if TaxYr is missing.
  const header = getFirst<Record<string, unknown>>(returnObj, 'ReturnHeader');
  if (!header) return null;
  const fy = getNumber(header, 'TaxYr', 'TaxYear');
  if (fy != null) return fy;
  const endDt = getString(header, 'TaxPeriodEndDt', 'TaxPeriodEnd');
  if (endDt) {
    const m = endDt.match(/^(\d{4})/);
    if (m) return Number(m[1]);
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Parse a 990 / 990-PF e-file XML string into a normalized return record.
 * Throws if the XML is malformed or doesn't carry a recognizable Return
 * envelope. Schema-drift cases return a valid result with `warnings`
 * populated.
 */
export function parse990Xml(xml: string): ParsedReturn {
  const warnings: string[] = [];
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const root = getFirst<Record<string, unknown>>(parsed, 'Return') ?? parsed;

  const header = getFirst<Record<string, unknown>>(root, 'ReturnHeader');
  const filer  = getFirst<Record<string, unknown>>(header, 'Filer');
  const funder_ein  = cleanEin(getString(filer, 'EIN'));
  if (!funder_ein) throw new Error('parse990Xml: filer EIN not found');

  const filerBusinessName = getFirst<Record<string, unknown>>(filer, 'BusinessName');
  const funder_name = getString(filerBusinessName, 'BusinessNameLine1Txt', 'BusinessNameLine1')
    ?? getString(filer, 'BusinessNameLine1Txt')
    ?? '(unnamed filer)';

  const fiscal_year = deriveFiscalYear(root);
  if (fiscal_year == null) warnings.push('fiscal_year not derivable; defaulting to 0');

  const returnData = getFirst<Record<string, unknown>>(root, 'ReturnData');
  const irs990pf   = getFirst<Record<string, unknown>>(returnData, 'IRS990PF');
  const irs990si   = getFirst<Record<string, unknown>>(returnData, 'IRS990ScheduleI');

  let form_type: '990PF' | '990' = '990PF';
  let rawGrants: unknown[] = [];

  if (irs990pf) {
    form_type = '990PF';
    const supp = getFirst<Record<string, unknown>>(irs990pf, 'SupplementaryInformationGrp', 'SupplementaryInformation');
    const grp = (supp?.GrantOrContributionPdDuringYearGrp ?? supp?.GrantOrContributionPdDuringYrGrp) as unknown[] | undefined;
    rawGrants = Array.isArray(grp) ? grp : [];
  } else if (irs990si) {
    form_type = '990';
    const grp = (irs990si.RecipientTable) as unknown[] | undefined;
    rawGrants = Array.isArray(grp) ? grp : [];
  } else {
    warnings.push('no IRS990PF or IRS990ScheduleI section found; no grants extracted');
  }

  const grants: ParsedGrant[] = [];
  for (const row of rawGrants) {
    const recipient_name = extractRecipientName(row);
    const amount         = extractAmount(row);
    if (!recipient_name || amount == null) {
      warnings.push(`row skipped: name=${recipient_name ?? 'null'} amount=${amount}`);
      continue;
    }
    const { state, city } = extractAddress(row);
    grants.push({
      recipient_name,
      recipient_ein:    cleanEin(getString(row, 'RecipientEIN', 'EIN')),
      recipient_state:  state,
      recipient_city:   city,
      amount,
      purpose:          extractPurpose(row),
      irc_section:      extractIrcSection(row),
    });
  }

  return {
    funder_ein,
    funder_name,
    fiscal_year: fiscal_year ?? 0,
    form_type,
    grants,
    warnings,
  };
}
