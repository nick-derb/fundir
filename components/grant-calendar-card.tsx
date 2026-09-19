'use client';

// "Replace the grant calendar" — the Data Hub card that loads CYC's own grant
// calendar workbook (one sheet per fiscal year). Preview first, then replace
// the fiscal years the file carries. Works without Microsoft 365.

import { useRef, useState } from 'react';
import { CalendarDays, Upload, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { CalendarPreview } from '@/lib/grant-calendar-import';

type Done = { written: number; replaced: number; years: string[]; filed: { name: string; webUrl: string | null } | null };

export function GrantCalendarCard({ readOnly }: { readOnly?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CalendarPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(commit ? 'commit' : 'preview'); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/data-hub/grant-calendar${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      if (commit) { setDone({ written: b.written, replaced: b.replaced, years: b.years, filed: b.filed }); setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; }
      else setPreview(b.preview as CalendarPreview);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }
  const reset = () => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; };
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-surface border border-hairline rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <CalendarDays className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Grant calendar workbook</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">feeds the calendar and the dashboard&apos;s due-soon list</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-3">Drop the FY grant calendar workbook here (the “FY27 Grant Calendar” sheet, plus “Considered &amp; Rejected” when present; working copies like “Sheet1” are ignored). Each fiscal year in the file replaces that year in Fundir, so upload the current workbook whenever it changes. Items whose due date is “Rolling” or “TBD” are kept with that wording.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={readOnly || !!busy} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{file ? file.name : 'Choose the workbook'}</button>
          {file && !preview && <button type="button" onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Preview changes</button>}
        </div>
        {error && <p className="mt-3 text-[12px] text-critical flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        {preview && (
          <div className="mt-4 rounded-[10px] border border-hairline bg-page p-3.5" style={{ animation: 'fd-fade .3s ease' }}>
            {preview.years.map(y => (
              <div key={y.fiscal_year} className="mb-3">
                <span className="fd-eyebrow block text-tertiary mb-1.5" style={{ fontSize: 9.5 }}>{y.fiscal_year}{y.on_file_now ? ` · replaces ${y.on_file_now} rows on file` : ' · new'}</span>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                  <Stat label="Items" value={y.in_file} tone="var(--accent)" /><Stat label="With a date" value={y.dated} /><Stat label="Rolling / TBD" value={y.undated} /><Stat label="Considered & rejected" value={y.rejected} />
                </div>
                <p className="font-mono text-[10.5px] text-tertiary mt-1.5">{Object.entries(y.statuses).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
              </div>
            ))}
            <p className="font-mono text-[10.5px] text-tertiary">sheets read: {preview.sheets.map(s => `${s.name} (${s.rows})`).join(', ')}{preview.skipped.length ? ` · ignored: ${preview.skipped.join('; ')}` : ''}</p>
            {preview.sample.length > 0 && <p className="mt-2 text-[11.5px] text-secondary">Next up: {preview.sample.map(s => `${s.funder} ${s.item_type ?? ''} ${fmt(s.due)}`).join(' · ')}</p>}
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => run(true)} disabled={!!busy || readOnly} className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Replace {preview.years.map(y => y.fiscal_year).join(' and ')}</button>
              <button type="button" onClick={reset} disabled={!!busy} className="h-9 px-3 rounded-[10px] border border-hairline bg-surface text-[12.5px] text-secondary">Cancel</button>
            </div>
          </div>
        )}
        {done && (
          <p className="mt-3 text-[12.5px] text-accent flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Loaded {done.years.join(' and ')}: {done.written} rows written{done.replaced ? `, ${done.replaced} replaced` : ''}{done.filed ? `; a copy was filed in the Data Hub as ${done.filed.name}` : ''}. The calendar reads the new rows immediately.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2"><span className="fd-eyebrow block text-tertiary mb-1" style={{ fontSize: 9.5 }}>{label}</span><b className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: tone }}>{value.toLocaleString('en-US')}</b></div>;
}
