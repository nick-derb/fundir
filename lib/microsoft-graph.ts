// Microsoft Graph API helpers — OneDrive, Excel, Word

const GRAPH = 'https://graph.microsoft.com/v1.0';

export interface GraphFile {
  id: string;
  name: string;
  file?: { mimeType: string };
  folder?: { childCount: number };
  lastModifiedDateTime: string;
  size?: number;
  webUrl?: string;
}

async function graphFetch(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${GRAPH}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API ${res.status}: ${err}`);
  }
  return res;
}

const FINANCIAL_EXTENSIONS = [
  '.xlsx', '.xls', '.csv', '.docx', '.doc', '.pdf', '.pptx',
];

function isFinancialFile(f: GraphFile): boolean {
  if (f.folder) return false;
  const name = f.name.toLowerCase();
  return FINANCIAL_EXTENSIONS.some(ext => name.endsWith(ext));
}

export async function listOneDriveFiles(
  token: string,
  search?: string,
  folderId?: string,
): Promise<GraphFile[]> {
  const select =
    '$select=id,name,file,folder,lastModifiedDateTime,size,webUrl';
  let path: string;

  if (search) {
    path = `/me/drive/root/search(q='${encodeURIComponent(search)}')?${select}&$top=40`;
  } else if (folderId) {
    path = `/me/drive/items/${folderId}/children?${select}&$top=40&$orderby=lastModifiedDateTime+desc`;
  } else {
    path = `/me/drive/root/children?${select}&$top=40&$orderby=lastModifiedDateTime+desc`;
  }

  const res = await graphFetch(token, path);
  const data = await res.json();
  const files: GraphFile[] = data.value ?? [];
  return files.filter(isFinancialFile);
}

export async function listFolderItems(
  token: string,
  folderId: string,
): Promise<GraphFile[]> {
  const res = await graphFetch(
    token,
    `/me/drive/items/${folderId}/children?$select=id,name,file,folder,lastModifiedDateTime,size,webUrl&$top=40&$orderby=lastModifiedDateTime+desc`,
  );
  const data = await res.json();
  return (data.value ?? []) as GraphFile[];
}

export async function extractExcelContent(
  token: string,
  itemId: string,
): Promise<string> {
  const sheetsRes = await graphFetch(
    token,
    `/me/drive/items/${itemId}/workbook/worksheets`,
  );
  const sheetsData = await sheetsRes.json();
  const sheets: Array<{ name: string }> = sheetsData.value ?? [];
  const parts: string[] = [];

  for (const sheet of sheets.slice(0, 8)) {
    const sheetName = sheet.name;
    try {
      const rangeRes = await graphFetch(
        token,
        `/me/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='A1:Z500')`,
      );
      const rangeData = await rangeRes.json();
      const rows: string[][] = rangeData.values ?? [];
      if (rows.length === 0) continue;
      parts.push(`\n=== Sheet: ${sheetName} ===`);
      parts.push(rows.map(r => r.map(c => c ?? '').join('\t')).join('\n'));
    } catch {
      // skip inaccessible sheets
    }
  }

  return parts.join('\n');
}

export async function extractWordContent(
  token: string,
  itemId: string,
): Promise<string> {
  // Download raw bytes and extract readable text from docx XML
  const res = await graphFetch(token, `/me/drive/items/${itemId}/content`);
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  // docx files are ZIP archives; XML text runs are in <w:t> elements
  const raw = buf.toString('binary');
  const matches = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
  const text = matches
    .map(m => m.replace(/<[^>]+>/g, ''))
    .filter(t => t.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 100_000);
}

export async function extractPowerPointContent(
  token: string,
  itemId: string,
): Promise<string> {
  // Best-effort: pptx slide text lives in <a:t> runs (same ZIP-XML trick as docx)
  const res = await graphFetch(token, `/me/drive/items/${itemId}/content`);
  const buf = Buffer.from(await res.arrayBuffer());
  const raw = buf.toString('binary');
  const matches = raw.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
  return matches
    .map(m => m.replace(/<[^>]+>/g, ''))
    .filter(t => t.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100_000);
}

/** Raw file bytes as base64 — used to hand PDFs to Claude natively. */
export async function downloadFileBase64(
  token: string,
  itemId: string,
): Promise<{ base64: string; bytes: number }> {
  const res = await graphFetch(token, `/me/drive/items/${itemId}/content`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), bytes: buf.byteLength };
}

export async function extractContent(
  token: string,
  file: GraphFile,
): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return extractExcelContent(token, file.id);
  }
  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    return extractWordContent(token, file.id);
  }
  if (name.endsWith('.pptx')) {
    return extractPowerPointContent(token, file.id);
  }
  // CSV or text files
  const res = await graphFetch(token, `/me/drive/items/${file.id}/content`);
  return res.text();
}

export async function findOrCreateFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<GraphFile> {
  // Try to find existing folder
  try {
    const searchPath = parentId
      ? `/me/drive/items/${parentId}/children?$filter=name eq '${name}' and folder ne null&$select=id,name,webUrl,folder`
      : `/me/drive/root/children?$filter=name eq '${name}' and folder ne null&$select=id,name,webUrl,folder`;
    const res = await graphFetch(token, searchPath);
    const data = await res.json();
    if (data.value?.[0]) return data.value[0];
  } catch {
    // not found — create
  }

  const path = parentId
    ? `/me/drive/items/${parentId}/children`
    : '/me/drive/root/children';

  const res = await graphFetch(token, path, {
    method: 'POST',
    body: JSON.stringify({
      name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  });
  return res.json();
}

export async function createWordDoc(
  token: string,
  name: string,
  parentId: string,
): Promise<GraphFile> {
  const docName = name.endsWith('.docx') ? name : `${name}.docx`;
  // Create an empty docx by uploading minimal bytes
  const uploadPath = `/me/drive/items/${parentId}:/${encodeURIComponent(docName)}:/content`;
  const res = await fetch(`${GRAPH}${uploadPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    body: new Uint8Array(0),
  });
  return res.json();
}

export async function createExcelFile(
  token: string,
  name: string,
  parentId: string,
): Promise<GraphFile> {
  const docName = name.endsWith('.xlsx') ? name : `${name}.xlsx`;
  const uploadPath = `/me/drive/items/${parentId}:/${encodeURIComponent(docName)}:/content`;
  const res = await fetch(`${GRAPH}${uploadPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: new Uint8Array(0),
  });
  return res.json();
}

export async function getUserEmail(token: string): Promise<string> {
  const res = await graphFetch(token, '/me?$select=mail,userPrincipalName');
  const data = await res.json();
  return data.mail ?? data.userPrincipalName ?? '';
}
