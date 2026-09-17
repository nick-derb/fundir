'use client';

// "Replace the Instrumentl export" — the Data Hub card that makes the pipeline
// workbook swappable from the app: pick the new export, read exactly what would
// change, then replace. Nothing is written until the second click.

import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { ImportPreview } from '@/lib/instrumentl-import';

export function InstrumentlCard({ readOnly }: { readOnly?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ written: number; removed: number; kept_history: number; filed: { name: string; webUrl: string | null } | null; at: string } | null>(null);
  const [prune, setPrune] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(commit ? 'commit' : 'preview'); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/data-hub/instrumentl${commit ? `?commit=1${prune ? '&prune=1' : ''}` : ''}`, { method: 'POST', body: fd });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      if (commit) { setDone({ written: b.written, removed: b.removed, kept_history: b.kept_history ?? 0, filed: b.filed, at: b.at }); setPreview(null); setFile(null); setPrune(false); if (ref.current) ref.current.value = ''; }
      else setPreview(b.preview as ImportPreview);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  return (
    <div className="bg-surface border border-hairline rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <FileSpreadsheet className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Instrumentl export</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">feeds outcomes, win rates, deadlines</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-3">In Instrumentl, open your tracker, choose Export (.csv or .xlsx) and drop the file here. Fundir shows what would change before anything is written. Submitted applications and decisions already on file are always kept, even when the export leaves them out, so a filtered export is safe.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); setPrune(false); }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={readOnly || !!busy} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{file ? file.name : 'Choose the export'}</button>
          {file && !preview && <button type="button" onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Preview changes</button>}
        </div>
        {error && <p className="mt-3 text-[12px] text-critical flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        {preview && (
          <div className="mt-4 rounded-[10px] border border-hairline bg-page p-3.5" style={{ animation: 'fd-fade .3s ease' }}>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <Stat label="New" value={preview.new} tone="var(--accent)" /><Stat label="Updated" value={preview.updated} tone="#9C7A2A" /><Stat label="Unchanged" value={preview.unchanged} /><Stat label="Not in file" value={preview.removed + preview.kept_history} />
            </div>
            <p className="font-mono text-[10.5px] text-tertiary mt-2">{preview.file_rows} rows in file · {preview.funders} funders · {preview.awarded} awarded / {preview.rejected} declined{preview.collapsed ? ` · ${preview.collapsed} duplicate rows collapsed` : ''}{preview.missing_columns.length ? ` · missing columns: ${preview.missing_columns.join(', ')}` : ''}</p>
            {preview.kept_history > 0 && <p className="mt-2 text-[11.5px] text-secondary">{preview.kept_history} submitted, decided or abandoned row{preview.kept_history === 1 ? '' : 's'} not in this export stay on file as history.</p>}
            {preview.sample_updated.length > 0 && <ul className="mt-2 text-[11.5px] text-secondary space-y-0.5">{preview.sample_updated.map((s, i) => <li key={i}><b className="font-medium text-primary">{s.opportunity}</b> · {s.funder} — {s.changes.join(', ')}</li>)}</ul>}
            {preview.removed > 0 && (
              <label className="mt-3 flex items-start gap-2 text-[11.5px] text-secondary cursor-pointer">
                <input type="checkbox" checked={prune} onChange={e => setPrune(e.target.checked)} className="mt-0.5" />
                <span>Also remove the {preview.removed} researching / planned / in-progress row{preview.removed === 1 ? '' : 's'} this export no longer carries. Tick this only when you exported the whole tracker; leave it off for a filtered view.</span>
              </label>
            )}
            {prune && preview.sample_removed.length > 0 && <ul className="mt-2 text-[11.5px] text-secondary space-y-0.5">{preview.sample_removed.map((s, i) => <li key={i}><span className="text-critical">remove</span> {s.opportunity} · {s.funder}{s.status ? ` (${s.status})` : ''}</li>)}</ul>}
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => run(true)} disabled={!!busy || readOnly} className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Replace with this export</button>
              <button type="button" onClick={() => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; }} disabled={!!busy} className="h-9 px-3 rounded-[10px] border border-hairline bg-surface text-[12.5px] text-secondary">Cancel</button>
            </div>
          </div>
        )}
        {done && (
          <p className="mt-3 text-[12.5px] text-accent flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Refreshed: {done.written} submissions written{done.removed ? `, ${done.removed} removed` : ''}{done.kept_history ? `, ${done.kept_history} kept as history` : ''}{done.filed ? `; a copy was filed in the Data Hub as ${done.filed.name}` : ''}. Reports, Prospecting and the calendar read the new rows immediately.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2"><span className="fd-eyebrow block text-tertiary mb-1" style={{ fontSize: 9.5 }}>{label}</span><b className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: tone }}>{value.toLocaleString('en-US')}</b></div>;
}
