'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, Plus, Loader2, ExternalLink, FileText,
  FileSpreadsheet, File, AlertTriangle, FolderPlus,
} from 'lucide-react';

interface WorkspaceFile {
  id:          string;
  name:        string;
  webViewLink?: string;
  webUrl?:     string;
  file?:       { mimeType: string };
  mimeType?:   string;
  lastModifiedDateTime?: string;
  modifiedTime?: string;
}

interface WorkspaceFolder {
  id:  string;
  url: string | null;
}

interface GrantWorkspaceProps {
  matchId:            string;
  grantTitle:         string;
  orgCode:            string;
  googleConnected:    boolean;
  microsoftConnected: boolean;
}

type Provider = 'google' | 'microsoft';

function fileIcon(f: WorkspaceFile) {
  const name = f.name.toLowerCase();
  const mime = (f.mimeType ?? f.file?.mimeType ?? '').toLowerCase();
  if (mime.includes('spreadsheet') || mime.includes('sheet') || name.endsWith('.xlsx') || name.endsWith('.xls'))
    return <FileSpreadsheet className="w-3.5 h-3.5 text-[#16a34a]" />;
  if (mime.includes('document') || mime.includes('word') || name.endsWith('.docx') || name.endsWith('.doc'))
    return <FileText className="w-3.5 h-3.5 text-[#2563eb]" />;
  return <File className="w-3.5 h-3.5 text-[#64748b]" />;
}

function formatDate(f: WorkspaceFile): string {
  const raw = f.modifiedTime ?? f.lastModifiedDateTime;
  if (!raw) return '';
  return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TEMPLATE_DOCS = [
  { name: 'Letter of Inquiry (LOI)', type: 'doc'   },
  { name: 'Grant Narrative',         type: 'doc'   },
  { name: 'Budget Worksheet',        type: 'sheet' },
  { name: 'Cover Letter',            type: 'doc'   },
];

export function GrantWorkspace({
  matchId,
  grantTitle,
  orgCode,
  googleConnected,
  microsoftConnected,
}: GrantWorkspaceProps) {
  const [activeProvider, setActiveProvider] = useState<Provider | null>(
    googleConnected ? 'google' : microsoftConnected ? 'microsoft' : null,
  );
  const [folder,   setFolder]   = useState<WorkspaceFolder | null>(null);
  const [files,    setFiles]    = useState<WorkspaceFile[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const provider = activeProvider;

  const loadWorkspace = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/integrations/workspace?provider=${provider}&matchId=${matchId}&org=${orgCode}`,
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFolder(data.folder);
      setFiles(data.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [provider, matchId, orgCode]);

  useEffect(() => {
    if (provider) loadWorkspace();
  }, [provider, loadWorkspace]);

  async function initWorkspace() {
    if (!provider) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          matchId,
          grantTitle,
          orgCode,
          action: 'init',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFolder(data.folder);
      setFiles(data.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  }

  async function createDoc(name: string, docType: 'doc' | 'sheet') {
    if (!provider || !folder) return;
    setCreating(name);
    try {
      const res = await fetch('/api/integrations/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          matchId,
          grantTitle,
          orgCode,
          action:  'create_doc',
          docName: name,
          docType,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document');
    } finally {
      setCreating(null);
    }
  }

  const anyConnected = googleConnected || microsoftConnected;

  // ── Not connected ────────────────────────────────────────────────────────────
  if (!anyConnected) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0]">
        <AlertTriangle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-bold text-[#0f172a]">Connect cloud storage to use workspace</p>
          <p className="text-[12px] text-[#64748b] mt-0.5">
            Connect Google Workspace or Microsoft 365 in{' '}
            <a href="/settings" className="text-[#0d9488] hover:underline">Settings</a>{' '}
            to create and manage grant documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Provider toggle */}
      {googleConnected && microsoftConnected && (
        <div className="flex gap-2">
          {(['google', 'microsoft'] as Provider[]).map(p => (
            <button
              key={p}
              onClick={() => { setActiveProvider(p); setFolder(null); setFiles([]); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all border ${
                activeProvider === p
                  ? 'border-[#0d9488] bg-[#f0fdfa] text-[#0d9488]'
                  : 'border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#0d9488]'
              }`}
            >
              {p === 'google' ? 'Google Drive' : 'OneDrive'}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-6 justify-center text-[#64748b]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-[13px]">Loading workspace…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-2 p-3 rounded-[8px] bg-red-50 border border-red-100">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-700">{error}</p>
        </div>
      )}

      {/* No workspace yet */}
      {!loading && !folder && !error && (
        <div className="flex flex-col items-center gap-4 py-8 border-2 border-dashed border-[#e2e8f0] rounded-[12px]">
          <div className="w-12 h-12 rounded-xl bg-[#f0fdfa] flex items-center justify-center">
            <FolderPlus className="w-5 h-5 text-[#0d9488]" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-bold text-[#0f172a]">Create Grant Workspace</p>
            <p className="text-[12px] text-[#64748b] mt-1 max-w-xs">
              Set up a dedicated folder in{' '}
              {provider === 'google' ? 'Google Drive' : 'OneDrive'} for this grant.
              Fundir will create it at{' '}
              <span className="font-mono text-[#0d9488]">Fundir/Grants/{grantTitle.slice(0, 30)}</span>
            </p>
          </div>
          <button
            onClick={initWorkspace}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-[13px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Create Workspace
          </button>
        </div>
      )}

      {/* Active workspace */}
      {!loading && folder && (
        <>
          {/* Folder header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#0d9488]" />
              <span className="text-[13px] font-semibold text-[#0f172a]">
                Fundir / Grants / {grantTitle.slice(0, 40)}
              </span>
            </div>
            {folder.url && (
              <a
                href={folder.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-[#0d9488] hover:underline"
              >
                Open folder
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Files list */}
          <div className="bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
            {files.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-[12px] text-[#94a3b8]">
                  No documents yet. Create one below.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#f8fafc]">
                {files.map(f => {
                  const url = f.webViewLink ?? f.webUrl;
                  return (
                    <li key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8fafc] transition-colors">
                      <div className="w-6 h-6 rounded-[4px] bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
                        {fileIcon(f)}
                      </div>
                      <span className="text-[13px] text-[#0f172a] flex-1 min-w-0 truncate">
                        {f.name}
                      </span>
                      <span className="text-[11px] text-[#94a3b8] flex-shrink-0">
                        {formatDate(f)}
                      </span>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 p-1 rounded hover:bg-[#f1f5f9] text-[#94a3b8] hover:text-[#0d9488] transition-colors"
                          title="Open"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Create new document */}
          <div>
            <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">
              Add Document
            </p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_DOCS.map(({ name, type }) => (
                <button
                  key={name}
                  onClick={() => createDoc(name, type as 'doc' | 'sheet')}
                  disabled={creating === name}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[7px] text-[12px] font-medium border border-[#e2e8f0] hover:border-[#0d9488] hover:bg-[#f0fdfa] transition-all text-[#475569] hover:text-[#0d9488] disabled:opacity-50"
                >
                  {creating === name ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : type === 'sheet' ? (
                    <FileSpreadsheet className="w-3 h-3" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  {name}
                </button>
              ))}
              <button
                onClick={() => {
                  const n = window.prompt('Document name:');
                  if (n?.trim()) createDoc(n.trim(), 'doc');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-[7px] text-[12px] font-medium border border-dashed border-[#e2e8f0] hover:border-[#0d9488] text-[#94a3b8] hover:text-[#0d9488] transition-all"
              >
                <Plus className="w-3 h-3" />
                Custom
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
