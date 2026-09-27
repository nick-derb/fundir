'use client';

// Tenant dashboard. Wired to real data: Instrumentl pipeline
// (cyc_grant_submissions) for KPIs / deadlines / activity / needs, org_goals
// for goals, and the user's Microsoft/Google calendar.
//
// Layout, top to bottom: date + greeting, one ruled KPI strip, then the
// left column in order of urgency (next deadlines, this week, deadline load
// by month, FY goals) with a rail for today, needs-attention and the
// assistant. No hero band, parallax, reveal-on-scroll or hover lift: the
// numbers carry the page.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, Mail, Send, CheckCircle2, Hourglass, Radar, ArrowRight,
  FileEdit, MessageSquare, Clock, Pencil, X, Plus, Trash2,
} from 'lucide-react';

declare global {
  interface Window {
    FundirField?: { init: (c: HTMLCanvasElement) => void };
    FundirCharts?: { init: (root: Document | HTMLElement) => void };
  }
}

export interface DashGoal { id: string; label: string; current: number; target: number; unit: 'percent' | 'count' | 'currency'; pct: number; readout: string }
export interface DashData {
  greeting: string; firstName: string; today: string; isCyc: boolean;
  kpis: { label: string; value: string; sub: string; icon: string; accent?: boolean }[];
  monthly: number[]; months: string[]; liveIdx: number;
  deadlines: { funder: string; type: string; due: string; days: number; stage: string; tone: Tone }[];
  goals: DashGoal[];
  week: { n: number; dow: string; isToday: boolean; events: { title: string; time: string; kind: string }[] }[];
  todayEvents: { time: string; title: string; meta: string; dot: string }[];
  needs: { icon: string; text: string }[];
  calendarConnected: boolean;
}
type Tone = 'accent' | 'neutral' | 'info' | 'warning';

const KPI_ICON: Record<string, React.ComponentType<{ style?: React.CSSProperties }>> = {
  send: Send, 'check-circle-2': CheckCircle2, hourglass: Hourglass, radar: Radar,
};
const TAG_TONE: Record<Tone, string | undefined> = { accent: 'accent', neutral: undefined, info: 'info', warning: 'warning' };

const CSS = `
.dv-root{color:var(--text-primary)}
.dv-root [data-kind="grant"]{border-left-color:var(--accent)!important;background:var(--accent-tint)}
.dv-root [data-kind="funder"]{border-left-color:var(--warning)!important;background:rgba(192,133,43,.08)}
.dv-root [data-kind="internal"]{border-left-color:#5B7383!important;background:rgba(91,115,131,.08)}
.dv-root [data-kind="site"]{border-left-color:var(--critical)!important;background:rgba(194,78,62,.07)}
.dv-root .dv-section{background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:var(--radius)}
.dv-root .dv-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 18px 12px}
.dv-root .dv-section-head p{margin:3px 0 0}
.dv-root .dv-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--border-hairline)}
.dv-root .dv-week-scroll{overflow-x:auto}
.dv-root .dv-link{color:var(--accent);text-decoration:none;white-space:nowrap}
.dv-root .dv-link:hover{text-decoration:underline}
.dv-root .dv-cols{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start}
.dv-root .dv-rail{position:sticky;top:64px;display:flex;flex-direction:column;gap:14px;min-width:0}
.dv-root .dv-goal-row{display:grid;grid-template-columns:minmax(0,1fr) 74px 74px 92px 28px;gap:0 10px;align-items:center}
.dv-root .dv-goal-row input,.dv-root .dv-goal-row select{width:100%;font:inherit;font-size:13px;color:var(--text-primary);background:transparent;border:1px solid transparent;border-radius:var(--radius-sm);padding:7px 8px;outline:none}
.dv-root .dv-goal-row input:focus,.dv-root .dv-goal-row select:focus{border-color:var(--accent)}
.dv-root .dv-goal-row input[inputmode]{font-family:var(--font-mono);font-size:12px;text-align:right}
.dv-root .dv-goal-row select{font-family:var(--font-mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary);background:var(--bg-surface);border-color:var(--border-hairline);padding:6px 7px;cursor:pointer}
@media (max-width:1180px){.dv-root .dv-cols{grid-template-columns:minmax(0,1fr)}.dv-root .dv-rail{position:static}}
@media (max-width:640px){.dv-root .dv-week{min-width:560px}.dv-root .dv-goal-row{grid-template-columns:minmax(0,1fr) 64px 64px}.dv-root .dv-goal-row select,.dv-root .dv-goal-row > .dv-goal-unit{grid-column:1 / span 2}.dv-root .dv-actions{width:100%}.dv-root .dv-actions > *{flex:1;justify-content:center}}
`;

