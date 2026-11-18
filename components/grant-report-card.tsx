'use client';

// "Grant report" — load the organization's own grant report for a fiscal
// year (one row per application: awarded, declined or pending). Preview shows
// the year's totals and breakdowns, which funders it records and which leads
// it moves; loading it replaces that year's rows. The dashboard's funding
// numbers then come from the report instead of the Instrumentl export.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Upload, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { ReportPreview, Breakdown } from '@/lib/grant-report';

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3).toLocaleString('en-US')}K` : `$${Math.round(n)}`);
const fyLabel = (y: number) => `FY${String(y).slice(2)}`;
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const MOVE: Record<string, string> = { AWAITING_DECISION: 'to Awaiting decision', WON: 'to Won', LOST: 'to Lost' };

export function GrantReportCard({ readOnly }: { readOnly?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fy, setFy] = useState('');
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ fiscal_year: number; rows: number; funders_recorded: number; leads_moved: number } | null>(null);
  const [years, setYears] = useState<Array<{ fiscal_year: number; rows: number; imported_at: string }>>([]);
  const ref = useRef<HTMLInputElement>(null);

  const load = () => fetch('/api/data-hub/grant-report').then(r => r.json()).then(b => { if (Array.isArray(b.years)) setYears(b.years); }).catch(() => {});
  useEffect(() => { load(); }, []);

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(commit ? 'commit' : 'preview'); setError('');
    try {
      const fd = new FormData(); fd.append('file', file); if (fy) fd.append('fiscal_year', fy);
      const res = await fetch(`/api/data-hub/grant-report${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      if (commit) { setDone({ fiscal_year: b.fiscal_year, rows: b.rows, funders_recorded: b.funders_recorded, leads_moved: b.leads_moved }); setPreview(null); setFile(null); setFy(''); if (ref.current) ref.current.value = ''; load(); router.refresh(); }
      else { setPreview(b.preview as ReportPreview); if (!fy) setFy(String(b.preview.fiscal_year)); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  const s = preview?.summary;
  const moves = preview ? Object.entries(preview.lead_moves.reduce<Record<string, string[]>>((a, m) => { (a[m.to] ??= []).push(m.funder); return a; }, {})) : [];
  return (
    <div id="grant-report" className="bg-surface border border-hairline rounded-md overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <FileSpreadsheet className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Grant report</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">feeds the dashboard, funders and Network</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-2">Your own report of the year&rsquo;s applications: one row per grant with its status (Awarded, Declined, Pending), funding type, purpose, ask type, requested and awarded amounts. The dashboard&rsquo;s funding numbers and breakdowns come from it; awarded funders are recorded as current funders; and open leads for these funders move to Awaiting decision, Won or Lost. Uploading again replaces that year.</p>
        {years.length > 0 && <p className="font-mono text-[10.5px] text-tertiary mb-3">Loaded: {years.map(y => `${fyLabel(y.fiscal_year)} (${y.rows} grants, ${when(y.imported_at)})`).join(' · ')}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); setFy(''); }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={readOnly || !!busy} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{file ? file.name : 'Choose the grant report (.xlsx)'}</button>
          {file && !preview && <button type="button" onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Preview</button>}
        </div>
        {error && <p className="mt-3 text-[12px] text-critical flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        {preview && s && (
          <div className="mt-4 rounded-md border border-hairline bg-page p-3.5" style={{ animation: 'fd-fade .3s ease' }}>
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              <span className="text-[12.5px] text-secondary">Fiscal year</span>
              <select value={fy || String(preview.fiscal_year)} onChange={e => { setFy(e.target.value); setPreview(null); }} disabled={!!busy || readOnly} className="h-8 rounded-md border border-hairline bg-surface px-2 text-[12.5px]" aria-label="Fiscal year">
                {[preview.fiscal_year - 2, preview.fiscal_year - 1, preview.fiscal_year, preview.fiscal_year + 1].map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
              </select>
              <span className="text-[11.5px] text-tertiary">{preview.fiscal_year_source === 'file' ? 'read from the file' : 'not in the file, so the current fiscal year'}{preview.replaces ? ` · replaces the ${preview.replaces} ${fyLabel(preview.fiscal_year)} grants loaded now` : ''}</span>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <Stat label="Awarded" value={`${s.counts.awarded} · ${money(s.awarded)}`} tone="var(--accent)" />
              <Stat label="Pending" value={`${s.counts.pending} · ${money(s.pending_requested)}`} tone="#9C7A2A" />
              <Stat label="Declined" value={String(s.counts.declined)} />
              <Stat label="Win rate" value={s.win_rate == null ? '—' : `${Math.round(s.win_rate * 100)}%`} />
            </div>
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <Mini title="Restricted vs. unrestricted" rows={s.by_funding} />
              <Mini title="By ask type" rows={s.by_ask} />
              <Mini title="By purpose" rows={s.by_purpose.slice(0, 6)} />
            </div>
            <p className="mt-2.5 text-[12px] text-secondary leading-relaxed">
              {preview.funders_current} awarded funder{preview.funders_current === 1 ? '' : 's'} will be recorded as current{preview.funders_past ? `, ${preview.funders_past} re-engagement funder${preview.funders_past === 1 ? '' : 's'} as past` : ''}.
              {moves.length ? ` Open leads move: ${moves.map(([to, fs]) => `${fs.length} ${MOVE[to]} (${fs.slice(0, 4).join(', ')}${fs.length > 4 ? '…' : ''})`).join('; ')}.` : ' No open leads point at these funders.'}
            </p>
            <p className="font-mono text-[10.5px] text-tertiary mt-2">{preview.rows} grants on “{preview.sheet}”{preview.skipped ? ` · ${preview.skipped} total or blank rows skipped` : ''} · columns: {Object.values(preview.columns).filter(Boolean).join(', ')}</p>
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => run(true)} disabled={!!busy || readOnly} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Load {fyLabel(Number(fy) || preview.fiscal_year)} report</button>
              <button type="button" onClick={() => { setPreview(null); setFile(null); setFy(''); if (ref.current) ref.current.value = ''; }} disabled={!!busy} className="h-9 px-3 rounded-md border border-hairline bg-surface text-[12.5px] text-secondary">Cancel</button>
            </div>
          </div>
        )}
        {preview === null && file && fy && !busy && !error && <p className="mt-3 text-[12px] text-secondary">Fiscal year changed to {fyLabel(Number(fy))}. <button type="button" className="text-accent" onClick={() => run(false)}>Preview again</button></p>}
        {done && <p className="mt-3 text-[12.5px] text-accent flex items-center gap-1.5"><Check className="w-3.5 h-3.5 flex-none" /><span>{fyLabel(done.fiscal_year)} report loaded: {done.rows} grants; {done.funders_recorded} funder{done.funders_recorded === 1 ? '' : 's'} recorded; {done.leads_moved} lead{done.leads_moved === 1 ? '' : 's'} moved. The dashboard shows the {fyLabel(done.fiscal_year)} numbers now.</span></p>}
      </div>
    </div>
  );
}

