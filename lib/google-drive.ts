// Google Drive, Sheets, and Docs API helpers

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
}

const FINANCIAL_MIME_TYPES = [
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/pdf',
].map(m => `mimeType='${m}'`).join(' or ');

async function driveGet(token: string, path: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API ${res.status}: ${err}`);
  }
  return res;
}

export async function listDriveFiles(
  token: string,
  search?: string,
  folderId?: string,
): Promise<DriveFile[]> {
  const conditions = [
    'trashed=false',
    `(${FINANCIAL_MIME_TYPES})`,
    folderId ? `'${folderId}' in parents` : null,
    search
      ? `(name contains '${search.replace(/'/g, "\\'")}' or fullText contains '${search.replace(/'/g, "\\'")}')`
      : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const url = `files?q=${encodeURIComponent(conditions)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink)&orderBy=modifiedTime+desc&pageSize=40`;
  const res = await driveGet(token, url);
  const data = await res.json();
  return data.files ?? [];
}

export async function listFolderContents(
  token: string,
  folderId: string,
): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const url = `files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink)&orderBy=modifiedTime+desc`;
  const res = await driveGet(token, url);
  const data = await res.json();
  return data.files ?? [];
}

export async function extractSheetContent(
  token: string,
  fileId: string,
): Promise<string> {
  const metaRes = await driveGet(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets.properties`.replace(
      'https://www.googleapis.com/drive/v3/',
      '',
    ),
  );
  // Use full URL for Sheets API
  const sheetsRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!sheetsRes.ok) throw new Error('Cannot read spreadsheet');

  const meta = await sheetsRes.json();
  const sheets: Array<{ properties: { title: string } }> = meta.sheets ?? [];
  const parts: string[] = [];

  for (const sheet of sheets.slice(0, 8)) {
    const sheetName = sheet.properties.title;
    const range = encodeURIComponent(`${sheetName}!A1:Z500`);
    const valRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${range}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!valRes.ok) continue;
    const vals = await valRes.json();
    const rows: string[][] = vals.values ?? [];
    if (rows.length === 0) continue;
    parts.push(`\n=== Sheet: ${sheetName} ===`);
    parts.push(rows.map(r => r.join('\t')).join('\n'));
  }

  return parts.join('\n');
}

export async function extractDocContent(
  token: string,
  fileId: string,
  mimeType: string,
): Promise<string> {
  if (
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    // If it's a native Google Sheet, use Sheets API
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return extractSheetContent(token, fileId);
    }
    // Uploaded xlsx — export as CSV
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fcsv`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error('Cannot export spreadsheet');
    return res.text();
  }

  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error('Cannot export document');
    return res.text();
  }

  // PDF or binary Word doc — export as text best-effort
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.ok) return res.text();

  // Fallback: get file metadata for context
  const metaRes = await driveGet(token, `files/${fileId}?fields=name,description`);
  const meta = await metaRes.json();
  return `File: ${meta.name}\n(Binary content — text extraction not available for this file type)`;
}

export async function findOrCreateFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const conditions = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const searchRes = await driveGet(
    token,
    `files?q=${encodeURIComponent(conditions)}&fields=files(id,name,mimeType,webViewLink)`,
  );
  const searchData = await searchRes.json();
  if (searchData.files?.[0]) return searchData.files[0];

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : [],
      }),
    },
  );
  return createRes.json();
}

export async function createGoogleDoc(
  token: string,
  name: string,
  parentId: string,
): Promise<DriveFile> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
    }),
  });
  return res.json();
}

export async function createGoogleSheet(
  token: string,
  name: string,
  parentId: string,
): Promise<DriveFile> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [parentId],
    }),
  });
  return res.json();
}
