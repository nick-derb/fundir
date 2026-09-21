// CYC Data Hub — the shared Excel workbook in OneDrive IS the source of truth.
//
// Architecture (deliberate, per Microsoft-first direction): rows live in a real
// workbook ("CYC Data Collection.xlsx" under /CYC Data Hub) that the whole org
// can also open in Excel or Teams. The app reads and appends through Microsoft
// Graph, so:
//   - a site director's submission is instantly visible to everyone (app + Excel)
//   - edits made directly in Excel show up in the app on refresh
//   - appends are handled server-side by Graph's workbook-table API (concurrency-safe)
// Uploaded documents (990s, audited statements, …) live next to it in
// /CYC Data Hub/Documents so one person's upload is everyone's file.
//
// PERFORMANCE: resolving the OneDrive handles (folder ids, workbook id, table
// name) costs ~5 sequential Graph round-trips including an Excel workbook-session
// spin-up. Those handles are STABLE per org, so we resolve them once and cache
// them (see lib/data-hub-state.ts). After the first open, a read is just:
//   1× usedRange (rows)  +  1× children (documents)  — resolved from cache.
// Reads pull rows via a single usedRange call rather than the row-by-row table
// API; the table API is reserved for concurrency-safe appends.

import * as XLSX from 'xlsx';
import { graphFetch, findOrCreateFolder } from '@/lib/microsoft-graph';
import type { GraphFile } from '@/lib/microsoft-graph';
import {
  getCachedHandles, setCachedHandles, invalidateHandles,
} from '@/lib/data-hub-state';
import { resolveDrive, PERSONAL_DRIVE } from '@/lib/sharepoint';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export const HUB_FOLDER    = 'CYC Data Hub';
const DOCS_FOLDER          = 'Documents';
const WORKBOOK_NAME        = 'CYC Data Collection.xlsx';
const SHEET_NAME           = 'Data';
const TABLE_NAME           = 'DataHub';

/** Column order in the workbook table — keep in sync with append/list below. */
export const HUB_COLUMNS = [
  'Submitted', 'Submitted by', 'Site', 'Period', 'Metric', 'Value', 'Notes',
] as const;

export interface HubRow {
  submitted:   string;
  submittedBy: string;
  site:        string;
  period:      string;
  metric:      string;
  value:       string;
  notes:       string;
}

export interface HubDocument {
  id:           string;
  name:         string;
  size:         number;
  webUrl:       string | null;
  modified:     string | null;
  modifiedBy:   string | null;
  /** Sub-folder of Documents the file sits in, or null at the top level. */
  folder:       string | null;
}

/** Resolved, cacheable OneDrive handles for one org's hub. */
export interface HubHandles {
  workbookId:  string;
  workbookUrl: string | null;
  tableName:   string;
  sheetName:   string;
  docsId:      string;
  docsUrl:     string | null;
}

// ── Handle resolution (cached) ───────────────────────────────────────────────

/** Path-addressed lookup that returns null on 404 instead of throwing. */
async function findChild(token: string, parentId: string, name: string, base: string): Promise<GraphFile | null> {
  try {
    const res = await graphFetch(
      token,
      `${base}/items/${parentId}:/${encodeURIComponent(name)}`,
    );
    return await res.json();
  } catch {
    return null;
  }
}

interface ChildItem {
  id: string; name: string; size?: number; webUrl?: string;
  lastModifiedDateTime?: string; folder?: unknown;
  lastModifiedBy?: { user?: { displayName?: string } };
}

async function listChildren(token: string, base: string, itemId: string): Promise<ChildItem[]> {
  const res = await graphFetch(
    token,
    `${base}/items/${itemId}/children` +
    `?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,folder&$top=200`,
  );
  const data = await res.json();
  return (data.value ?? []) as ChildItem[];
}

/** Move a file under a new parent; on a name clash, suffix the name and retry. */
async function moveItem(token: string, base: string, item: ChildItem, parentId: string, suffix: string): Promise<void> {
  const move = (name?: string) => fetch(`${GRAPH}${base}/items/${item.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentReference: { id: parentId }, ...(name ? { name } : {}) }),
  });
  let res = await move();
  if (res.status === 409) {
    const dot = item.name.lastIndexOf('.');
    const renamed = dot > 0
      ? `${item.name.slice(0, dot)} (${suffix})${item.name.slice(dot)}`
      : `${item.name} (${suffix})`;
    res = await move(renamed);
  }
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`);
}

