'use client';

// The brief, as sections of the dashboard: what changed in the funding
// picture since the person last looked, what is due, and which asks the
// board could make this week. Each line carries its evidence and one
// action. Everything is computed by lib/brief from tables the product
// already maintains; "since you last looked" is a cookie this component
// sets for itself.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Sparkles, Clock, Share2, FileText, RefreshCw } from 'lucide-react';
import type { Brief, BriefSignal, SignalKind, Tone } from '@/lib/brief';
import { useOrg } from '@/components/org-context';

const COOKIE = 'fundir_brief_seen';
const SIX_HOURS = 6 * 3600 * 1000;

export const BRIEF_CSS = `
.bf-filters{display:flex;gap:4px;flex-wrap:wrap;padding:0 18px 10px}
.bf-chip{height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--border-hairline);background:var(--bg-surface);font:inherit;font-size:12px;color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.bf-chip i{font-style:normal;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)}
.bf-chip[aria-pressed="true"]{background:var(--text-primary);color:var(--bg-surface);border-color:var(--text-primary)}
.bf-chip[aria-pressed="true"] i{color:inherit;opacity:.7}
.bf-group{padding:6px 18px 2px;font-size:12px;font-weight:500;color:var(--text-tertiary);border-top:1px solid var(--border-hairline);display:flex;align-items:center;gap:8px}
.bf-group i{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent)}
.bf-sig{display:grid;grid-template-columns:3px minmax(0,1fr) auto;gap:14px;padding:12px 18px 12px 0;margin-left:18px;border-top:1px solid var(--border-hairline);text-decoration:none;color:inherit;transition:background .14s}
.bf-sig:hover{background:var(--bg-elevated)}
.bf-sig[data-tone="accent"] .bf-bar{background:var(--accent)}
.bf-sig[data-tone="warning"] .bf-bar{background:var(--warning)}
.bf-sig[data-tone="critical"] .bf-bar{background:var(--critical)}
.bf-sig[data-tone="info"] .bf-bar{background:var(--info)}
.bf-sig[data-tone="slate"] .bf-bar{background:#5B7383}
.bf-bar{border-radius:2px;align-self:stretch}
.bf-kind{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-tertiary);margin-bottom:3px}
.bf-kind b{font-weight:500;color:var(--text-secondary)}
.bf-kind em{font-style:normal;color:var(--accent);font-weight:500}
.bf-title{font-size:13.5px;font-weight:500;letter-spacing:-.005em;line-height:1.35}
.bf-detail{font-size:12.5px;line-height:1.5;color:var(--text-secondary);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bf-ev{font-size:11.5px;color:var(--text-tertiary);margin-top:4px}
.bf-cta{display:inline-flex;align-items:center;gap:5px;align-self:center;font-size:12px;font-weight:500;color:var(--accent);white-space:nowrap}
.bf-score{font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--accent);text-align:right}
.bf-more{display:block;width:100%;border:none;border-top:1px solid var(--border-hairline);background:none;font:inherit;font-size:12.5px;color:var(--accent);padding:10px 18px;text-align:left;cursor:pointer}
.bf-more:hover{background:var(--bg-elevated)}
.bf-todo{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 0;border-top:1px solid var(--border-hairline);text-decoration:none;color:inherit}
.bf-todo:first-of-type{border-top:none}
.bf-todo i{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--border-strong);margin-top:2px;display:inline-flex;align-items:center;justify-content:center;color:var(--accent)}
.bf-todo b{display:block;font-size:12.5px;font-weight:500;line-height:1.35}
.bf-todo span{display:block;font-size:11.5px;color:var(--text-tertiary);margin-top:2px}
.bf-due{font-family:var(--font-mono);font-size:10.5px;white-space:nowrap;padding-top:3px}
.bf-ask{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid var(--border-hairline)}
.bf-ask:first-of-type{border-top:none}
.bf-ask b{display:block;font-size:12.5px;font-weight:500}
.bf-ask small{display:block;font-size:11.5px;color:var(--text-tertiary)}
.bf-ask ul{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px}
.bf-ask li{display:flex;align-items:center;gap:8px;font-size:12px}
.bf-ask li a{color:var(--text-primary);text-decoration:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.bf-ask li a:hover{color:var(--accent)}
.bf-ask li em{font-style:normal;font-family:var(--font-mono);font-size:10.5px;color:var(--accent);font-weight:600}
.bf-av{width:30px;height:30px;border-radius:50%;background:var(--accent);color:var(--accent-on);display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10px;font-weight:600}
.bf-empty{padding:0 18px 16px;font-size:12.5px;color:var(--text-tertiary);margin:0}
@media (max-width:640px){.bf-sig{grid-template-columns:3px minmax(0,1fr)}.bf-cta{display:none}}
`;

