// Handle cache for the CYC Data Hub.
//
// The OneDrive handles (workbook id, table name, docs folder id, …) are stable
// per org, but resolving them from Graph is the single biggest cost of opening
// the Data Hub. We cache them in two layers:
//
//   1. in-memory  — a module-level Map with a short TTL. Free, instant, and
//      survives across requests on a warm serverless instance (most opens).
//   2. Supabase   — the data_hub_state table. Survives cold starts and is shared
//      across every instance, so the very first open of the day is fast too.
//
// It is a cache, not a source of truth: callers invalidate() on a Graph 404 and
// re-discover. If the Supabase table is absent (migration not yet applied), the
// persistent layer silently no-ops and the in-memory layer still does its job.

import { createServerClient } from '@/lib/supabase';
import type { HubHandles } from '@/lib/data-hub';

const TTL_MS = 10 * 60 * 1000; // 10 minutes

const mem = new Map<string, { handles: HubHandles; expires: number }>();

interface StateRow {
  org_code:     string;
  workbook_id:  string;
  workbook_url: string | null;
  table_name:   string;
  sheet_name:   string;
  docs_id:      string;
  docs_url:     string | null;
}

function rowToHandles(r: StateRow): HubHandles {
  return {
    workbookId:  r.workbook_id,
    workbookUrl: r.workbook_url,
    tableName:   r.table_name,
    sheetName:   r.sheet_name,
    docsId:      r.docs_id,
    docsUrl:     r.docs_url,
  };
}

/** In-memory first, then Supabase; returns null on a full miss. */
export async function getCachedHandles(orgCode: string): Promise<HubHandles | null> {
  const hit = mem.get(orgCode);
  if (hit && hit.expires > Date.now()) return hit.handles;

  try {
    const db = createServerClient();
    const { data } = await db
      .from('data_hub_state')
      .select('*')
      .eq('org_code', orgCode)
      .single();
    if (data) {
      const handles = rowToHandles(data as StateRow);
      mem.set(orgCode, { handles, expires: Date.now() + TTL_MS });
      return handles;
    }
  } catch {
    // table missing or unreachable — fall back to in-memory only
  }
  return null;
}

/** Write both layers. Supabase write is best-effort. */
export async function setCachedHandles(orgCode: string, handles: HubHandles): Promise<void> {
  mem.set(orgCode, { handles, expires: Date.now() + TTL_MS });
  try {
    const db = createServerClient();
    await db.from('data_hub_state').upsert(
      {
        org_code:     orgCode,
        workbook_id:  handles.workbookId,
        workbook_url: handles.workbookUrl,
        table_name:   handles.tableName,
        sheet_name:   handles.sheetName,
        docs_id:      handles.docsId,
        docs_url:     handles.docsUrl,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'org_code' },
    );
  } catch {
    // best-effort — in-memory cache still holds
  }
}

/** Drop both layers (called when a handle 404s so the next read re-discovers). */
export function invalidateHandles(orgCode: string): void {
  mem.delete(orgCode);
  // Fire-and-forget; a stale persistent row would just be overwritten anyway.
  try {
    const db = createServerClient();
    void db.from('data_hub_state').delete().eq('org_code', orgCode);
  } catch {
    /* ignore */
  }
}