function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="dv-section-head">
      <div style={{ minWidth: 0 }}>
        <div className="fd-h2">{title}</div>
        {sub && <p className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function DashboardView({ data }: { data: DashData }) {
  const [goals, setGoals] = useState(data.goals);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashGoal[]>([]);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The deadline-load bars are drawn by /dashboard/charts.js once it loads.
  useEffect(() => {
    if (!document.getElementById('dash-charts')) {
      const el = document.createElement('script'); el.id = 'dash-charts'; el.src = '/dashboard/charts.js'; document.body.appendChild(el);
    }
    let n = 0;
    const boot = setInterval(() => {
      if (window.FundirCharts && rootRef.current) { window.FundirCharts.init(rootRef.current); clearInterval(boot); }
      if (++n > 40) clearInterval(boot);
    }, 150);
    return () => clearInterval(boot);
  }, []);

  // Live counts from the same data the page renders.
  const dueSoon = data.deadlines.filter(d => d.days <= 14).length;

  const openGoals = () => { setDraft(goals.map(g => ({ ...g }))); setEditing(true); };
  const closeGoals = () => { setEditing(false); setDraft([]); };
  const money = (n: number) => n >= 1e6 ? '$' + (n / 1e6).toFixed(n % 1e6 ? 2 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + n;
  const readout = (g: DashGoal) => g.unit === 'percent' ? `${Math.round(g.current)}%` : g.unit === 'currency' ? `${money(g.current)} of ${money(g.target)}` : `${g.current} of ${g.target}`;
  const pctOf = (g: DashGoal) => Math.max(0, Math.min(100, g.target ? (g.current / g.target) * 100 : 0));
  const patch = (id: string, k: keyof DashGoal, v: string) => setDraft(d => d.map(g => g.id === id ? { ...g, [k]: k === 'label' || k === 'unit' ? v : Number(v.replace(/[^\d.]/g, '')) || 0 } : g));
  async function saveGoals() {
    setSaving(true);
    const kept = draft.filter(g => String(g.label).trim());
    try {
      await fetch('/api/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goals: kept.map(g => ({ label: g.label, current: g.current, target: g.target, unit: g.unit })) }) });
      setGoals(kept.map(g => ({ ...g, pct: pctOf(g), readout: readout(g) })));
    } catch { /* keep local */ }
    setSaving(false); setEditing(false); setDraft([]);
  }

  return (
    <div className="dv-root" ref={rootRef} style={{ background: 'var(--bg-page)', padding: '22px 26px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* header */}
      <div className="fd-page-head" style={{ marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{data.today}</p>
          <h1>{data.greeting}, {data.firstName}</h1>
          <p className="fd-lede">Live workspace · your Instrumentl pipeline and calendar</p>
        </div>
        <div className="dv-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/calendar" className="fd-btn"><CalendarDays style={{ width: 13, height: 13 }} />Calendar</Link>
          <a href="https://outlook.office.com/mail/" target="_blank" rel="noreferrer" className="fd-btn-primary"><Mail style={{ width: 13, height: 13 }} />Open Outlook</a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="fd-stats" style={{ marginBottom: 18 }}>
        <div className="fd-stat">
          <span className="fd-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock style={{ width: 11, height: 11 }} />Due in 14 days</span>
          <b style={{ color: dueSoon > 0 ? 'var(--warning)' : undefined }}>{dueSoon}</b>
          <small>{dueSoon > 0 ? 'see next deadlines' : 'nothing imminent'}</small>
        </div>
        {data.kpis.map(k => {
          const Icon = KPI_ICON[k.icon] ?? Radar;
          return (
            <div key={k.label} className="fd-stat" data-accent={k.accent ? 'true' : undefined}>
              <span className="fd-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon style={{ width: 11, height: 11 }} />{k.label}</span>
              <b>{k.value}</b>
              <small>{k.sub}</small>
            </div>
          );
        })}
      </div>

      <div className="dv-cols">

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

          {/* Next deadlines */}
          <section className="dv-section" aria-labelledby="dv-deadlines">
            <SectionHead title="Next deadlines" sub="Across every open opportunity, soonest first"
              right={<Link href="/prospecting" className="fd-eyebrow dv-link">View all</Link>} />
            {data.deadlines.length === 0 ? (
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', padding: '0 18px 16px', margin: 0 }}>No upcoming deadlines on open opportunities.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="fd-table" style={{ minWidth: 520 }}>
                  <thead><tr>
                    <th id="dv-deadlines" style={{ paddingLeft: 18, borderTop: '1px solid var(--border-hairline)' }}>Funder</th>
                    <th style={{ borderTop: '1px solid var(--border-hairline)' }}>Type</th>
                    <th style={{ borderTop: '1px solid var(--border-hairline)' }}>Due</th>
                    <th className="num" style={{ borderTop: '1px solid var(--border-hairline)' }}>Days</th>
                    <th style={{ textAlign: 'right', paddingRight: 18, borderTop: '1px solid var(--border-hairline)' }}>Stage</th>
                  </tr></thead>
                  <tbody>
                    {data.deadlines.map((d, i) => (
                      <tr key={i}>
                        <td style={{ paddingLeft: 18, fontWeight: 500 }}>{d.funder}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>{d.type}</td>
                        <td className="fd-mono" style={{ fontSize: 12 }}>{d.due}</td>
                        <td className="num" style={{ fontSize: 12, color: d.days <= 14 ? 'var(--warning)' : 'var(--text-secondary)' }}>{d.days}</td>
                        <td style={{ textAlign: 'right', paddingRight: 18 }}><span className="fd-tag" data-tone={TAG_TONE[d.tone]}>{d.stage}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* This week */}
          <section className="dv-section">
            <SectionHead title="This week"
              sub={data.calendarConnected ? 'Your week, next to your deadlines' : 'Connect your calendar in Settings to see your week'}
              right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
                  <span className="fd-tag" data-tone={data.calendarConnected ? 'accent' : undefined}>
                    <i style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', animation: data.calendarConnected ? 'fd-pulse 2.6s ease-in-out infinite' : undefined }} />
                    {data.calendarConnected ? 'Microsoft 365' : 'Not connected'}
                  </span>
                  <Link href="/calendar" className="fd-eyebrow dv-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>Open calendar <ArrowRight style={{ width: 12, height: 12 }} /></Link>
                </div>
              } />
            <div className="dv-week-scroll">
              <div className="dv-week">
                {data.week.map((d, i) => (
                  <Link key={i} href="/calendar" style={{ borderRight: i < 6 ? '1px solid var(--border-hairline)' : 'none', padding: '10px 9px 12px', minHeight: 100, textDecoration: 'none', color: 'inherit', background: d.isToday ? 'var(--bg-page)' : undefined }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      {d.isToday
                        ? <span className="fd-mono" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 4px', borderRadius: 'var(--radius-xs)', background: 'var(--text-primary)', color: 'var(--bg-surface)', fontSize: 10, fontWeight: 500 }}>{d.n}</span>
                        : <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{d.n}</span>}
                      <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>{d.dow}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {d.events.map((e, j) => (
                        <div key={j} data-kind={e.kind} style={{ borderLeft: '2px solid #5B7383', borderRadius: '0 3px 3px 0', padding: '4px 6px' }}>
                          <div style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.28, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                          <div className="fd-mono" style={{ fontSize: 8.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{e.time}</div>
                        </div>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Deadline load */}
          <section className="dv-section" style={{ padding: '0 0 16px' }}>
            <SectionHead title="Deadline load" sub="Upcoming application deadlines by month, FY27" right={<span className="fd-tag">FY27</span>} />
            <div style={{ padding: '0 18px' }}>
              <canvas data-chart="bars" data-values={data.monthly.join(',')} data-live={data.liveIdx} style={{ display: 'block', width: '100%', height: 120 }} />
              <div className="fd-mono" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                {data.months.map(m => <span key={m}>{m}</span>)}
              </div>
            </div>
          </section>

          {/* FY27 goals */}
          <section className="dv-section" style={{ padding: '0 0 18px' }}>
            <SectionHead title="FY27 goals" sub="Organization-wide, July 2026 to June 2027"
              right={<button type="button" onClick={openGoals} className="fd-btn" style={{ height: 28, padding: '0 10px', fontSize: 12 }}><Pencil style={{ width: 12, height: 12 }} />Edit</button>} />
            <div style={{ padding: '0 18px' }}>
              {goals.length === 0 ? (
                <button type="button" onClick={openGoals} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 500 }}>Add your first goal →</button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {goals.map(g => (
                    <div key={g.id}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}><span style={{ fontSize: 13 }}>{g.label}</span><span className="fd-mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{g.readout}</span></div>
                      <div className="fd-bar"><i style={{ width: `${g.pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT RAIL */}
        <div className="dv-rail">

          {/* Today */}
          <section className="dv-section" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Today</span>
              <Link href="/calendar" className="fd-eyebrow dv-link">Full day</Link>
            </div>
            {data.todayEvents.length === 0 ? (
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{data.calendarConnected ? 'Nothing scheduled today.' : 'Connect your calendar to see today.'}</p>
            ) : data.todayEvents.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', paddingTop: 1, width: 40, flex: 'none' }}>{t.time}</span>
                <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--border-hairline)', padding: '0 0 14px 12px', position: 'relative' }}>
                  <i style={{ position: 'absolute', left: -3.5, top: 4, width: 6, height: 6, borderRadius: '50%', background: t.dot === 'on' ? 'var(--accent)' : 'var(--border-strong)', border: '1.5px solid var(--bg-surface)' }} />
                  <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{t.title}</b>
                  {t.meta && <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{t.meta}</span>}
                </div>
              </div>
            ))}
          </section>

          {/* Needs attention */}
          {data.needs.length > 0 && (
            <section className="dv-section" style={{ padding: '14px 16px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Needs attention</span>
                <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{data.needs.length}</span>
              </div>
              {data.needs.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <FileEdit style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
                  <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5 }}>{it.text}</span>
                </div>
              ))}
            </section>
          )}

          {/* Ask Fundir */}
          <section className="dv-section" style={{ padding: '14px 16px 16px' }}>
            <p className="fd-eyebrow" style={{ color: 'var(--text-secondary)', margin: '0 0 8px' }}>Ask Fundir</p>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>Search your filings, documents and funder record in plain language.</p>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('fundir:open-advisor'))} className="fd-btn" style={{ width: '100%', justifyContent: 'center' }}><MessageSquare style={{ width: 13, height: 13 }} />Open assistant</button>
          </section>
        </div>
      </div>

      {/* goals modal */}
      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Edit FY27 goals" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={closeGoals} style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,.38)', animation: 'fd-fade .18s ease both' }} />
          <div className="dv-section" style={{ position: 'relative', width: 'min(620px,100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-overlay)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 20px 14px', borderBottom: '1px solid var(--border-hairline)' }}>
              <div>
                <div className="fd-h2">FY27 goals</div>
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '3px 0 0' }}>Organization-wide targets for July 2026 to June 2027</p>
              </div>
              <button type="button" onClick={closeGoals} aria-label="Close" className="fd-btn" style={{ width: 28, height: 28, padding: 0, justifyContent: 'center', flex: 'none' }}><X style={{ width: 13, height: 13 }} /></button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 20px 18px' }}>
              <div className="dv-goal-row" style={{ padding: '12px 0 8px' }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Goal</span>
                <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', textAlign: 'right' }}>Current</span>
                <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', textAlign: 'right' }}>Target</span>
                <span className="fd-eyebrow dv-goal-unit" style={{ color: 'var(--text-tertiary)' }}>Unit</span>
                <span />
              </div>
              {draft.map(g => (
                <div key={g.id} className="dv-goal-row" style={{ padding: '6px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <input value={g.label} onChange={e => patch(g.id, 'label', e.target.value)} placeholder="Name this goal" aria-label="Goal" />
                  <input value={String(g.current)} onChange={e => patch(g.id, 'current', e.target.value)} inputMode="decimal" aria-label="Current" />
                  <input value={String(g.target)} onChange={e => patch(g.id, 'target', e.target.value)} inputMode="decimal" aria-label="Target" />
                  <select value={g.unit} onChange={e => patch(g.id, 'unit', e.target.value)} aria-label="Unit"><option value="percent">Percent</option><option value="count">Count</option><option value="currency">Dollars</option></select>
                  <button type="button" onClick={() => setDraft(d => d.filter(x => x.id !== g.id))} aria-label="Remove goal" style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setDraft(d => [...d, { id: 'new-' + Date.now(), label: '', current: 0, target: 100, unit: 'count', pct: 0, readout: '' }])} className="fd-btn" style={{ marginTop: 14, borderStyle: 'dashed' }}>
                <Plus style={{ width: 12, height: 12 }} />Add goal
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 20px', borderTop: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}>
              <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>Visible to everyone at Chicago Youth Centers</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={closeGoals} className="fd-btn">Cancel</button>
                <button type="button" onClick={saveGoals} disabled={saving} className="fd-btn-primary">{saving ? 'Saving…' : 'Save goals'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
