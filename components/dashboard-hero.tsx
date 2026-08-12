'use client';

// ⚠ PARKED — not currently rendered anywhere (removed from /dashboard on
// 2026-08-12 in favor of <CycHeroTransform/>). Kept intentionally so the
// CYC × Fundir co-brand lockup with the animated data pulse (the circle that
// travels between the two logos) can be re-implemented later. To bring it
// back, import { DashboardHero } into app/dashboard/page.tsx and restore the
// hero inputs (today, sources, syncedLabel, tickerMessages, heroKpis) — see
// git history for that commit. Do not delete.
//
// Dashboard hero — the "clean white console" treatment (from the reference):
// a provenance strip, an org × Fundir co-brand lockup with an animated data
// pulse, a rotating system ticker, and an animated KPI strip (count-up +
// corner brackets + a subtle spark). Every value here is REAL — passed in
// from the server page. The sparklines are decorative accents (we don't yet
// compute period-over-period trend); wire them to real deltas later.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export interface HeroKpi {
  label:   string;
  value:   number;
  pre?:    string;
  suf?:    string;
  caption: string;
  tone?:   'accent' | 'warning' | 'critical';
  spark:   string; // SVG polyline points — decorative
}

interface DashboardHeroProps {
  orgName:        string;
  logoUrl:        string | null;
  today:          string;
  ein:            string | null;
  sources:        string;
  syncedLabel:    string;
  tickerMessages: string[];
  kpis:           HeroKpi[];
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

function CountUp({ target, pre = '', suf = '', go }: { target: number; pre?: string; suf?: string; go: boolean }) {
  const [n, setN] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!go || started.current) return;
    started.current = true;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(target); return;
    }
    const dur = 1000; let raf = 0; let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setN(Math.round(p * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [go, target]);
  return <>{pre}{n.toLocaleString()}{suf}</>;
}

