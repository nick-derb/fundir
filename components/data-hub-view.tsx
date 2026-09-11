'use client';

// Data Hub — React port of the Claude Design "Data hub" template, wired to real
// data end to end:
//   • Collections / documents / sizes come from the shared OneDrive folder.
//   • "Fundir" status is the REAL index state (cyc_context_chunks), not a guess.
//   • The "Reading now" queue tracks an actual upload → extract → embed request;
//     when it resolves, the chips show how many passages were really indexed.
//   • The consent checkbox genuinely controls whether the file is read.
// The metric-submission surface (site directors' workbook entries) is preserved
// as its own section so nothing the org depends on is lost.

import { StrategyResources } from '@/components/strategy-resources';
import { InstrumentlCard } from '@/components/instrumentl-card';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, SlidersHorizontal, Upload, UploadCloud, X, MoreVertical, FileText,
  Table2, Landmark, Users, BarChart3, AlertCircle, Loader2, Check, Plus, ExternalLink,
} from 'lucide-react';

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";

interface HubDoc {
  id: string; name: string; size: number;
  webUrl: string | null; modified: string | null; modifiedBy: string | null;
}
interface HubRow {
  submitted: string; submittedBy: string; site: string;
  period: string; metric: string; value: string; notes: string;
}
interface QueueItem {
  id: string; name: string; pct: number; stage: string;
  signals: string[]; failed?: boolean;
}

const METRICS = [
  'Enrollment', 'Average daily attendance %', 'Youth served',
  'Program sessions delivered', 'Parent & family engagement events',
  'Meals served', 'Staff count', 'Other…',
];

const STAGES = ['Uploading', 'Extracting text', 'Reading', 'Updating profile', 'Indexed'];

// ── Collection classification ───────────────────────────────────────────────
// Documents live in one flat OneDrive folder, so collections are derived from
// the file name and type. Keyword match wins; otherwise spreadsheets read as
// outcome data and prose as narrative, which keeps every file in exactly one
// bucket (counts always sum to the real total).
const COLLECTIONS = [
  { key: 'outcome',   label: 'Outcome data',            icon: BarChart3, color: 'var(--accent)', tint: 'rgba(101,154,128,.14)',
    re: /outcome|metric|attendance|enroll|participant|impact|program data|youth served|demographic/i },
  { key: 'financial', label: 'Financials & audits',     icon: Landmark,  color: '#5B7383',       tint: 'rgba(91,115,131,.14)',
    re: /financ|audit|990|budget|statement|balance|expense|revenue|fy\d{2}|irs/i },
  { key: 'narrative', label: 'Narratives & boilerplate', icon: FileText,  color: '#9C7A2A',      tint: 'rgba(156,122,42,.14)',
    re: /narrative|boilerplate|proposal|loi|letter|case for|story|about us|program description/i },
  { key: 'board',     label: 'Board & governance',      icon: Users,     color: '#0C6B5A',       tint: 'rgba(12,107,90,.12)',
    re: /board|governance|bylaw|roster|minutes|policy|conflict of interest|trustee/i },
] as const;

const ext = (n: string) => n.toLowerCase().slice(n.lastIndexOf('.') + 1);

