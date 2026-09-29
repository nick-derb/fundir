'use client';

// Calendar — month grid, schedule-style week and day grids, plus the rail
// (Today timeline, Calendars, Grant deadlines). Wired to real data: the user's
// Microsoft/Google events and the live grant deadlines from
// cyc_grant_submissions. AppShell supplies the sidebar + topbar, so this
// renders the <main> content only.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  SlidersHorizontal, Plus, ArrowLeft, ArrowRight, Link2,
} from 'lucide-react';

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
type Ev = CalData['events'][number];

const HOUR_H = 48;          // px per hour on the schedule grids
const DEFAULT_START = 7;    // 07:00
const DEFAULT_END = 19;     // 19:00

const CSS = `
.cv-root{color:var(--text-primary)}
.cv-root .cv-cols{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;align-items:start}
.cv-root .cv-rail{position:sticky;top:64px;min-width:0}
.cv-root .cv-rail-sec{padding:12px 14px;border-bottom:1px solid var(--border-hairline)}
.cv-root .cv-rail-sec:last-child{border-bottom:none}
.cv-root .cv-toolbar{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border-hairline);flex-wrap:wrap}
.cv-root .cv-iconbtn{width:32px;padding:0;justify-content:center}
/* event blocks: kind carries the colour, always a left border + tint */
.cv-root .cv-ev{border-left:2px solid #5B7383;background:#EEF2F4;border-radius:0 var(--radius-xs) var(--radius-xs) 0;padding:4px 7px;min-width:0;overflow:hidden}
.cv-root .cv-ev b{display:block;font-size:11px;font-weight:500;line-height:1.3;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cv-root .cv-ev span{display:block;margin-top:2px;font-family:var(--font-mono);font-size:9px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cv-root .cv-ev[data-kind="grant"]{border-left-color:#0C6B5A;background:#EDF4F0}
.cv-root .cv-ev[data-kind="funder"]{border-left-color:#9C7A2A;background:#F7F2E6}
.cv-root .cv-ev[data-kind="internal"]{border-left-color:#5B7383;background:#EEF2F4}
.cv-root .cv-ev[data-kind="site"]{border-left-color:#A25A44;background:#F7EFEC}
.cv-root [data-src="me"]{background:#0C6B5A}
.cv-root [data-src="deadline"]{background:#A25A44}
.cv-root [data-src="team"]{background:#9C7A2A}
.cv-root [data-src="org"]{background:#5B7383}
.cv-root [data-dot="on"]{background:var(--accent)}
.cv-root [data-dot="off"]{background:var(--border-strong)}
/* month */
.cv-root .cv-mgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.cv-root .cv-mday{position:relative;min-height:112px;padding:6px 7px 8px;border-right:1px solid var(--border-hairline);border-bottom:1px solid var(--border-hairline);overflow:hidden;transition:background-color var(--motion-fast)}
.cv-root .cv-mday:nth-child(7n){border-right:none}
.cv-root .cv-mday:hover{background:var(--bg-page)}
.cv-root .cv-mday:hover .cv-add{opacity:1}
.cv-root .cv-mday[data-today="true"]{background:rgba(12,107,90,.035)}
.cv-root .cv-add{width:17px;height:17px;border-radius:var(--radius-xs);border:none;background:var(--bg-elevated);color:var(--text-tertiary);cursor:pointer;opacity:0;display:flex;align-items:center;justify-content:center;transition:opacity var(--motion-fast)}
/* schedule (week / day) */
.cv-root .cv-sched{display:grid;grid-template-columns:52px minmax(0,1fr)}
.cv-root .cv-shead{display:grid;border-bottom:1px solid var(--border-hairline);background:var(--bg-page)}
.cv-root .cv-shead > div{padding:8px 8px 7px;border-left:1px solid var(--border-hairline);min-width:0}
.cv-root .cv-allday{display:grid;border-bottom:1px solid var(--border-hairline)}
.cv-root .cv-allday > div{padding:4px 5px;border-left:1px solid var(--border-hairline);min-height:30px;display:flex;flex-direction:column;gap:3px;min-width:0}
.cv-root .cv-sbody{max-height:600px;overflow-y:auto}
.cv-root .cv-gutter{position:relative}
.cv-root .cv-gutter i{position:absolute;right:8px;transform:translateY(-6px);font-style:normal;font-family:var(--font-mono);font-size:9.5px;color:var(--text-tertiary)}
.cv-root .cv-scol{position:relative;border-left:1px solid var(--border-hairline);background-image:linear-gradient(to bottom,var(--border-hairline) 1px,transparent 1px);background-size:100% ${HOUR_H}px}
.cv-root .cv-scol[data-today="true"]{background-color:rgba(12,107,90,.03)}
.cv-root .cv-sev{position:absolute;box-sizing:border-box;padding:4px 7px}
.cv-root .cv-sev b{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.cv-root .cv-now{position:absolute;left:0;right:0;height:0;border-top:1px solid var(--critical);pointer-events:none}
.cv-root .cv-now::before{content:'';position:absolute;left:-3px;top:-3px;width:5px;height:5px;border-radius:50%;background:var(--critical)}
@media (max-width:1080px){.cv-root .cv-cols{grid-template-columns:minmax(0,1fr)}.cv-root .cv-rail{position:static}}
@media (max-width:860px){.cv-root .cv-mscroll,.cv-root .cv-wscroll{overflow-x:auto}.cv-root .cv-mscroll > div{min-width:700px}.cv-root .cv-wscroll > div{min-width:640px}}
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

// "HH:MM" → minutes since midnight; anything else (All day, "LOI due") is untimed.
const minutesOf = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const kindLabel = (k: Ev['kind']) => k === 'grant' ? 'grant deadline' : k === 'funder' ? 'funder meeting' : k === 'site' ? 'site visit' : 'internal';

export function CalendarView({ data }: { data: CalData }) {
  const [ty, tm, td] = data.todayISO.split('-').map(Number);
  // The cursor is a day; Month reads its month, Week its Monday-first week, Day the day itself.
  const [cursor, setCursor] = useState(() => new Date(ty, (tm || 1) - 1, td || 1));
  const [view, setView] = useState<'Month' | 'Week' | 'Day'>('Month');

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
  const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monday = new Date(cursor); monday.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const fmtShort = (d: Date) => `${MON_ABBR[d.getMonth()]} ${d.getDate()}`;
  const dayCount = data.events.filter(e => e.date === keyOf(cursor)).length;
  const monthLabel = view === 'Month' ? `${MONTHS[mo]} ${y}` : view === 'Week' ? `Week of ${fmtShort(monday)}` : cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const rangeLabel = view === 'Month' ? `${MON_ABBR[mo]} 1 – ${MON_ABBR[mo]} ${dim}, ${y}` : view === 'Week' ? `${fmtShort(weekDays[0])} – ${fmtShort(weekDays[6])}, ${weekDays[6].getFullYear()}` : `${dayCount} event${dayCount === 1 ? '' : 's'} · ${y}`;
  // Previous / next moves by the unit the view shows.
  const stepMonth = (delta: number) => setCursor(view === 'Month' ? new Date(y, mo + delta, 1) : view === 'Week' ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7 * delta) : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + delta));
  const unit = view === 'Month' ? 'month' : view === 'Week' ? 'week' : 'day';

  const openDay = (d: Date) => { setCursor(d); setView('Day'); };

  return (
    <div className="cv-root">
      <style>{CSS}</style>
      <main style={{ padding: '22px 24px 40px' }}>

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="fd-page-head">
          <div style={{ minWidth: 0 }}>
            <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Chicago Youth Centers</p>
            <h1>Calendar</h1>
            <p className="fd-lede">Your Microsoft schedule and every grant deadline, on one grid.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a className="fd-btn" href={OUTLOOK_CAL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <SlidersHorizontal style={{ width: 13, height: 13 }} />Manage calendars
            </a>
            <a className="fd-btn-primary" href={OUTLOOK_NEW} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Plus style={{ width: 14, height: 14 }} />Add event
            </a>
          </div>
        </div>

        {!data.calendarConnected && (
          <div className="fd-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14, borderLeft: '2px solid var(--accent)' }}>
            <Link2 style={{ width: 14, height: 14, color: 'var(--accent)', flex: 'none' }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Your calendar isn’t connected — the grid shows grant deadlines only.{' '}
              <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Connect Microsoft 365 →</Link>
            </span>
          </div>
        )}

        <div className="cv-cols">

          {/* Left — calendar card */}
          <div className="fd-card" style={{ overflow: 'hidden', minWidth: 0 }}>

            {/* Toolbar */}
            <div className="cv-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ flex: 'none', width: 40, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-xs)', overflow: 'hidden', textAlign: 'center' }}>
                  <div className="fd-mono" style={{ fontSize: 7.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-on)', background: 'var(--accent)', padding: '2px 0' }}>{MON_ABBR[(tm || 1) - 1]}</div>
                  <div className="fd-mono" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em', padding: '2px 0 3px' }}>{td}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-.012em' }}>{monthLabel}</b>
                  <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{rangeLabel}</span>
                </div>
              </div>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="fd-btn cv-iconbtn" aria-label={`Previous ${unit}`} onClick={() => stepMonth(-1)}><ArrowLeft style={{ width: 14, height: 14 }} /></button>
                <button type="button" className="fd-btn cv-iconbtn" aria-label={`Next ${unit}`} onClick={() => stepMonth(1)}><ArrowRight style={{ width: 14, height: 14 }} /></button>
                <button type="button" className="fd-btn" onClick={() => setCursor(new Date(ty, (tm || 1) - 1, td || 1))}>Today</button>
                <span style={{ width: 6 }} />
                {(['Month', 'Week', 'Day'] as const).map(v => (
                  <button key={v} type="button" className="fd-seg" aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>
                ))}
              </div>
            </div>

            {/* Week — schedule grid, seven columns by the hour */}
            {view === 'Week' && (
              <div className="cv-wscroll"><div>
                <Schedule days={weekDays} byDay={byDay} todayISO={data.todayISO} keyOf={keyOf} onPickDay={openDay} />
              </div></div>
            )}

            {/* Day — one column, same grid */}
            {view === 'Day' && (() => {
              const evs = byDay.get(keyOf(cursor)) ?? [];
              return (
                <>
                  {evs.length === 0 && (
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)' }}>
                      <p className="fd-display" style={{ fontSize: '1.15rem', margin: '0 0 3px' }}>Nothing on {cursor.toLocaleDateString('en-US', { weekday: 'long' })}.</p>
                      <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{data.calendarConnected ? 'No events or deadlines fall on this day.' : 'Connect your calendar to see events here; deadlines still show.'}</p>
                    </div>
                  )}
                  <Schedule days={[cursor]} byDay={byDay} todayISO={data.todayISO} keyOf={keyOf} single />
                </>
              );
            })()}

            {/* Month grid */}
            {view === 'Month' && (
              <div className="cv-mscroll"><div>
                <div className="cv-mgrid" style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border-hairline)' }}>
                  {DOWS.map(d => <div key={d} className="fd-eyebrow" style={{ padding: '8px 10px', color: 'var(--text-tertiary)' }}>{d}</div>)}
                </div>
                <div className="cv-mgrid">
                  {cells.map((c, i) => {
                    const shown = c.events.slice(0, MAXV);
                    const more = c.events.length - shown.length;
                    return (
                      <div key={i} className="cv-mday" data-today={c.isToday ? 'true' : undefined}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          {c.isToday
                            ? <span className="fd-mono" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 19, height: 19, padding: '0 4px', borderRadius: 'var(--radius-xs)', background: 'var(--text-primary)', color: 'var(--bg-surface)', fontSize: 10.5, fontWeight: 500 }}>{c.n}</span>
                            : <button type="button" onClick={() => { if (!c.out) openDay(new Date(y, mo, c.n)); }} className="fd-mono" style={{ border: 'none', background: 'none', padding: '0 2px', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: c.out ? 'var(--text-tertiary)' : 'var(--text-secondary)', opacity: c.out ? .55 : 1, cursor: c.out ? 'default' : 'pointer' }}>{c.n}</button>}
                          {!c.out && (
                            <a className="cv-add" href={OUTLOOK_NEW} target="_blank" rel="noopener noreferrer" aria-label="Add event">
                              <Plus style={{ width: 10, height: 10 }} />
                            </a>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {shown.map((e, j) => (
                            <div key={j} className="cv-ev" data-kind={e.kind} title={`${e.title} · ${e.time}`}>
                              <b>{e.title}</b>
                              <span>{e.time}</span>
                            </div>
                          ))}
                          {more > 0 && (
                            <button type="button" onClick={() => { if (!c.out) openDay(new Date(y, mo, c.n)); }} className="fd-mono" style={{ border: 'none', background: 'none', padding: '2px 0', fontSize: 9.5, color: 'var(--accent)', cursor: 'pointer', textAlign: 'left', font: 'inherit', fontFamily: 'var(--font-mono)' }}>{more} more…</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div></div>
            )}
          </div>

          {/* Right rail — one card, three ruled sections */}
          <div className="fd-card cv-rail" style={{ overflow: 'hidden' }}>

            {/* Today */}
            <div className="cv-rail-sec">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Today</span>
                <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{new Date(ty, (tm || 1) - 1, td).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              {data.todayEvents.length === 0 && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-tertiary)' }}>{data.calendarConnected ? 'Nothing scheduled today.' : 'Connect your calendar to see today’s events.'}</p>
              )}
              {data.todayEvents.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', paddingTop: 1, width: 36, flex: 'none' }}>{e.time}</span>
                  <div style={{ flex: 1, minWidth: 0, borderLeft: i < data.todayEvents.length - 1 ? '1px solid var(--border-hairline)' : 'none', padding: `0 0 ${i < data.todayEvents.length - 1 ? 12 : 0}px 12px`, position: 'relative' }}>
                    <i data-dot={e.dot} style={{ position: 'absolute', left: -3.5, top: 4, width: 6, height: 6, borderRadius: '50%', border: '1.5px solid var(--bg-surface)' }} />
                    <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</b>
                    {e.meta && <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{e.meta}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Calendars sources */}
            <div className="cv-rail-sec">
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Calendars</span>
              {data.sources.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' }}>
                  <i data-src={s.key} style={{ width: 8, height: 8, borderRadius: 2, flex: 'none' }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                  <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.count}</span>
                </div>
              ))}
            </div>

            {/* Grant deadlines */}
            <div className="cv-rail-sec">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
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

        <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '18px 0 0' }}>Live · your Microsoft 365 calendar and Instrumentl deadlines</p>
      </main>
    </div>
  );
}

// ── Schedule grid (Week and Day) ──────────────────────────────────────────────
// Timed events sit on an hour grid; untimed ones (all-day, "LOI due") sit in
// the band above it. Events carry no end time, so each block is one hour and
// overlapping starts share the column in lanes.

interface Placed { ev: Ev; start: number; lane: number; lanes: number }

function placeTimed(evs: Ev[]): { timed: Placed[]; untimed: Ev[] } {
  const untimed: Ev[] = [];
  const timed: { ev: Ev; start: number }[] = [];
  for (const ev of evs) {
    const m = minutesOf(ev.time);
    if (m === null) untimed.push(ev); else timed.push({ ev, start: m });
  }
  timed.sort((a, b) => a.start - b.start);
  // greedy lanes within clusters of overlapping one-hour blocks
  const placed: Placed[] = [];
  let cluster: Placed[] = []; let laneEnds: number[] = [];
  const flush = () => { for (const p of cluster) p.lanes = laneEnds.length; placed.push(...cluster); cluster = []; laneEnds = []; };
  for (const t of timed) {
    if (cluster.length && laneEnds.every(end => end <= t.start)) flush();
    let lane = laneEnds.findIndex(end => end <= t.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(t.start + 60); } else laneEnds[lane] = t.start + 60;
    cluster.push({ ev: t.ev, start: t.start, lane, lanes: 1 });
  }
  flush();
  return { timed: placed, untimed };
}

function Schedule({ days, byDay, todayISO, keyOf, single, onPickDay }: {
  days: Date[]; byDay: Map<string, Ev[]>; todayISO: string; keyOf: (d: Date) => string; single?: boolean; onPickDay?: (d: Date) => void;
}) {
  const cols = days.map(d => { const key = keyOf(d); const { timed, untimed } = placeTimed(byDay.get(key) ?? []); return { d, key, timed, untimed, isToday: key === todayISO }; });
  // Hour window: the working day, widened to fit any timed event.
  let start = DEFAULT_START, end = DEFAULT_END;
  for (const c of cols) for (const p of c.timed) { start = Math.min(start, Math.floor(p.start / 60)); end = Math.max(end, Math.ceil((p.start + 60) / 60)); }
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const bodyH = (end - start) * HOUR_H;
  const gridCols = `repeat(${days.length}, minmax(0,1fr))`;
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin - start * 60) / 60 * HOUR_H;

  return (
    <div>
      {/* day headings */}
      <div className="cv-sched">
        <div style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border-hairline)' }} />
        <div className="cv-shead" style={{ gridTemplateColumns: gridCols }}>
          {cols.map((c, i) => (
            <div key={c.key}>
              <button type="button" onClick={() => onPickDay?.(c.d)} disabled={!onPickDay} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: onPickDay ? 'pointer' : 'default', display: 'flex', alignItems: 'baseline', gap: 6, color: 'inherit' }}>
                <span className="fd-eyebrow" style={{ color: c.isToday ? 'var(--accent)' : 'var(--text-tertiary)' }}>{single ? c.d.toLocaleDateString('en-US', { weekday: 'long' }) : DOWS[i]}</span>
                <span className="fd-mono" style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.01em', color: c.isToday ? 'var(--accent)' : 'var(--text-primary)' }}>{c.d.getDate()}</span>
              </button>
              <span className="fd-mono" style={{ float: 'right', fontSize: 9.5, color: 'var(--text-tertiary)' }}>{(c.timed.length + c.untimed.length) || ''}</span>
            </div>
          ))}
        </div>
      </div>
      {/* all-day / deadline band */}
      <div className="cv-sched">
        <div className="fd-eyebrow" style={{ padding: '8px 6px 0 0', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 8.5, borderBottom: '1px solid var(--border-hairline)' }}>All day</div>
        <div className="cv-allday" style={{ gridTemplateColumns: gridCols }}>
          {cols.map(c => (
            <div key={c.key}>
              {c.untimed.map((e, j) => (
                <div key={j} className="cv-ev" data-kind={e.kind} title={`${e.title} · ${e.time}`}>
                  <b>{e.title}</b>
                  <span>{e.time}{e.kind === 'grant' && !/due/i.test(e.time) ? ' · deadline' : ''}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* hour grid */}
      <div className="cv-sbody">
        <div className="cv-sched" style={{ height: bodyH + 1 }}>
          <div className="cv-gutter">
            {hours.map(h => <i key={h} style={{ top: (h - start) * HOUR_H }}>{pad(h)}:00</i>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols }}>
            {cols.map(c => (
              <div key={c.key} className="cv-scol" data-today={c.isToday ? 'true' : undefined} style={{ height: bodyH }}>
                {c.timed.map((p, j) => {
                  const w = 100 / p.lanes;
                  return (
                    <div key={j} className="cv-ev cv-sev" data-kind={p.ev.kind} title={`${p.ev.title} · ${p.ev.time} · ${kindLabel(p.ev.kind)}`}
                      style={{ top: (p.start - start * 60) / 60 * HOUR_H + 1, height: HOUR_H - 2, left: `calc(${p.lane * w}% + 2px)`, width: `calc(${w}% - 4px)` }}>
                      <b>{p.ev.title}</b>
                      <span>{p.ev.time} · {kindLabel(p.ev.kind)}</span>
                    </div>
                  );
                })}
                {c.isToday && nowTop >= 0 && nowTop <= bodyH && <div className="cv-now" style={{ top: nowTop }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
