// CYC Data Hub — the shared Excel workbook in OneDrive IS the source of truth.
//
// Architecture (deliberate, per Microsoft-first direction): rows live in a real
// workbook ("CYC Data Collection.xlsx" under /CYC Data Hub) that the whole org
// can also open in Excel or Teams. The app reads and appends through Microsoft
// Graph's workbook-table API, so:
//   - a site director's submission is instantly visible to everyone (app + Excel)
//   - edits made directly in Excel show up in the app on refresh
//   - appends are handled server-side by Graph (safe under concurrency)
// Uploaded documents (990s, audited statements, …) live next to it in
// /CYC Data Hub/Documents so one person's upload is everyone's file.

import * as XLSX from 'xlsx';
import { graphFetch, findOrCreateFolder } from '@/lib/microsoft-graph';
import type { GraphFile } from '@/lib/microsoft-graph';

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

interface HubHandles {
  workbookId:  string;
  workbookUrl: string | null;
  tableName:   string;
  docsId:      string;
  docsUrl:     string | null;
}

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
 * Idempotently ensure the hub folder, workbook (with header row + table), and
 * documents folder all exist, returning handles for the caller.
 */
export async function ensureHub(token: string): Promise<HubHandles> {
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
    docsId:      docs.id,
    docsUrl:     docs.webUrl ?? null,
  };
}

/** All rows, newest first, plus links for "Open in Excel" / "Open folder". */
export async function listRows(token: string): Promise<{
  rows: HubRow[];
  workbookUrl: string | null;
  docsUrl: string | null;
}> {
  const hub = await ensureHub(token);
  const res = await graphFetch(
    token,
    `/me/drive/items/${hub.workbookId}/workbook/tables/${hub.tableName}/rows`,
  );
  const data = await res.json();
  const rows: HubRow[] = ((data.value ?? []) as Array<{ values?: unknown[][] }>).map(r => {
    const v = (r.values?.[0] ?? []) as unknown[];
    const s = (i: number) => (v[i] == null ? '' : String(v[i]));
    return {
      submitted: s(0), submittedBy: s(1), site: s(2),
      period: s(3), metric: s(4), value: s(5), notes: s(6),
    };
  });
  rows.reverse(); // newest submissions first
  return { rows, workbookUrl: hub.workbookUrl, docsUrl: hub.docsUrl };
}

/** Append one submission to the shared workbook (Graph handles concurrency). */
export async function appendRow(
  token: string,
  row: Omit<HubRow, 'submitted'>,
): Promise<void> {
  const hub = await ensureHub(token);
  const submitted = new Date().toISOString().slice(0, 10);
  await graphFetch(
    token,
    `/me/drive/items/${hub.workbookId}/workbook/tables/${hub.tableName}/rows/add`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [[
          submitted, row.submittedBy, row.site, row.period, row.metric, row.value, row.notes,
        ]],
      }),
    },
  );
}

/** Shared documents (990s, audited statements, …), newest first. */
export async function listDocuments(token: string): Promise<{
  documents: HubDocument[];
  docsUrl: string | null;
}> {
  const hub = await ensureHub(token);
  const res = await graphFetch(
    token,
    `/me/drive/items/${hub.docsId}/children` +
    `?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,folder` +
    `&$orderby=lastModifiedDateTime desc&$top=50`,
  );
  const data = await res.json();
  const documents: HubDocument[] = ((data.value ?? []) as Array<{
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
  return { documents, docsUrl: hub.docsUrl };
}

/** Upload a document into the shared folder (auto-renames on name conflict). */
export async function uploadDocument(
  token: string,
  name: string,
  buffer: Buffer,
  contentType: string,
): Promise<HubDocument> {
  const hub = await ensureHub(token);
  const res = await fetch(
    `${GRAPH}/me/drive/items/${hub.docsId}:/${encodeURIComponent(name)}:/content` +
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
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  const f = await res.json();
  return {
    id: f.id, name: f.name, size: f.size ?? 0, webUrl: f.webUrl ?? null,
    modified: f.lastModifiedDateTime ?? null, modifiedBy: null,
  };
}
