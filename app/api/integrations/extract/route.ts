import { NextRequest, NextResponse } from 'next/server';
import { getValidToken } from '@/lib/oauth-tokens';
import { getAuthContext } from '@/lib/auth-context';
import { extractDocContent } from '@/lib/google-drive';
import { extractContent } from '@/lib/microsoft-graph';
import type { GraphFile } from '@/lib/microsoft-graph';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { provider, fileId, mimeType, fileName } =
    await req.json() as {
      provider: 'google' | 'microsoft';
      fileId: string;
      mimeType?: string;
      fileName?: string;
    };

  // Org code from auth — never trust the body.
  const token = await getValidToken(ctx.orgCode, provider);
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  try {
    let content: string;

    if (provider === 'google') {
      content = await extractDocContent(token, fileId, mimeType ?? '');
    } else {
      const file: GraphFile = {
        id: fileId,
        name: fileName ?? 'document',
        lastModifiedDateTime: '',
        file: mimeType ? { mimeType } : undefined,
      };
      content = await extractContent(token, file);
    }

    // Truncate to ~150k chars to stay within Claude's context window
    const truncated = content.slice(0, 150_000);
    return NextResponse.json({
      content: truncated,
      truncated: content.length > 150_000,
      chars: truncated.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
