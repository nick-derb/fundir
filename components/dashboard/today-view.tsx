'use client';

// Today — the page the development officer opens first. The brief at the
// top is the reason to come back: what changed in the funding picture since
// they last looked (new warm paths, insights, filings, refresh runs), what
// is due, and which asks the board could make this week, each with the
// evidence and one action. The pipeline and calendar sections the old
// dashboard carried sit underneath, unchanged in substance.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, MessageSquare, Sparkles, CalendarDays, Clock, Share2, FileText, Users, RefreshCw } from 'lucide-react';
import type { Brief, BriefSignal, SignalKind, Tone } from '@/lib/brief';
import { DashboardView, type DashData } from './dashboard-view';
import { useOrg } from '@/components/org-context';

const COOKIE = 'fundir_brief_seen';
const SIX_HOURS = 6 * 3600 * 1000;

const CSS = `
.td-root{color:var(--text-primary);background:var(--bg-page);padding:22px 26px 40px}
.td-cols{display:grid;grid-template-columns:minmax(0,1fr) 332px;gap:18px;align-items:start}
.td-rail{position:sticky;top:64px;display:flex;flex-direction:column;gap:14px;min-width:0}
.td-sec{background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:var(--radius)}
.td-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 18px 10px;flex-wrap:wrap}
.td-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.005em}
.td-head p{margin:3px 0 0;font-size:12px;color:var(--text-tertiary)}
.td-filters{display:flex;gap:4px;flex-wrap:wrap;padding:0 18px 10px}
.td-chip{height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--border-hairline);background:var(--bg-surface);font:inherit;font-size:12px;color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.td-chip i{font-style:normal;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)}
.td-chip[aria-pressed="true"]{background:var(--text-primary);color:var(--bg-surface);border-color:var(--text-primary)}
.td-chip[aria-pressed="true"] i{color:inherit;opacity:.7}
.td-group{padding:6px 18px 2px;font-size:12px;font-weight:500;color:var(--text-tertiary);border-top:1px solid var(--border-hairline);display:flex;align-items:center;gap:8px}
.td-group i{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent)}
.td-sig{display:grid;grid-template-columns:3px minmax(0,1fr) auto;gap:14px;padding:12px 18px 12px 0;margin-left:18px;border-top:1px solid var(--border-hairline);text-decoration:none;color:inherit;transition:background .14s}
.td-sig:hover{background:var(--bg-elevated)}
.td-sig[data-tone="accent"] .td-bar{background:var(--accent)}
.td-sig[data-tone="warning"] .td-bar{background:var(--warning)}
.td-sig[data-tone="critical"] .td-bar{background:var(--critical)}
.td-sig[data-tone="info"] .td-bar{background:var(--info)}
.td-sig[data-tone="slate"] .td-bar{background:#5B7383}
.td-bar{border-radius:2px;align-self:stretch}
.td-kind{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-tertiary);margin-bottom:3px}
.td-kind b{font-weight:500;color:var(--text-secondary)}
.td-kind em{font-style:normal;color:var(--accent);font-weight:500}
.td-title{font-size:13.5px;font-weight:500;letter-spacing:-.005em;line-height:1.35}
.td-detail{font-size:12.5px;line-height:1.5;color:var(--text-secondary);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.td-ev{font-size:11.5px;color:var(--text-tertiary);margin-top:4px}
.td-cta{display:inline-flex;align-items:center;gap:5px;align-self:center;font-size:12px;font-weight:500;color:var(--accent);white-space:nowrap}
.td-score{font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--accent);text-align:right}
.td-todo{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 0;border-top:1px solid var(--border-hairline);text-decoration:none;color:inherit}
.td-todo:first-of-type{border-top:none}
.td-todo i{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--border-strong);margin-top:2px;display:inline-flex;align-items:center;justify-content:center;color:var(--accent)}
.td-todo b{display:block;font-size:12.5px;font-weight:500;line-height:1.35}
.td-todo span{display:block;font-size:11.5px;color:var(--text-tertiary);margin-top:2px}
.td-due{font-family:var(--font-mono);font-size:10.5px;white-space:nowrap;padding-top:3px}
.td-ask{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid var(--border-hairline)}
.td-ask:first-of-type{border-top:none}
.td-ask b{display:block;font-size:12.5px;font-weight:500}
.td-ask small{display:block;font-size:11.5px;color:var(--text-tertiary)}
.td-ask ul{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px}
.td-ask li{display:flex;align-items:center;gap:8px;font-size:12px}
.td-ask li a{color:var(--text-primary);text-decoration:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.td-ask li a:hover{color:var(--accent)}
.td-ask li em{font-style:normal;font-family:var(--font-mono);font-size:10.5px;color:var(--accent);font-weight:600}
.td-av{width:30px;height:30px;border-radius:50%;background:var(--accent);color:var(--accent-on);display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10px;font-weight:600}
.td-empty{padding:18px;font-size:12.5px;color:var(--text-tertiary)}
.td-counts{display:flex;gap:18px;flex-wrap:wrap;margin:14px 0 0}
.td-count{display:flex;align-items:baseline;gap:6px;font-size:12.5px;color:var(--text-secondary)}
.td-count b{font-family:var(--font-mono);font-size:16px;font-weight:600;color:var(--text-primary)}
.td-count[data-tone="accent"] b{color:var(--accent)}
.td-count[data-tone="warning"] b{color:var(--warning)}
@media (max-width:1180px){.td-cols{grid-template-columns:minmax(0,1fr)}.td-rail{position:static}}
@media (max-width:640px){.td-root{padding:16px 16px 32px}.td-sig{grid-template-columns:3px minmax(0,1fr)}.td-cta{display:none}}
`;

