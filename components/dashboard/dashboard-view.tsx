'use client';

// Tenant dashboard — native React rebuild of the Claude Design "Console
// dashboard" template, wired to real data. Uses the app's design tokens
// (identical to the DS token set) + Instrument Serif for the greeting.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CycHeroTransform } from '@/components/cyc-hero-transform';
import type { CalendarEvent } from '@/lib/microsoft-graph';

export interface DashKpi { label: string; value: number; delta: string | null; accent?: boolean }
export interface DeadlineRow { funder: string; title: string; due: string; days: number; stage: string; href: string }
export interface GoalVM { id?: string; label: string; current: number; target: number; unit: 'percent' | 'count' | 'currency'; pct: number; readout: string }

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";

export function DashboardView({
  orgName, userName, greeting, today, isCyc,
  kpis, monthly, months, deadlines, goals, calendarConnected, events,
}: {
  orgName: string; userName?: string; greeting: string; today: string; isCyc: boolean;
  kpis: DashKpi[]; monthly: number[]; months: string[];
  deadlines: DeadlineRow[]; goals: GoalVM[];
  calendarConnected: boolean; events: CalendarEvent[];
}) {
  useEffect(() => {
    if (document.getElementById('dash-serif')) return;
    const l = document.createElement('link');
    l.id = 'dash-serif'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap';
    document.head.appendChild(l);
  }, []);

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-end justify-between gap-6 flex-wrap mb-5">
        <div>
          <p className="text-eyebrow uppercase text-tertiary mb-2">{today}</p>
          <h1 className="text-primary leading-tight" style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.8rem,3vw,2.4rem)', letterSpacing: '-0.018em' }}>
            {greeting}, {userName || orgName}
          </h1>
        </div>
        <a href="https://outlook.office.com/mail/" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-body-strong text-primary border border-hairline bg-surface hover:bg-elevated transition-colors">
          <MsSquares /> Open Outlook
        </a>
      </div>

      {/* ── Hero ── */}
      {isCyc && <div className="mb-5"><CycHeroTransform /></div>}

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_348px] gap-5 items-start">

        {/* Left column */}
        <div className="flex flex-col gap-5 min-w-0">
          <GoalsCard goals={goals} />
          <ActivityCard kpis={kpis} monthly={monthly} months={months} />
          <DeadlinesCard rows={deadlines} />
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-5 min-w-0">
          <CalendarCard connected={calendarConnected} events={events} />
          <TimelineCard connected={calendarConnected} events={events} />
          <AskFundirCard />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Goals ────────────────────────── */