const KIND: Record<SignalKind, { label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }> = {
  path: { label: 'Warm path', icon: Share2 }, insight: { label: 'Insight', icon: Sparkles }, refresh: { label: 'Network refresh', icon: RefreshCw },
  deadline: { label: 'Deadline', icon: Clock }, follow_up: { label: 'Follow-up', icon: Check }, stale: { label: 'Gone quiet', icon: Clock }, filing: { label: 'Filing', icon: FileText },
};
const FILTERS: Array<{ key: 'all' | SignalKind; label: string }> = [
  { key: 'all', label: 'Everything' }, { key: 'path', label: 'Paths' }, { key: 'insight', label: 'Insights' }, { key: 'deadline', label: 'Deadlines' }, { key: 'follow_up', label: 'Follow-ups' }, { key: 'filing', label: 'Filings' }, { key: 'refresh', label: 'Refreshes' },
];
const PAGE = 6;

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const relDay = (iso: string, now: Date) => {
  const d = new Date(iso); const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export const sinceLabel = (iso: string, now: Date) => {
  const d = new Date(iso); const h = (now.getTime() - d.getTime()) / 3600000;
  if (h < 1) return 'in the last hour'; if (h < 24) return `since ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const days = Math.round(h / 24); if (days === 1) return 'since yesterday'; if (days < 7) return `since ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
  return 'this week';
};
const toneColor: Record<Tone, string> = { accent: 'var(--accent)', warning: 'var(--warning)', critical: 'var(--critical)', slate: '#5B7383', info: 'var(--info)' };

/** Remember that the brief was read. A reload inside the same working session keeps the same "since" baseline; the next day starts a new one. */
export function useBriefSeen() {
  useEffect(() => {
    try {
      const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
      const last = m ? new Date(decodeURIComponent(m[1])) : null;
      if (!last || Number.isNaN(last.getTime()) || Date.now() - last.getTime() > SIX_HOURS) {
        document.cookie = `${COOKIE}=${encodeURIComponent(new Date().toISOString())}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch { /* cookies blocked: the brief just shows the week */ }
  }, []);
}

/** One line of the lede: "3 new warm paths, 2 deadlines inside two weeks, 11 asks ready for your board." */
export function briefSummary(brief: Brief): string | null {
  const st = brief.stats;
  const parts = [
    st.newPaths ? `${st.newPaths} new warm path${st.newPaths === 1 ? '' : 's'}` : null,
    st.newInsights ? `${st.newInsights} new insight${st.newInsights === 1 ? '' : 's'}` : null,
    st.dueSoon ? `${st.dueSoon} deadline${st.dueSoon === 1 ? '' : 's'} inside two weeks` : null,
    st.asksReady ? `${st.asksReady} ask${st.asksReady === 1 ? '' : 's'} ready for your board` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')}.` : null;
}

/** The "What changed" card: filter chips, the new signals, then the rest of the week, folded past the first page. */
export function BriefSection({ brief, now, head }: { brief: Brief; now: Date; head: (title: string, sub: string, right?: React.ReactNode) => React.ReactNode }) {
  const [filter, setFilter] = useState<'all' | SignalKind>('all');
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => { const c: Partial<Record<SignalKind, number>> = {}; for (const s of brief.signals) c[s.kind] = (c[s.kind] ?? 0) + 1; return c; }, [brief.signals]);
  const shown = useMemo(() => brief.signals.filter(s => filter === 'all' || s.kind === filter || (filter === 'follow_up' && s.kind === 'stale')), [brief.signals, filter]);
  const visible = open ? shown : shown.slice(0, PAGE);
  const fresh = visible.filter(s => s.isNew), earlier = visible.filter(s => !s.isNew);
  const seen = sinceLabel(brief.seenAt, now);
  return (
    <section className="dv-section" aria-labelledby="dv-brief">
      {head('What changed', `${seen[0].toUpperCase()}${seen.slice(1)}, then the rest of the week. Every line links to its evidence.`, <span className="fd-tag" data-tone="accent">{brief.signals.filter(s => s.isNew).length} new</span>)}
      <div className="bf-filters" role="group" aria-label="Filter what changed">
        {FILTERS.map(f => {
          const n = f.key === 'all' ? brief.signals.length : f.key === 'follow_up' ? (counts.follow_up ?? 0) + (counts.stale ?? 0) : counts[f.key] ?? 0;
          if (f.key !== 'all' && !n) return null;
          return <button key={f.key} type="button" className="bf-chip" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setOpen(false); }}>{f.label}<i>{n}</i></button>;
        })}
      </div>
      {shown.length === 0 && <p className="bf-empty">Nothing in this category this week. Run a network refresh or set a next action on a lead and it shows up here.</p>}
      {fresh.length > 0 && <div className="bf-group"><i />New {seen}</div>}
      {fresh.map(s => <Signal key={s.id} s={s} now={now} />)}
      {earlier.length > 0 && <div className="bf-group">{fresh.length ? 'Earlier this week' : 'This week'}</div>}
      {earlier.map(s => <Signal key={s.id} s={s} now={now} />)}
      {shown.length > PAGE && <button type="button" className="bf-more" onClick={() => setOpen(o => !o)}>{open ? 'Show fewer' : `Show all ${shown.length}`}</button>}
    </section>
  );
}

function Signal({ s, now }: { s: BriefSignal; now: Date }) {
  const k = KIND[s.kind]; const Icon = k.icon;
  return (
    <Link href={s.href} className="bf-sig" data-tone={s.tone}>
      <span className="bf-bar" />
      <span style={{ minWidth: 0 }}>
        <span className="bf-kind"><Icon style={{ width: 12, height: 12, color: toneColor[s.tone] }} /><b>{k.label}</b><span>·</span><span>{relDay(s.at, now)}</span>{s.isNew && <em>new</em>}</span>
        <span className="bf-title">{s.title}</span>
        {s.detail && <span className="bf-detail">{s.detail}</span>}
        {s.evidence && <span className="bf-ev">{s.evidence}</span>}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, justifyContent: 'center' }}>
        {s.score !== null && <span className="bf-score">{s.score}</span>}
        <span className="bf-cta">{s.cta}<ArrowRight style={{ width: 12, height: 12 }} /></span>
      </span>
    </Link>
  );
}

