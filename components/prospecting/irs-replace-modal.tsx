'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, Lock, ShieldCheck, X, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import type { Sheet } from '@/components/prospecting/prospecting-view';
import { parseCsv, rowsToRecords, detectBmfFormat, normalizeBmfRows, type BmfRow } from '@/lib/prospecting/irs-bmf';

// "Replace the IRS sheets" — drop the raw IRS Business Master File, see the
// diff against the live sheet, apply. The file is parsed in the browser and
// streamed to /api/prospecting/irs-replace in batches; the diff and the
// swap run as single SQL calls on the server.

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const BATCH = 2000;
const STATE = 'IL';

type Phase = 'idle' | 'parsing' | 'staging' | 'preview' | 'applying' | 'done' | 'error';

interface Sample { ein: string; name: string | null; city: string | null; assets?: number | null; before?: number | null; after?: number | null; tracked?: boolean }
interface Diff {
  staged: number; current: number; added: number; removed: number; changed: number; unchanged: number;
  trackedRemoved: number; addedSample: Sample[]; removedSample: Sample[]; changedSample: Sample[];
  canApply: boolean; minCoverage: number;
}
interface Applied { upserted: number; deleted: number; prospects: number; peers: number; queue: number; cultivation: number; cultivationDropped: number }

const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US'));

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/prospecting/irs-replace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

async function readRecords(file: File): Promise<{ headers: string[]; records: Record<string, unknown>[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'xlsx' || ext === 'xls') {
    const mod = await import('xlsx');
    const XLSX = ('read' in mod ? mod : (mod as unknown as { default: typeof mod }).default) as typeof mod;
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
    // Prefer a sheet that looks like the BMF; otherwise the first one.
    const name = wb.SheetNames.find(n => /eo_?[a-z]{2}|bmf/i.test(n)) ?? wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }) as unknown[][];
    return rowsToRecords(rows.map(r => r.map(v => (v == null ? '' : String(v)))));
  }
  if (ext === 'csv' || ext === 'txt' || ext === '') {
    return rowsToRecords(parseCsv(await file.text()));
  }
  throw new Error(`Unsupported file type .${ext}. Drop the IRS file as .csv (raw download) or .xlsx.`);
}