function GoalsCard({ goals }: { goals: GoalVM[] }) {
  const [editing, setEditing] = useState(false);
  const avg = goals.length ? goals.reduce((s, g) => s + g.pct, 0) / goals.length : 0;
  const onPace = avg >= 60;

  return (
    <section className="bg-surface border border-hairline rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-h2 text-primary">Organization goals</h2>
          <p className="text-caption text-tertiary mt-1">Fiscal year to date</p>
        </div>
        <div className="flex items-center gap-3">
          {goals.length > 0 && (
            <span className={`text-eyebrow uppercase ${onPace ? 'text-accent' : 'text-warning'}`}>
              {onPace ? 'On pace' : 'Behind'}
            </span>
          )}
          <button onClick={() => setEditing(true)}
            className="text-eyebrow uppercase text-tertiary hover:text-accent transition-colors inline-flex items-center gap-1.5">
            Edit
          </button>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-body text-muted mb-3">No goals set yet.</p>
          <button onClick={() => setEditing(true)}
            className="text-body-strong text-accent hover:underline">Add your first goal →</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {goals.map((g, i) => (
            <div key={g.id ?? i}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-body text-primary">{g.label}</span>
                <span className="font-mono text-caption text-secondary tabular-nums">{g.readout}</span>
              </div>
              <div className="h-1 rounded-full bg-elevated overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${g.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <GoalsModal goals={goals} onClose={() => setEditing(false)} />}
    </section>
  );
}

type DraftGoal = { id: string; label: string; current: string; target: string; unit: GoalVM['unit'] };

function GoalsModal({ goals, onClose }: { goals: GoalVM[]; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftGoal[]>(() =>
    goals.length
      ? goals.map(g => ({ id: g.id ?? crypto.randomUUID(), label: g.label, current: String(g.current), target: String(g.target), unit: g.unit }))
      : [{ id: crypto.randomUUID(), label: '', current: '0', target: '100', unit: 'count' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const patch = (id: string, k: keyof DraftGoal, v: string) => setRows(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r));
  const remove = (id: string) => setRows(rs => rs.filter(r => r.id !== id));
  const add = () => setRows(rs => [...rs, { id: crypto.randomUUID(), label: '', current: '0', target: '100', unit: 'count' }]);

  async function save() {
    setSaving(true);
    const payload = rows
      .filter(r => r.label.trim())
      .map(r => ({ label: r.label.trim(), current: Number(r.current) || 0, target: Number(r.target) || 0, unit: r.unit }));
    try {
      await fetch('/api/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goals: payload }) });
    } catch { /* ignore */ }
    onClose();
    router.refresh();
  }

  const inputCls = 'w-full text-[13px] text-primary bg-transparent border border-transparent rounded-sm px-2 py-1.5 hover:bg-elevated focus:outline-none focus:bg-surface focus:border-accent transition-colors';

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-7">
      <div onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-[620px] max-h-full flex flex-col bg-surface border border-hairline rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-hairline">
          <div>
            <h2 className="text-h2 text-primary">Organization goals</h2>
            <p className="text-caption text-tertiary mt-1">Visible to everyone at your organization</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-sm border border-hairline text-secondary hover:text-primary flex items-center justify-center">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_90px_28px] gap-x-2.5 items-center pb-2">
            {['Goal', 'Current', 'Target', 'Unit', ''].map((h, i) => (
              <span key={i} className={`text-eyebrow uppercase text-tertiary ${i === 1 || i === 2 ? 'text-right' : ''}`}>{h}</span>
            ))}
          </div>
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_70px_70px_90px_28px] gap-x-2.5 items-center py-1.5 border-t border-hairline">
              <input value={r.label} onChange={e => patch(r.id, 'label', e.target.value)} placeholder="Name this goal" className={inputCls} />
              <input value={r.current} onChange={e => patch(r.id, 'current', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={`${inputCls} font-mono text-right`} />
              <input value={r.target} onChange={e => patch(r.id, 'target', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={`${inputCls} font-mono text-right`} />
              <select value={r.unit} onChange={e => patch(r.id, 'unit', e.target.value as GoalVM['unit'])}
                className="w-full text-[10px] uppercase tracking-wide text-secondary bg-surface border border-hairline rounded-sm px-1.5 py-1.5 cursor-pointer focus:outline-none focus:border-accent">
                <option value="percent">Percent</option>
                <option value="count">Count</option>
                <option value="currency">Dollars</option>
              </select>
              <button onClick={() => remove(r.id)} aria-label="Remove" className="w-6 h-6 text-tertiary hover:text-critical flex items-center justify-center">✕</button>
            </div>
          ))}
          <button onClick={add} className="inline-flex items-center gap-2 mt-3 text-eyebrow uppercase text-secondary border border-dashed border-hairline rounded-sm px-3 py-2 hover:border-accent hover:text-accent transition-colors">＋ Add goal</button>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-hairline bg-page">
          <button onClick={onClose} className="px-3.5 py-2 rounded-md text-body-strong text-primary border border-hairline bg-surface hover:bg-elevated transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md text-body-strong bg-accent text-accent-on hover:bg-accent-hover disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Save goals'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Activity ────────────────────────── */

function ActivityCard({ kpis, monthly, months }: { kpis: DashKpi[]; monthly: number[]; months: string[] }) {
  const max = Math.max(1, ...monthly);
  return (
    <section className="bg-surface border border-hairline rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-h2 text-primary">Activity</h2>
          <p className="text-caption text-tertiary mt-1">Matches tracked by month, fiscal year to date</p>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-[104px]">
        {monthly.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end" title={`${months[i]}: ${v}`}>
            <div className="rounded-t-sm bg-accent/80" style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 font-mono text-[8.5px] uppercase tracking-wide text-tertiary">
        {months.map(m => <span key={m}>{m}</span>)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        {kpis.map(k => (
          <div key={k.label} className="border border-hairline rounded-lg p-3.5">
            <p className="text-eyebrow uppercase text-tertiary mb-2">{k.label}</p>
            <div className="flex items-baseline gap-2">
              <b className="font-mono text-[22px] text-primary tabular-nums">{k.value}</b>
              {k.delta && <span className={`font-mono text-caption ${k.accent ? 'text-accent' : 'text-tertiary'}`}>{k.delta}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────── Deadlines ────────────────────────── */

const STAGE_TONE: Record<string, string> = {
  Drafting: 'text-accent', Submitted: 'text-accent', Queued: 'text-secondary', Tracking: 'text-tertiary', 'Board path': 'text-info',
};

function DeadlinesCard({ rows }: { rows: DeadlineRow[] }) {
  return (
    <section className="bg-surface border border-hairline rounded-lg overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-h2 text-primary">Next deadlines</h2>
          <p className="text-caption text-tertiary mt-1">Across every open opportunity</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-body text-muted">No upcoming deadlines. Run discovery to start tracking grants.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-y border-hairline bg-elevated/40">
              {['Funder', 'Due', 'Stage'].map((h, i) => (
                <th key={h} className={`text-eyebrow uppercase text-tertiary font-medium px-5 py-2 ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-hairline last:border-0 hover:bg-elevated/30 transition-colors">
                <td className="px-5 py-2.5">
                  <Link href={r.href} className="text-body text-primary hover:text-accent transition-colors">{r.funder}</Link>
                  {r.title && r.title !== r.funder && <p className="text-caption text-tertiary truncate max-w-[280px]">{r.title}</p>}
                </td>
                <td className="px-5 py-2.5 font-mono text-caption text-secondary tabular-nums whitespace-nowrap">
                  {r.due} <span className="text-tertiary">· {r.days}d</span>
                </td>
                <td className="px-5 py-2.5 text-right">
                  <span className={`text-eyebrow uppercase ${STAGE_TONE[r.stage] ?? 'text-tertiary'}`}>{r.stage}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ────────────────────────── Calendar ────────────────────────── */

function CalendarCard({ connected, events }: { connected: boolean; events: CalendarEvent[] }) {
  const eventDays = useMemo(() => {
    const s = new Set<number>();
    const now = new Date();
    for (const e of events) {
      const d = new Date(e.start);
      if (!Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) s.add(d.getDate());
    }
    return s;
  }, [events]);

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayD = now.getDate();

  return (
    <section className="bg-surface border border-hairline rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <MsSquares />
        <span className="text-eyebrow uppercase text-secondary">Microsoft 365</span>
        <span className="ml-auto text-eyebrow uppercase text-tertiary flex items-center gap-1.5">
          {connected ? <><i className="w-1 h-1 rounded-full bg-accent" /> Synced</> : 'Not connected'}
        </span>
      </div>

      {!connected ? (
        <div>
          <p className="text-body-strong text-primary mb-1.5">Connect your calendar</p>
          <p className="text-caption text-tertiary mb-4 leading-relaxed">Your week sits next to your deadlines. Connect the calendar you use for work.</p>
          <div className="flex flex-col gap-2">
            <a href="/api/auth/microsoft?mode=user&return=/dashboard"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-body-strong text-primary border border-hairline bg-surface hover:bg-elevated transition-colors">
              <MsSquares /> Connect Microsoft
            </a>
            <a href="/api/auth/google?mode=user&return=/dashboard"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-body-strong text-primary border border-hairline bg-surface hover:bg-elevated transition-colors">
              <GoogleG /> Connect Google
            </a>
          </div>
        </div>
      ) : (
        <>
          <p className="text-center text-body-strong text-primary mb-2.5">{monthLabel}</p>
          <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[8.5px] uppercase text-tertiary mb-1">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[11px]">
            {cells.map((n, i) => {
              if (n === null) return <span key={i} />;
              const isToday = n === todayD;
              const hasEvent = eventDays.has(n);
              return (
                <span key={i} className={`relative h-7 flex items-center justify-center rounded-sm ${isToday ? 'bg-primary text-inverse font-medium' : 'text-secondary'}`}>
                  {n}
                  {hasEvent && !isToday && <i className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full bg-accent" />}
                </span>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* ────────────────────────── Timeline ────────────────────────── */

function TimelineCard({ connected, events }: { connected: boolean; events: CalendarEvent[] }) {
  const upcoming = useMemo(() => events
    .filter(e => new Date(e.end || e.start).getTime() >= Date.now() - 3_600_000)
    .slice(0, 6), [events]);

  const dayLabel = upcoming.length
    ? new Date(upcoming[0].start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <section className="bg-surface border border-hairline rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-h3 text-primary">{dayLabel}</h3>
        <p className="text-caption text-tertiary mt-0.5">{connected ? `${upcoming.length} upcoming` : 'No calendar connected'}</p>
      </div>
      {!connected ? (
        <p className="text-caption text-tertiary leading-relaxed">Connect Microsoft 365 to see your schedule here.</p>
      ) : upcoming.length === 0 ? (
        <p className="text-caption text-tertiary leading-relaxed">Nothing on the calendar in the next few days.</p>
      ) : (
        <div className="flex flex-col">
          {upcoming.map((e, i) => (
            <div key={e.id} className="flex gap-3">
              <span className="font-mono text-[9.5px] text-tertiary pt-[11px] w-10 flex-none">
                {e.isAllDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
              <div className={`flex-1 min-w-0 pl-3 py-2.5 ${i < upcoming.length - 1 ? 'border-l border-hairline' : ''} relative`}>
                <i className="absolute -left-[3px] top-3.5 w-[5px] h-[5px] rounded-full bg-hairline" />
                <b className="block text-[12.5px] font-medium text-primary mb-0.5 truncate">{e.subject}</b>
                <span className="text-caption text-tertiary">{e.online ? 'Online' : e.location || '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ────────────────────────── Ask Fundir ────────────────────────── */

function AskFundirCard() {
  return (
    <section className="bg-surface border border-hairline rounded-lg p-5">
      <p className="text-eyebrow uppercase text-tertiary mb-2">Ask Fundir</p>
      <p className="text-body text-secondary leading-relaxed mb-4">
        Search your filings, documents and funder record in plain language.
      </p>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('fundir:open-advisor'))}
        className="w-full px-4 py-2 rounded-md text-body-strong text-primary border border-hairline bg-surface hover:bg-elevated transition-colors">
        Open assistant
      </button>
    </section>
  );
}

/* ────────────────────────── bits ────────────────────────── */

function MsSquares() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="flex-none">
      <rect x="0.6" y="0.6" width="5.9" height="5.9" fill="#F25022" />
      <rect x="7.5" y="0.6" width="5.9" height="5.9" fill="#7FBA00" />
      <rect x="0.6" y="7.5" width="5.9" height="5.9" fill="#00A4EF" />
      <rect x="7.5" y="7.5" width="5.9" height="5.9" fill="#FFB900" />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" className="flex-none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
