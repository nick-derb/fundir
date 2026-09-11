import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { getValidToken, getIntegration } from '@/lib/oauth-tokens';
import { getHubState } from '@/lib/data-hub';
import { createServerClient } from '@/lib/supabase';

export const maxDuration = 60;

/**
 * GET — everything the Data Hub needs in one request: the shared workbook rows,
 * the shared documents, the Excel/folder links, and a connection-health block so
 * any CYC user can see the Microsoft 365 link is live (and an admin can spot a
 * stale token before it becomes a mystery).
 *
 * This replaces the old separate GET /rows and GET /documents calls, which each
 * re-resolved the OneDrive handles independently. One token fetch, one handle
 * resolution, rows + documents in parallel.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const token = await getValidToken(ctx.orgCode, 'microsoft');
  if (!token) {
    // Not an error — the UI shows a connect prompt instead of the grid.
    return NextResponse.json({ connected: false, rows: [], documents: [] });
  }

  try {
    const startedAt = Date.now();
    const state = await getHubState(token, ctx.orgCode);
    const graphMs = Date.now() - startedAt;

    // Connection-health metadata (getValidToken already refreshed if needed).
    const integration = await getIntegration(ctx.orgCode, 'microsoft');
    const expiresAt = integration?.token_expires_at ?? null;
    const msToExpiry = expiresAt ? new Date(expiresAt).getTime() - Date.now() : null;
    const tokenStatus =
      msToExpiry == null            ? 'unknown'
      : msToExpiry <= 0             ? 'expired'
      : msToExpiry < 24 * 3600_000  ? 'expiring'
      :                               'valid';

    // Which documents Fundir has actually read into the advisor's knowledge
    // base, so the table can show a real "Indexed" state instead of a guess.
    const db = createServerClient();
    const { data: chunkRows } = await db
      .from('cyc_context_chunks')
      .select('source_doc_id')
      .eq('org_id', ctx.orgId)
      .eq('kind', 'document');
    const indexedDocIds = Array.from(
      new Set((chunkRows ?? []).map(r => r.source_doc_id as string).filter(Boolean)),
    );

    return NextResponse.json({
      connected:   true,
      rows:        state.rows,
      documents:   state.documents,
      workbookUrl: state.workbookUrl,
      docsUrl:     state.docsUrl,
      location:    state.location,
      indexedDocIds,
      corpus: { documents: indexedDocIds.length, chunks: (chunkRows ?? []).length },
      health: {
        account:     integration?.user_email ?? null,
        connectedAt: integration?.connected_at ?? null,
        expiresAt,
        tokenStatus,        // 'valid' | 'expiring' | 'expired' | 'unknown'
        graphMs,            // server-measured Graph round-trip
        rowCount:    state.rows.length,
        docCount:    state.documents.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not read the shared workbook';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
