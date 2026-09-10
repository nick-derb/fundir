'use client';

// Tenant dashboard — native React port of the updated Claude Design "Console
// dashboard" (condensing header, parallax hero, KPI strip, this-week calendar,
// goals, activity, next deadlines, today, needs-a-decision). Wired to real data:
// Instrumentl pipeline (cyc_grant_submissions) for KPIs / deadlines / activity /
// needs, org_goals for goals, and the user's Microsoft/Google calendar.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, Mail, Send, CheckCircle2, Hourglass, Radar, ArrowRight,
  FileEdit, MessageSquare,
} from 'lucide-react';
import { CycHeroTransform } from '@/components/cyc-hero-transform';

declare global {
  interface Window {
    FundirField?: { init: (c: HTMLCanvasElement) => void };
    FundirCharts?: { init: (root: Document | HTMLElement) => void };
  }
}

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";

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

const CSS = `
.dv-root{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary)}
.dv-root{--radius-kpi:12px;--radius-console:14px}
.dv-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.dv-root .fd-kpi{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:-.01em}
.dv-root .fd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.dv-root .fd-caption{font-size:12px;line-height:1.5}
.dv-root .fd-h2{font-size:17px;line-height:1.4;font-weight:600}
.dv-root [data-hero] .cyc-hero{background:transparent!important;border:none!important;border-radius:0!important}
.dv-root [data-hero] .cyc-replay{background:rgba(247,248,247,.9)!important}
.dv-root [data-kind="grant"]{border-left-color:#0C6B5A!important;background:#EDF4F0}
.dv-root [data-kind="funder"]{border-left-color:#9C7A2A!important;background:#F7F2E6}
.dv-root [data-kind="internal"]{border-left-color:#5B7383!important;background:#EEF2F4}
.dv-root [data-kind="site"]{border-left-color:#A25A44!important;background:#F7EFEC}
@keyframes fd-pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes fd-fade{from{opacity:0}to{opacity:1}}
@keyframes fd-rise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}
.dv-root [data-reveal]{opacity:0;transform:translateY(14px);transition:opacity .5s cubic-bezier(.2,.7,.2,1),transform .5s cubic-bezier(.2,.7,.2,1)}
.dv-root [data-reveal].fd-in{opacity:1;transform:none}
.dv-root [data-lift]{transition:transform .18s cubic-bezier(.2,.8,.3,1),box-shadow .18s ease,border-color .18s ease}
.dv-root [data-lift]:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(16,25,23,.07);border-color:#CBD5D0}
.dv-root [data-kpi]{transition:border-color .18s ease,background-color .18s ease}
.dv-root [data-kpi]:hover{border-color:#CBD5D0;background:var(--bg-surface)}
.dv-root [data-calrow]{transition:background-color .15s ease}
.dv-root [data-calrow]:hover{background:var(--bg-page)}
.dv-root [data-hdr]{transition:padding .28s cubic-bezier(.2,.8,.3,1),border-color .28s ease,background-color .28s ease}
.dv-root [data-hdr].is-stuck{padding-top:11px;padding-bottom:11px;border-color:var(--border-hairline);background:rgba(255,255,255,.94);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px)}
.dv-root [data-hdr-compact]{display:none;animation:fd-fade .2s ease}
.dv-root [data-hdr].is-stuck [data-hdr-hero]{display:none}
.dv-root [data-hdr].is-stuck [data-hdr-compact]{display:flex}
.dv-root [data-hdr-pulse]{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:999px;border:1px solid var(--border-hairline);background:var(--bg-surface);color:var(--text-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;transition:border-color .15s ease,color .15s ease}
.dv-root [data-hdr-pulse]:hover{border-color:#CBD5D0;color:var(--text-primary)}
.dv-root [data-hdr-pulse][data-hot="true"]{border-color:rgba(156,122,42,.35);background:rgba(156,122,42,.07);color:#7A5E1E}
.dv-root [data-hdr-pulse] b{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;color:inherit}
@media (max-width:820px){.dv-root [data-hdr-pulses]{display:none!important}}
@media (prefers-reduced-motion:reduce){.dv-root [data-reveal]{opacity:1;transform:none;transition:none}}
@media (max-width:1240px){.dv-root [data-dash-cols]{grid-template-columns:minmax(0,1fr)!important}.dv-root [data-dash-rail]{position:static!important}}
@media (max-width:1080px){.dv-root [data-kpis]{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media (max-width:640px){.dv-root [data-kpis]{grid-template-columns:minmax(0,1fr)!important}.dv-root [data-goal-row]{grid-template-columns:minmax(0,1fr) 64px 64px!important}}
`;

