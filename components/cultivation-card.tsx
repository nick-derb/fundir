'use client';

// "Replace the Foundation Cultivation List" — the Data Hub card that makes the
// cultivation workbook swappable from the app: pick the new list, read exactly
// what would change (foundations, board members, IRS matches), then replace.
// Nothing is written until the second click. Works without Microsoft 365.

import { useRef, useState } from 'react';
import { Users, Upload, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { CultivationPreview, CultivationCommit } from '@/lib/cultivation-import';

type Done = Pick<CultivationCommit, 'foundations' | 'members' | 'removed' | 'graph'> & { filed: { name: string; webUrl: string | null } | null; at: string };

export function CultivationCard({ readOnly }: { readOnly?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CultivationPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(commit ? 'commit' : 'preview'); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/data-hub/cultivation${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      if (commit) { setDone({ foundations: b.foundations, members: b.members, removed: b.removed, graph: b.graph, filed: b.filed, at: b.at }); setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; }
      else setPreview(b.preview as CultivationPreview);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  const reset = () => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; };

  return (
    <div className="bg-surface border border-hairline rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <Users className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Foundation cultivation list</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">feeds Connections, Prospecting, the relationship graph</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-3">Drop the Foundation Cultivation List workbook here (both sheets are read, including “Rejected or Reconsider”). Each foundation is matched to the IRS Illinois file on its name so the EIN, legal name and assets come from the IRS. Board members are replaced per foundation; a connection or outreach note you entered in Fundir is kept. Trustees are then re-synced into the relationship graph.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={readOnly || !!busy} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{file ? file.name : 'Choose the list'}</button>
          {file && !preview && <button type="button" onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Preview changes</button>}
        </div>
        {error && <p className="mt-3 text-[12px] text-critical flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        {preview && (
          <div className="mt-4 rounded-[10px] border border-hairline bg-page p-3.5" style={{ animation: 'fd-fade .3s ease' }}>
            <span className="fd-eyebrow block text-tertiary mb-1.5" style={{ fontSize: 9.5 }}>Foundations</span>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <Stat label="New" value={preview.foundations.new} tone="var(--accent)" /><Stat label="Updated" value={preview.foundations.updated} tone="#9C7A2A" /><Stat label="Unchanged" value={preview.foundations.unchanged} /><Stat label="IRS matched" value={preview.foundations.matched_irs} />
            </div>
            <span className="fd-eyebrow block text-tertiary mt-3 mb-1.5" style={{ fontSize: 9.5 }}>Board members</span>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <Stat label="New" value={preview.members.new} tone="var(--accent)" /><Stat label="Updated" value={preview.members.updated} tone="#9C7A2A" /><Stat label="Unchanged" value={preview.members.unchanged} /><Stat label="Removed" value={preview.members.removed} tone={preview.members.removed ? 'var(--critical)' : undefined} />
            </div>
            <p className="font-mono text-[10.5px] text-tertiary mt-2">{preview.foundations.in_file} foundations · {preview.members.in_file} people · {preview.members.with_connection} with a recorded connection · sheets: {preview.sheets.join(', ')}{preview.foundations.kept_not_in_file ? ` · ${preview.foundations.kept_not_in_file} foundation${preview.foundations.kept_not_in_file === 1 ? '' : 's'} already in Fundir but not in this file (kept)` : ''}</p>
            {preview.foundations.unmatched.length > 0 && <p className="mt-2 text-[11.5px] text-secondary">Not in the IRS Illinois file (out of state, or named differently): {preview.foundations.unmatched.join('; ')}.</p>}
            {preview.sample_new.length > 0 && <p className="mt-2 text-[11.5px] text-secondary"><span className="text-accent">new</span> {preview.sample_new.join('; ')}</p>}
            {preview.sample_removed.length > 0 && <p className="mt-2 text-[11.5px] text-secondary"><span className="text-critical">remove</span> {preview.sample_removed.join('; ')}</p>}
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => run(true)} disabled={!!busy || readOnly} className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Replace with this list</button>
              <button type="button" onClick={reset} disabled={!!busy} className="h-9 px-3 rounded-[10px] border border-hairline bg-surface text-[12.5px] text-secondary">Cancel</button>
            </div>
          </div>
        )}
        {done && (
          <p className="mt-3 text-[12.5px] text-accent flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Replaced: {done.foundations} foundations and {done.members} people written{done.removed ? `, ${done.removed} removed` : ''}{done.graph ? `; ${done.graph.people} trustee${done.graph.people === 1 ? '' : 's'} and ${done.graph.edges + done.graph.links} connection${done.graph.edges + done.graph.links === 1 ? '' : 's'} added to the relationship graph` : ''}{done.filed ? `; a copy was filed in the Data Hub as ${done.filed.name}` : ''}. Connections and Prospecting read the new rows immediately.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2"><span className="fd-eyebrow block text-tertiary mb-1" style={{ fontSize: 9.5 }}>{label}</span><b className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: tone }}>{value.toLocaleString('en-US')}</b></div>;
}
