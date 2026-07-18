import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { getValidToken } from '@/lib/oauth-tokens';
import { listDocuments, uploadDocument } from '@/lib/data-hub';

export const maxDuration = 60;

/** GET — shared documents (990s, audited statements, …), newest first. */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const token = await getValidToken(ctx.orgCode, 'microsoft');
  if (!token) return NextResponse.json({ connected: false, documents: [] });

  try {
    const { documents, docsUrl } = await listDocuments(token);
    return NextResponse.json({ connected: true, documents, docsUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not list shared documents';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
    const doc = await uploadDocument(token, file.name, buffer, file.type);
    return NextResponse.json({ ok: true, document: doc });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
