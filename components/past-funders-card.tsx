'use client';

// "Past and current funders" — the organization's own funder record, kept in
// Fundir so the network stops pitching funders that already give. Three ways
// in: upload a Raiser's Edge export (preview first, nothing written until the
// second click), add one funder by name, or mark a lead as a past or current
// funder from its panel. The list below shows what is on record and lets the
// team take a mistake off. Shown in the Data Hub.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, Upload, Check, Loader2, AlertTriangle, RefreshCw, X, Plus } from 'lucide-react';
import type { DonorPreview, KnownFunder } from '@/lib/known-funders';
import { useOrg } from '@/components/org-context';

const money = (n: number | null) => (n == null ? '' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
const SOURCE: Record<string, string> = { raisers_edge: "Raiser's Edge", manual: 'Team', feedback: 'Correction', grant_report: 'Grant report' };

export function PastFundersCard({ readOnly }: { readOnly?: boolean }) {
  const org = useOrg();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DonorPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | 'add' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ recorded: number; linked: number; leads_closed: number } | null>(null);
  const [funders, setFunders] = useState<KnownFunder[] | null>(null);
  const [q, setQ] = useState('');
  const [add, setAdd] = useState({ name: '', relationship: 'past' as 'past' | 'current', year: '' });
  const ref = useRef<HTMLInputElement>(null);

  const load = () => fetch('/api/data-hub/past-funders').then(r => r.json()).then(b => { if (Array.isArray(b.funders)) setFunders(b.funders); }).catch(() => {});
  useEffect(() => { load(); }, []);

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(commit ? 'commit' : 'preview'); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/data-hub/past-funders${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      if (commit) { setDone({ recorded: b.recorded, linked: b.linked, leads_closed: b.leads_closed }); setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; load(); router.refresh(); }
      else setPreview(b.preview as DonorPreview);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  async function addOne() {
    if (!add.name.trim()) return;
    setBusy('add'); setError('');
    try {
      const res = await fetch('/api/network/known-funders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: add.name, relationship: add.relationship, last_gift_year: add.year ? Number(add.year) : null }) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      setAdd({ name: '', relationship: add.relationship, year: '' }); load(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  async function remove(f: KnownFunder) {
    if (readOnly) return;
    if (!window.confirm(`Take ${f.name} off the funder record? Its leads go back to reading as prospects.`)) return;
    await fetch(`/api/network/known-funders?id=${f.id}`, { method: 'DELETE' }).catch(() => {});
    load(); router.refresh();
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (funders ?? []).filter(f => !needle || f.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.relationship === 'current') - Number(a.relationship === 'current') || (b.last_gift_year ?? 0) - (a.last_gift_year ?? 0) || a.name.localeCompare(b.name));
  }, [funders, q]);
  const counts = { current: (funders ?? []).filter(f => f.relationship === 'current').length, past: (funders ?? []).filter(f => f.relationship === 'past').length };

  return (
    <div id="past-funders" className="bg-surface border border-hairline rounded-md overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <HandCoins className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Past and current funders</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">feeds Network, the brief and the map</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-3">Funders that already give to {org.short} but are not in Instrumentl or the Grant Calendar: ones that send money without an application, or last gave before FY26. Upload a <b className="font-medium text-primary">Raiser&rsquo;s Edge</b> export of organization donors (one row per donor, or one per gift), add a funder by name, or mark a lead as a past or current funder from its panel. A recorded funder stops showing up as an untapped prospect.</p>

        <div className="flex items-center gap-2 flex-wrap">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={readOnly || !!busy} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{file ? file.name : "Choose a Raiser's Edge export (.xlsx or .csv)"}</button>
          {file && !preview && <button type="button" onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Preview</button>}
        </div>
        {error && <p className="mt-3 text-[12px] text-critical flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}

        {preview && (
          <div className="mt-4 rounded-md border border-hairline bg-page p-3.5" style={{ animation: 'fd-fade .3s ease' }}>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <Stat label="Funders" value={preview.funders} /><Stat label="Current" value={preview.current} tone="var(--accent)" /><Stat label="Past" value={preview.past} /><Stat label="In the network" value={preview.in_graph} tone="var(--accent)" />
            </div>
            <p className="mt-2.5 text-[12px] text-secondary leading-relaxed">
              {preview.leads_relabelled ? `${preview.leads_relabelled} open lead${preview.leads_relabelled === 1 ? '' : 's'} will be labelled with the funding history` : 'No open leads point at these funders yet; they will be recognised when one does'}
              {preview.leads_closed ? `, and ${preview.leads_closed} untapped-funder lead${preview.leads_closed === 1 ? '' : 's'} for current funders will close as “Already funds us”` : ''}.
              {` Current means a gift in the last 18 months.`}{preview.kept_manual ? ` ${preview.kept_manual} funder${preview.kept_manual === 1 ? '' : 's'} the team already marked keep their status.` : ''}
            </p>
            {preview.sample.length > 0 && (
              <ul className="mt-2.5 text-[11.5px] text-secondary flex flex-col gap-1">
                {preview.sample.map(s => <li key={s.name} className="flex items-baseline gap-2"><span className={s.relationship === 'current' ? 'text-accent' : 'text-tertiary'} style={{ width: 52, flex: 'none' }}>{s.relationship}</span><span className="text-primary truncate">{s.name}</span><span className="font-mono text-tertiary ml-auto whitespace-nowrap">{[s.last_gift?.slice(0, 7), money(s.total)].filter(Boolean).join(' · ')}{s.in_graph ? '' : ' · not in the network yet'}</span></li>)}
              </ul>
            )}
            <p className="font-mono text-[10.5px] text-tertiary mt-2">{preview.file_rows} rows read · columns: {[preview.columns.name, preview.columns.last_date, preview.columns.total, preview.columns.type].filter(Boolean).join(', ')}{preview.skipped_individuals ? ` · ${preview.skipped_individuals} individual donors skipped` : ''}</p>
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => run(true)} disabled={!!busy || readOnly} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Record these funders</button>
              <button type="button" onClick={() => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; }} disabled={!!busy} className="h-9 px-3 rounded-md border border-hairline bg-surface text-[12.5px] text-secondary">Cancel</button>
            </div>
          </div>
        )}
        {done && <p className="mt-3 text-[12.5px] text-accent flex items-center gap-1.5"><Check className="w-3.5 h-3.5 flex-none" /><span>Recorded {done.recorded} funder{done.recorded === 1 ? '' : 's'}; {done.linked} matched in the network{done.leads_closed ? `; ${done.leads_closed} untapped lead${done.leads_closed === 1 ? '' : 's'} closed as already funding ${org.short}` : ''}. Network and the brief read the record now.</span></p>}

        {/* add one */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <input value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} disabled={readOnly || !!busy} placeholder="Add a funder by name" className="h-9 flex-1 min-w-[220px] rounded-md border border-hairline bg-surface px-3 text-[12.5px]" aria-label="Funder name" onKeyDown={e => { if (e.key === 'Enter') addOne(); }} />
          <select value={add.relationship} onChange={e => setAdd({ ...add, relationship: e.target.value as 'past' | 'current' })} disabled={readOnly || !!busy} className="h-9 rounded-md border border-hairline bg-surface px-2 text-[12.5px]" aria-label="Relationship"><option value="past">Past funder</option><option value="current">Current funder</option></select>
          <input value={add.year} onChange={e => setAdd({ ...add, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} disabled={readOnly || !!busy} placeholder="Last gift year" inputMode="numeric" className="h-9 w-[110px] rounded-md border border-hairline bg-surface px-3 text-[12.5px]" aria-label="Last gift year" />
          <button type="button" onClick={addOne} disabled={readOnly || !!busy || !add.name.trim()} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50">{busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Add</button>
        </div>

        {/* the record */}
        {funders && funders.length > 0 && (
          <div className="mt-4 border-t border-hairline pt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12px] text-secondary">On record: {counts.current} current, {counts.past} past</span>
              <span className="flex-1" />
              {funders.length > 8 && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a funder" className="h-7 w-[180px] rounded-md border border-hairline bg-surface px-2.5 text-[12px]" aria-label="Find a funder" />}
            </div>
            <ul className="flex flex-col max-h-[260px] overflow-y-auto">
              {shown.slice(0, 200).map(f => (
                <li key={f.id} className="flex items-center gap-2.5 py-1.5 border-b border-hairline last:border-b-0 text-[12.5px]">
                  <span className="fd-tag" data-tone={f.relationship === 'current' ? 'accent' : undefined} style={{ flex: 'none' }}>{f.relationship === 'current' ? 'Current' : 'Past'}</span>
                  <span className="truncate text-primary">{f.name}</span>
                  <span className="font-mono text-[10.5px] text-tertiary ml-auto whitespace-nowrap">{[f.last_gift_year, money(f.total_given), SOURCE[f.source] ?? f.source].filter(Boolean).join(' · ')}</span>
                  {!readOnly && <button type="button" onClick={() => remove(f)} className="h-6 w-6 inline-flex items-center justify-center rounded text-tertiary hover:text-critical" aria-label={`Remove ${f.name}`} title="Take off the record"><X className="w-3.5 h-3.5" /></button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2"><span className="fd-eyebrow block text-tertiary mb-1" style={{ fontSize: 11.5 }}>{label}</span><b className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: tone }}>{value.toLocaleString('en-US')}</b></div>;
}
