'use client';

// "Board connections survey" — load the answers to the board's foundation
// connections survey. A forms export (Microsoft or Google) or the blank
// template both work. Preview shows who matched and which foundations are new
// to the network; recording turns each answer into a direct connection and a
// warm-introduction lead, so "Ask your board" and the map use it at once.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Handshake, Upload, Check, Loader2, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import type { SurveyPreview } from '@/lib/board-survey';
import { useOrg } from '@/components/org-context';

export function BoardSurveyCard({ readOnly }: { readOnly?: boolean }) {
  const org = useOrg();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SurveyPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ connections: number; added: number; leads: number; created: number; skipped: string[] } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(commit ? 'commit' : 'preview'); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/data-hub/board-survey${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Failed');
      if (commit) { setDone({ connections: b.connections, added: b.foundations_added, leads: b.leads?.leads ?? 0, created: b.leads?.created ?? 0, skipped: b.skipped_members ?? [] }); setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; router.refresh(); }
      else setPreview(b.preview as SurveyPreview);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  return (
    <div id="board-survey" className="bg-surface border border-hairline rounded-md overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <Handshake className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Board connections survey</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">feeds Network, Ask your board, the map</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-3">Upload the answers to the board&rsquo;s foundation connections survey: a Microsoft Forms or Google Forms export, or the blank template filled in. Each &ldquo;I know this foundation&rdquo; becomes a direct connection from that member and a warm-introduction lead, ranked higher when they are willing to introduce. Uploading again replaces the earlier answers of the members in the file.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={readOnly || !!busy} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-hairline bg-surface text-[12.5px] text-primary hover:bg-elevated disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{file ? file.name : 'Choose the survey results (.xlsx or .csv)'}</button>
          {file && !preview && <button type="button" onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Preview</button>}
          <a href="/api/data-hub/board-survey?template=1" className="inline-flex items-center gap-1.5 text-[12px] text-accent ml-auto"><Download className="w-3.5 h-3.5" />Blank survey template</a>
        </div>
        {error && <p className="mt-3 text-[12px] text-critical flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        {preview && (
          <div className="mt-4 rounded-md border border-hairline bg-page p-3.5" style={{ animation: 'fd-fade .3s ease' }}>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <Stat label="Respondents" value={preview.respondents} /><Stat label="Connections" value={preview.answers} tone="var(--accent)" /><Stat label="Foundations" value={preview.foundations} /><Stat label="Willing to introduce" value={preview.willing} tone="var(--accent)" />
            </div>
            <p className="mt-2.5 text-[12px] text-secondary leading-relaxed">{preview.members_matched} of {preview.members_matched + preview.members_unmatched.length} members matched a name on {org.possessive} roster. {preview.foundations_in_graph} foundation{preview.foundations_in_graph === 1 ? '' : 's'} already in the network{preview.foundations_new.length ? `; ${preview.foundations_new.length} will be added` : ''}.</p>
            {preview.members_unmatched.length > 0 && <p className="mt-1.5 text-[11.5px] text-critical">Not on the roster, so skipped: {preview.members_unmatched.join('; ')}. Upload the new board roster first, or check the spelling.</p>}
            {preview.foundations_new.length > 0 && <p className="mt-1.5 text-[11.5px] text-secondary">New to the network: {preview.foundations_new.join('; ')}.</p>}
            {preview.sample.length > 0 && <ul className="mt-2 text-[11.5px] text-secondary flex flex-col gap-0.5">{preview.sample.map((s, i) => <li key={i}><span className="text-primary">{s.member}</span> knows <span className="text-primary">{s.foundation}</span>{s.detail ? ` · ${s.detail}` : ''}</li>)}</ul>}
            <p className="font-mono text-[10.5px] text-tertiary mt-2">{preview.shape === 'matrix' ? 'one column per foundation' : 'one row per answer'} · columns: {Object.values(preview.columns).filter(Boolean).join(', ')}</p>
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => run(true)} disabled={!!busy || readOnly} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-[12.5px] font-medium disabled:opacity-60" style={{ color: 'var(--accent-on)' }}>{busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Add these connections</button>
              <button type="button" onClick={() => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; }} disabled={!!busy} className="h-9 px-3 rounded-md border border-hairline bg-surface text-[12.5px] text-secondary">Cancel</button>
            </div>
          </div>
        )}
        {done && <p className="mt-3 text-[12.5px] text-accent flex items-center gap-1.5"><Check className="w-3.5 h-3.5 flex-none" /><span>{done.connections} connection{done.connections === 1 ? '' : 's'} recorded{done.added ? `, ${done.added} foundation${done.added === 1 ? '' : 's'} added to the network` : ''}; {done.created} new warm-introduction lead{done.created === 1 ? '' : 's'} ({done.leads} in all from direct connections). They show under Network and Ask your board now.{done.skipped.length ? ` Skipped (not on the roster): ${done.skipped.join('; ')}.` : ''}</span></p>}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-[8px] border border-hairline bg-surface px-2.5 py-2"><span className="fd-eyebrow block text-tertiary mb-1" style={{ fontSize: 11.5 }}>{label}</span><b className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: tone }}>{value.toLocaleString('en-US')}</b></div>;
}