const STRAY_HUB_RE = /^CYC Data Hub \d+$/;
/** On the personal drive even the un-numbered hub is a stray once SharePoint is in use. */
const PERSONAL_HUB_RE = /^CYC Data Hub( \d+)?$/;
/** What the last discovery on this instance tidied — surfaced by hubDiagnostics. */
let lastMerge: { folders: number; files: number; rows: number; removed: number; sweptPersonal: boolean; capped: boolean; at: string } | null = null;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface FoundHub { driveId: string; id: string; name: string; webUrl: string | null; parentPath: string | null }

/**
 * Every folder in the tenant called "CYC Data Hub" or "CYC Data Hub N" that
 * this connection can see — Microsoft Search across SharePoint and OneDrive,
 * so a hub that landed on the wrong site or drive is found, not guessed at.
 * Returns [] when search is unavailable (older token without Sites scope).
 */
async function findHubFoldersEverywhere(token: string): Promise<FoundHub[]> {
  try {
    const res = await graphFetch(token, '/search/query', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ entityTypes: ['driveItem'], query: { queryString: `"${HUB_FOLDER}" isDocument<>true` }, from: 0, size: 50 }] }),
    });
    const data = await res.json() as { value?: Array<{ hitsContainers?: Array<{ hits?: Array<{ resource?: Record<string, unknown> }> }> }> };
    const out: FoundHub[] = [];
    for (const c of data.value?.[0]?.hitsContainers ?? []) {
      for (const h of c.hits ?? []) {
        const r = h.resource ?? {};
        const name = String(r.name ?? '');
        if (!PERSONAL_HUB_RE.test(name)) continue;
        const parent = (r.parentReference ?? {}) as { driveId?: string; path?: string };
        if (!parent.driveId || !r.id) continue;
        out.push({ driveId: parent.driveId, id: String(r.id), name, webUrl: (r.webUrl as string) ?? null, parentPath: parent.path ?? null });
      }
    }
    return out;
  } catch { return []; }
}

/**
 * Copy one file into another drive (Graph cannot move across drives), wait for
 * the async copy to finish, then delete the source — to its recycle bin.
 * Returns false (source untouched) if the copy could not be confirmed.
 */
