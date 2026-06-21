/**
 * Org-logo resolution.
 *
 * Logos are looked up in two passes:
 *   1. A small bundled-assets map keyed by org_code, for tenants whose
 *      brand we ship with the app (CYC). Returns a stable /public path.
 *   2. (server-only) ProPublica EIN → website → Clearbit fallback,
 *      handled at the call site in app/dashboard/page.tsx.
 *
 * Returning a /public path keeps the sidebar (client-rendered) free of a
 * network round-trip and means the logo is never broken by Clearbit's
 * coverage gaps or a slow external response.
 */

/** Exact-match map. Add new tenant codes here as logos ship. */
const BUNDLED_LOGO_BY_ORG_CODE: Record<string, string> = {
  CYC2026: '/cyc-logo.png',
  CYC2025: '/cyc-logo.png',   // legacy code in case the rename migration hasn't run
};

/** Prefix fallback so any CYC{year} or YMCA{year} variant resolves correctly
 *  without us tracking every annual code revision. */
const PREFIX_LOGOS: Array<{ prefix: string; src: string }> = [
  { prefix: 'CYC',  src: '/cyc-logo.png' },
];

export function bundledLogoFor(orgCode: string | null | undefined): string | null {
  if (!orgCode) return null;
  if (BUNDLED_LOGO_BY_ORG_CODE[orgCode]) return BUNDLED_LOGO_BY_ORG_CODE[orgCode];
  const code = orgCode.toUpperCase();
  for (const { prefix, src } of PREFIX_LOGOS) {
    if (code.startsWith(prefix)) return src;
  }
  return null;
}