export function DashboardHero({
  orgName, logoUrl, today, ein, sources, syncedLabel, tickerMessages, kpis,
}: DashboardHeroProps) {
  const [go, setGo]   = useState(false);
  const [tick, setTick] = useState(0);
  const short = initials(orgName);

  useEffect(() => {
    const t = setTimeout(() => setGo(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (tickerMessages.length < 2) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setTick(t => (t + 1) % tickerMessages.length), 4200);
    return () => clearInterval(id);
  }, [tickerMessages.length]);

  return (
    <div className={`dh2 bg-surface border border-hairline rounded-sm overflow-hidden ${go ? 'dh2-go' : ''}`}>
      <style>{`
        .dh2{--dh2-accent:var(--accent);--dh2-accent-br:var(--accent-bright,#15917A);position:relative;padding:16px 22px 22px}
        .dh2-prov{display:flex;justify-content:flex-end;gap:16px;flex-wrap:wrap;font-family:var(--font-geist-mono,ui-monospace,monospace);
          font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-tertiary)}
        .dh2-prov b{color:var(--text-secondary);font-weight:600}
        .dh2-live{display:inline-flex;align-items:center;gap:6px}
        .dh2-live i{width:6px;height:6px;border-radius:50%;background:var(--dh2-accent-br);animation:dh2blink 2.4s infinite}
        @keyframes dh2blink{0%,100%{opacity:1}50%{opacity:.3}}

        .dh2-row{display:flex;align-items:flex-start;justify-content:space-between;gap:26px;margin-top:8px;flex-wrap:wrap}
        .dh2-eyebrow{font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-tertiary)}
        .dh2-h1{font-size:27px;font-weight:800;letter-spacing:-.022em;margin:7px 0 0;color:var(--text-primary);line-height:1.05}
        .dh2-ticker{margin-top:11px;height:20px;position:relative;font-family:var(--font-geist-mono,ui-monospace,monospace);
          font-size:11.5px;color:var(--dh2-accent);overflow:hidden;min-width:280px;max-width:min(70vw,560px)}
        .dh2-ticker span{position:absolute;left:0;top:0;opacity:0;transition:opacity .5s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        .dh2-ticker span.on{opacity:1}
        .dh2-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
        .dh2-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;
          text-decoration:none;transition:background-color .15s,color .15s,border-color .15s}
        .dh2-btn-p{background:var(--dh2-accent);color:var(--accent-on,#fff)}
        .dh2-btn-p:hover{background:var(--accent-hover,#0A5648)}
        .dh2-btn-s{border:1px solid var(--border-hairline);color:var(--text-primary);background:var(--bg-surface)}
        .dh2-btn-s:hover{background:var(--bg-elevated)}

        .dh2-lockup{display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:2px;flex-shrink:0}
        .dh2-lockrow{display:flex;align-items:center}
        .dh2-badge{width:46px;height:46px;border-radius:11px;display:flex;align-items:center;justify-content:center;overflow:hidden;
          background:var(--bg-elevated);border:1px solid var(--border-hairline);opacity:0;transform:scale(.92);
          transition:opacity .6s cubic-bezier(.2,.7,.2,1),transform .6s cubic-bezier(.2,.7,.2,1)}
        .dh2-badge img{width:100%;height:100%;object-fit:contain;padding:6px}
        .dh2-badge.dh2-second{transition-delay:.25s}
        .dh2-badge.dh2-org{font-weight:800;font-size:14px;color:var(--text-secondary)}
        .dh2-go .dh2-badge{opacity:1;transform:none}
        .dh2-conn{position:relative;width:96px;height:20px;margin:0 9px}
        .dh2-connline{position:absolute;left:4px;right:4px;top:9px;border-top:2px dotted var(--border-strong,var(--border-hairline));opacity:0;transition:opacity .7s .3s}
        .dh2-go .dh2-connline{opacity:1}
        .dh2-pulse{position:absolute;top:6px;left:0;width:8px;height:8px;border-radius:50%;background:var(--dh2-accent-br);box-shadow:0 0 8px rgba(21,145,122,.55);opacity:0}
        .dh2-go .dh2-pulse{animation:dh2pmove 3.2s ease-in-out 1s infinite}
        @keyframes dh2pmove{0%{left:0;opacity:0}12%{opacity:1}88%{opacity:1}100%{left:calc(100% - 8px);opacity:0}}
        .dh2-lockcap{font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:8.5px;letter-spacing:.18em;color:var(--text-tertiary)}

        .dh2-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px}
        @media(max-width:900px){.dh2-kpis{grid-template-columns:repeat(2,1fr)}}
        .dh2-kpi{border:1px solid var(--border-hairline);border-radius:12px;padding:13px 15px;background:var(--bg-surface);position:relative}
        .dh2-kpi::before,.dh2-kpi::after{content:"";position:absolute;width:10px;height:10px;border:1.6px solid transparent;transition:border-color .25s}
        .dh2-kpi::before{left:-1px;top:-1px;border-right:none;border-bottom:none;border-radius:4px 0 0 0}
        .dh2-kpi::after{right:-1px;bottom:-1px;border-left:none;border-top:none;border-radius:0 0 4px 0}
        .dh2-kpi:hover::before,.dh2-kpi:hover::after{border-color:color-mix(in srgb,var(--dh2-accent) 70%,transparent)}
        .dh2-k{font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:9px;letter-spacing:.11em;text-transform:uppercase;
          color:var(--text-tertiary);display:flex;justify-content:space-between;align-items:center}
        .dh2-k .dot{width:6px;height:6px;border-radius:50%;background:var(--dh2-accent-br)}
        .dh2-v{font-family:var(--font-geist-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;font-weight:700;font-size:23px;letter-spacing:-.02em;margin-top:6px;color:var(--text-primary)}
        .dh2-kpi.warn .dh2-v{color:var(--warning,#C0852B)} .dh2-kpi.crit .dh2-v{color:var(--critical,#C24E3E)}
        .dh2-kpi.warn .dot{background:var(--warning,#C0852B)} .dh2-kpi.crit .dot{background:var(--critical,#C24E3E)}
        .dh2-s{font-size:10.5px;color:var(--text-secondary);margin-top:3px}
        .dh2-kpi svg{position:absolute;right:12px;bottom:11px;width:60px;height:22px}
        .dh2-spark{fill:none;stroke:var(--dh2-accent-br);stroke-width:2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)}
        .dh2-go .dh2-spark{stroke-dashoffset:0}
        .dh2-kpi.warn .dh2-spark{stroke:var(--warning,#C0852B)} .dh2-kpi.crit .dh2-spark{stroke:var(--critical,#C24E3E)}

        .dh2-underline{position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--dh2-accent),var(--dh2-accent-br));transform:scaleX(0);transform-origin:left;transition:transform 1.1s cubic-bezier(.2,.7,.2,1) .3s}
        .dh2-go .dh2-underline{transform:scaleX(1)}

        @media(prefers-reduced-motion:reduce){
          .dh2-live i,.dh2-pulse{animation:none}
          .dh2-badge{opacity:1;transform:none}.dh2-connline{opacity:1}
          .dh2-spark{transition:none;stroke-dashoffset:0}.dh2-underline{transition:none;transform:scaleX(1)}
        }
      `}</style>

      {/* provenance strip */}
      <div className="dh2-prov">
        <span className="dh2-live"><i />{' '}<b>Live</b></span>
        {ein && <span>EIN <b>{ein}</b></span>}
        {sources && <span>Sources <b>{sources}</b></span>}
        <span>Synced <b>{syncedLabel}</b></span>
      </div>

      <div className="dh2-row">
        <div style={{ minWidth: 0 }}>
          <div className="dh2-eyebrow">{today}</div>
          <h1 className="dh2-h1">{orgName}</h1>

          {tickerMessages.length > 0 && (
            <div className="dh2-ticker" aria-live="polite">
              {tickerMessages.map((m, i) => (
                <span key={i} className={i === tick ? 'on' : ''}>{m}</span>
              ))}
            </div>
          )}

          <div className="dh2-actions">
            <Link href="/discover" className="dh2-btn dh2-btn-p"><Sparkles className="w-3.5 h-3.5" /> Run discovery</Link>
            <Link href="/pipeline" className="dh2-btn dh2-btn-s">Open pipeline</Link>
          </div>
        </div>

        {/* co-brand lockup */}
        <div className="dh2-lockup">
          <div className="dh2-lockrow">
            <div className="dh2-badge dh2-org">
              {logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logoUrl} alt={orgName} />
                : short}
            </div>
            <div className="dh2-conn"><div className="dh2-connline" /><div className="dh2-pulse" /></div>
            <div className="dh2-badge dh2-second">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/fundir-logo.png" alt="Fundir" />
            </div>
          </div>
          <div className="dh2-lockcap">{short} × FUNDIR · PRIVATE TENANT</div>
        </div>
      </div>

      {/* animated KPI strip */}
      {kpis.length > 0 && (
        <div className="dh2-kpis">
          {kpis.map((k, i) => (
            <div key={i} className={`dh2-kpi ${k.tone === 'warning' ? 'warn' : k.tone === 'critical' ? 'crit' : ''}`}>
              <div className="dh2-k">{k.label} <span className="dot" /></div>
              <div className="dh2-v"><CountUp target={k.value} pre={k.pre} suf={k.suf} go={go} /></div>
              <div className="dh2-s">{k.caption}</div>
              <svg viewBox="0 0 64 24" aria-hidden="true">
                <polyline className="dh2-spark" pathLength={1} points={k.spark} />
              </svg>
            </div>
          ))}
        </div>
      )}

      <div className="dh2-underline" />
    </div>
  );
}