const KIND: Record<SignalKind, { label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }> = {
  path: { label: 'Warm path', icon: Share2 }, insight: { label: 'Insight', icon: Sparkles }, refresh: { label: 'Network refresh', icon: RefreshCw },
  deadline: { label: 'Deadline', icon: Clock }, follow_up: { label: 'Follow-up', icon: Check }, stale: { label: 'Gone quiet', icon: Clock }, filing: { label: 'Filing', icon: FileText },
};
const FILTERS: Array<{ key: 'all' | SignalKind; label: string }> = [
  { key: 'all', label: 'Everything' }, { key: 'path', label: 'Paths' }, { key: 'insight', label: 'Insights' }, { key: 'deadline', label: 'Deadlines' }, { key: 'follow_up', label: 'Follow-ups' }, { key: 'filing', label: 'Filings' }, { key: 'refresh', label: 'Refreshes' },
];

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const relDay = (iso: string, now: Date) => {
  const d = new Date(iso); const days = Math.round((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const sinceLabel = (iso: string, now: Date) => {
  const d = new Date(iso); const h = (now.getTime() - d.getTime()) / 3600000;
  if (h < 1) return 'in the last hour'; if (h < 24) return `since ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const days = Math.round(h / 24); if (days === 1) return 'since yesterday'; if (days < 7) return `since ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
  return 'this week';
};
const toneColor: Record<Tone, string> = { accent: 'var(--accent)', warning: 'var(--warning)', critical: 'var(--critical)', slate: '#5B7383', info: 'var(--info)' };

export function TodayView({ data, brief }: { data: DashData; brief: Brief }) {
  const org = useOrg();
  const [filter, setFilter] = useState<'all' | SignalKind>('all');
  const [now] = useState(() => new Date());

  // Remember that the brief was read. A reload inside the same working
  // session keeps the same "since" baseline; the next day starts a new one.
  useEffect(() => {
    try {
      const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
      const last = m ? new Date(decodeURIComponent(m[1])) : null;
      if (!last || Number.isNaN(last.getTime()) || Date.now() - last.getTime() > SIX_HOURS) {
        document.cookie = `${COOKIE}=${encodeURIComponent(new Date().toISOString())}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch { /* cookies blocked: the brief just shows the week */ }
  }, []);

  const counts = useMemo(() => { const c: Partial<Record<SignalKind, number>> = {}; for (const s of brief.signals) c[s.kind] = (c[s.kind] ?? 0) + 1; return c; }, [brief.signals]);
  const shown = useMemo(() => brief.signals.filter(s => filter === 'all' || s.kind === filter || (filter === 'follow_up' && s.kind === 'stale')), [brief.signals, filter]);
  const fresh = shown.filter(s => s.isNew), earlier = shown.filter(s => !s.isNew);
  const seen = sinceLabel(brief.seenAt, now);
  const st = brief.stats;
  const summary = [
    st.newPaths ? `${st.newPaths} new warm path${st.newPaths === 1 ? '' : 's'}` : null,
    st.newInsights ? `${st.newInsights} new insight${st.newInsights === 1 ? '' : 's'}` : null,
    st.dueSoon ? `${st.dueSoon} deadline${st.dueSoon === 1 ? '' : 's'} inside two weeks` : null,
    st.asksReady ? `${st.asksReady} ask${st.asksReady === 1 ? '' : 's'} ready for your board` : null,
  ].filter(Boolean);

  return (
    <div className="td-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="fd-page-head" style={{ marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{data.today}</p>
          <h1>{data.greeting}, {data.firstName}</h1>
          <p className="fd-lede">{summary.length ? `${summary.join(', ')}.` : `Nothing new for ${org.short} ${seen}. The week is below.`}</p>
          <div className="td-counts">
            <span className="td-count" data-tone={st.newPaths ? 'accent' : undefined}><b>{st.newPaths}</b>new paths</span>
            <span className="td-count"><b>{st.relationshipsFound.toLocaleString('en-US')}</b>relationships read this week</span>
            <span className="td-count" data-tone={st.dueSoon ? 'warning' : undefined}><b>{st.dueSoon}</b>due in 14 days</span>
            <span className="td-count"><b>{st.asksReady}</b>asks ready</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/calendar" className="fd-btn"><CalendarDays style={{ width: 13, height: 13 }} />Calendar</Link>
          <Link href="/connections?tab=discover" className="fd-btn-primary"><Share2 style={{ width: 13, height: 13 }} />Open the network</Link>
        </div>
      </div>

      <div className="td-cols">
        {/* ── The brief ── */}
        <section className="td-sec" aria-labelledby="td-brief">
          <div className="td-head">
            <div style={{ minWidth: 0 }}>
              <h2 id="td-brief">Your brief</h2>
              <p>What changed {seen}, then the rest of the week. Every line links to its evidence.</p>
            </div>
            <span className="fd-tag" data-tone="accent">{fresh.length} new</span>
          </div>
          <div className="td-filters" role="group" aria-label="Filter the brief">
            {FILTERS.map(f => {
              const n = f.key === 'all' ? brief.signals.length : f.key === 'follow_up' ? (counts.follow_up ?? 0) + (counts.stale ?? 0) : counts[f.key] ?? 0;
              if (f.key !== 'all' && !n) return null;
              return <button key={f.key} type="button" className="td-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}<i>{n}</i></button>;
            })}
          </div>
          {shown.length === 0 && <p className="td-empty">Nothing in this category this week. Run a network refresh or add a next action on a lead and it will show up here.</p>}
          {fresh.length > 0 && <div className="td-group"><i />New {seen}</div>}
          {fresh.map(s => <Signal key={s.id} s={s} now={now} />)}
          {earlier.length > 0 && <div className="td-group">{fresh.length ? 'Earlier this week' : 'This week'}</div>}
          {earlier.map(s => <Signal key={s.id} s={s} now={now} />)}
        </section>

        {/* ── Rail ── */}
        <div className="td-rail">
          <section className="td-sec" style={{ padding: '14px 16px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>Do today</span>
              <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{brief.todos.length}</span>
            </div>
            {brief.todos.length === 0 ? <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Nothing due. Set a next action on a lead and it lands here.</p> : brief.todos.map(t => (
              <Link key={t.id} href={t.href} className="td-todo">
                <i aria-hidden>{t.kind === 'ask' ? <ArrowRight style={{ width: 10, height: 10 }} /> : null}</i>
                <span><b>{t.text}</b><span>{t.sub}</span></span>
                <span className="td-due" style={{ color: toneColor[t.tone] }}>{t.days === null ? '' : t.days < 0 ? `${-t.days}d over` : t.days === 0 ? 'today' : `${t.days}d`}</span>
              </Link>
            ))}
          </section>

          <section className="td-sec" style={{ padding: '14px 16px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>Ask your board</span>
              <Link href="/connections?tab=paths" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none' }}>All paths</Link>
            </div>
            <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 6px' }}>People at {org.short} who can open a door this week, by how much it is worth.</p>
            {brief.asks.length === 0 ? <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>No open paths yet. Add board members&rsquo; LinkedIn profiles and run a refresh.</p> : brief.asks.map(a => (
              <div key={a.personId} className="td-ask">
                <span className="td-av" aria-hidden>{initials(a.name)}</span>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/connections?tab=people&person=${a.personId}`} style={{ textDecoration: 'none', color: 'inherit' }}><b>{a.name}</b></Link>
                  <small>{a.role ?? `${org.short} network`} · {a.targets.length} intro{a.targets.length === 1 ? '' : 's'} to ask for</small>
                  <ul>{a.targets.map(t => <li key={t.leadId}><em>{t.score}</em><Link href={`/connections?tab=discover&lead=${t.leadId}`}>{t.name}</Link></li>)}</ul>
                </div>
              </div>
            ))}
          </section>

          <section className="td-sec" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>Today</span>
              <Link href="/calendar" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Full day</Link>
            </div>
            {data.todayEvents.length === 0 ? (
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{data.calendarConnected ? 'Nothing scheduled today.' : 'Connect your calendar in Settings to see today here.'}</p>
            ) : data.todayEvents.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', paddingTop: 1, width: 40, flex: 'none' }}>{t.time}</span>
                <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--border-hairline)', padding: '0 0 12px 12px', position: 'relative' }}>
                  <i style={{ position: 'absolute', left: -3.5, top: 4, width: 6, height: 6, borderRadius: '50%', background: t.dot === 'on' ? 'var(--accent)' : 'var(--border-strong)', border: '1.5px solid var(--bg-surface)' }} />
                  <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{t.title}</b>
                  {t.meta && <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{t.meta}</span>}
                </div>
              </div>
            ))}
          </section>

          <section className="td-sec" style={{ padding: '14px 16px 16px' }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Ask Fundir</span>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>Search {org.possessive} filings, documents and funder record in plain language.</p>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('fundir:open-advisor'))} className="fd-btn" style={{ width: '100%', justifyContent: 'center' }}><MessageSquare style={{ width: 13, height: 13 }} />Open the assistant</button>
          </section>
        </div>
      </div>

      {/* ── Pipeline, calendar and goals ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '26px 0 10px' }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.005em' }}>Pipeline and calendar</span>
        <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>Applications, deadlines and the fiscal-year goals</span>
        <Users style={{ display: 'none' }} />
      </div>
      <DashboardView data={data} embedded />
    </div>
  );
}

function Signal({ s, now }: { s: BriefSignal; now: Date }) {
  const k = KIND[s.kind]; const Icon = k.icon;
  return (
    <Link href={s.href} className="td-sig" data-tone={s.tone}>
      <span className="td-bar" />
      <span style={{ minWidth: 0 }}>
        <span className="td-kind"><Icon style={{ width: 12, height: 12, color: toneColor[s.tone] }} /><b>{k.label}</b><span>·</span><span>{relDay(s.at, new Date(now))}</span>{s.isNew && <em>new</em>}</span>
        <span className="td-title">{s.title}</span>
        {s.detail && <span className="td-detail">{s.detail}</span>}
        {s.evidence && <span className="td-ev">{s.evidence}</span>}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, justifyContent: 'center' }}>
        {s.score !== null && <span className="td-score">{s.score}</span>}
        <span className="td-cta">{s.cta}<ArrowRight style={{ width: 12, height: 12 }} /></span>
      </span>
    </Link>
  );
}
