'use client';

// Data Hub body — the shared workbook grid, the submission form, and the
// shared documents drop. Everything reads/writes the SAME OneDrive artifacts
// (CYC Data Collection.xlsx + /CYC Data Hub/Documents), so one person's entry
// is instantly everyone's entry — here, in Excel, and in Teams.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Table2, RefreshCw, ExternalLink, Loader2, Plus, FileText,
  FolderOpen, CloudUpload, CheckCircle2, AlertTriangle, Users,
} from 'lucide-react';
import Link from 'next/link';

interface HubRow {
  submitted: string; submittedBy: string; site: string;
  period: string; metric: string; value: string; notes: string;
}
interface HubDoc {
  id: string; name: string; size: number; webUrl: string | null;
  modified: string | null; modifiedBy: string | null;
}

const METRICS = [
  'Enrollment',
  'Average daily attendance %',
  'Youth served',
  'Program sessions delivered',
  'Parent & family engagement events',
  'Meals served',
  'Staff count',
  'Other…',
];

function fmtBytes(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} KB`;
  return `${n} B`;
}
function fmtDate(iso: string | null) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function DataHub({ userEmail }: { userEmail: string }) {
  const [rows, setRows]               = useState<HubRow[]>([]);
  const [docs, setDocs]               = useState<HubDoc[]>([]);
  const [workbookUrl, setWorkbookUrl] = useState<string | null>(null);
  const [docsUrl, setDocsUrl]         = useState<string | null>(null);
  const [connected, setConnected]     = useState<boolean | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState('');

  // form state
  const [site, setSite]           = useState('');
  const [period, setPeriod]       = useState(currentMonth());
  const [metric, setMetric]       = useState(METRICS[0]);
  const [customMetric, setCustom] = useState('');
  const [value, setValue]         = useState('');
  const [notes, setNotes]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved]   = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError('');
    try {
      const [rowsRes, docsRes] = await Promise.all([
        fetch('/api/data-hub/rows').then(r => r.json()),
        fetch('/api/data-hub/documents').then(r => r.json()),
      ]);
      if (rowsRes.error) throw new Error(rowsRes.error);
      setConnected(rowsRes.connected !== false);
      setRows(rowsRes.rows ?? []);
      setWorkbookUrl(rowsRes.workbookUrl ?? null);
      setDocsUrl(rowsRes.docsUrl ?? docsRes.docsUrl ?? null);
      if (!docsRes.error) setDocs(docsRes.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the Data Hub');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load on mount; re-sync when the tab regains focus so teammates' entries
  // (and edits made directly in Excel) show up without anyone thinking about it.
  useEffect(() => {
    load();
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/data-hub/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site,
          period,
          metric: metric === 'Other…' ? customMetric : metric,
          value,
          notes,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setValue(''); setNotes(''); setCustom('');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3500);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the entry');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/data-hub/documents', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const knownSites = Array.from(new Set(rows.map(r => r.site).filter(Boolean)));
  const inputCls = 'w-full px-3 py-2 border border-hairline rounded-md text-[13px] text-primary placeholder:text-tertiary bg-surface focus:outline-none focus:ring-2 focus:border-accent transition-colors';
  const labelCls = 'block text-[10.5px] font-semibold text-secondary uppercase tracking-[0.08em] mb-1.5';

  // ── Loading / not-connected states ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-secondary text-[13px]">
        <Loader2 className="w-4 h-4 animate-spin" /> Opening the shared workbook…
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="max-w-xl mx-auto my-14 bg-surface rounded-xl border border-dashed border-hairline p-10 text-center">
        <CloudUpload className="w-9 h-9 text-tertiary mx-auto mb-4" />
        <h3 className="text-[15px] font-semibold text-primary mb-2">Connect Microsoft 365 to open the Data Hub</h3>
        <p className="text-[13px] text-secondary mb-6">
          The Data Hub lives in your organization&rsquo;s OneDrive — one shared workbook and
          document folder everyone reads and writes. Connect Microsoft 365 once and it
          switches on for the whole team.
        </p>
        <Link href="/settings" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover transition-colors">
          Connect Microsoft 365
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

      {/* ── LEFT (2 cols): the living spreadsheet ── */}
      <div className="lg:col-span-2 bg-surface rounded-xl border border-hairline overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hairline flex items-center gap-3 flex-wrap">
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-elevated flex-shrink-0">
            <Table2 className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-bold text-primary leading-tight">CYC Data Collection.xlsx</h2>
            <p className="text-[11px] text-secondary">
              Live shared workbook · {rows.length} {rows.length === 1 ? 'entry' : 'entries'} · everyone sees the same rows
            </p>
          </div>
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-primary bg-elevated hover:bg-elevated border border-hairline px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {workbookUrl && (
            <a href={workbookUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-lg transition-all">
              Open in Excel <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="w-8 h-8 text-tertiary mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-primary mb-1">No entries yet — yours can be the first</p>
            <p className="text-[12px] text-secondary max-w-sm mx-auto">
              Use the form to add a site metric. It lands in the shared workbook instantly,
              for everyone.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-hairline bg-elevated/40">
                  {['Submitted', 'By', 'Site', 'Period', 'Metric', 'Value', 'Notes'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-[10.5px] font-semibold text-tertiary uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0 hover:bg-elevated/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono tabular-nums text-secondary whitespace-nowrap">{r.submitted}</td>
                    <td className="px-4 py-2.5 text-secondary whitespace-nowrap max-w-[160px] truncate" title={r.submittedBy}>
                      {r.submittedBy.split('@')[0]}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-primary whitespace-nowrap">{r.site}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-secondary whitespace-nowrap">{r.period}</td>
                    <td className="px-4 py-2.5 text-primary">{r.metric}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums font-semibold text-primary whitespace-nowrap">{r.value}</td>
                    <td className="px-4 py-2.5 text-secondary max-w-[220px] truncate" title={r.notes}>{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-hairline bg-elevated/30">
          <p className="text-[11px] text-tertiary">
            Synced with OneDrive — entries from teammates (or edits made directly in Excel)
            appear when you refresh or return to this tab.
          </p>
        </div>
      </div>

      {/* ── RIGHT: submit form + shared documents ── */}
      <div className="space-y-6">

        {/* Submission form */}
        <div className="bg-surface rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-accent" />
            <h3 className="text-[13.5px] font-bold text-primary">Add an entry</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className={labelCls}>Site</label>
              <input list="dh-sites" value={site} onChange={e => setSite(e.target.value)} required
                placeholder="e.g. Elliott Donnelley" className={inputCls} />
              <datalist id="dh-sites">
                {knownSites.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Period</label>
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Metric</label>
                <select value={metric} onChange={e => setMetric(e.target.value)} className={inputCls}>
                  {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {metric === 'Other…' && (
              <div>
                <label className={labelCls}>Metric name</label>
                <input value={customMetric} onChange={e => setCustom(e.target.value)} required
                  placeholder="e.g. SEL survey score" className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Value</label>
              <input value={value} onChange={e => setValue(e.target.value)} required
                placeholder="e.g. 78% or 142" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notes <span className="normal-case font-normal text-tertiary">(optional)</span></label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Anything a grant writer should know" className={inputCls} />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white font-semibold rounded-md text-[13px] hover:bg-accent-hover disabled:opacity-50 transition-colors">
              {submitting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving to the shared workbook…</>
                : justSaved
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved — visible to everyone</>
                  : 'Add to the workbook'}
            </button>
            <p className="text-[10.5px] text-tertiary text-center">
              Recorded as {userEmail.split('@')[0]} · lands in CYC Data Collection.xlsx
            </p>
          </form>
        </div>

        {/* Shared documents */}
        <div className="bg-surface rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-accent" />
            <h3 className="text-[13.5px] font-bold text-primary flex-1">Shared documents</h3>
            {docsUrl && (
              <a href={docsUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:underline">
                <FolderOpen className="w-3 h-3" /> Open folder
              </a>
            )}
          </div>
          <p className="text-[11.5px] text-secondary mb-3.5">
            990s, audited statements, board docs — one upload, visible to the whole team.
          </p>

          <input ref={fileRef} type="file" className="hidden"
            accept=".pdf,.xlsx,.xls,.csv,.docx,.pptx,.txt"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 mb-3.5 rounded-md border-2 border-dashed border-hairline text-[12.5px] font-semibold text-secondary hover:text-primary hover:border-accent/40 transition-all disabled:opacity-50">
            {uploading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading to OneDrive…</>
              : <><CloudUpload className="w-3.5 h-3.5" /> Upload a document</>}
          </button>

          {docs.length === 0 ? (
            <p className="text-[11.5px] text-tertiary text-center py-2">Nothing shared yet.</p>
          ) : (
            <div className="space-y-1">
              {docs.slice(0, 8).map(d => (
                <a key={d.id} href={d.webUrl ?? '#'} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-elevated transition-colors group">
                  <FileText className="w-3.5 h-3.5 text-tertiary group-hover:text-accent flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-[12.5px] font-medium text-primary truncate">{d.name}</span>
                  <span className="text-[10.5px] text-tertiary whitespace-nowrap font-mono tabular-nums">
                    {fmtBytes(d.size)}{d.modified ? ` · ${fmtDate(d.modified)}` : ''}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-surface border border-hairline border-l-[3px] rounded-md px-3.5 py-2.5 text-[12.5px]"
            style={{ borderLeftColor: 'var(--critical)' }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--critical)' }} />
            <span className="text-secondary">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
