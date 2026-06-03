import { NextRequest, NextResponse } from 'next/server';
import { getValidToken } from '@/lib/oauth-tokens';
import { getAuthContext } from '@/lib/auth-context';
import { listDriveFiles } from '@/lib/google-drive';
import { listOneDriveFiles } from '@/lib/microsoft-graph';

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const provider = searchParams.get('provider') as 'google' | 'microsoft' | null;
  const search   = searchParams.get('q') ?? undefined;
  const folderId = searchParams.get('folder') ?? undefined;

  if (!provider) {
    return NextResponse.json({ error: 'provider required' }, { status: 400 });
  }

  // Org code comes from auth, never from the URL — would otherwise let any
  // caller use any org's stored OAuth token to list Drive/OneDrive contents.
  const token = await getValidToken(ctx.orgCode, provider);
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  try {
    const files =
      provider === 'google'
        ? await listDriveFiles(token, search, folderId)
        : await listOneDriveFiles(token, search, folderId);

    return NextResponse.json({ files });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