async function copyAcrossDrives(token: string, srcBase: string, item: ChildItem, destDriveId: string, destParentId: string): Promise<boolean> {
  const res = await fetch(`${GRAPH}${srcBase}/items/${item.id}/copy?@microsoft.graph.conflictBehavior=rename`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentReference: { driveId: destDriveId, id: destParentId }, name: item.name }),
  });
  if (res.status !== 202) return false;
  const monitor = res.headers.get('Location');
  if (!monitor) return false;
  for (let i = 0; i < 12; i++) {
    await sleep(1500 + i * 500);
    const m = await fetch(monitor).then(r => r.json()).catch(() => null) as { status?: string } | null;
    if (m?.status === 'completed') {
      await fetch(`${GRAPH}${srcBase}/items/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      return true;
    }
    if (m?.status === 'failed') return false;
  }
  return false;
}

/**
 * A SharePoint quirk once made every cold open create a fresh "CYC Data Hub N"
 * folder (see findOrCreateFolder), and before the site resolved at all the hub
 * lived in the connecting user's personal OneDrive — so staff uploads landed
 * in whichever copy that request happened to make. This folds them back:
 * files from each stray's Documents folder (and any loose files) go into the
 * real Documents folder (moved on the same drive, copied then deleted across
 * drives), data rows typed into a stray workbook are appended to the real
 * table, and a stray that is then empty is deleted — to the recycle bin, so
 * nothing is unrecoverable. Bounded by a time budget; it simply picks up where
 * it left off on the next discovery or repair.
 */
async function mergeStrayHubFolders(
  token: string, base: string, docsId: string, workbookId: string, tableName: string,
): Promise<NonNullable<typeof lastMerge>> {
  const out = { folders: 0, files: 0, rows: 0, removed: 0, sweptPersonal: false, capped: false, at: new Date().toISOString() };
  const deadline = Date.now() + 38_000;
  const destDriveId = base.startsWith('/drives/') ? base.slice('/drives/'.length) : null;

  // Which drives to sweep: the hub's own drive for numbered copies; when the
  // hub is on SharePoint, the connecting user's OneDrive for any copy at all.
  const sweeps: Array<{ srcBase: string; re: RegExp; sameDrive: boolean; only?: Set<string> }> = [{ srcBase: base, re: STRAY_HUB_RE, sameDrive: true }];
  if (destDriveId) {
    sweeps.push({ srcBase: '/me/drive', re: PERSONAL_HUB_RE, sameDrive: false });
    out.sweptPersonal = true;
    // …and any other drive where search finds one (a different site, another
    // library): sweep just those folders, whatever their number.
    const byDrive = new Map<string, Set<string>>();
    let personalDriveId: string | null = null;
    try { personalDriveId = ((await (await graphFetch(token, '/me/drive?$select=id')).json()) as { id?: string }).id ?? null; } catch { /* no personal drive */ }
    for (const f of await findHubFoldersEverywhere(token)) {
      if (f.driveId === destDriveId && f.name === HUB_FOLDER) continue;   // the real one
      if (f.driveId === destDriveId) continue;                          // same drive: first sweep has it
      if (f.driveId === personalDriveId) continue;                      // the /me/drive sweep has it
      if (!byDrive.has(f.driveId)) byDrive.set(f.driveId, new Set());
      byDrive.get(f.driveId)!.add(f.id);
    }
    for (const [driveId, ids] of byDrive) {
      sweeps.push({ srcBase: `/drives/${driveId}`, re: PERSONAL_HUB_RE, sameDrive: false, only: ids });
    }
  }

  const relocate = async (srcBase: string, f: ChildItem, sameDrive: boolean, suffix: string): Promise<boolean> => {
    if (sameDrive) { await moveItem(token, base, f, docsId, suffix); return true; }
    return copyAcrossDrives(token, srcBase, f, destDriveId!, docsId);
  };

  for (const sweep of sweeps) {
    let root: ChildItem[] = [];
    try {
      const rootRes = await graphFetch(token, `${sweep.srcBase}/root/children?$select=id,name,folder&$top=200`);
      root = ((await rootRes.json()).value ?? []) as ChildItem[];
    } catch { continue; }   // e.g. no personal drive on this token
    const strays = root.filter(c => c.folder && sweep.re.test(c.name) && (!sweep.only || sweep.only.has(c.id)));

    for (const stray of strays) {
      if (Date.now() > deadline) { out.capped = true; return out; }
      out.folders++;
      let leftovers = 0;
      for (const kid of await listChildren(token, sweep.srcBase, stray.id)) {
        if (Date.now() > deadline) { out.capped = true; return out; }
        if (kid.folder && kid.name === DOCS_FOLDER) {
          for (const f of await listChildren(token, sweep.srcBase, kid.id)) {
            if (Date.now() > deadline) { out.capped = true; return out; }
            if (f.folder) { leftovers++; continue; }   // nested folders: leave for a human
            if (await relocate(sweep.srcBase, f, sweep.sameDrive, stray.name)) out.files++; else leftovers++;
          }
          continue;
        }
        if (!kid.folder && kid.name === WORKBOOK_NAME) {
          // Only rows beyond the header are worth carrying over.
          const ur = await graphFetch(
            token,
            `${sweep.srcBase}/items/${kid.id}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange(valuesOnly=true)?$select=values`,
          ).then(r => r.json()).catch(() => ({ values: [] }));
          const rows = ((ur.values ?? []) as unknown[][]).slice(1)
            .map(v => HUB_COLUMNS.map((_, i) => (v[i] == null ? '' : String(v[i]))))
            .filter(v => v.some(Boolean));
          if (rows.length) {
            await graphFetch(token, `${base}/items/${workbookId}/workbook/tables/${tableName}/rows/add`, {
              method: 'POST', body: JSON.stringify({ values: rows }),
            });
            out.rows += rows.length;
            // Blank the copied rows' source so a second sweep cannot double-append:
            // simplest is to leave the workbook alone and let the folder deletion
            // below take it — which only happens once every file is out.
          }
          continue;
        }
        if (kid.folder) { leftovers++; continue; }
        if (await relocate(sweep.srcBase, kid, sweep.sameDrive, stray.name)) out.files++; else leftovers++;
      }
      if (leftovers === 0) {
        const del = await fetch(`${GRAPH}${sweep.srcBase}/items/${stray.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (del.ok || del.status === 404) out.removed++;
      }
    }
  }
  return out;
}

