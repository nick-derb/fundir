'use client';

// Calendar — native React port of the Claude Design "Calendar" console page
// (month grid + Today timeline + Calendars sources + Grant deadlines rail).
// Wired to real data: the user's Microsoft/Google events and the live grant
// deadlines from cyc_grant_submissions. AppShell supplies the sidebar + topbar,
// so this renders the <main> content only.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useEffect } from 'react';
import {
  SlidersHorizontal, Plus, ArrowLeft, ArrowRight, Link2,
} from 'lucide-react';

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const OUTLOOK_NEW = 'https://outlook.office.com/calendar/0/deeplink/compose';
const OUTLOOK_CAL = 'https://outlook.office.com/calendar/';

export interface CalData {
  todayISO: string; // YYYY-MM-DD (local)
  events: { date: string; title: string; time: string; kind: 'grant' | 'funder' | 'site' | 'internal' }[];
  todayEvents: { time: string; title: string; meta: string; dot: 'on' | 'off' }[];
  sources: { key: string; label: string; count: number }[];
  deadlines: { d: string; label: string; isNext: boolean }[];
  calendarConnected: boolean;
  orgCode: string;
}

const CSS = `
.cv-root{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary);--radius-kpi:12px;--radius-console:14px}
.cv-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.cv-root .fd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.cv-root .fd-caption{font-size:12px;line-height:1.5}
.cv-root [data-kind="grant"]{border-left-color:#0C6B5A!important;background:#EDF4F0}
.cv-root [data-kind="funder"]{border-left-color:#9C7A2A!important;background:#F7F2E6}
.cv-root [data-kind="internal"]{border-left-color:#5B7383!important;background:#EEF2F4}
.cv-root [data-kind="site"]{border-left-color:#A25A44!important;background:#F7EFEC}
.cv-root [data-src="me"]{background:#0C6B5A}
.cv-root [data-src="deadline"]{background:#A25A44}
.cv-root [data-src="team"]{background:#9C7A2A}
.cv-root [data-src="org"]{background:#5B7383}
.cv-root [data-dot="on"]{background:var(--accent)}
.cv-root [data-dot="off"]{background:var(--border-hairline)}
.cv-root [data-cal-day]{transition:background-color .16s ease}
.cv-root [data-cal-day]:hover{background:var(--bg-page)}
.cv-root [data-cal-day]:hover [data-cal-add]{opacity:1}
.cv-root [data-cal-ev]{transition:transform .14s cubic-bezier(.2,.8,.3,1),box-shadow .14s ease}
.cv-root [data-cal-ev]:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(16,25,23,.09)}
.cv-root [data-btn]:hover{border-color:var(--text-tertiary)}
.cv-root [data-navbtn]:hover{background:var(--bg-page)}
.cv-root [data-addbtn]:hover{background:#0A5648}
@media (max-width:1080px){.cv-root [data-cal-rail]{display:none!important}}
@media (max-width:980px){.cv-root [data-cal-cols]{grid-template-columns:minmax(0,1fr)!important}}
@media (max-width:860px){.cv-root [data-cal-grid]{min-width:720px}.cv-root [data-cal-scroll]{overflow-x:auto}}
`;

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAXV = 2;

interface Cell {
  n: number; out: boolean; isToday: boolean;
  events: CalData['events'];
}

