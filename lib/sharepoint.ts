// Where the Data Hub physically lives.
//
// It used to live in `/me/drive` — the personal OneDrive of whoever happened to
// connect Microsoft 365. That made one employee the owner of the whole
// organization's grant documents: when they change roles, the folder and the
// token leave with them. A SharePoint document library belongs to the
// organization instead, so the files outlive any individual.
//
// Resolution order, first hit wins:
//   1. SHAREPOINT_SITE  — a site name as staff know it ("Development"), found
//                         by Graph site search; or an explicit Graph path
//                         ("contoso.sharepoint.com:/sites/Grants")
//   2. the tenant's root SharePoint site and its default document library
//   3. `/me/drive`      — the old personal drive, so a connection made before
//                         the Sites scope existed keeps working untouched.
//
// Resolution costs two Graph calls and the answer never changes for a tenant,
// so it is memoized per org for the life of the instance. No schema change:
// stale folder ids from the old drive simply 404 and the Data Hub re-discovers.

import { graphFetch } from '@/lib/microsoft-graph';

export const PERSONAL_DRIVE = '/me/drive';

export interface DriveTarget {
  /** Graph path prefix, e.g. `/drives/b!abc…` or `/me/drive`. */
  base: string;
  kind: 'sharepoint' | 'personal';
  /** Human-readable location, for Settings and the Data Hub header. */
  label: string;
  webUrl: string | null;
}

const PERSONAL: DriveTarget = { base: PERSONAL_DRIVE, kind: 'personal', label: 'Personal OneDrive', webUrl: null };
const memo = new Map<string, { target: DriveTarget; expires: number }>();
const TTL_MS = 30 * 60 * 1000;

interface GraphSite { id?: string; displayName?: string; name?: string; webUrl?: string }

/**
 * The configured site. SHAREPOINT_SITE is either an explicit Graph site path
 * ("contoso.sharepoint.com:/sites/Grants", anything with a colon or a dot) or
 * just the site's name as staff know it ("Development"), which is looked up
 * with a Graph site search so nobody has to hunt for a URL. A name match is
 * exact on the display name or on the last segment of the site URL.
 */
async function configuredSite(token: string, configured: string): Promise<GraphSite | null> {
  if (/[:.]/.test(configured)) {
    return await (await graphFetch(token, `/sites/${configured}?$select=id,displayName,webUrl`)).json() as GraphSite;
  }
  const res = await (await graphFetch(token, `/sites?search=${encodeURIComponent(configured)}&$select=id,displayName,name,webUrl`)).json() as { value?: GraphSite[] };
  const want = configured.toLowerCase();
  const hits = (res.value ?? []).filter(s => s.id);
  return hits.find(s => (s.displayName ?? '').trim().toLowerCase() === want)
    ?? hits.find(s => (s.webUrl ?? '').replace(/\/+$/, '').split('/').pop()?.toLowerCase() === want)
    ?? hits.find(s => (s.name ?? '').trim().toLowerCase() === want)
    ?? null;
}

/** Ask Graph for the document library of the configured (or root) site. */
async function resolveFromGraph(token: string): Promise<DriveTarget | null> {
  const configured = process.env.SHAREPOINT_SITE?.trim();
  try {
    const site = configured
      ? await configuredSite(token, configured)
      : await (await graphFetch(token, `/sites/root?$select=id,displayName,webUrl`)).json() as GraphSite;
    if (!site?.id) return null;
    // The site's default library ("Documents") is the organization's drive.
    const drive = await (await graphFetch(token, `/sites/${site.id}/drive?$select=id,name,webUrl`)).json() as
      { id?: string; name?: string; webUrl?: string };
    if (!drive.id) return null;
    return {
      base: `/drives/${drive.id}`,
      kind: 'sharepoint',
      label: [site.displayName, drive.name].filter(Boolean).join(' · ') || 'SharePoint',
      webUrl: drive.webUrl ?? site.webUrl ?? null,
    };
  } catch {
    // The token has no Sites permission, or the tenant has no SharePoint.
    return null;
  }
}

/**
 * The drive this org's Data Hub reads and writes. Falls back to the connecting
 * user's OneDrive so an existing connection never breaks; Settings reports
 * which of the two is actually in use.
 */
export async function resolveDrive(token: string, orgCode: string): Promise<DriveTarget> {
  const hit = memo.get(orgCode);
  if (hit && hit.expires > Date.now()) return hit.target;
  const target = (await resolveFromGraph(token)) ?? PERSONAL;
  memo.set(orgCode, { target, expires: Date.now() + TTL_MS });
  return target;
}

/** Forget the memoized drive for an org — call after a reconnect. */
export function clearDrive(orgCode: string): void {
  memo.delete(orgCode);
}