function StatusTag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const m = {
    accent: { c: 'var(--accent)', bg: 'rgba(12,107,90,.10)', b: 'rgba(12,107,90,.26)' },
    neutral: { c: 'var(--text-secondary)', bg: 'var(--bg-elevated)', b: 'var(--border-hairline)' },
    info: { c: '#3E6CA8', bg: 'rgba(62,108,168,.10)', b: 'rgba(62,108,168,.25)' },
    warning: { c: '#9C7A2A', bg: 'rgba(156,122,42,.10)', b: 'rgba(156,122,42,.3)' },
  }[tone];
  return <span className="fd-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', color: m.c, background: m.bg, border: `1px solid ${m.b}`, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{children}</span>;
}

export function DashboardView({ data }: { data: DashData }) {
  const [goals, setGoals] = useState(data.goals);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashGoal[]>([]);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState('Overview');
  const rootRef = useRef<HTMLDivElement>(null);

  // Fonts + charts + field, then scroll behavior (condense header, hero
  // parallax, reveal-on-scroll).
  useEffect(() => {
    if (!document.getElementById('dash-fonts')) {
      const l = document.createElement('link');
      l.id = 'dash-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(l);
    }
    const ensure = (id: string, src: string) => { if (!document.getElementById(id)) { const s = document.createElement('script'); s.id = id; s.src = src; document.body.appendChild(s); } };
    ensure('dash-charts', '/dashboard/charts.js');
    ensure('dash-field', '/dashboard/field.js');
    let n = 0;
    const boot = setInterval(() => {
      const cv = rootRef.current?.querySelector<HTMLCanvasElement>('[data-dash-field]');
      if (cv && window.FundirField) window.FundirField.init(cv);
      if (window.FundirCharts) window.FundirCharts.init(document);
      if (++n > 30) clearInterval(boot);
    }, 150);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = rootRef.current;
    const hdr = root?.querySelector('[data-hdr]');
    const inner = root?.querySelector<HTMLElement>('[data-hero-inner]');
    const band = root?.querySelector<HTMLElement>('[data-hero-band]');
    const sections = Array.from(root?.querySelectorAll<HTMLElement>('[data-section]') ?? []);
    let current = '';
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        if (hdr) hdr.classList.toggle('is-stuck', y > 26);
        // Wayfinder: the last section whose top has passed under the bar.
        let label = 'Overview';
        for (const el of sections) { if (el.getBoundingClientRect().top <= 120) label = el.dataset.section || label; }
        if (label !== current) { current = label; setSection(label); }
        if (reduced) return;
        if (inner) { const k = Math.min(1, y / 420); inner.style.transform = `translate3d(0,${(-y * 0.32).toFixed(1)}px,0)`; inner.style.opacity = String(1 - k * 0.72); }
        if (band) band.style.opacity = String(Math.max(0, 1 - y / 460));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const targets = root?.querySelectorAll('[data-reveal]') ?? [];
    let io: IntersectionObserver | null = null;
    if (reduced) { targets.forEach(el => el.classList.add('fd-in')); }
    else {
      io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('fd-in'); io!.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      targets.forEach(el => io!.observe(el));
    }
    return () => { clearInterval(boot); window.removeEventListener('scroll', onScroll); io?.disconnect(); };
  }, []);

  // Condensed-header pulses: live counts from the same data the page renders.
  const kpiValue = (label: string) => Number(data.kpis.find(k => k.label === label)?.value) || 0;
  const dueSoon = data.deadlines.filter(d => d.days <= 14).length;
  const pulses = [
    { n: dueSoon, label: 'due in 14 days', hot: dueSoon > 0, target: 'Next deadlines', title: 'Deadlines within two weeks' },
    { n: kpiValue('Awaiting decision'), label: 'awaiting decision', hot: false, target: 'Overview', title: 'Submitted, pending a funder decision' },
    { n: kpiValue('In pipeline'), label: 'in pipeline', hot: false, target: 'Overview', title: 'Researching, planned or in progress' },
  ];
  const jumpTo = (label: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-section="${label}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 104;
    window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

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

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)' };

  return (
    <div className="dv-root" ref={rootRef} style={{ position: 'relative', background: 'var(--bg-page)' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* hero band */}
      <div data-hero-band style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 520, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(120% 78% at 62% 6%,rgba(101,154,128,.16),rgba(101,154,128,0) 62%),linear-gradient(180deg,#FFFFFF 0%,#FBFCFB 38%,var(--bg-page) 100%)' }} />

      {/* condensing header */}
      <div data-hdr style={{ position: 'sticky', top: 48, zIndex: 15, padding: '22px 26px 16px', borderBottom: '1px solid transparent' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div data-hdr-hero style={{ minWidth: 0 }}>
            <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>{data.today}</p>
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>{data.greeting}, {data.firstName}</h1>
          </div>
          {/* Condensed strip: where you are + the live numbers that matter, not the greeting again. */}
          <div data-hdr-compact style={{ alignItems: 'center', gap: 12, minWidth: 0, minHeight: 38, flexWrap: 'wrap' }}>
            <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Home</span>
            <span aria-hidden="true" style={{ color: 'var(--border-hairline)' }}>/</span>
            <span className="fd-eyebrow" style={{ color: 'var(--text-primary)' }} aria-live="polite">{section}</span>
            <span data-hdr-pulses style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 6, paddingLeft: 14, borderLeft: '1px solid var(--border-hairline)' }}>
              {pulses.map(p => (
                <button key={p.label} type="button" data-hdr-pulse data-hot={p.hot ? 'true' : 'false'} onClick={() => jumpTo(p.target)} title={p.title}>
                  <b>{p.n}</b>{p.label}
                </button>
              ))}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Link href="/calendar" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap' }}><CalendarDays style={{ width: 13, height: 13 }} />Calendar</Link>
            <a href="https://outlook.office.com/mail/" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px', borderRadius: 'var(--radius-kpi)', border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none' }}><Mail style={{ width: 13, height: 13 }} />Open Outlook</a>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '0 26px 44px' }}>

        {/* hero */}
        <div data-hero style={{ position: 'relative', margin: '0 -8px 4px', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,#000 0%,#000 76%,transparent 100%)', maskImage: 'linear-gradient(180deg,#000 0%,#000 76%,transparent 100%)' }}>
          <div data-hero-inner style={{ willChange: 'transform' }}>
            <CycHeroTransform />
          </div>
        </div>

        {/* KPI strip */}
        <div data-reveal data-kpis data-section="Overview" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 22 }}>
          {data.kpis.map(k => {
            const Icon = KPI_ICON[k.icon] ?? Radar;
            return (
              <div key={k.label} data-kpi style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', padding: '15px 16px', background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}><Icon style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} /><span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>{k.label}</span></div>
                <b className="fd-kpi" style={{ fontSize: 26, display: 'block', lineHeight: 1, color: k.accent ? 'var(--accent)' : undefined }}>{k.value}</b>
                <span className="fd-mono" style={{ fontSize: 9.5, color: k.accent ? 'var(--accent)' : 'var(--text-tertiary)', display: 'block', marginTop: 6 }}>{k.sub}</span>
              </div>
            );
          })}
        </div>

        <div data-dash-cols style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'start' }}>

          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

            {/* This week */}
            <Link data-reveal data-lift data-section="This week" href="/calendar" style={{ display: 'block', textDecoration: 'none', color: 'inherit', ...card, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px 14px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div className="fd-h2" style={{ color: 'var(--text-primary)' }}>This week</div>
                    <span className="fd-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}><i style={{ width: 4, height: 4, borderRadius: '50%', background: data.calendarConnected ? 'var(--accent)' : 'var(--border-hairline)', animation: data.calendarConnected ? 'fd-pulse 2.6s ease-in-out infinite' : undefined }} />{data.calendarConnected ? 'Microsoft 365' : 'Not connected'}</span>
                  </div>
                  <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{data.calendarConnected ? 'Your week, next to your deadlines' : 'Connect a calendar in onboarding to see your week'}</p>
                </div>
                <span style={{ flex: 1 }} />
                <span className="fd-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Open calendar <ArrowRight style={{ width: 12, height: 12 }} /></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', borderTop: '1px solid var(--border-hairline)' }}>
                {data.week.map((d, i) => (
                  <div key={i} style={{ borderRight: i < 6 ? '1px solid var(--border-hairline)' : 'none', padding: '10px 9px 12px', minHeight: 104 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      {d.isToday
                        ? <span className="fd-mono" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 4px', borderRadius: 4, background: 'var(--text-primary)', color: 'var(--bg-surface)', fontSize: 10, fontWeight: 500 }}>{d.n}</span>
                        : <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{d.n}</span>}
                      <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 8 }}>{d.dow}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {d.events.map((e, j) => (
                        <div key={j} data-kind={e.kind} style={{ borderLeft: '2px solid #5B7383', borderRadius: '0 3px 3px 0', padding: '4px 6px' }}>
                          <div style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.28, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                          <div className="fd-mono" style={{ fontSize: 8.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{e.time}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Link>

            {/* FY27 goals */}
            <div data-reveal data-section="FY27 goals" style={{ ...card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                <div>
                  <div className="fd-h2" style={{ color: 'var(--text-primary)' }}>FY27 goals</div>
                  <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Organization-wide, July 2026 to June 2027</p>
                </div>
                <button type="button" onClick={openGoals} className="fd-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace" }}>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M9.6 1.9 L12.1 4.4 L4.6 11.9 L1.6 12.4 L2.1 9.4 Z" /></svg>Edit
                </button>
              </div>
              {goals.length === 0 ? (
                <button type="button" onClick={openGoals} className="text-body-strong" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 13 }}>Add your first goal →</button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                  {goals.map(g => (
                    <div key={g.id}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}><span style={{ fontSize: 13 }}>{g.label}</span><span className="fd-mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{g.readout}</span></div>
                      <div style={{ height: 4, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${g.pct}%`, borderRadius: 3, background: 'var(--accent)', transition: 'width .5s cubic-bezier(.2,.8,.3,1)' }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity */}
            <div data-reveal data-section="Deadline load" style={{ ...card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div>
                  <div className="fd-h2" style={{ color: 'var(--text-primary)' }}>Deadline load</div>
                  <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Upcoming application deadlines by month, FY27</p>
                </div>
                <StatusTag tone="neutral">FY27</StatusTag>
              </div>
              <canvas data-chart="bars" data-values={data.monthly.join(',')} data-live={data.liveIdx} style={{ display: 'block', width: '100%', height: 128 }} />
              <div className="fd-mono" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 8.5, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                {data.months.map(m => <span key={m}>{m}</span>)}
              </div>
            </div>

            {/* Next deadlines */}
            <div data-reveal data-section="Next deadlines" style={{ ...card, padding: '18px 0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '0 20px 14px' }}>
                <div>
                  <div className="fd-h2" style={{ color: 'var(--text-primary)' }}>Next deadlines</div>
                  <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Across every open opportunity</p>
                </div>
                <Link href="/prospecting" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>View all</Link>
              </div>
              {data.deadlines.length === 0 ? (
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', padding: '4px 20px 16px' }}>No upcoming deadlines on open opportunities.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    {['Funder', 'Type', 'Due', 'Stage'].map((h, i) => (
                      <th key={h} className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', textAlign: i === 3 ? 'right' : 'left', fontWeight: 500, padding: i === 0 || i === 3 ? '8px 20px' : '8px 12px', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.deadlines.map((d, i) => {
                      const last = i === data.deadlines.length - 1;
                      const bb = last ? 'none' : '1px solid var(--border-hairline)';
                      return (
                        <tr key={i} data-calrow>
                          <td style={{ padding: '11px 20px', borderBottom: bb, fontSize: 13 }}>{d.funder}</td>
                          <td style={{ padding: '11px 12px', borderBottom: bb, fontSize: 12.5, color: 'var(--text-secondary)' }}>{d.type}</td>
                          <td className="fd-mono" style={{ padding: '11px 12px', borderBottom: bb, fontSize: 11.5 }} title={`${d.days} days`}>{d.due}</td>
                          <td style={{ padding: '11px 20px', borderBottom: bb, textAlign: 'right' }}><StatusTag tone={d.tone}>{d.stage}</StatusTag></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT RAIL */}
          <div data-dash-rail style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* Today */}
            <div data-reveal style={{ ...card, padding: '16px 17px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Today</span>
                <Link href="/calendar" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Full day</Link>
              </div>
              {data.todayEvents.length === 0 ? (
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{data.calendarConnected ? 'Nothing scheduled today.' : 'Connect your calendar to see today.'}</p>
              ) : data.todayEvents.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', paddingTop: 1, width: 38, flex: 'none' }}>{t.time}</span>
                  <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--border-hairline)', padding: '0 0 14px 12px', position: 'relative' }}>
                    <i style={{ position: 'absolute', left: -3.5, top: 4, width: 6, height: 6, borderRadius: '50%', background: t.dot === 'on' ? 'var(--accent)' : '#CFD8D3', border: '1.5px solid var(--bg-surface)' }} />
                    <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{t.title}</b>
                    {t.meta && <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{t.meta}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Needs a decision */}
            {data.needs.length > 0 && (
              <div data-reveal style={{ ...card, padding: '16px 17px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
                  <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', flex: 1 }}>Needs attention</span>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{data.needs.length}</span>
                </div>
                {data.needs.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <FileEdit style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                    <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5 }}>{it.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Ask Fundir */}
            <div data-reveal style={{ ...card, overflow: 'hidden' }}>
              <canvas data-dash-field aria-hidden="true" style={{ display: 'block', width: '100%', height: 172, pointerEvents: 'none' }} />
              <div style={{ padding: '0 18px 17px', marginTop: -8 }}>
                <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Ask Fundir</p>
                <p style={{ margin: '0 0 14px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>Search your filings, documents and funder record in plain language.</p>
                <button onClick={() => window.dispatchEvent(new CustomEvent('fundir:open-advisor'))} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 32, borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}><MessageSquare style={{ width: 13, height: 13 }} />Open assistant</button>
              </div>
            </div>
          </div>
        </div>

        <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '22px 0 0' }}>Live workspace · your Instrumentl pipeline &amp; calendar</p>
      </div>

      {/* goals modal */}
      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Edit FY27 goals" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div onClick={closeGoals} style={{ position: 'absolute', inset: 0, background: 'rgba(16,25,23,.34)', backdropFilter: 'blur(3px)', animation: 'fd-fade .22s ease both' }} />
          <div style={{ position: 'relative', width: 'min(620px,100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column', ...card, boxShadow: '0 24px 60px rgba(16,25,23,.16)', animation: 'fd-rise .26s cubic-bezier(.2,.8,.3,1) both', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '20px 22px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
              <div>
                <div className="fd-h2" style={{ color: 'var(--text-primary)' }}>FY27 goals</div>
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Organization-wide targets for July 2026 to June 2027</p>
              </div>
              <button type="button" onClick={closeGoals} aria-label="Close" style={{ width: 28, height: 28, flex: 'none', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.4 2.4 L9.6 9.6 M9.6 2.4 L2.4 9.6" /></svg>
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 22px 18px' }}>
              <div data-goal-row style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 74px 74px 92px 28px', gap: '0 10px', alignItems: 'center', padding: '12px 0 8px' }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Goal</span>
                <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', textAlign: 'right' }}>Current</span>
                <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', textAlign: 'right' }}>Target</span>
                <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Unit</span>
                <span />
              </div>
              {draft.map(g => (
                <div key={g.id} data-goal-row style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 74px 74px 92px 28px', gap: '0 10px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <input value={g.label} onChange={e => patch(g.id, 'label', e.target.value)} placeholder="Name this goal" style={{ width: '100%', fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--text-primary)', background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', padding: '7px 8px' }} />
                  <input value={String(g.current)} onChange={e => patch(g.id, 'current', e.target.value)} inputMode="decimal" style={{ width: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, textAlign: 'right', color: 'var(--text-primary)', background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', padding: '7px 8px' }} />
                  <input value={String(g.target)} onChange={e => patch(g.id, 'target', e.target.value)} inputMode="decimal" style={{ width: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, textAlign: 'right', color: 'var(--text-primary)', background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', padding: '7px 8px' }} />
                  <select value={g.unit} onChange={e => patch(g.id, 'unit', e.target.value)} style={{ width: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '6px 7px', cursor: 'pointer' }}><option value="percent">Percent</option><option value="count">Count</option><option value="currency">Dollars</option></select>
                  <button type="button" onClick={() => setDraft(d => d.filter(x => x.id !== g.id))} aria-label="Remove goal" style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 3.2 H10 M4.8 3.2 V2 H7.2 V3.2 M3.1 3.2 L3.6 10 H8.4 L8.9 3.2" /></svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setDraft(d => [...d, { id: 'new-' + Date.now(), label: '', current: 0, target: 100, unit: 'count', pct: 0, readout: '' }])} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', background: 'none', border: '1px dashed var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '9px 13px', cursor: 'pointer' }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2 V10 M2 6 H10" /></svg>Add goal
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 22px', borderTop: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}>
              <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>Visible to everyone at Chicago Youth Centers</span>
              <div style={{ display: 'flex', gap: 9 }}>
                <button type="button" onClick={closeGoals} style={{ height: 32, padding: '0 14px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={saveGoals} disabled={saving} style={{ height: 32, padding: '0 16px', borderRadius: 'var(--radius-kpi)', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save goals'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