/**
 * Full discovery: idempotently ensure the hub folder, workbook (with header row
 * + table), and documents folder all exist. This is the expensive path — it only
 * runs on a cache miss (see resolveHandles).
 */
async function discoverHandles(token: string, base: string): Promise<HubHandles> {
  const hub = await findOrCreateFolder(token, HUB_FOLDER, undefined, base);

  // ── Workbook ──
  let workbook = await findChild(token, hub.id, WORKBOOK_NAME, base);
  if (!workbook) {
    // A zero-byte .xlsx is not a valid workbook — build a real one (header row)
    // with SheetJS and upload the bytes.
    const ws   = XLSX.utils.aoa_to_sheet([[...HUB_COLUMNS]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, SHEET_NAME);
    const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const res = await fetch(
      `${GRAPH}${base}/items/${hub.id}:/${encodeURIComponent(WORKBOOK_NAME)}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: new Uint8Array(buf),
      },
    );
    if (!res.ok) throw new Error(`Could not create workbook: ${res.status} ${await res.text()}`);
    workbook = await res.json();
  }

  // ── Table over the header row (needed for concurrency-safe appends) ──
  const tablesRes  = await graphFetch(token, `${base}/items/${workbook!.id}/workbook/tables?$select=name`);
  const tables: Array<{ name: string }> = (await tablesRes.json()).value ?? [];
  let tableName = tables.find(t => t.name === TABLE_NAME)?.name ?? tables[0]?.name ?? null;

  if (!tableName) {
    const createdRes = await graphFetch(
      token,
      `${base}/items/${workbook!.id}/workbook/tables/add`,
      {
        method: 'POST',
        body: JSON.stringify({ address: `${SHEET_NAME}!A1:G1`, hasHeaders: true }),
      },
    );
    const created = await createdRes.json();
    tableName = created.name as string;
    // Stable name is nicer but cosmetic — best-effort rename.
    try {
      await graphFetch(token, `${base}/items/${workbook!.id}/workbook/tables/${tableName}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: TABLE_NAME }),
      });
      tableName = TABLE_NAME;
    } catch { /* keep generated name */ }
  }

  // ── Documents folder ──
  const docs = await findOrCreateFolder(token, DOCS_FOLDER, hub.id, base);

  // Sweep any "CYC Data Hub 1/2/3…" duplicates back into this one. Best
  // effort: discovery must never fail because a stray could not be tidied.
  try {
    const merged = await mergeStrayHubFolders(token, base, docs.id, workbook!.id, tableName);
    lastMerge = merged;
    console.log(`[data-hub] discovery on ${base}: ${merged.folders} stray hub folder(s), moved ${merged.files} file(s) + ${merged.rows} row(s), removed ${merged.removed}${merged.capped ? ' (time-capped, will continue)' : ''}`);
  } catch (err) {
    console.warn('[data-hub] stray-folder merge skipped:', err instanceof Error ? err.message : err);
  }

  return {
    workbookId:  workbook!.id,
    workbookUrl: workbook!.webUrl ?? null,
    tableName,
    sheetName:   SHEET_NAME,
    docsId:      docs.id,
    docsUrl:     docs.webUrl ?? null,
  };
}

/** Cached handle resolution — the fast path for every read and write. */
async function resolveHandles(token: string, orgCode: string, base: string): Promise<HubHandles> {
  const cached = await getCachedHandles(orgCode);
  if (cached) return cached;
  const handles = await discoverHandles(token, base);
  await setCachedHandles(orgCode, handles);
  return handles;
}

function isNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Graph API 404|itemNotFound|ItemNotFound|404:/.test(msg);
}

/**
 * Run `fn` with resolved handles, self-healing on a stale cache: if a Graph call
 * 404s (the workbook or a folder was moved/renamed/deleted in OneDrive), drop the
 * cached handles, re-discover once, and retry.
 *
 * `base` is the drive the hub lives on — the org's SharePoint document library
 * where one exists, otherwise the connecting user's OneDrive. It is resolved
 * here and passed down rather than cached with the handles, because the cached
 * handles are plain columns in Postgres and would otherwise pin an old drive.
 * A hub created on the old personal drive self-heals through the same 404 path.
 */