function Mini({ title, rows }: { title: string; rows: Breakdown[] }) {
  const max = Math.max(1, ...rows.map(r => r.requested + r.awarded));
  return (
    <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2">
      <span className="fd-eyebrow block text-tertiary mb-1.5" style={{ fontSize: 11.5 }}>{title}</span>
      <ul className="flex flex-col gap-1.5">
        {rows.map(r => (
          <li key={r.label} className="text-[11.5px]">
            <div className="flex items-baseline gap-2"><span className="text-primary truncate">{r.label}</span><span className="font-mono text-tertiary ml-auto whitespace-nowrap">{money(r.requested)} · {money(r.awarded)}</span></div>
            <div className="h-[4px] rounded bg-elevated mt-1 overflow-hidden flex"><i style={{ width: `${(r.awarded / max) * 100}%`, background: 'var(--accent)' }} /><i style={{ width: `${(Math.max(0, r.requested - r.awarded) / max) * 100}%`, background: 'rgba(156,122,42,.45)' }} /></div>
          </li>
        ))}
      </ul>
      <span className="block font-mono text-[10px] text-tertiary mt-1.5">requested · awarded</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2"><span className="fd-eyebrow block text-tertiary mb-1" style={{ fontSize: 11.5 }}>{label}</span><b className="font-mono text-[14px] font-semibold tabular-nums" style={{ color: tone }}>{value}</b></div>;
}
