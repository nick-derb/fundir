'use client';

// "Board roster" — replace the board list from the Data Hub. Pick the new
// roster, read who joins, who continues, whose role changes and who rolls off,
// then apply it as of an effective date. Members who roll off keep their
// history and read as former members; only the boards in the file change.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRoundCog, Upload, Check, Loader2, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import type { RosterPreview, RosterStatus, BoardKind } from '@/lib/board-roster';
import { useOrg } from '@/components/org-context';

const LABEL: Record<BoardKind, string> = { board: 'Board of Directors', auxiliary: 'Auxiliary Board', council: 'Leadership Council', staff: 'Ex officio' };
const today = () => new Date().toISOString().slice(0, 10);
const when = (iso: string | null) => { if (!iso) return null; const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

export function BoardRosterCard({ readOnly }: { readOnly?: boolean }) {
  const org = useOrg();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [effective, setEffective] = useState(today());
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ joined: number; updated: number; left: number; effective: string } | null>(null);
  const [status, setStatus] = useState<RosterStatus | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const load = () => fetch('/api/data-hub/board-roster').then(r => r.json()).then(b => { if (b.status) setStatus(b.status); }).catch(() => {});
  useEffect(() => { load(); }, []);

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(commit ? 'commit' : 'preview'); setError('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('effective', effective);
      const res = await fetch(`/api/data-hub/board-roster${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      if (commit) { setDone({ joined: b.joined, updated: b.updated, left: b.left, effective: b.effective }); setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; load(); router.refresh(); }
      else setPreview(b.preview as RosterPreview);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  const c = status?.counts;
  return (
    <div id="board-roster" className="bg-surface border border-hairline rounded-md overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <UserRoundCog className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Board roster</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">feeds Network, Ask your board, the map</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-2">When members roll off or join, upload the new roster here. Fundir shows who joins, who continues and who rolls off before anything changes. New members are added to the network; members who roll off keep their history and paths but read as former members and leave &ldquo;Ask your board.&rdquo; Only the boards in the file change.</p>
        {c && <p className="font-mono text-[10.5px] text-tertiary mb-3">On record now: {c.board} {LABEL.board} · {c.auxiliary} {LABEL.auxiliary} · {c.council} {LABEL.council}{status!.former ? ` · ${status!.former} former` : ''}{status!.last_upload ? ` · last roster uploaded ${when(status!.last_upload)}${status!.effective ? `, effective ${when(status!.effective)}` : ''}` : ''}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={readOnly || !!busy} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{file ? file.name : 'Choose the new roster (.xlsx or .csv)'}</button>
          <label className="inline-flex items-center gap-2 text-[12px] text-secondary">Effective <input type="date" value={effective} onChange={e => setEffective(e.target.value || today())} disabled={readOnly || !!busy} className="h-9 rounded-md border border-hairline bg-surface px-2 text-[12.5px]" /></label>
          {file && !preview && <button type="button" onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Preview changes</button>}
          <a href="/api/data-hub/board-roster?template=1" className="inline-flex items-center gap-1.5 text-[12px] text-accent ml-auto"><Download className="w-3.5 h-3.5" />Blank roster template</a>
        </div>
        {error && <p className="mt-3 text-[12px] text-critical flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        {preview && (
          <div className="mt-4 rounded-md border border-hairline bg-page p-3.5" style={{ animation: 'fd-fade .3s ease' }}>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <Stat label="Joining" value={preview.joining.length} tone="var(--accent)" /><Stat label="Continuing" value={preview.continuing} /><Stat label="Role change" value={preview.role_changes.length} tone="#9C7A2A" /><Stat label="Rolling off" value={preview.leaving.length} tone={preview.leaving.length ? 'var(--critical)' : undefined} />
            </div>
            {preview.warnings.map(w => <p key={w} className="mt-2.5 text-[12px] text-critical flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-none mt-[2px]" />{w}</p>)}
            <p className="font-mono text-[10.5px] text-tertiary mt-2">{preview.in_file} people in the file · boards: {preview.kinds.map(k => LABEL[k]).join(', ')}{preview.sheets.length > 1 ? ` · sheets: ${preview.sheets.join(', ')}` : ''}</p>
            {preview.joining.length > 0 && <List tone="text-accent" label="joining" items={preview.joining.map(j => `${j.name}${j.role !== 'Member' ? ` (${j.role})` : ''}${j.rejoining ? ', rejoining' : ''}${preview.kinds.length > 1 ? ` · ${LABEL[j.kind]}` : ''}`)} />}
            {preview.leaving.length > 0 && <List tone="text-critical" label="rolling off" items={preview.leaving.map(l => `${l.name}${l.role && l.role !== 'Member' ? ` (${l.role})` : ''}${preview.kinds.length > 1 ? ` · ${LABEL[l.kind]}` : ''}`)} />}
            {preview.role_changes.length > 0 && <List tone="text-secondary" label="new role" items={preview.role_changes.map(r => `${r.name}: ${r.from ?? 'Member'} → ${r.to}`)} />}
            {preview.loose_matches.length > 0 && <p className="mt-2 text-[11.5px] text-secondary">Matched on first and last name, check these are the same people: {preview.loose_matches.map(m => `${m.file} = ${m.record}`).join('; ')}.</p>}
            <p className="mt-2 text-[11.5px] text-secondary">Someone listed as rolling off who is staying? Their name is probably spelled differently in the file; fix the file and preview again.</p>
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => run(true)} disabled={!!busy || readOnly} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Apply as of {when(effective)}</button>
              <button type="button" onClick={() => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; }} disabled={!!busy} className="h-9 px-3 rounded-md border border-hairline bg-surface text-[12.5px] text-secondary">Cancel</button>
            </div>
          </div>
        )}
        {done && <p className="mt-3 text-[12.5px] text-accent flex items-center gap-1.5"><Check className="w-3.5 h-3.5 flex-none" /><span>Roster applied as of {when(done.effective)}: {done.joined} joined, {done.updated} updated, {done.left} rolled off. New members get paths once their LinkedIn profiles are read on the next network refresh; the connections survey adds paths for them right away.</span></p>}
        {!preview && !done && <p className="mt-3 text-[11.5px] text-tertiary">Tip: upload the roster before the board connections survey, so new members&rsquo; answers match a name {org.short} has on record.</p>}
      </div>
    </div>
  );
}

function List({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return <p className="mt-2 text-[11.5px] text-secondary"><span className={tone}>{label}</span> {items.join('; ')}</p>;
}
function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2"><span className="fd-eyebrow block text-tertiary mb-1" style={{ fontSize: 11.5 }}>{label}</span><b className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: tone }}>{value.toLocaleString('en-US')}</b></div>;
}