async function withHandles<T>(
  token: string,
  orgCode: string,
  fn: (h: HubHandles, base: string) => Promise<T>,
): Promise<T> {
  const { base } = await resolveDrive(token, orgCode);
  const handles = await resolveHandles(token, orgCode, base);
  try {
    return await fn(handles, base);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await invalidateHandles(orgCode);
    const fresh = await discoverHandles(token, base);
    await setCachedHandles(orgCode, fresh);
    return fn(fresh, base);
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Read all data rows via a single usedRange call (cheaper than the table API). */
async function readRows(token: string, h: HubHandles, base: string): Promise<HubRow[]> {
  const res = await graphFetch(
    token,
    `${base}/items/${h.workbookId}/workbook/worksheets('${encodeURIComponent(h.sheetName)}')` +
    `/usedRange(valuesOnly=true)?$select=values`,
  );
  const data = await res.json();
  const values = (data.values ?? []) as unknown[][];
  // Row 0 is the header (HUB_COLUMNS); data starts at row 1.
  const rows: HubRow[] = values.slice(1).map(v => {
    const s = (i: number) => (v[i] == null ? '' : String(v[i]));
    return {
      submitted: s(0), submittedBy: s(1), site: s(2),
      period: s(3), metric: s(4), value: s(5), notes: s(6),
    };
  }).filter(r => r.site || r.metric || r.value); // drop blank trailing cells
  rows.reverse(); // newest submissions first
  return rows;
}

async function readDocuments(token: string, h: HubHandles, base: string): Promise<HubDocument[]> {
  // Server-side $orderby/$filter are not reliable across drive kinds, so the
  // listing is plain and sorting happens here. Files one level down (a
  // "Financials" or "Board" sub-folder someone made in SharePoint) are
  // included too, tagged with the folder name, so nothing goes missing just
  // because staff organised the library.
  const top = await listChildren(token, base, h.docsId);
  const subfolders = top.filter(f => f.folder).slice(0, 25);
  const nested = await Promise.all(subfolders.map(async sf => {
    try { return (await listChildren(token, base, sf.id)).filter(f => !f.folder).map(f => ({ f, folder: sf.name })); }
    catch { return []; }
  }));
  const all = [
    ...top.filter(f => !f.folder).map(f => ({ f, folder: null as string | null })),
    ...nested.flat(),
  ];
  return all
    .map(({ f, folder }) => ({
      id:         f.id,
      name:       f.name,
      size:       f.size ?? 0,
      webUrl:     f.webUrl ?? null,
      modified:   f.lastModifiedDateTime ?? null,
      modifiedBy: f.lastModifiedBy?.user?.displayName ?? null,
      folder,
    }))
    .sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''))
    .slice(0, 100);
}

export interface HubState {
  rows:        HubRow[];
  documents:   HubDocument[];
  workbookUrl: string | null;
  docsUrl:     string | null;
  /** Where the hub physically lives, so the app can say so out loud. */
  location:    { kind: 'sharepoint' | 'personal'; label: string; webUrl: string | null };
}

/**
 * Everything the Data Hub needs in ONE resolve: rows + documents + links.
 * Handles are resolved once (from cache), then rows and documents are fetched
 * in parallel — the whole open is 2 Graph calls on a warm cache.
 */