/** Rail card: deadlines, promised follow-ups, quiet introductions and the top asks, soonest first. */
export function DoToday({ brief }: { brief: Brief }) {
  return (
    <section className="dv-section" style={{ padding: '14px 16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Do today</span>
        <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{brief.todos.length}</span>
      </div>
      {brief.todos.length === 0 ? <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Nothing due. Set a next action on a lead and it lands here.</p> : brief.todos.map(t => (
        <Link key={t.id} href={t.href} className="bf-todo">
          <i aria-hidden>{t.kind === 'ask' ? <ArrowRight style={{ width: 10, height: 10 }} /> : null}</i>
          <span><b>{t.text}</b><span>{t.sub}</span></span>
          <span className="bf-due" style={{ color: toneColor[t.tone] }}>{t.days === null ? '' : t.days < 0 ? `${-t.days}d over` : t.days === 0 ? 'today' : `${t.days}d`}</span>
        </Link>
      ))}
    </section>
  );
}

/** Rail card: the open warm paths grouped by the person who can make the introduction, ranked by what they are worth. */
export function AskYourBoard({ brief }: { brief: Brief }) {
  const org = useOrg();
  return (
    <section className="dv-section" style={{ padding: '14px 16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Ask your board</span>
        <Link href="/connections?tab=paths" className="fd-eyebrow dv-link">All paths</Link>
      </div>
      <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 6px' }}>People at {org.short} who can open a door this week, by how much it is worth.</p>
      {brief.asks.length === 0 ? <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>No open paths yet. Add board members&rsquo; LinkedIn profiles and run a refresh.</p> : brief.asks.map(a => (
        <div key={a.personId} className="bf-ask">
          <span className="bf-av" aria-hidden>{initials(a.name)}</span>
          <div style={{ minWidth: 0 }}>
            <Link href={`/connections?tab=people&person=${a.personId}`} style={{ textDecoration: 'none', color: 'inherit' }}><b>{a.name}</b></Link>
            <small>{a.role ?? `${org.short} network`} · {a.targets.length} intro{a.targets.length === 1 ? '' : 's'} to ask for</small>
            <ul>{a.targets.map(t => <li key={t.leadId}><em>{t.score}</em><Link href={`/connections?tab=discover&lead=${t.leadId}`}>{t.name}</Link></li>)}</ul>
          </div>
        </div>
      ))}
    </section>
  );
}
