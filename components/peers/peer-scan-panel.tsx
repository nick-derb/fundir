'use client';

// Admin control for the peer-staff scan: runs bounded steps against
// /api/network/peers until every flagged peer is scanned and every found
// profile is read, or until the credit cap set here is reached. Every step's
// spend is shown as it lands; nothing runs on a schedule.

import { useState } from 'react';
import { Loader2, Play, Square, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { PeerStaffStatus, PeerStaffStepResult } from '@/lib/network/peer-staff';

export function PeerScanPanel({ status }: { status: PeerStaffStatus }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stop, setStop] = useState(false);
  const [cap, setCap] = useState(600);
  const [log, setLog] = useState<string[]>([]);
  const [spent, setSpent] = useState(0);
  const done = status.pendingScans === 0 && status.pendingEnrich === 0;

  async function run(oneStep: boolean) {
    setRunning(true); setStop(false); setLog([]); setSpent(0);
    let credits = 0;
    try {
      for (let i = 1; i <= 80; i++) {
        const res = await fetch('/api/network/peers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const b = await res.json() as PeerStaffStepResult & { error?: string };
        if (!res.ok) { setLog(l => [...l, `Stopped: ${b.error ?? 'step failed'}`]); break; }
        credits += b.credits;
        setSpent(credits);
        const line = [b.scanned ? `${b.scanned.peer}: ${b.scanned.hits} hits, ${b.scanned.kept} kept` : null, b.enriched.length ? `read ${b.enriched.length} profile${b.enriched.length === 1 ? '' : 's'}` : null, b.relationshipsFound ? `${b.relationshipsFound} relationships in graph` : null, ...b.errors.slice(0, 2)].filter(Boolean).join(' · ');
        setLog(l => [...l, `Step ${i} (${b.credits} credits): ${line || 'nothing left to do'}`]);
        if (b.done || oneStep) break;
        if (credits >= cap) { setLog(l => [...l, `Credit cap of ${cap} reached.`]); break; }
        if (!b.scanned && !b.enriched.length) { setLog(l => [...l, 'No progress this step; stopping to protect the budget.']); break; }
        if (stop) break;
      }
    } finally { setRunning(false); router.refresh(); }
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Admin · LinkedIn scan</span>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {status.scanned} of {status.peers} peers scanned · {status.people} people found, {status.enriched} read · {status.creditsSpent} credits spent so far
            {status.lastRun ? ` · last step ${new Date(status.lastRun.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
            {!status.configured ? ' · RAPIDAPI_KEY is not configured' : ''}
          </p>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>Cap
          <input type="number" value={cap} min={20} max={4000} step={20} onChange={e => setCap(Number(e.target.value) || 0)} disabled={running} style={{ width: 70, height: 30, border: '1px solid var(--border-hairline)', borderRadius: 8, padding: '0 8px', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 12 }} />
          credits
        </label>
        <button type="button" onClick={() => run(true)} disabled={running || done || !status.configured} className="inline-flex items-center gap-2 h-8 px-3 rounded-[8px] border border-hairline text-[12px] text-primary disabled:opacity-50"><RefreshCw className="w-3.5 h-3.5" />One step</button>
        {running
          ? <button type="button" onClick={() => setStop(true)} className="inline-flex items-center gap-2 h-8 px-3.5 rounded-[8px] bg-accent text-[12px] font-medium" style={{ color: 'var(--accent-on)' }}><Loader2 className="w-3.5 h-3.5 animate-spin" />Running… stop after this step<Square className="w-3 h-3" /></button>
          : <button type="button" onClick={() => run(false)} disabled={done || !status.configured} className="inline-flex items-center gap-2 h-8 px-3.5 rounded-[8px] bg-accent text-[12px] font-medium disabled:opacity-50" style={{ color: 'var(--accent-on)' }}><Play className="w-3.5 h-3.5" />{done ? 'Everything is scanned' : 'Run until done'}</button>}
      </div>
      {(log.length > 0 || spent > 0) && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 160, overflowY: 'auto' }}>
          {log.map((l, i) => <li key={i}>{l}</li>)}
          {running && <li>… {spent} credits this run</li>}
        </ul>
      )}
    </div>
  );
}