export function CalendarView({ data }: { data: CalData }) {
  const [ty, tm, td] = data.todayISO.split('-').map(Number);
  const [cursor, setCursor] = useState(() => new Date(ty, (tm || 1) - 1, 1));
  const [view, setView] = useState<'Month' | 'Week' | 'Day'>('Month');

  // Load the design's font stack once (shared id with the dashboard port).
  useEffect(() => {
    if (!document.getElementById('dash-fonts')) {
      const l = document.createElement('link');
      l.id = 'dash-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(l);
    }
  }, []);

  // day-key → events, built once from the flat event list.
  const byDay = useMemo(() => {
    const m = new Map<string, CalData['events']>();
    for (const e of data.events) {
      const arr = m.get(e.date); if (arr) arr.push(e); else m.set(e.date, [e]);
    }
    return m;
  }, [data.events]);

  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const cells = useMemo<Cell[]>(() => {
    const out: Cell[] = [];
    const first = new Date(y, mo, 1);
    const lead = (first.getDay() + 6) % 7;         // Monday-first offset
    const dim = new Date(y, mo + 1, 0).getDate();
    const prevDim = new Date(y, mo, 0).getDate();
    for (let i = lead; i > 0; i--) out.push({ n: prevDim - i + 1, out: true, isToday: false, events: [] });
    for (let n = 1; n <= dim; n++) {
      const key = `${y}-${pad(mo + 1)}-${pad(n)}`;
      out.push({ n, out: false, isToday: key === data.todayISO, events: byDay.get(key) ?? [] });
    }
    let trail = 1;
    while (out.length % 7 !== 0) out.push({ n: trail++, out: true, isToday: false, events: [] });
    return out;
  }, [y, mo, byDay, data.todayISO]);

  const dim = new Date(y, mo + 1, 0).getDate();
  const monthLabel = `${MONTHS[mo]} ${y}`;
  const rangeLabel = `${MON_ABBR[mo]} 1 – ${MON_ABBR[mo]} ${dim}, ${y}`;
  const stepMonth = (delta: number) => setCursor(new Date(y, mo + delta, 1));

  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px',
    borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'border-color .15s', textDecoration: 'none',
  };

  return (
    <div className="cv-root">
      <style>{CSS}</style>
      <main style={{ padding: '24px 26px 40px' }}>

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>Chicago Youth Centers</p>
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Calendar</h1>
            <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>Your Microsoft schedule and every grant deadline, on one grid.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <a data-btn href={OUTLOOK_CAL} target="_blank" rel="noopener noreferrer" style={btn}>
              <SlidersHorizontal style={{ width: 13, height: 13 }} />Manage calendars
            </a>
            <a data-addbtn href={OUTLOOK_NEW} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 17px', borderRadius: 'var(--radius-kpi)', border: 'none', background: 'var(--accent)', color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .15s', textDecoration: 'none' }}>
              <Plus style={{ width: 14, height: 14 }} />Add event
            </a>
          </div>
        </div>

        {!data.calendarConnected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 16, borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)' }}>
            <Link2 style={{ width: 14, height: 14, color: 'var(--accent)', flex: 'none' }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Your calendar isn’t connected — the grid shows grant deadlines only.{' '}
              <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Connect Microsoft 365 →</Link>
            </span>
          </div>
        )}

        {/* ── Console: month grid + rail ──────────────────────────────── */}
        <div data-cal-cols style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>

          {/* Left — month calendar card */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', overflow: 'hidden', minWidth: 0 }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 18px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                <div style={{ flex: 'none', width: 42, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', textAlign: 'center', background: 'var(--bg-surface)' }}>
                  <div className="fd-mono" style={{ fontSize: 7.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#fff', background: 'var(--accent)', padding: '2px 0' }}>{MON_ABBR[(tm || 1) - 1]}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-.02em', padding: '2px 0 3px' }}>{td}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 15, fontWeight: 600, letterSpacing: '-.012em' }}>{monthLabel}</b>
                  <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{rangeLabel}</span>
                </div>
              </div>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', overflow: 'hidden' }}>
                  <button data-navbtn type="button" aria-label="Previous month" onClick={() => stepMonth(-1)} style={navBtn(true)}><ArrowLeft style={{ width: 14, height: 14 }} /></button>
                  <button data-navbtn type="button" aria-label="Next month" onClick={() => stepMonth(1)} style={navBtn(false)}><ArrowRight style={{ width: 14, height: 14 }} /></button>
                </div>
                <button type="button" onClick={() => setCursor(new Date(ty, (tm || 1) - 1, 1))} style={{ ...btn, height: 34, padding: '0 12px' }}>Today</button>
                <div style={{ display: 'flex', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', overflow: 'hidden', background: 'var(--bg-page)' }}>
                  {(['Month', 'Week', 'Day'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setView(v)} style={{ border: 'none', background: 'none', font: 'inherit', padding: 0, cursor: 'pointer' }}>
                      {view === v
                        ? <span style={{ display: 'block', padding: '8px 17px', fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', background: 'var(--bg-surface)', boxShadow: '0 1px 3px rgba(16,25,23,.07)' }}>{v}</span>
                        : <span style={{ display: 'block', padding: '8px 17px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>{v}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid */}
            <div data-cal-scroll>
              <div data-cal-grid>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', background: 'var(--bg-page)', borderBottom: '1px solid var(--border-hairline)' }}>
                  {DOWS.map(d => <div key={d} className="fd-eyebrow" style={{ padding: '9px 11px', color: 'var(--text-tertiary)', textAlign: 'left' }}>{d}</div>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))' }}>
                  {cells.map((c, i) => {
                    const shown = c.events.slice(0, MAXV);
                    const more = c.events.length - shown.length;
                    return (
                      <div key={i} data-cal-day style={{ position: 'relative', minHeight: 118, padding: '7px 8px 9px', borderRight: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          {c.isToday
                            ? <span className="fd-mono" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 19, height: 19, padding: '0 4px', borderRadius: 4, background: 'var(--text-primary)', color: 'var(--bg-surface)', fontSize: 10.5, fontWeight: 500 }}>{c.n}</span>
                            : <span className="fd-mono" style={{ fontSize: 10.5, color: c.out ? 'var(--text-tertiary)' : 'var(--text-secondary)', opacity: c.out ? .55 : 1, paddingLeft: 2 }}>{c.n}</span>}
                          {!c.out && (
                            <a data-cal-add href={OUTLOOK_NEW} target="_blank" rel="noopener noreferrer" aria-label="Add event"
                              style={{ width: 17, height: 17, borderRadius: 4, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', cursor: 'pointer', opacity: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity .16s,color .15s' }}>
                              <Plus style={{ width: 10, height: 10 }} />
                            </a>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {shown.map((e, j) => (
                            <div key={j} data-cal-ev data-kind={e.kind} style={{ borderLeft: '2px solid #5B7383', background: '#EEF2F4', borderRadius: '0 4px 4px 0', padding: '5px 7px', cursor: 'default' }}>
                              <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 }}>
                                <span className="fd-mono" style={{ fontSize: 9, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{e.time}</span>
                              </div>
                            </div>
                          ))}
                          {more > 0 && (
                            <span className="fd-mono" style={{ padding: '2px 0', fontSize: 9.5, color: 'var(--text-tertiary)' }}>{more} more…</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right rail */}
          <div data-cal-rail style={{ position: 'sticky', top: 68, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* Today */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', padding: '16px 17px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Today</span>
                <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{new Date(ty, (tm || 1) - 1, td).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              {data.todayEvents.length === 0 && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-tertiary)' }}>{data.calendarConnected ? 'Nothing scheduled today.' : 'Connect your calendar to see today’s events.'}</p>
              )}
              {data.todayEvents.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', paddingTop: 1, width: 38, flex: 'none' }}>{e.time}</span>
                  <div style={{ flex: 1, minWidth: 0, borderLeft: i < data.todayEvents.length - 1 ? '1px solid var(--border-hairline)' : 'none', padding: `0 0 ${i < data.todayEvents.length - 1 ? 14 : 0}px 12px`, position: 'relative' }}>
                    <i data-dot={e.dot} style={{ position: 'absolute', left: -3.5, top: 4, width: 6, height: 6, borderRadius: '50%', border: '1.5px solid var(--bg-surface)' }} />
                    <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</b>
                    {e.meta && <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{e.meta}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Calendars sources */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', padding: '16px 17px' }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 13 }}>Calendars</span>
              {data.sources.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0' }}>
                  <i data-src={s.key} style={{ width: 9, height: 9, borderRadius: 2.5, flex: 'none' }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{s.count}</span>
                </div>
              ))}
            </div>

            {/* Grant deadlines */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', padding: '16px 17px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Grant deadlines</span>
                <Link href="/dashboard" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none' }}>All</Link>
              </div>
              {data.deadlines.length === 0 && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>No upcoming deadlines.</p>
              )}
              {data.deadlines.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: i < data.deadlines.length - 1 ? '1px solid var(--border-hairline)' : 'none' }}>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: d.isNext ? 'var(--accent)' : 'var(--text-tertiary)', flex: 'none', width: 40 }}>{d.d}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '22px 0 0' }}>Live · your Microsoft 365 calendar and Instrumentl deadlines</p>
      </main>
    </div>
  );
}

function navBtn(withBorder: boolean): React.CSSProperties {
  return {
    width: 34, height: 34, border: 'none', borderRight: withBorder ? '1px solid var(--border-hairline)' : 'none',
    background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s',
  };
}
