// Short, human labels for the signed-in organization. The product is
// multi-tenant, so no screen may say "CYC": it says whatever this tenant is
// called, in the short form a colleague would use in conversation.

const SKIP = new Set([
  'of', 'the', 'and', 'for', 'in', 'at', 'to', 'a', 'an', 'de', 'du', 'des', 'la', 'le',
  'inc', 'llc', 'nfp', 'ltd', 'co', 'corp', 'corporation', 'incorporated',
]);
const clean = (w: string) => w.replace(/[^A-Za-z0-9]/g, '');

/**
 * "Chicago Youth Centers" → "CYC"; "Boys & Girls Clubs of Chicago" → "BGCC";
 * "Metropolitan Family Services (MFS)" → "MFS"; "YMCA of Metropolitan Chicago"
 * → "YMCA"; "Heartland" → "Heartland". Prefers an acronym the name already
 * carries, in parentheses or as its first word; when the initials would not
 * read as a word people use, the full name comes back instead.
 */
export function orgShortName(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return 'your organization';
  const paren = n.match(/\(([A-Z][A-Z0-9&.-]{1,7})\)/);
  if (paren) return paren[1].replace(/[.&-]/g, '');
  const plain = n.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const words = plain.split(/[\s/]+/).filter(Boolean);
  const sig = words.filter(w => { const k = clean(w).toLowerCase(); return !!k && !SKIP.has(k); });
  if (sig.length === 0) return plain || n;
  if (sig.length === 1) return sig[0].replace(/[,.;:]+$/, '');
  const lead = clean(sig[0]);
  const allCaps = sig.every(w => clean(w) === clean(w).toUpperCase());
  if (!allCaps && /^[A-Z][A-Z0-9]{2,5}$/.test(lead)) return lead; // "YMCA of …", "JCC Chicago"
  const initials = sig.map(w => clean(w)[0] ?? '').join('').toUpperCase();
  return initials.length >= 2 && initials.length <= 5 ? initials : plain;
}

/** Possessive for copy: "CYC's", "Heartland's", "Alternatives'". */
export const orgPossessive = (short: string) =>
  (/s$/i.test(short) && short.length > 4 && short !== short.toUpperCase() ? `${short}'` : `${short}'s`);
