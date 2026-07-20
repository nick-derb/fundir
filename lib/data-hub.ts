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
async function findChild(token: string, parentId: string, name: string): Promise<GraphFile | null> {
  try {
    const res = await graphFetch(
      token,
      `/me/drive/items/${parentId}:/${encodeURIComponent(name)}`,
    );
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Full discovery: idempotently ensure the hub folder, workbook (with header row
 * + table), and documents folder all exist. This is the expensive path — it only
 * runs on a cache miss (see resolveHandles).
 */
async function discoverHandles(token: string): Promise<HubHandles> {
  const hub = await findOrCreateFolder(token, HUB_FOLDER);

  // ── Workbook ──
  let workbook = await findChild(token, hub.id, WORKBOOK_NAME);
  if (!workbook) {
    // A zero-byte .xlsx is not a valid workbook — build a real one (header row)
    // with SheetJS and upload the bytes.
    const ws   = XLSX.utils.aoa_to_sheet([[...HUB_COLUMNS]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, SHEET_NAME);
    const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const res = await fetch(
      `${GRAPH}/me/drive/items/${hub.id}:/${encodeURIComponent(WORKBOOK_NAME)}:/content`,
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
  const tablesRes  = await graphFetch(token, `/me/drive/items/${workbook!.id}/workbook/tables?$select=name`);
  const tables: Array<{ name: string }> = (await tablesRes.json()).value ?? [];
  let tableName = tables.find(t => t.name === TABLE_NAME)?.name ?? tables[0]?.name ?? null;

  if (!tableName) {
    const createdRes = await graphFetch(
      token,
      `/me/drive/items/${workbook!.id}/workbook/tables/add`,
      {
        method: 'POST',
        body: JSON.stringify({ address: `${SHEET_NAME}!A1:G1`, hasHeaders: true }),
      },
    );
    const created = await createdRes.json();
    tableName = created.name as string;
    // Stable name is nicer but cosmetic — best-effort rename.
    try {
      await graphFetch(token, `/me/drive/items/${workbook!.id}/workbook/tables/${tableName}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: TABLE_NAME }),
      });
      tableName = TABLE_NAME;
    } catch { /* keep generated name */ }
  }

  // ── Documents folder ──
  const docs = await findOrCreateFolder(token, DOCS_FOLDER, hub.id);

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
async function resolveHandles(token: string, orgCode: string): Promise<HubHandles> {
  const cached = await getCachedHandles(orgCode);
  if (cached) return cached;
  const handles = await discoverHandles(token);
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
 */
async function withHandles<T>(
  token: string,
  orgCode: string,
  fn: (h: HubHandles) => Promise<T>,
): Promise<T> {
  const handles = await resolveHandles(token, orgCode);
  try {
    return await fn(handles);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    invalidateHandles(orgCode);
    const fresh = await discoverHandles(token);
    await setCachedHandles(orgCode, fresh);
    return fn(fresh);
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Read all data rows via a single usedRange call (cheaper than the table API). */
async function readRows(token: string, h: HubHandles): Promise<HubRow[]> {
  const res = await graphFetch(
    token,
    `/me/drive/items/${h.workbookId}/workbook/worksheets('${encodeURIComponent(h.sheetName)}')` +
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

async function readDocuments(token: string, h: HubHandles): Promise<HubDocument[]> {
  const res = await graphFetch(
    token,
    `/me/drive/items/${h.docsId}/children` +
    `?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,folder` +
    `&$orderby=lastModifiedDateTime desc&$top=50`,
  );
  const data = await res.json();
  return ((data.value ?? []) as Array<{
    id: string; name: string; size?: number; webUrl?: string;
    lastModifiedDateTime?: string; folder?: unknown;
    lastModifiedBy?: { user?: { displayName?: string } };
  }>)
    .filter(f => !f.folder)
    .map(f => ({
      id:         f.id,
      name:       f.name,
      size:       f.size ?? 0,
      webUrl:     f.webUrl ?? null,
      modified:   f.lastModifiedDateTime ?? null,
      modifiedBy: f.lastModifiedBy?.user?.displayName ?? null,
    }));
}

export interface HubState {
  rows:        HubRow[];
  documents:   HubDocument[];
  workbookUrl: string | null;
  docsUrl:     string | null;
}

/**
 * Everything the Data Hub needs in ONE resolve: rows + documents + links.
 * Handles are resolved once (from cache), then rows and documents are fetched
 * in parallel — the whole open is 2 Graph calls on a warm cache.
 */
export async function getHubState(token: string, orgCode: string): Promise<HubState> {
  return withHandles(token, orgCode, async (h) => {
    const [rows, documents] = await Promise.all([
      readRows(token, h),
      readDocuments(token, h),
    ]);
    return { rows, documents, workbookUrl: h.workbookUrl, docsUrl: h.docsUrl };
  });
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Append one submission to the shared workbook (Graph handles concurrency). */
export async function appendRow(
  token: string,
  orgCode: string,
  row: Omit<HubRow, 'submitted'>,
): Promise<void> {
  await withHandles(token, orgCode, async (h) => {
    const submitted = new Date().toISOString().slice(0, 10);
    await graphFetch(
      token,
      `/me/drive/items/${h.workbookId}/workbook/tables/${h.tableName}/rows/add`,
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
  return withHandles(token, orgCode, async (h) => {
    const res = await fetch(
      `${GRAPH}/me/drive/items/${h.docsId}:/${encodeURIComponent(name)}:/content` +
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
      modified: f.lastModifiedDateTime ?? null, modifiedBy: null,
    };
  });
}