function collectionOf(name: string): typeof COLLECTIONS[number]['key'] {
  for (const c of COLLECTIONS) if (c.re.test(name)) return c.key;
  return ['xlsx', 'xls', 'csv', 'tsv'].includes(ext(name)) ? 'outcome' : 'narrative';
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function currentMonth() {
  const d = new Date();
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

export function DataHubView({ orgName, userEmail }: { orgName: string; userEmail: string }) {
  const [docs, setDocs]           = useState<HubDoc[]>([]);
  const [rows, setRows]           = useState<HubRow[]>([]);
  const [indexedIds, setIndexed]  = useState<Set<string>>(new Set());
  const [corpus, setCorpus]       = useState({ documents: 0, chunks: 0 });
  const [docsUrl, setDocsUrl]     = useState<string | null>(null);
  const [workbookUrl, setWbUrl]   = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [query, setQuery]         = useState('');

  const [queue, setQueue]         = useState<QueueItem[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [consent, setConsent]     = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/data-hub/state').then(r => r.json());
      if (res.error) throw new Error(res.error);
      setConnected(!!res.connected);
      setDocs(res.documents ?? []);
      setRows(res.rows ?? []);
      setIndexed(new Set<string>(res.indexedDocIds ?? []));
      setCorpus(res.corpus ?? { documents: 0, chunks: 0 });
      setDocsUrl(res.docsUrl ?? null);
      setWbUrl(res.workbookUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the data hub');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Upload + live indexing ────────────────────────────────────────────────
  async function uploadFiles(files: File[]) {
    setUploadOpen(false);
    for (const file of files.slice(0, 6)) {
      const id = `${file.name}:${Date.now()}:${Math.random()}`;
      setQueue(q => [...q, { id, name: file.name, pct: 4, stage: STAGES[0], signals: [] }]);

      // Advance the visible stages while the request is genuinely in flight.
      // It never reaches 100% on its own — only the real response completes it.
      const tick = setInterval(() => {
        setQueue(q => q.map(f => {
          if (f.id !== id) return f;
          const pct = Math.min(92, f.pct + 2 + Math.random() * 3);
          return { ...f, pct, stage: STAGES[Math.min(STAGES.length - 2, Math.floor(pct / 24))] };
        }));
      }, 180);

      try {
        const form = new FormData();
        form.append('file', file);
        form.append('index', consent ? 'true' : 'false');
        const res = await fetch('/api/data-hub/documents', { method: 'POST', body: form });
        const body = await res.json();
        clearInterval(tick);
        if (!res.ok) throw new Error(body?.error || 'Upload failed');

        const chunks: number = body.indexed ?? 0;
        const signals = chunks > 0
          ? [`${chunks} passage${chunks === 1 ? '' : 's'} indexed`, fmtSize(file.size), ext(file.name).toUpperCase()]
          : [body.skipped === 'not indexed by request' ? 'Stored, not read' : 'No text found', fmtSize(file.size)];
        setQueue(q => q.map(f => f.id === id
          ? { ...f, pct: 100, stage: chunks > 0 ? 'Indexed' : 'Stored', signals, failed: chunks === 0 }
          : f));
        await load();
      } catch (e) {
        clearInterval(tick);
        setQueue(q => q.map(f => f.id === id
          ? { ...f, pct: 100, stage: 'Failed', failed: true, signals: [e instanceof Error ? e.message : 'Upload failed'] }
          : f));
      }
      // Let the finished row linger briefly, then clear it.
      setTimeout(() => setQueue(q => q.filter(f => f.id !== id)), 6000);
    }
  }

  const visible = query.trim()
    ? docs.filter(d => d.name.toLowerCase().includes(query.trim().toLowerCase()))
    : docs;

  const counts = COLLECTIONS.map(c => {
    const mine = docs.filter(d => collectionOf(d.name) === c.key);
    return { ...c, files: mine.length, bytes: mine.reduce((s, d) => s + (d.size || 0), 0) };
  });

  const totalBytes = docs.reduce((s, d) => s + (d.size || 0), 0);
  const notIndexed = docs.filter(d => !indexedIds.has(d.id)).length;
  const sites   = new Set(rows.map(r => r.site).filter(Boolean));
  const periods = new Set(rows.map(r => r.period).filter(Boolean));
  const thisMonth = rows.filter(r => r.period === currentMonth()).length;

  const gaps: string[] = [];
  if (notIndexed > 0) gaps.push(`${notIndexed} document${notIndexed === 1 ? '' : 's'} not yet read by Fundir`);
  if (thisMonth === 0) gaps.push(`No metric entries for ${currentMonth()} yet`);
  for (const c of counts) if (c.files === 0) gaps.push(`No files in ${c.label}`);

  if (connected === false) {
    return (
      <div className="px-6 md:px-8 py-10 max-w-3xl mx-auto">
        <div className="bg-surface border border-hairline rounded-xl p-8 text-center">
          <UploadCloud className="w-8 h-8 text-tertiary mx-auto mb-4" />
          <h2 className="text-[17px] font-semibold text-primary mb-2">Microsoft 365 isn’t connected</h2>
          <p className="text-[13px] text-secondary mb-5">
            The Data Hub stores documents and metrics in your organization’s shared OneDrive folder.
          </p>
          <a href="/settings" className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-semibold">
            Connect in Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="dh-root">
      <style>{CSS}</style>
      <main className="px-6 md:px-[26px] pt-6 pb-10">

        {/* ── Header ── */}
        <div className="flex items-end justify-between gap-7 flex-wrap mb-5">
          <div>
            <p className="fd-eyebrow text-tertiary mb-2.5">{orgName}</p>
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>
              Data hub
            </h1>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-secondary max-w-[62ch]">
              Everything the organization has written, in one place. Fundir reads each file as it arrives
              and adds what it finds to the {orgName} profile.
            </p>
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-accent text-white text-[12.5px] font-medium hover:bg-accent-hover transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload files
          </button>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2.5 mb-5 flex-wrap">
          <label className="flex-1 min-w-0 max-w-[460px] flex items-center gap-2.5 bg-surface border border-hairline rounded-xl px-3 h-[38px]">
            <Search className="w-3.5 h-3.5 text-tertiary flex-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="flex-1 min-w-0 border-none bg-transparent outline-none text-[13px] text-primary h-full"
            />
          </label>
          <button className="inline-flex items-center gap-2 h-[38px] px-3.5 rounded-xl border border-hairline bg-surface text-secondary text-[12.5px] hover:bg-elevated transition-colors">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filter
          </button>
          <span className="flex-1" />
          <span className="fd-eyebrow text-tertiary whitespace-nowrap">Shared with everyone at {orgName}</span>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl border border-hairline bg-surface text-[12.5px] text-critical">{error}</div>
        )}

        <div data-hub-cols className="grid gap-5 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) 344px' }}>
          <div className="min-w-0 flex flex-col gap-5">

            {/* ── Collections ── */}
            <div>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-[17px] font-semibold text-primary">Collections</h2>
                {docsUrl && (
                  <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="fd-eyebrow text-accent no-underline">Open folder</a>
                )}
              </div>
              <div data-hub-folders className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
                {counts.map(c => (
                  <div key={c.key} className="bg-surface border border-hairline rounded-[14px] p-[14px_15px]">
                    <div className="flex items-start justify-between mb-6">
                      <span className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center" style={{ background: c.tint }}>
                        <c.icon className="w-[15px] h-[15px]" style={{ color: c.color }} />
                      </span>
                    </div>
                    <b className="block text-[13.5px] font-medium tracking-[-.005em] mb-1 text-primary">{c.label}</b>
                    <span className="font-mono text-[10px] text-tertiary tabular-nums">
                      {c.files} file{c.files === 1 ? '' : 's'} · {fmtSize(c.bytes)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Grant strategy resources: guides + intake forms, embedded ── */}
            <StrategyResources />

            {/* ── Instrumentl export: swappable from the app ── */}
            <InstrumentlCard />

            {/* ── Reading now (real upload + indexing) ── */}
            {queue.length > 0 && (
              <div className="bg-surface border border-hairline rounded-[14px] overflow-hidden" style={{ animation: 'fd-fade .3s ease' }}>
                <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
                  <i className="w-[5px] h-[5px] rounded-full bg-accent flex-none" style={{ animation: 'fd-pulse 1.6s ease-in-out infinite' }} />
                  <span className="fd-eyebrow text-secondary">Reading now</span>
                  <span className="flex-1" />
                  <span className="font-mono text-[10px] text-tertiary">
                    {queue.filter(f => f.pct < 100).length
                      ? `${queue.filter(f => f.pct < 100).length} of ${queue.length} in progress`
                      : 'Profile updated'}
                  </span>
                </div>
                {queue.map(f => (
                  <div key={f.id} className="px-[18px] py-3.5 border-b border-hairline last:border-b-0">
                    <div className="flex items-center gap-3 mb-2.5">
                      <span className="w-[26px] h-[26px] rounded-md bg-elevated flex items-center justify-center flex-none">
                        <FileText className="w-3 h-3 text-tertiary" />
                      </span>
                      <b className="text-[13px] font-medium text-primary min-w-0 truncate">{f.name}</b>
                      <span className="flex-1" />
                      <span className={`font-mono text-[10.5px] whitespace-nowrap ${f.failed ? 'text-warning' : 'text-secondary'}`}>{f.stage}</span>
                    </div>
                    <div className="h-[3px] rounded-sm bg-elevated overflow-hidden">
                      <i className="block h-full rounded-sm transition-[width] duration-200"
                         style={{ width: `${f.pct}%`, background: f.failed ? 'var(--warning)' : 'var(--accent)' }} />
                    </div>
                    {f.signals.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {f.signals.map((s, i) => (
                          <span key={i} className="font-mono text-[9.5px] uppercase tracking-[.06em] text-accent border rounded-[3px] px-[7px] py-[3px]"
                                style={{ borderColor: 'rgba(12,107,90,.24)', animation: 'fd-fade .3s ease' }}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Recent documents ── */}
            <div className="bg-surface border border-hairline rounded-[14px] pt-[18px] pb-1">
              <div className="flex items-baseline justify-between gap-3 px-5 pb-3.5">
                <div>
                  <h2 className="text-[17px] font-semibold text-primary">Recent documents</h2>
                  <p className="text-[12px] text-tertiary mt-1">Newest first, across every collection</p>
                </div>
                <span className="fd-eyebrow text-tertiary whitespace-nowrap tabular-nums">{visible.length} shown</span>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th className="pl-5">Name</Th>
                    <Th hide>Size</Th>
                    <Th hide>Last modified</Th>
                    <Th>Fundir</Th>
                    <Th className="pr-5 text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-[12.5px] text-tertiary">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading documents…
                    </td></tr>
                  )}
                  {!loading && visible.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-[12.5px] text-tertiary">
                      {query ? `No documents match “${query}”.` : 'No documents yet — upload the first one.'}
                    </td></tr>
                  )}
                  {visible.map(d => {
                    const col = COLLECTIONS.find(c => c.key === collectionOf(d.name))!;
                    const isIndexed = indexedIds.has(d.id);
                    return (
                      <tr key={d.id} className="hover:bg-elevated transition-colors">
                        <td className="px-5 py-3 border-b border-hairline">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-md flex items-center justify-center flex-none" style={{ background: col.tint }}>
                              <col.icon className="w-3.5 h-3.5" style={{ color: col.color }} />
                            </span>
                            <span className="min-w-0">
                              <b className="block text-[13px] font-medium tracking-[-.005em] text-primary truncate">{d.name}</b>
                              <i className="not-italic text-[12px] text-tertiary">{col.label}</i>
                            </span>
                          </div>
                        </td>
                        <td data-hub-hidecol className="px-3 py-3 border-b border-hairline font-mono text-[11.5px] text-secondary tabular-nums">{fmtSize(d.size)}</td>
                        <td data-hub-hidecol className="px-3 py-3 border-b border-hairline text-[12.5px] text-secondary whitespace-nowrap">{fmtWhen(d.modified)}</td>
                        <td className="px-3 py-3 border-b border-hairline">
                          <span className={`fd-eyebrow inline-flex items-center gap-1.5 whitespace-nowrap ${isIndexed ? 'text-accent' : 'text-tertiary'}`}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: isIndexed ? 'var(--accent)' : 'var(--border-hairline)' }} />
                            {isIndexed ? 'Indexed' : 'Not read'}
                          </span>
                        </td>
                        <td className="px-5 py-3 border-b border-hairline text-right">
                          {d.webUrl && (
                            <a href={d.webUrl} target="_blank" rel="noopener noreferrer" title="Open in OneDrive"
                               className="inline-flex text-tertiary hover:text-accent transition-colors">
                              <ExternalLink className="w-[15px] h-[15px]" />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Metric entry (preserved workbook submission) ── */}
            <MetricForm onSaved={load} workbookUrl={workbookUrl} rows={rows} userEmail={userEmail} />
          </div>

          {/* ── Rail ── */}
          <div data-hub-rail className="sticky top-[68px] flex flex-col gap-5 min-w-0">

            <div className="bg-surface border border-hairline rounded-[14px] p-[18px]">
              <div className="flex items-center gap-2.5 mb-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/fundir-mark.png" alt="" className="w-5 h-5 object-contain flex-none" />
                <span className="fd-eyebrow text-secondary">{orgName} profile</span>
                <span className="flex-1" />
                <span className="fd-eyebrow text-accent">Live</span>
              </div>
              <p className="mt-0 mb-4 text-[12.5px] leading-relaxed text-tertiary">
                What Fundir has learned from the corpus. Every grant answer and metric suggestion draws on this.
              </p>
              <div className="flex flex-col gap-px border border-hairline rounded-xl overflow-hidden mb-3.5" style={{ background: 'var(--border-hairline)' }}>
                <RailStat label="Documents read"   value={corpus.documents} />
                <RailStat label="Passages indexed" value={corpus.chunks} />
                <RailStat label="Metric entries"   value={rows.length} />
                <RailStat label="Sites reporting"  value={sites.size} />
                <RailStat label="Periods covered"  value={periods.size} />
              </div>
              <a href="/org" className="fd-eyebrow text-accent no-underline">Open full profile →</a>
            </div>

            <div className="bg-surface border border-hairline rounded-[14px] p-[18px]">
              <div className="flex items-center gap-2.5 mb-1.5">
                <AlertCircle className="w-[15px] h-[15px] flex-none" style={{ color: '#9C7A2A' }} />
                <span className="fd-eyebrow text-secondary">Gaps worth filling</span>
              </div>
              <p className="mt-0 mb-3.5 text-[12.5px] leading-relaxed text-tertiary">
                {gaps.length ? 'Worth closing so the corpus can answer more.' : 'Nothing obvious — the corpus looks current.'}
              </p>
              <div className="flex flex-col gap-2.5">
                {gaps.map((g, i) => (
                  <div key={i} className="flex gap-2.5">
                    <i className="w-1 h-1 rounded-full flex-none mt-[6px]" style={{ background: '#9C7A2A' }} />
                    <span className="text-[12.5px] leading-[1.55] text-primary">{g}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-hairline rounded-[14px] p-[18px]">
              <span className="fd-eyebrow text-secondary block mb-3">Storage</span>
              <div className="flex items-baseline gap-2 mb-1">
                <b className="font-mono text-[20px] font-semibold tabular-nums text-primary">{fmtSize(totalBytes)}</b>
                <span className="font-mono text-[10px] text-tertiary tabular-nums">across {docs.length} file{docs.length === 1 ? '' : 's'}</span>
              </div>
              <p className="text-[11.5px] text-tertiary">In the shared OneDrive folder.</p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Upload modal ── */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
          <button aria-label="Close" onClick={() => setUploadOpen(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" style={{ animation: 'fd-fade .22s ease' }} />
          <div role="dialog" aria-modal="true" aria-label="Upload files"
               className="relative w-full max-w-[540px] bg-surface border border-hairline rounded-[14px] max-h-[calc(100vh-48px)] overflow-y-auto"
               style={{ boxShadow: '0 24px 60px rgba(16,25,23,.20)', animation: 'fd-rise .26s cubic-bezier(.2,.8,.3,1)' }}>
            <div className="flex items-start justify-between gap-4 px-[22px] pt-5">
              <div>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.6rem', lineHeight: 1.1, letterSpacing: '-.015em', margin: '0 0 6px' }}>
                  Add to the data hub
                </h2>
                <p className="m-0 text-[13px] leading-relaxed text-secondary">
                  Fundir reads each file on arrival and adds what it finds to the {orgName} profile.
                </p>
              </div>
              <button onClick={() => setUploadOpen(false)} aria-label="Close"
                      className="w-[30px] h-[30px] flex-none rounded-md border border-hairline bg-surface text-secondary flex items-center justify-center hover:bg-elevated transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-[22px] pt-4 pb-[22px]">
              <label
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) uploadFiles(f); }}
                className="block border border-dashed rounded-xl px-5 py-[30px] text-center cursor-pointer bg-page"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <input ref={fileRef} type="file" multiple className="hidden"
                       onChange={e => { const f = [...(e.target.files || [])]; if (f.length) uploadFiles(f); e.target.value = ''; }} />
                <UploadCloud className="w-[22px] h-[22px] text-tertiary mx-auto" />
                <b className="block text-[13.5px] font-medium text-primary mt-2.5 mb-1">Drop files here, or choose from your computer</b>
                <span className="text-[12px] text-tertiary">Word, Excel, PDF, CSV · up to 4 MB each</span>
              </label>

              <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                       className="w-[15px] h-[15px] mt-0.5 flex-none" style={{ accentColor: '#0C6B5A' }} />
                <span className="text-[12.5px] leading-[1.55] text-secondary">
                  Let Fundir read these files and update the {orgName} profile. Nothing is shared outside the organization.
                  {!consent && <em className="not-italic text-tertiary"> — the file will be stored but not read.</em>}
                </span>
              </label>

              <div className="flex items-center gap-2.5 mt-5">
                <span className="flex-1" />
                <button onClick={() => setUploadOpen(false)}
                        className="h-[38px] px-4 rounded-xl border border-hairline bg-surface text-primary text-[12.5px] hover:bg-elevated transition-colors">
                  Cancel
                </button>
                <button onClick={() => fileRef.current?.click()}
                        className="h-[38px] px-[18px] rounded-xl bg-accent text-white text-[12.5px] font-medium hover:bg-accent-hover transition-colors">
                  Choose files
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Metric submission (preserves the workbook entry flow) ───────────────────

function MetricForm({
  onSaved, workbookUrl, rows, userEmail,
}: { onSaved: () => Promise<void>; workbookUrl: string | null; rows: HubRow[]; userEmail: string }) {
  const [open, setOpen]     = useState(false);
  const [site, setSite]     = useState('');
  const [period, setPeriod] = useState(currentMonth());
  const [metric, setMetric] = useState(METRICS[0]);
  const [custom, setCustom] = useState('');
  const [value, setValue]   = useState('');
  const [notes, setNotes]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/data-hub/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site, period, metric: metric === 'Other…' ? custom : metric, value, notes }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setValue(''); setNotes(''); setCustom('');
      setSaved(true); setTimeout(() => setSaved(false), 3500);
      await onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not save the entry');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full h-9 px-2.5 rounded-md border border-hairline bg-surface text-[13px] text-primary focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="bg-surface border border-hairline rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-primary">Submit a metric</h2>
          <p className="text-[12px] text-tertiary mt-1">
            Goes straight into the shared workbook — visible to everyone, here and in Excel.
          </p>
        </div>
        {workbookUrl && (
          <a href={workbookUrl} target="_blank" rel="noopener noreferrer" className="fd-eyebrow text-accent no-underline whitespace-nowrap">Open workbook</a>
        )}
        <button onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-hairline bg-surface text-[12px] font-semibold text-primary hover:bg-elevated transition-colors flex-none">
          <Plus className="w-3.5 h-3.5" />
          {open ? 'Close' : 'New entry'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="p-5 grid gap-3" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
          <label className="block"><span className="block fd-eyebrow text-tertiary mb-1.5">Site</span>
            <input required value={site} onChange={e => setSite(e.target.value)} placeholder="e.g. Elliott Donnelley" className={input} /></label>
          <label className="block"><span className="block fd-eyebrow text-tertiary mb-1.5">Period</span>
            <input value={period} onChange={e => setPeriod(e.target.value)} className={input} /></label>
          <label className="block"><span className="block fd-eyebrow text-tertiary mb-1.5">Metric</span>
            <select value={metric} onChange={e => setMetric(e.target.value)} className={input}>
              {METRICS.map(m => <option key={m}>{m}</option>)}
            </select></label>
          <label className="block"><span className="block fd-eyebrow text-tertiary mb-1.5">Value</span>
            <input required value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 128" className={input} /></label>
          {metric === 'Other…' && (
            <label className="block col-span-2"><span className="block fd-eyebrow text-tertiary mb-1.5">Metric name</span>
              <input required value={custom} onChange={e => setCustom(e.target.value)} className={input} /></label>
          )}
          <label className="block col-span-2"><span className="block fd-eyebrow text-tertiary mb-1.5">Notes</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional context" className={input} /></label>
          <div className="col-span-2 flex items-center gap-3">
            {err && <span className="text-[12px] text-critical">{err}</span>}
            {saved && <span className="text-[12px] text-accent inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Saved to the workbook</span>}
            <span className="flex-1" />
            <span className="text-[11px] text-tertiary truncate">as {userEmail}</span>
            <button type="submit" disabled={busy}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy ? 'Saving…' : 'Add entry'}
            </button>
          </div>
        </form>
      )}

      {rows.length > 0 && (
        <div className="px-5 pb-4 pt-1">
          <p className="fd-eyebrow text-tertiary mb-2">Latest entries</p>
          <div className="flex flex-col gap-1.5">
            {rows.slice(0, 4).map((r, i) => (
              <div key={i} className="flex items-baseline gap-3 text-[12.5px]">
                <span className="font-mono text-[10.5px] text-tertiary tabular-nums w-[74px] flex-none truncate">{r.period}</span>
                <span className="text-primary truncate flex-1 min-w-0">{r.site} · {r.metric}</span>
                <span className="font-mono font-semibold text-primary tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Local primitives ────────────────────────────────────────────────────────

function RailStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface">
      <span className="text-[12.5px] text-primary">{label}</span>
      <b className="font-mono text-[12px] font-medium tabular-nums text-primary">{value}</b>
    </div>
  );
}

function Th({ children, hide, className = '' }: { children: React.ReactNode; hide?: boolean; className?: string }) {
  return (
    <th
      {...(hide ? { 'data-hub-hidecol': '' } : {})}
      className={`fd-eyebrow text-tertiary text-left font-medium px-3 py-2 border-t border-b border-hairline ${className}`}
    >
      {children}
    </th>
  );
}

const CSS = `
.dh-root{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif}
.dh-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
@keyframes fd-pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes fd-fade{from{opacity:0}to{opacity:1}}
@keyframes fd-rise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dh-root *{animation-duration:.01ms!important}}
@media (max-width:1240px){.dh-root [data-hub-cols]{grid-template-columns:minmax(0,1fr)!important}.dh-root [data-hub-rail]{position:static!important}}
@media (max-width:1040px){.dh-root [data-hub-folders]{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media (max-width:900px){.dh-root [data-hub-hidecol]{display:none!important}}
@media (max-width:620px){.dh-root [data-hub-folders]{grid-template-columns:minmax(0,1fr)!important}}
`;
