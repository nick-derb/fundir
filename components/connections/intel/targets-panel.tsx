'use client';

// Target companies: the list CYC wants community-affairs and giving contacts
// at, and the control that runs the LinkedIn scan over it in bounded steps
// until it is done or a credit cap is reached. Every step's spend is shown as
// it lands; nothing runs on a schedule.

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Building2, Plus, Trash2, Loader2, Play, Square, RefreshCw, Sparkles, Users } from 'lucide-react';
import type { TargetStatus, TargetStepResult, TargetRow } from '@/lib/network/targets';

type Status = TargetStatus & { starter: Array<{ name: string; category: string }> };

const STATUS_TONE: Record<string, string | undefined> = { done: 'accent', pending: undefined, no_company: 'warning', error: 'critical' };
const STATUS_LABEL: Record<string, string> = { done: 'scanned', pending: 'pending', no_company: 'not on LinkedIn', error: 'error' };

export function TargetsPanel({ onClose, onFinished, onOpenPeople, onOpenLead, readOnly }: { onClose: () => void; onFinished: () => void; onOpenPeople?: (company: string) => void; onOpenLead?: (id: string) => void; readOnly?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('grocery');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const [cap, setCap] = useState(500);
  const [log, setLog] = useState<string[]>([]);
  const [spent, setSpent] = useState(0);

  const load = useCallback(() => fetch('/api/network/targets').then(r => r.json()).then(b => { if (b.error) setError(b.error); else setStatus(b as Status); }).catch(() => setError('Could not load target companies')), []);
  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/network/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const b = await res.json();
    if (!res.ok) throw new Error(b.error ?? 'Request failed');
    return b;
  }
  async function act(body: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await post(body); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  }

  async function run(oneStep: boolean) {
    setRunning(true); stopRef.current = false; setLog([]); setSpent(0); setError('');
    let credits = 0; let finished = false;
    try {
      for (let i = 1; i <= 80; i++) {
        let b: TargetStepResult;
        try { b = await post({ action: 'step' }) as TargetStepResult; }
        catch (e) { setLog(l => [...l, `Stopped: ${e instanceof Error ? e.message : 'step failed'}`]); break; }
        credits += b.credits; setSpent(credits);
        const line = [
          b.scanned ? `${b.scanned.target}: ${b.scanned.hits} hits, ${b.scanned.kept} kept` : null,
          b.enriched.length ? `read ${b.enriched.length} profile${b.enriched.length === 1 ? '' : 's'}` : null,
          b.pruned?.length ? `dropped ${b.pruned.length} who moved on or hold unrelated roles` : null,
          b.relationshipsFound ? `${b.relationshipsFound} relationships in graph` : null,
          b.leadsWritten ? `${b.leadsWritten} corporate leads` : null,
          ...b.errors.slice(0, 2),
        ].filter(Boolean).join(' · ');
        setLog(l => [...l, `Step ${i} (${b.credits} credits): ${line || 'nothing left to do'}`]);
        await load();
        if (b.done) { finished = true; break; }
        if (oneStep) break;
        if (credits >= cap) { setLog(l => [...l, `Credit cap of ${cap} reached. Run again to continue.`]); break; }
        if (!b.scanned && !b.enriched.length) { setLog(l => [...l, 'No progress this step; stopping to protect the budget.']); break; }
        if (stopRef.current) break;
      }
      // A run that stopped early still gets its edges and leads, at no credit cost.
      if (!finished && credits > 0) {
        try { const f = await post({ action: 'finalize' }) as { relationshipsFound: number; leadsWritten: number; pruned?: string[] }; setLog(l => [...l, `Folded into the graph: ${f.relationshipsFound} relationships, ${f.leadsWritten} corporate leads${f.pruned?.length ? `, ${f.pruned.length} contact${f.pruned.length === 1 ? '' : 's'} dropped after reading` : ''}.`]); await load(); }
        catch (e) { setLog(l => [...l, `Could not fold results into the graph: ${e instanceof Error ? e.message : 'failed'}`]); }
      }
    } finally { setRunning(false); onFinished(); }
  }

  const s = status;
  const done = !!s && s.pendingScans === 0 && s.pendingEnrich === 0;
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <aside className="ni-peek" role="dialog" aria-modal="false" aria-label="Target companies" style={{ width: 'min(560px,100vw)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 10px 18px', borderBottom: '1px solid var(--border-hairline)', flex: 'none' }}>
        <Building2 style={{ width: 13, height: 13, color: 'var(--accent)' }} />
        <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Target companies · on demand</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="fd-btn" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }} aria-label="Close" onClick={onClose} disabled={running}><X style={{ width: 14, height: 14 }} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 40px' }}>
        <h2 className="fd-display" style={{ fontSize: '1.5rem', margin: '0 0 6px' }}>Companies to find contacts at</h2>
        <p className="fd-caption" style={{ color: 'var(--text-secondary)', margin: '0 0 16px' }}>Grocers, retailers and Chicago brands CYC wants a door into, whether or not a board member ever worked there. Each company is searched once for community-affairs, giving and local-leadership people; the ones kept are read, linked to CYC&rsquo;s own people where they share history, and scored as Corporate Giving Opportunity leads.</p>
        {error && <p className="fd-caption" style={{ color: 'var(--critical)', margin: '0 0 12px' }}>{error}</p>}

        {s && (
          <div className="fd-stats" style={{ marginBottom: 16 }}>
            <div className="fd-stat"><span className="fd-eyebrow">Companies</span><b>{s.targets.length}</b><small>{s.pendingScans} to scan</small></div>
            <div className="fd-stat"><span className="fd-eyebrow">Contacts found</span><b>{s.people}</b><small>{s.enriched} read · {s.withPath} with a path</small></div>
            <div className="fd-stat"><span className="fd-eyebrow">Credits spent</span><b>{n(s.creditsSpent)}</b><small>≈ {n(s.estimateCredits)} to finish</small></div>
          </div>
        )}

        {/* run */}
        <div className="fd-card" style={{ padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>Cap
              <input type="number" className="fd-input" value={cap} min={20} max={4000} step={20} onChange={e => setCap(Number(e.target.value) || 0)} disabled={running} style={{ width: 76, height: 28 }} />
              credits
            </label>
            <span style={{ flex: 1 }} />
            <button type="button" className="fd-btn" style={{ height: 28 }} onClick={() => run(true)} disabled={readOnly || running || busy || done || !s?.configured || !s?.targets.length}><RefreshCw style={{ width: 12, height: 12 }} />One step</button>
            {running
              ? <button type="button" className="fd-btn-primary" style={{ height: 28 }} onClick={() => { stopRef.current = true; }}><Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />Running… stop after this step<Square style={{ width: 10, height: 10 }} /></button>
              : <button type="button" className="fd-btn-primary" style={{ height: 28 }} onClick={() => run(false)} disabled={readOnly || busy || done || !s?.configured || !s?.targets.length}><Play style={{ width: 12, height: 12 }} />{done && s?.targets.length ? 'Everything is scanned' : 'Run until done'}</button>}
          </div>
          {s && !s.configured && <p className="fd-caption" style={{ color: 'var(--warning)', margin: '8px 0 0' }}>RapidAPI is not configured, so nothing can run.</p>}
          {s?.lastRun && <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '8px 0 0' }}>Last step {new Date(s.lastRun.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {s.lastRun.api_calls} calls · {s.lastRun.status}{s.lastRun.notes ? ` · ${s.lastRun.notes}` : ''}</p>}
          {(log.length > 0 || spent > 0) && (
            <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 180, overflowY: 'auto' }}>
              {log.map((l, i) => <li key={i}>{l}</li>)}
              {running && <li>… {spent} credits this run</li>}
            </ul>
          )}
        </div>

        {/* add */}
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) { act({ action: 'add', name: name.trim(), category }); setName(''); } }} style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <input className="fd-input" style={{ flex: '1 1 180px' }} placeholder="Add a company, e.g. Jewel-Osco" value={name} onChange={e => setName(e.target.value)} disabled={readOnly || running} aria-label="Company name" />
          <select className="fd-input" value={category} onChange={e => setCategory(e.target.value)} disabled={readOnly || running} aria-label="Category" style={{ width: 120 }}>
            {['grocery', 'retail', 'pharmacy', 'restaurant', 'food', 'utility', 'airline', 'bank', 'other'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" className="fd-btn" disabled={readOnly || running || busy || !name.trim()}><Plus style={{ width: 12, height: 12 }} />Add</button>
        </form>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" className="fd-btn" style={{ height: 28 }} onClick={() => act({ action: 'seed' })} disabled={readOnly || running || busy}><Sparkles style={{ width: 12, height: 12 }} />Use the Chicago starter list</button>
          <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{s ? `${s.starter.length} grocers, retailers and Chicago brands` : ''}</span>
        </div>

        {/* list */}
        <div className="fd-card" style={{ overflow: 'hidden' }}>
          {!s && <p className="fd-caption" style={{ padding: 14, margin: 0, color: 'var(--text-tertiary)' }}>Loading…</p>}
          {s && s.targets.length === 0 && <p className="fd-caption" style={{ padding: '22px 14px', margin: 0, textAlign: 'center', color: 'var(--text-tertiary)' }}>No companies yet. Add one, or load the starter list.</p>}
          {s?.targets.map((t: TargetRow) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</b>
                <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>
                  {t.category}{t.status === 'done' ? ` · ${t.hits} hits, ${t.kept} kept` : ''}{t.note ? ` · ${t.note}` : ''}
                </span>
              </div>
              {!!t.contacts && <button type="button" className="fd-btn" style={{ height: 24, fontSize: 11, padding: '0 8px' }} title={`See the ${t.contacts} contact${t.contacts === 1 ? '' : 's'} under People`} onClick={() => onOpenPeople?.(t.name)}><Users style={{ width: 11, height: 11 }} />{t.contacts}</button>}
              {t.leadId && <button type="button" className="fd-btn" style={{ height: 24, fontSize: 11, padding: '0 8px', color: 'var(--accent)' }} title="Open the Corporate Giving Opportunity lead" onClick={() => onOpenLead?.(t.leadId!)}><Sparkles style={{ width: 11, height: 11 }} />{t.leadScore ?? 'Lead'}</button>}
              <span className="fd-tag" data-tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status] ?? t.status}</span>
              <button type="button" className="fd-btn" style={{ height: 24, width: 24, padding: 0, justifyContent: 'center', color: 'var(--text-tertiary)' }} aria-label={`Remove ${t.name}`} title="Remove" onClick={() => act({ action: 'remove', id: t.id })} disabled={readOnly || running || busy}><Trash2 style={{ width: 11, height: 11 }} /></button>
            </div>
          ))}
        </div>
        <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '12px 0 0' }}>Rough cost: about 15 credits to search a company plus 2 per contact read. A company already scanned is not re-spent for 180 days. Each company&rsquo;s contacts are listed under People → Corporate contacts (the people button above), and its lead on Discover carries them as &ldquo;People to approach&rdquo; (the score button).</p>
      </div>
    </aside>
  );
}
