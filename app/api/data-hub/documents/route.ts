import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { getValidToken } from '@/lib/oauth-tokens';
import { uploadDocument } from '@/lib/data-hub';
import { indexDocument } from '@/lib/cyc-context/documents';

// Upload + inline RAG indexing (extract → embed) can take a moment for a PDF.
export const maxDuration = 120;

// Listing is served by GET /api/data-hub/state (rows + documents + health in one
// resolve). This route is upload-only.

/** POST — upload a document into the shared OneDrive folder. */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const token = await getValidToken(ctx.orgCode, 'microsoft');
  if (!token) {
    return NextResponse.json({ error: 'Microsoft 365 is not connected for this organization' }, { status: 409 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  // Keep uploads inside serverless request-body limits.
  if (file.size > 4_000_000) {
    return NextResponse.json({ error: 'File too large (max ~4MB). For bigger files, drop them straight into the OneDrive folder.' }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await uploadDocument(token, ctx.orgCode, file.name, buffer, file.type);

    // Feed the advisor's knowledge base: extract → chunk → embed → index this
    // document so the agent can retrieve from it immediately. Best-effort — a
    // failed/unsupported index must never fail the upload itself. The uploader
    // can opt out (Data Hub consent checkbox), in which case the file is stored
    // in OneDrive but never read into the corpus.
    const wantsIndex = String(formData.get('index') ?? 'true') !== 'false';
    let indexed = 0;
    let skipped: string | undefined;
    if (wantsIndex) {
      try {
        const r = await indexDocument(ctx.orgId, token, { id: doc.id, name: doc.name });
        indexed = r.chunks;
        skipped = r.skipped;
      } catch (e) {
        console.error('doc index failed', doc.name, e instanceof Error ? e.message : e);
        skipped = 'indexing failed';
      }
    } else {
      skipped = 'not indexed by request';
    }

    return NextResponse.json({ ok: true, document: doc, indexed, skipped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
