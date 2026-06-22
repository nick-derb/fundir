/**
 * Admin-email allowlist for the platform admin role.
 *
 * `ADMIN_EMAIL` env var accepts a comma-separated list:
 *   ADMIN_EMAIL=alice@example.com,bob@example.com
 *
 * Backward-compatible with single-email configs (no comma → one-element list).
 *
 * Anyone whose verified auth email matches an entry gets:
 *   - access to /admin/* (gated by app/admin/layout.tsx)
 *   - the multi-org switcher in the sidebar
 *   - the right to mutate access_allowlist / access_requests via actions/access.ts
 *
 * Tenant-level admin (CYC2026 admin vs. CYC2026 member) is separate — that
 * lives in user_organizations.role and access_allowlist.role.
 */

const ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_EMAIL ?? '')
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
);

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

/** Read-only snapshot, for diagnostics / logging only. */
export function adminEmailCount(): number {
  return ADMIN_EMAILS.size;
}
