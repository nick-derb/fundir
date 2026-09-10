'use client';

// Refresh — the panel. Before: what a run would do and cost, per category,
// against the plan. During: live counters as each bounded step returns.
// After: the run is saved, a dated Excel + JSON snapshot is written to the
// Data Hub (or offered as downloads), and new leads appear in Discover.
// On demand only; there is no schedule anywhere in this system.

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Loader2, Check, Download, FileSpreadsheet, FileJson, AlertTriangle, ExternalLink } from 'lucide-react';
import type { RefreshEstimate, RefreshCategory, RefreshStepResult } from '@/lib/network/refresh';
import { SERIF, MONO, Eyebrow, Skeleton, fmtDate, AMBER } from './shared';

interface Live { steps: number; enriched: number; scanned: number; leads: number; relationships: number; calls: number; credits: number; errors: string[]; done: boolean }
const EMPTY: Live = { steps: 0, enriched: 0, scanned: 0, leads: 0, relationships: 0, calls: 0, credits: 0, errors: [], done: false };

export function RefreshPanel({ open, onClose, onFinished, readOnly }: { open: boolean; onClose: () => void; onFinished: () => Promise<void> | void; readOnly?: boolean }) {
  const [est, setEst] = useState<RefreshEstimate | null>(null);
  const [error, setError] = useState('');
  const [cats, setCats] = useState<RefreshCategory[]>(['people', 'employers']);
  const [phase, setPhase] = useState<'idle' | 'running' | 'snapshot' | 'done'>('idle');
  const [live, setLive] = useState<Live>(EMPTY);
  const [snapshot, setSnapshot] = useState<{ xlsx?: { name: string; webUrl: string | null }; json?: { name: string; webUrl: string | null }; downloadOnly?: boolean } | null>(null);
  const stop = useRef(false);

  const loadEstimate = useCallback(() => { fetch('/api/network/refresh').then(r => r.json()).then(b => { if (b.error) setError(b.error); else setEst(b as RefreshEstimate); }).catch(() => setError('Could not estimate')); }, []);
  useEffect(() => { if (open) loadEstimate(); }, [open, loadEstimate]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'running') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose, phase]);
  if (!open) return null;

  const chosen = est?.categories.filter(c => cats.includes(c.key)) ?? [];
  const calls = chosen.reduce((n, c) => n + c.calls, 0), credits = chosen.reduce((n, c) => n + c.credits, 0);
  const share = est ? credits / est.plan.credits : 0;
  const stepsPlanned = chosen.length ? Math.max(...chosen.map(c => Math.ceil(c.pending / (c.key === 'people' ? 6 : 2)))) : 0;

  async function run() {
    if (!est || readOnly) return;
    stop.current = false; setPhase('running'); setLive(EMPTY); setSnapshot(null); setError('');
    let acc = { ...EMPTY };
    for (let i = 0; i < 40 && !stop.current; i++) {
      try {
        const res = await fetch('/api/network/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categories: cats }) });
        const b = await res.json() as RefreshStepResult & { error?: string };
        if (!res.ok) { acc = { ...acc, errors: [...acc.errors, b.error ?? 'Step failed'] }; setLive(acc); break; }
        acc = { steps: acc.steps + 1, enriched: acc.enriched + b.enriched.length, scanned: acc.scanned + b.scanned.length, leads: acc.leads + b.leadsFound, relationships: acc.relationships + ((b as { relationshipsFound?: number }).relationshipsFound ?? 0), calls: acc.calls + b.apiCalls, credits: acc.credits + b.enriched.length * 2 + Math.max(0, b.apiCalls - b.enriched.length), errors: [...acc.errors, ...b.errors], done: b.done };
        setLive(acc);
        if (b.done || (!b.enriched.length && !b.scanned.length)) break;
      } catch { acc = { ...acc, errors: [...acc.errors, 'Network error during a step'] }; setLive(acc); break; }
    }
    // Completion: the snapshot is the point — the database is never the only copy.
    setPhase('snapshot');
    try {
      const r = await fetch('/api/network/export', { method: 'POST' });
      const b = await r.json();
      if (r.ok) setSnapshot({ xlsx: b.document, json: b.json });
      else setSnapshot({ downloadOnly: true });
    } catch { setSnapshot({ downloadOnly: true }); }
    setPhase('done');
    await onFinished();
    loadEstimate();
  }

  const n = (v: number) => v.toLocaleString('en-US');
  return (
    <aside className="ni-peek" role="dialog" aria-modal="false" aria-label="Refresh the network" style={{ width: 'min(520px,100vw)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 10px 18px', borderBottom: '1px solid var(--border-hairline)', flex: 'none' }}>
        <RefreshCw style={{ width: 13, height: 13, color: 'var(--accent)' }} />
        <span className="fd-mono" style={{ fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Refresh · on demand</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ni-ghost" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }} aria-label="Close" onClick={onClose} disabled={phase === 'running'}><X style={{ width: 14, height: 14 }} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 40px' }}>
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.6rem', lineHeight: 1.1, letterSpacing: '-.015em', margin: '0 0 6px' }}>{phase === 'idle' ? 'Before you run it' : phase === 'done' ? 'Refresh complete' : 'Refreshing…'}</h2>
        <p className="fd-caption" style={{ color: 'var(--text-secondary)', margin: '0 0 18px' }}>A refresh reads CYC profiles that are new or stale, then scans their former employers for people worth an introduction. It runs in bounded steps, spends nothing on the model, and ends with a dated snapshot. Quarterly is plenty.</p>
        {error && <p className="fd-caption" style={{ color: 'var(--critical)', margin: '0 0 12px' }}>{error}</p>}

        {/* pre-flight */}
        {!est && !error && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><Skeleton h={54} /><Skeleton h={54} /><Skeleton h={40} w="60%" /></div>}
        {est && phase === 'idle' && (
          <>
            {!est.configured && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: `1px solid rgba(156,122,42,.36)`, background: 'rgba(156,122,42,.08)', marginBottom: 14 }}><AlertTriangle style={{ width: 14, height: 14, color: AMBER, flex: 'none', marginTop: 1 }} /><span className="fd-caption" style={{ color: 'var(--text-secondary)' }}>RapidAPI is not configured on this deployment (RAPIDAPI_KEY). The estimate is real; the run button stays off until the key is added.</span></div>}
            <Eyebrow color="var(--text-secondary)" style={{ display: 'block', marginBottom: 8 }}>Data categories</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {est.categories.map(c => { const on = cats.includes(c.key); return (
                <button key={c.key} type="button" aria-pressed={on} onClick={() => setCats(x => on ? x.filter(k => k !== c.key) : [...x, c.key])} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 12, alignItems: 'center', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-hairline)'}`, background: on ? 'var(--accent-tint)' : 'var(--bg-surface)', font: 'inherit', cursor: 'pointer', color: 'inherit' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Check style={{ width: 11, height: 11, color: 'var(--accent-on)' }} />}</span>
                  <span><b style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{c.label} <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>{c.pending} pending</span></b><span className="fd-caption" style={{ color: 'var(--text-secondary)' }}>{c.note}</span></span>
                  <span className="fd-mono" style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>{n(c.calls)} calls<br /><span style={{ color: 'var(--text-tertiary)' }}>{n(c.credits)} credits</span></span>
                </button>
              ); })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 14 }}>
              <Stat label="Estimated API calls" value={n(calls)} sub={`${stepsPlanned} bounded step${stepsPlanned === 1 ? '' : 's'} of ≤ 40 calls`} />
              <Stat label="Estimated credits" value={n(credits)} sub={`${(share * 100).toFixed(1)}% of ${n(est.plan.credits)} / month`} tone={share > 0.5 ? AMBER : undefined} />
              <Stat label="Estimated cost" value={est.marginalUsd > 0 ? `$${est.marginalUsd.toFixed(2)}` : 'Included'} sub={est.marginalUsd > 0 ? 'beyond the plan allowance' : `inside the plan · model calls $0`} />
              <Stat label="Subscription" value={`$${est.plan.monthlyUsd}/mo`} sub={est.plan.name} />
            </div>
            <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '12px 0 0', fontSize: 11.5 }}>
              {est.peopleWithoutUrl > 0 ? `${est.peopleWithoutUrl} CYC people have no LinkedIn URL yet and are not counted — add URLs on the People tab to widen the next run. ` : ''}
              Last run {est.lastRun ? `${fmtDate(est.lastRun.started_at)} · ${est.lastRun.api_calls} calls · ${est.lastRun.status}` : 'never'}.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
              <button type="button" className="ni-primary" style={{ height: 36, padding: '0 16px' }} disabled={readOnly || !est.configured || !cats.length || calls === 0} onClick={run}><RefreshCw style={{ width: 13, height: 13 }} />{calls === 0 ? 'Nothing pending' : `Run refresh · ${n(calls)} calls`}</button>
              <a href="/api/network/export" className="ni-ghost" style={{ height: 36, textDecoration: 'none' }} title="Download today's snapshot without refreshing"><Download style={{ width: 13, height: 13 }} />Snapshot now</a>
            </div>
          </>
        )}

        {/* live counters */}
        {phase !== 'idle' && (
          <>
            <Eyebrow color="var(--text-secondary)" style={{ display: 'block', marginBottom: 8 }}>{phase === 'running' ? `Step ${live.steps + 1} running` : `${live.steps} step${live.steps === 1 ? '' : 's'} run`}</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Stat label="People enriched" value={n(live.enriched)} live={phase === 'running'} />
              <Stat label="Organizations scanned" value={n(live.scanned)} live={phase === 'running'} />
              <Stat label="Relationships found" value={n(live.relationships)} live={phase === 'running'} />
              <Stat label="Warm paths generated" value={n(live.leads)} live={phase === 'running'} />
              <Stat label="API calls used" value={n(live.calls)} live={phase === 'running'} />
              <Stat label="Estimated spend" value={est && live.credits > est.plan.credits ? `$${((live.credits - est.plan.credits) * est.plan.monthlyUsd / est.plan.credits).toFixed(2)}` : `${n(live.credits)} cr`} sub="model $0" live={phase === 'running'} />
            </div>
            {phase === 'running' && <p className="fd-caption" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', margin: '14px 0 0' }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} />Reading profiles and scanning employers, one bounded step at a time… <button type="button" className="ni-ghost" style={{ height: 26, marginLeft: 'auto' }} onClick={() => { stop.current = true; }}>Stop after this step</button></p>}
            {phase === 'snapshot' && <p className="fd-caption" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', margin: '14px 0 0' }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} />Saving the run and writing the dated snapshot…</p>}
            {live.errors.length > 0 && <ul style={{ margin: '12px 0 0', padding: '10px 12px', listStyle: 'none', borderRadius: 10, border: '1px solid rgba(156,122,42,.36)', background: 'rgba(156,122,42,.08)', display: 'flex', flexDirection: 'column', gap: 4 }}>{live.errors.slice(0, 6).map((e, i) => <li key={i} className="fd-caption" style={{ color: 'var(--text-secondary)' }}>{e}</li>)}{live.errors.length > 6 && <li className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>and {live.errors.length - 6} more</li>}</ul>}
            {phase === 'done' && (
              <div style={{ marginTop: 16, border: '1px solid rgba(12,107,90,.3)', background: 'var(--accent-tint)', borderRadius: 12, padding: '12px 14px' }}>
                <Eyebrow color="var(--accent)" style={{ display: 'block', marginBottom: 6 }}>At completion</Eyebrow>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                  <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check style={{ width: 12, height: 12, color: 'var(--accent)' }} />Run saved to the refresh log with its spend.</li>
                  {snapshot?.xlsx ? <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}><FileSpreadsheet style={{ width: 12, height: 12, color: 'var(--accent)' }} />Excel snapshot in the Data Hub: <b style={{ fontWeight: 500 }}>{snapshot.xlsx.name}</b>{snapshot.xlsx.webUrl && <a href={snapshot.xlsx.webUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', lineHeight: 0 }}><ExternalLink style={{ width: 11, height: 11 }} /></a>}</li> : null}
                  {snapshot?.json ? <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}><FileJson style={{ width: 12, height: 12, color: 'var(--accent)' }} />JSON snapshot: <b style={{ fontWeight: 500 }}>{snapshot.json.name}</b></li> : null}
                  {snapshot?.downloadOnly && <li style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><AlertTriangle style={{ width: 12, height: 12, color: AMBER }} />Microsoft 365 is not connected, so the snapshot was not filed. Download it: <a href="/api/network/export" className="ni-ghost" style={{ height: 26, textDecoration: 'none' }}><FileSpreadsheet style={{ width: 11, height: 11 }} />.xlsx</a><a href="/api/network/export?format=json" className="ni-ghost" style={{ height: 26, textDecoration: 'none' }}><FileJson style={{ width: 11, height: 11 }} />.json</a></li>}
                  <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check style={{ width: 12, height: 12, color: 'var(--accent)' }} />Timestamps updated; new leads are in Discover.</li>
                </ul>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="ni-primary" style={{ height: 32 }} onClick={onClose}>See what changed</button>
                  <button type="button" className="ni-ghost" style={{ height: 32 }} onClick={() => { setPhase('idle'); setLive(EMPTY); }}>Back to estimate</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value, sub, tone, live }: { label: string; value: string; sub?: string; tone?: string; live?: boolean }) {
  return (
    <div className="ni-kpi" style={{ padding: '10px 12px' }}>
      <span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 9.5, marginBottom: 4 }}>{label}</span>
      <b className="fd-kpi" style={{ fontSize: 18, color: tone, fontFamily: MONO, transition: 'color .2s' }}>{value}{live && <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', marginLeft: 6, verticalAlign: 'middle', animation: 'ni-pulse 1.2s ease-in-out infinite' }} />}</b>
      {sub && <span className="fd-caption" style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 10.5, marginTop: 2 }}>{sub}</span>}
    </div>
  );
}
