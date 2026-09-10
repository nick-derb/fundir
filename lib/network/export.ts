// Network → files. Kept as the stable entry point (the refresh flow and the
// export route call these); the actual snapshot lives in snapshot.ts, which
// produces the thirteen-sheet workbook and the matching JSON.

import { createServerClient } from '@/lib/supabase';
import { buildSnapshot, workbookFromSnapshot, workbookBuffer, snapshotJson, snapshotNames, type Snapshot } from '@/lib/network/snapshot';

export function networkWorkbookName(): string { return snapshotNames().xlsx; }
export function networkJsonName(): string { return snapshotNames().json; }

export async function buildNetworkSnapshot(orgId: string): Promise<Snapshot> {
  return buildSnapshot(createServerClient(), orgId);
}
export async function buildNetworkWorkbook(orgId: string, snapshot?: Snapshot): Promise<Buffer> {
  return workbookBuffer(workbookFromSnapshot(snapshot ?? await buildNetworkSnapshot(orgId)));
}
export async function buildNetworkJson(orgId: string, snapshot?: Snapshot): Promise<Buffer> {
  return snapshotJson(snapshot ?? await buildNetworkSnapshot(orgId));
}