export function IrsReplaceModal({ open, onClose, lockedSheets, canReplace }: {
  open: boolean; onClose: () => void; lockedSheets: Sheet[]; canReplace: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [skipped, setSkipped] = useState({ noEin: 0, otherState: 0, duplicates: 0 });
  const [diff, setDiff] = useState<Diff | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [hover, setHover] = useState(false);
  const runId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase('idle'); setError(null); setFileName(null); setProgress({ done: 0, total: 0 });
    setSkipped({ noEin: 0, otherState: 0, duplicates: 0 }); setDiff(null); setApplied(null); setHover(false);
    runId.current = null;
  }, []);

  const cancelRun = useCallback(() => {
    const id = runId.current;
    runId.current = null;
    if (id) call({ action: 'cancel', runId: id }).catch(() => { /* best effort */ });
  }, []);

  const close = useCallback(() => {
    if (phase === 'staging' || phase === 'applying') return; // let it finish
    if (phase !== 'done') cancelRun();
    reset();
    onClose();
  }, [phase, cancelRun, reset, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const fail = (msg: string) => { setError(msg); setPhase('error'); cancelRun(); };

  async function handleFile(file: File) {
    if (!canReplace) return;
    setError(null); setFileName(file.name); setPhase('parsing');
    let rows: BmfRow[];
    let sourceRows = 0;
    try {
      const { headers, records } = await readRecords(file);
      const check = detectBmfFormat(headers);
      if (!check.ok) return fail(check.reason);
      sourceRows = records.length;
      const norm = normalizeBmfRows(records, { state: STATE });
      rows = norm.rows;
      setSkipped({ noEin: norm.skippedNoEin, otherState: norm.skippedOtherState, duplicates: norm.duplicates });
      if (!rows.length) return fail('No usable rows: every row was missing an EIN or filed outside Illinois.');
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Could not read that file.');
    }

    setPhase('staging'); setProgress({ done: 0, total: rows.length });
    try {
      const { runId: id } = await call<{ runId: string }>({ action: 'start', fileName: file.name, sourceRows });
      runId.current = id;
      for (let i = 0; i < rows.length; i += BATCH) {
        if (runId.current !== id) return; // cancelled
        await call({ action: 'stage', runId: id, rows: rows.slice(i, i + BATCH) });
        setProgress({ done: Math.min(rows.length, i + BATCH), total: rows.length });
      }
      const skippedRows = sourceRows - rows.length;
      const d = await call<Diff>({ action: 'preview', runId: id, skippedRows });
      setDiff(d); setPhase('preview');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Upload failed.');
    }
  }

  async function apply() {
    const id = runId.current;
    if (!id || !diff?.canApply) return;
    setPhase('applying'); setError(null);
    try {
      const r = await call<Applied>({ action: 'apply', runId: id });
      setApplied(r); setPhase('done'); runId.current = null;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed.'); setPhase('preview');
    }
  }

  if (!open) return null;

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)' };
  const busy = phase === 'parsing' || phase === 'staging' || phase === 'applying';
  const btn = (primary: boolean): React.CSSProperties => ({
    height: 38, padding: primary ? '0 18px' : '0 16px', borderRadius: 'var(--radius-kpi)', font: 'inherit', fontSize: 12.5, cursor: 'pointer',
    border: primary ? 'none' : '1px solid var(--border-hairline)', background: primary ? 'var(--accent)' : 'var(--bg-surface)', color: primary ? '#fff' : 'var(--text-primary)', fontWeight: primary ? 500 : 400,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(16,25,23,.42)', backdropFilter: 'blur(3px)', animation: 'pr-fade .22s ease' }} />
      <div role="dialog" aria-modal="true" aria-label="Replace IRS data" style={{ position: 'relative', width: 'min(600px,100%)', ...card, boxShadow: '0 24px 60px rgba(16,25,23,.20)', animation: 'pr-rise .26s cubic-bezier(.2,.8,.3,1)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '20px 22px 0' }}>
          <div>
            <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.6rem', lineHeight: 1.1, letterSpacing: '-.015em', margin: '0 0 6px' }}>
              {phase === 'done' ? 'IRS sheets replaced' : phase === 'preview' ? 'Preview the diff' : 'Replace the IRS sheets'}
            </h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              {phase === 'preview' ? 'Nothing has changed yet. Apply to swap the locked sheets and rejoin your columns on EIN.' : 'Your own columns are untouched. Only the locked source sheets are swapped.'}
            </p>
          </div>
          <button onClick={close} disabled={busy} aria-label="Close" style={{ width: 30, height: 30, flex: 'none', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: busy ? 'default' : 'pointer', opacity: busy ? .5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X style={{ width: 14, height: 14 }} /></button>
        </div>

        <div style={{ padding: '18px 22px 22px' }}>
          {/* ── Drop zone (idle / parsing / staging / error) ── */}
          {(phase === 'idle' || phase === 'parsing' || phase === 'staging' || phase === 'error') && (
            <>
              <input ref={inputRef} type="file" accept=".csv,.txt,.xlsx,.xls" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              <div
                role="button" tabIndex={canReplace && !busy ? 0 : -1} aria-disabled={!canReplace || busy}
                onClick={() => { if (canReplace && !busy) inputRef.current?.click(); }}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && canReplace && !busy) { e.preventDefault(); inputRef.current?.click(); } }}
                onDragOver={e => { e.preventDefault(); if (canReplace && !busy) setHover(true); }}
                onDragLeave={() => setHover(false)}
                onDrop={e => { e.preventDefault(); setHover(false); const f = e.dataTransfer.files?.[0]; if (f && canReplace && !busy) handleFile(f); }}
                style={{ border: `1px dashed ${hover ? 'var(--accent)' : 'var(--border-hairline)'}`, borderRadius: 'var(--radius-kpi)', padding: '26px 20px', textAlign: 'center', background: hover ? 'rgba(12,107,90,.05)' : 'var(--bg-page)', cursor: canReplace && !busy ? 'pointer' : 'default', opacity: canReplace ? 1 : .6, transition: 'border-color .15s ease, background-color .15s ease', outline: 'none' }}
              >
                {busy
                  ? <Loader2 style={{ width: 20, height: 20, color: 'var(--accent)', animation: 'pr-spin 1s linear infinite' }} />
                  : <UploadCloud style={{ width: 20, height: 20, color: hover ? 'var(--accent)' : 'var(--text-tertiary)' }} />}
                {phase === 'parsing' && <>
                  <b style={{ display: 'block', fontSize: 13.5, fontWeight: 500, margin: '10px 0 4px' }}>Reading {fileName}</b>
                  <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>Cleaning and mapping the IRS columns</span>
                </>}
                {phase === 'staging' && <>
                  <b style={{ display: 'block', fontSize: 13.5, fontWeight: 500, margin: '10px 0 4px' }}>Uploading {fmt(progress.done)} of {fmt(progress.total)} rows</b>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--border-hairline)', margin: '10px auto 6px', maxWidth: 320, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: 'var(--accent)', transition: 'width .2s ease' }} />
                  </div>
                  <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>Then the diff is computed against the live sheet</span>
                </>}
                {(phase === 'idle' || phase === 'error') && <>
                  <b style={{ display: 'block', fontSize: 13.5, fontWeight: 500, margin: '10px 0 4px' }}>Drop the new IRS Business Master File</b>
                  <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>
                    {canReplace ? <>Raw IRS format is fine (eo_il.csv, or any BMF as .csv / .xlsx) · Fundir cleans and maps the columns · or <u>browse</u></> : 'Only an organization admin can replace the shared IRS sheets.'}
                  </span>
                </>}
              </div>
              {phase === 'error' && error && (
                <div role="alert" style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid rgba(162,90,68,.35)', background: 'rgba(162,90,68,.06)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px' }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: '#A25A44', flex: 'none', marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{error}</span>
                </div>
              )}
              <div style={{ marginTop: 18, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}><span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Sheets that will be replaced</span></div>
                {lockedSheets.map((s, i) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', borderBottom: i < lockedSheets.length - 1 ? '1px solid var(--border-hairline)' : 'none' }}>
                    <Lock style={{ width: 12, height: 12, color: '#5B7383', flex: 'none' }} />
                    <span style={{ flex: 1, fontSize: 12.5 }}>{s.label}</span>
                    <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.total} rows</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, border: '1px solid rgba(12,107,90,.24)', borderRadius: 'var(--radius-kpi)', padding: '12px 13px', background: 'rgba(12,107,90,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><ShieldCheck style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} /><span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>Kept intact</span></div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>Cultivation List, Board Members and Research Queue keep every value you have entered. They rejoin the new source on EIN.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
                <span style={{ flex: 1 }} />
                <button onClick={close} disabled={busy} style={{ ...btn(false), opacity: busy ? .6 : 1 }}>Cancel</button>
              </div>
            </>
          )}

          {/* ── Preview ── */}
          {(phase === 'preview' || phase === 'applying') && diff && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <FileSpreadsheet style={{ width: 14, height: 14, color: 'var(--text-tertiary)', flex: 'none' }} />
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmt(diff.staged)} Illinois rows</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                {[
                  { label: 'Rows added', n: diff.added, tone: 'var(--accent)' },
                  { label: 'Assets changed', n: diff.changed, tone: '#3E6CA8' },
                  { label: 'Disappeared', n: diff.removed, tone: diff.removed ? '#9C7A2A' : 'var(--text-secondary)' },
                ].map(t => (
                  <div key={t.label} style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', padding: '12px 13px', background: 'var(--bg-page)' }}>
                    <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>{t.label}</span>
                    <span className="fd-kpi" style={{ fontSize: 22, color: t.tone }}>{fmt(t.n)}</span>
                  </div>
                ))}
              </div>
              <p className="fd-caption" style={{ margin: '10px 0 0', color: 'var(--text-tertiary)' }}>
                {fmt(diff.unchanged)} unchanged · sheet goes from {fmt(diff.current)} to {fmt(diff.staged)} rows
                {skipped.otherState ? ` · ${fmt(skipped.otherState)} out-of-state rows skipped` : ''}
                {skipped.noEin ? ` · ${fmt(skipped.noEin)} rows without an EIN skipped` : ''}
                {skipped.duplicates ? ` · ${fmt(skipped.duplicates)} duplicate EINs collapsed` : ''}
              </p>

              {!diff.canApply && (
                <div role="alert" style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid rgba(162,90,68,.35)', background: 'rgba(162,90,68,.06)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px' }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: '#A25A44', flex: 'none', marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>This file would remove more than half of the current sheet, so Fundir will not apply it. Check that you dropped the full Illinois file, not a filtered extract.</span>
                </div>
              )}
              {diff.canApply && diff.trackedRemoved > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid rgba(156,122,42,.3)', background: 'rgba(156,122,42,.06)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px' }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: '#9C7A2A', flex: 'none', marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{fmt(diff.trackedRemoved)} of the organizations that disappeared are on a CYC sheet. Their rows stay put with the values you last saw; the Cultivation List marks them as dropped from the IRS file.</span>
                </div>
              )}

              {([
                { title: 'Largest additions', rows: diff.addedSample, kind: 'added' },
                { title: 'Biggest asset changes', rows: diff.changedSample, kind: 'changed' },
                { title: 'Disappeared', rows: diff.removedSample, kind: 'removed' },
              ] as const).filter(g => g.rows.length).map(g => (
                <div key={g.kind} style={{ marginTop: 14, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', overflow: 'hidden' }}>
                  <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}><span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>{g.title}</span></div>
                  {g.rows.map((r, i) => (
                    <div key={r.ein} style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '8px 13px', borderBottom: i < g.rows.length - 1 ? '1px solid var(--border-hairline)' : 'none' }}>
                      <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', flex: 'none' }}>{r.ein}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name ?? '—'}{r.city ? <span style={{ color: 'var(--text-tertiary)' }}> · {r.city}</span> : null}{r.tracked ? <span className="fd-eyebrow" style={{ marginLeft: 8, color: '#9C7A2A' }}>on a CYC sheet</span> : null}</span>
                      <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-secondary)', flex: 'none' }}>
                        {g.kind === 'changed' ? <>{money(r.before)} → {money(r.after)}</> : money(r.assets)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              {error && (
                <div role="alert" style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid rgba(162,90,68,.35)', background: 'rgba(162,90,68,.06)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px' }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: '#A25A44', flex: 'none', marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
                <button onClick={() => { cancelRun(); reset(); }} disabled={busy} style={{ ...btn(false), opacity: busy ? .6 : 1 }}>Choose another file</button>
                <span style={{ flex: 1 }} />
                <button onClick={close} disabled={busy} style={{ ...btn(false), opacity: busy ? .6 : 1 }}>Cancel</button>
                <button onClick={apply} disabled={busy || !diff.canApply} style={{ ...btn(true), opacity: busy || !diff.canApply ? .6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {phase === 'applying' ? <><Loader2 style={{ width: 13, height: 13, animation: 'pr-spin 1s linear infinite' }} />Applying</> : 'Apply replacement'}
                </button>
              </div>
            </>
          )}

          {/* ── Done ── */}
          {phase === 'done' && applied && diff && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid rgba(12,107,90,.24)', borderRadius: 'var(--radius-kpi)', padding: '12px 13px', background: 'rgba(12,107,90,.04)' }}>
                <CheckCircle2 style={{ width: 15, height: 15, color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  <b style={{ color: 'var(--text-primary)', fontWeight: 500 }}>eo_il now holds {fmt(diff.staged)} rows.</b> {fmt(diff.added)} added, {fmt(diff.changed)} asset updates, {fmt(applied.deleted)} removed.
                </div>
              </div>
              <div style={{ marginTop: 14, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', overflow: 'hidden' }}>
                <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}><span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Rejoined on EIN</span></div>
                {[
                  ['Chicago Metro Funders + Funder Prospects', applied.prospects, 'name, address, NTEE, assets, income, 990-PF flag'],
                  ['Peer Youth Orgs', applied.peers, 'name, city, NTEE, assets, revenue'],
                  ['Research Queue', applied.queue, 'organization name, city, assets'],
                  ['Cultivation List', applied.cultivation, `legal name + In IL BMF${applied.cultivationDropped ? ` · ${fmt(applied.cultivationDropped)} marked dropped` : ''}`],
                ].map(([label, n, what], i, arr) => (
                  <div key={String(label)} style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '8px 13px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-hairline)' : 'none' }}>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{label}<span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}> · {what}</span></span>
                    <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', flex: 'none' }}>{fmt(Number(n))} rows</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
                <span style={{ flex: 1 }} />
                <button onClick={close} style={btn(true)}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
