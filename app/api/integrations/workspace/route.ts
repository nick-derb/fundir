import { NextRequest, NextResponse } from 'next/server';
import { getValidToken } from '@/lib/oauth-tokens';
import {
  findOrCreateFolder,
  listFolderContents,
  createGoogleDoc,
  createGoogleSheet,
} from '@/lib/google-drive';
import {
  findOrCreateFolder as findOrCreateMsFolder,
  listFolderItems,
  createWordDoc,
  createExcelFile,
} from '@/lib/microsoft-graph';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';

export const maxDuration = 30;

const ROOT_FOLDER = 'Fundir';
const GRANTS_FOLDER = 'Grants';

function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').slice(0, 80);
}

/** GET — list files in grant workspace folder */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const provider  = searchParams.get('provider') as 'google' | 'microsoft' | null;
  const matchId   = searchParams.get('matchId');

  if (!provider || !matchId) {
    return NextResponse.json({ error: 'provider and matchId required' }, { status: 400 });
  }

  // Org code from auth — never from the URL.
  const token = await getValidToken(ctx.orgCode, provider);
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  // Check if we have a stored folder ID
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('grant_workspaces')
    .select('*')
    .eq('match_id', matchId)
    .eq('provider', provider)
    .single();

  if (!existing) {
    return NextResponse.json({ folder: null, files: [] });
  }

  try {
    const files =
      provider === 'google'
        ? await listFolderContents(token, existing.folder_id)
        : await listFolderItems(token, existing.folder_id);

    return NextResponse.json({
      folder: { id: existing.folder_id, url: existing.folder_url },
      files,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list files';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST — create or initialize grant workspace folder */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const {
    provider,
    matchId,
    grantTitle,
    action = 'init',
    docName,
    docType = 'doc',
  } = await req.json() as {
    provider: 'google' | 'microsoft';
    matchId: string;
    grantTitle: string;
    action?: 'init' | 'create_doc';
    docName?: string;
    docType?: 'doc' | 'sheet';
  };

  // Org code from auth — never from the body.
  const token = await getValidToken(ctx.orgCode, provider);
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  const supabase = createServerClient();

  if (action === 'init') {
    try {
      let folderId: string;
      let folderUrl: string | undefined;

      if (provider === 'google') {
        const root   = await findOrCreateFolder(token, ROOT_FOLDER);
        const grants = await findOrCreateFolder(token, GRANTS_FOLDER, root.id);
        const grant  = await findOrCreateFolder(
          token,
          sanitizeName(grantTitle),
          grants.id,
        );
        folderId = grant.id;
        folderUrl = grant.webViewLink;
      } else {
        const root   = await findOrCreateMsFolder(token, ROOT_FOLDER);
        const grants = await findOrCreateMsFolder(token, GRANTS_FOLDER, root.id);
        const grant  = await findOrCreateMsFolder(
          token,
          sanitizeName(grantTitle),
          grants.id,
        );
        folderId = grant.id;
        folderUrl = grant.webUrl;
      }

      // Store in Supabase
      await supabase.from('grant_workspaces').upsert(
        {
          match_id:   matchId,
          provider,
          folder_id:  folderId,
          folder_url: folderUrl,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'match_id,provider' },
      );

      return NextResponse.json({
        folder: { id: folderId, url: folderUrl },
        files: [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create workspace';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === 'create_doc') {
    const { data: workspace } = await supabase
      .from('grant_workspaces')
      .select('folder_id')
      .eq('match_id', matchId)
      .eq('provider', provider)
      .single();

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not initialized' }, { status: 404 });
    }

    const name = docName ?? 'New Document';
    try {
      let file;
      if (provider === 'google') {
        file =
          docType === 'sheet'
            ? await createGoogleSheet(token, name, workspace.folder_id)
            : await createGoogleDoc(token, name, workspace.folder_id);
      } else {
        file =
          docType === 'sheet'
            ? await createExcelFile(token, name, workspace.folder_id)
            : await createWordDoc(token, name, workspace.folder_id);
      }
      return NextResponse.json({ file });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create document';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