export async function getHubState(token: string, orgCode: string): Promise<HubState> {
  return withHandles(token, orgCode, async (h, base) => {
    const [rows, documents] = await Promise.all([
      readRows(token, h, base),
      readDocuments(token, h, base),
    ]);
    // Memoized — this is a map lookup, not another Graph round-trip.
    const drive = await resolveDrive(token, orgCode);
    return {
      rows, documents,
      workbookUrl: h.workbookUrl,
      docsUrl: h.docsUrl,
      location: { kind: drive.kind, label: drive.label, webUrl: drive.webUrl },
    };
  });
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Append one submission to the shared workbook (Graph handles concurrency). */
export async function appendRow(
  token: string,
  orgCode: string,
  row: Omit<HubRow, 'submitted'>,
): Promise<void> {
  await withHandles(token, orgCode, async (h, base) => {
    const submitted = new Date().toISOString().slice(0, 10);
    await graphFetch(
      token,
      `${base}/items/${h.workbookId}/workbook/tables/${h.tableName}/rows/add`,
      {
        method: 'POST',
        body: JSON.stringify({
          values: [[
            submitted, row.submittedBy, row.site, row.period, row.metric, row.value, row.notes,
          ]],
        }),
      },
    );
  });
}

/** Upload a document into the shared folder (auto-renames on name conflict). */
export async function uploadDocument(
  token: string,
  orgCode: string,
  name: string,
  buffer: Buffer,
  contentType: string,
): Promise<HubDocument> {
  return withHandles(token, orgCode, async (h, base) => {
    const res = await fetch(
      `${GRAPH}${base}/items/${h.docsId}:/${encodeURIComponent(name)}:/content` +
      `?@microsoft.graph.conflictBehavior=rename`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType || 'application/octet-stream',
        },
        body: new Uint8Array(buffer),
      },
    );
    if (!res.ok) {
      // Surface 404 to withHandles so a moved folder self-heals.
      if (res.status === 404) throw new Error('Graph API 404: docs folder itemNotFound');
      throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    }
    const f = await res.json();
    return {
      id: f.id, name: f.name, size: f.size ?? 0, webUrl: f.webUrl ?? null,
      modified: f.lastModifiedDateTime ?? null, modifiedBy: null, folder: null,
    };
  });
}

/**
 * Operator view of where the hub resolved to and what sits at the library
 * root — for checking, without a browser, that files landed where staff see
 * them and that no numbered duplicates remain.
 */
export async function hubDiagnostics(token: string, orgCode: string): Promise<{
  drive: { kind: string; label: string; base: string; webUrl: string | null };
  root: Array<{ name: string; folder: boolean; webUrl: string | null }>;
  hub: Array<{ name: string; folder: boolean }> | null;
  documents: Array<{ name: string; folder: boolean }> | null;
  sites: Array<{ displayName: string | null; name: string | null; webUrl: string | null }>;
  lastMerge: typeof lastMerge;
  personalRoot: Array<{ name: string; folder: boolean }> | null;
  found: FoundHub[];
}> {
  const drive = await resolveDrive(token, orgCode);
  const base = drive.base;
  const rootRes = await graphFetch(token, `${base}/root/children?$select=id,name,folder,webUrl&$top=200`);
  const rootItems = ((await rootRes.json()).value ?? []) as ChildItem[];
  const root = rootItems.map(c => ({ name: c.name, folder: !!c.folder, webUrl: c.webUrl ?? null }));
  const hubItem = rootItems.find(c => c.folder && c.name === HUB_FOLDER);
  const hub = hubItem ? (await listChildren(token, base, hubItem.id)).map(c => ({ name: c.name, folder: !!c.folder })) : null;
  const cached = await getCachedHandles(orgCode);
  const documents = cached ? (await listChildren(token, base, cached.docsId).catch(() => [] as ChildItem[])).map(c => ({ name: c.name, folder: !!c.folder })) : null;
  let sites: Array<{ displayName: string | null; name: string | null; webUrl: string | null }> = [];
  const configured = process.env.SHAREPOINT_SITE;
  if (configured && !/[:.]/.test(configured)) {
    try {
      const r = await graphFetch(token, `/sites?search=${encodeURIComponent(configured)}&$select=id,displayName,name,webUrl`);
      sites = (((await r.json()).value ?? []) as Array<{ displayName?: string; name?: string; webUrl?: string }>)
        .map(x => ({ displayName: x.displayName ?? null, name: x.name ?? null, webUrl: x.webUrl ?? null }));
    } catch { /* diagnostics only */ }
  }
  let personalRoot: Array<{ name: string; folder: boolean }> | null = null;
  if (base !== PERSONAL_DRIVE) {
    try {
      const r = await graphFetch(token, `/me/drive/root/children?$select=id,name,folder&$top=200`);
      personalRoot = (((await r.json()).value ?? []) as ChildItem[]).map(c => ({ name: c.name, folder: !!c.folder }));
    } catch { /* diagnostics only */ }
  }
  const found = await findHubFoldersEverywhere(token);
  return { drive: { kind: drive.kind, label: drive.label, base, webUrl: drive.webUrl }, root, hub, documents, sites, lastMerge, personalRoot, found };
}
