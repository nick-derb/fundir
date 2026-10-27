// Short, human labels for the signed-in organization. The product is
// multi-tenant, so no screen may say "CYC": it says whatever this tenant is
// called, in the short form a colleague would use in conversation.

const SKIP = new Set(['of', 'the', 'and', 'for', 'in', 'at', 'to', 'a', 'an', 'de', 'du', 'des', 'la', 'le']);

/**
 * "Chicago Youth Centers" → "CYC"; "Boys & Girls Clubs of Chicago" → "BGCC";
 * "Metropolitan Family Services (MFS)" → "MFS"; "Heartland" → "Heartland".
 * Prefers an acronym the name already carries in parentheses.
 */
export function orgShortName(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return 'your organization';
  const paren = n.match(/\(([A-Z][A-Z0-9&.-]{1,7})\)/);
  if (paren) return paren[1].replace(/[.&-]/g, '');
  const words = n.replace(/\([^)]*\)/g, ' ').split(/[\s/]+/).filter(Boolean);
  const sig = words.filter(w => !SKIP.has(w.toLowerCase()) && /[A-Za-z0-9]/.test(w));
  if (sig.length <= 1) return sig[0] ?? n;
  const initials = sig.map(w => w.replace(/[^A-Za-z0-9]/g, '')[0] ?? '').join('').toUpperCase();
  return initials.length >= 2 && initials.length <= 5 ? initials : sig[0];
}

/** Possessive for copy: "CYC's", "Heartland's". */
export const orgPossessive = (short: string) => (/s$/i.test(short) && short.length > 4 ? `${short}'` : `${short}'s`);
