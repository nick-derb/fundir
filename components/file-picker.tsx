'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, FileSpreadsheet, FileText, File, Loader2,
  RefreshCw, X,
} from 'lucide-react';

interface PickerFile {
  id:           string;
  name:         string;
  mimeType?:    string;
  modifiedTime?: string;
  lastModifiedDateTime?: string;
  size?:        string | number;
  webViewLink?: string;
  webUrl?:      string;
}

interface FilePickerProps {
  provider:  'google' | 'microsoft';
  orgCode:   string;
  onSelect:  (file: PickerFile) => void;
  onClose:   () => void;
}

function fileIcon(file: PickerFile) {
  const name = file.name.toLowerCase();
  const mime = file.mimeType ?? '';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('sheet') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv')
  ) {
    return <FileSpreadsheet className="w-4 h-4 text-[#16a34a]" />;
  }
  if (
    mime.includes('document') ||
    mime.includes('word') ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  ) {
    return <FileText className="w-4 h-4 text-[#2563eb]" />;
  }
  return <File className="w-4 h-4 text-[#64748b]" />;
}

function fileTypeBadge(file: PickerFile) {
  const name = file.name.toLowerCase();
  const mime = file.mimeType ?? '';
  if (mime.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls'))
    return { label: 'Excel / Sheet', color: '#16a34a' };
  if (mime.includes('csv') || name.endsWith('.csv'))
    return { label: 'CSV', color: '#0d9488' };
  if (mime.includes('document') || name.endsWith('.docx') || name.endsWith('.doc'))
    return { label: 'Word / Doc', color: '#2563eb' };
  return { label: 'File', color: '#64748b' };
}

function formatModified(file: PickerFile): string {
  const raw = file.modifiedTime ?? file.lastModifiedDateTime;
  if (!raw) return '';
  return new Date(raw).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function FilePicker({ provider, orgCode, onSelect, onClose }: FilePickerProps) {
  const [query,   setQuery]   = useState('');
  const [files,   setFiles]   = useState<PickerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchFiles = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        provider,
        org: orgCode,
        ...(q ? { q } : {}),
      });
      const res = await fetch(`/api/integrations/files?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFiles(data.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [provider, orgCode]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchFiles(query.trim() || undefined);
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[640px] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] overflow-hidden flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9] bg-[#f8fafc] flex-shrink-0">
          <div>
            <h2 className="text-[15px] font-bold text-[#0f172a]">
              {provider === 'google' ? 'Google Drive' : 'OneDrive'}
            </h2>
            <p className="text-[11px] text-[#64748b]">
              Select a spreadsheet or document to analyze
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[6px] hover:bg-[#f1f5f9] text-[#64748b]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2 px-4 py-3 border-b border-[#f1f5f9] flex-shrink-0"
        >
          <Search className="w-4 h-4 text-[#94a3b8] flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by file name…"
            className="flex-1 text-[13px] text-[#0f172a] placeholder-[#94a3b8] bg-transparent outline-none"
            autoFocus
          />
          <button
            type="submit"
            className="text-[11px] font-semibold text-[#0d9488] hover:text-[#0f172a] transition-colors"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => fetchFiles()}
            className="p-1 hover:bg-[#f1f5f9] rounded text-[#94a3b8] hover:text-[#475569]"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-[#94a3b8]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[13px]">Loading files…</span>
            </div>
          ) : error ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-red-600">{error}</p>
              <button
                onClick={() => fetchFiles()}
                className="mt-3 text-[12px] text-[#0d9488] hover:underline"
              >
                Try again
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-[#94a3b8]">
                No spreadsheets or documents found.
              </p>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Try a different search term, or upload a file to your{' '}
                {provider === 'google' ? 'Google Drive' : 'OneDrive'}.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#f8fafc]">
              {files.map(file => {
                const badge = fileTypeBadge(file);
                return (
                  <li key={file.id}>
                    <button
                      onClick={() => onSelect(file)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[#f8fafc] transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-[6px] bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
                        {fileIcon(file)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#0f172a] truncate group-hover:text-[#0d9488] transition-colors">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-[#94a3b8] mt-0.5">
                          {formatModified(file)}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          color:      badge.color,
                          background: badge.color + '18',
                        }}
                      >
                        {badge.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[#f1f5f9] bg-[#f8fafc] flex-shrink-0">
          <p className="text-[10px] text-[#94a3b8]">
            {files.length > 0 ? `${files.length} files found · ` : ''}
            Showing spreadsheets and documents only
          </p>
        </div>
      </div>
    </div>
  );
}
