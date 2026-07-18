'use client';

// Dashboard console — faithful build of the "clean white console" reference:
// FIG.01 CRA Bank Intelligence, FIG.02 Urgent deadlines, FIG.03 Funder
// prospects. Every value is REAL (passed from the server page). Figure tags,
// corner brackets, tags/chips, confidence bars, count-ups, and scroll-reveal
// mirror the reference; colours are theme-token mapped so dark mode survives.

import { useEffect, useRef } from 'react';
import Link from 'next/link';

export interface CraRowVM {
  name:         string;
  relationship: 'existing' | 'prospect' | 'declined' | 'dormant';
  action:       'deepen' | 'open' | 'monitor';
  einPending:   boolean;
  rationale:    string;
  confidence:   number; // 0–100
  chips:        { name: string; amount: string }[];
  more:         number;
}
export interface DeadlineVM { title: string; agency: string; days: number; href: string; }
export interface FunderVM  { score: number; name: string; peers: number; amount: string; href?: string; }

interface DashboardConsoleProps {
  cra:       { rows: CraRowVM[]; meta: string };
  deadlines: DeadlineVM[];
  funders:   FunderVM[];
}

const REL_LABEL: Record<CraRowVM['relationship'], string> = {
  existing: 'Existing', prospect: 'Prospect', declined: 'Declined', dormant: 'Dormant',
};
const ACTION_LABEL: Record<CraRowVM['action'], string> = {
  deepen: 'Deepen', open: 'Open', monitor: 'Monitor',
};

export function DashboardConsole({ cra, deadlines, funders }: DashboardConsoleProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const counted = new WeakSet<Element>();
    const runCount = (el: HTMLElement) => {
      const target = Number(el.dataset.count || '0');
      const pre = el.dataset.pre || '';
      const suf = el.dataset.suf || '';
      if (reduce) { el.textContent = `${pre}${target}${suf}`; return; }
      const dur = 1000; let start: number | null = null;
      const step = (ts: number) => {
        if (start === null) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        el.textContent = `${pre}${Math.round(p * target)}${suf}`;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        e.target.classList.toggle('dc-in', e.isIntersecting);
        if (e.isIntersecting && !counted.has(e.target)) {
          counted.add(e.target);
          e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(runCount);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    root.querySelectorAll('[data-dc-reveal]').forEach(n => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="dc">
      <style>{`
        .dc{--dc-accent:var(--accent);--dc-accent-br:var(--accent-bright,#15917A);
          --dc-blue:var(--info,#3E6CA8);--dc-amber:var(--warning,#C0852B);--dc-crit:var(--critical,#C24E3E);
          --dc-mono:var(--font-geist-mono,ui-monospace,monospace)}

        .dc-fig{display:flex;align-items:baseline;gap:14px;margin:26px 0 13px}
        .dc-fn{font-family:var(--dc-mono);font-size:10px;letter-spacing:.14em;color:var(--dc-accent);font-weight:700;
          border:1px solid color-mix(in srgb,var(--dc-accent) 30%,transparent);border-radius:5px;padding:3px 8px;
          background:var(--accent-tint,rgba(12,107,90,.05));white-space:nowrap}
        .dc-fig h2{font-size:17.5px;font-weight:700;margin:0;color:var(--text-primary)}
        .dc-fm{margin-left:auto;font-family:var(--dc-mono);font-size:10.5px;color:var(--text-tertiary);text-align:right}

        .dc-card{background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:14px;padding:18px 20px;position:relative}
        .dc-card::before,.dc-card::after{content:"";position:absolute;width:11px;height:11px;border:1.6px solid transparent;transition:border-color .25s;pointer-events:none}
        .dc-card::before{left:-1px;top:-1px;border-right:none;border-bottom:none;border-radius:4px 0 0 0}
        .dc-card::after{right:-1px;bottom:-1px;border-left:none;border-top:none;border-radius:0 0 4px 0}
        .dc-card:hover::before,.dc-card:hover::after{border-color:color-mix(in srgb,var(--dc-accent) 70%,transparent)}

        [data-dc-reveal]{opacity:0;transform:translateY(18px);transition:opacity .6s cubic-bezier(.2,.7,.2,1),transform .6s cubic-bezier(.2,.7,.2,1)}
        [data-dc-reveal].dc-in{opacity:1;transform:none}

        /* bank rows */
        .dc-bankrow{display:flex;align-items:flex-start;gap:16px;padding:15px 0;border-bottom:1px solid var(--border-hairline)}
        .dc-bankrow:first-child{padding-top:2px}
        .dc-bankrow:last-child{border-bottom:none;padding-bottom:2px}
        .dc-bmain{flex:1;min-width:0}
        .dc-bname{font-size:15px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:9px;flex-wrap:wrap}
        .dc-tag{font-family:var(--dc-mono);font-size:8.5px;letter-spacing:.1em;padding:3px 7px;border-radius:5px;font-weight:700;text-transform:uppercase}
        .dc-tag.pros{background:color-mix(in srgb,var(--dc-blue) 12%,transparent);color:var(--dc-blue)}
        .dc-tag.open{background:var(--accent-tint,rgba(12,107,90,.09));color:var(--dc-accent)}
        .dc-tag.exist{background:color-mix(in srgb,var(--dc-accent-br) 16%,transparent);color:var(--dc-accent)}
        .dc-tag.warnt{background:color-mix(in srgb,var(--dc-amber) 15%,transparent);color:var(--dc-amber)}
        .dc-bdesc{font-size:12.5px;color:var(--text-secondary);margin-top:5px;line-height:1.5}
        .dc-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
        .dc-chip{font-family:var(--dc-mono);font-size:10.5px;border:1px solid var(--border-hairline);border-radius:6px;padding:4px 8px;color:var(--text-secondary);background:var(--bg-elevated)}
        .dc-chip b{color:var(--text-primary)}
        .dc-conf{width:120px;flex:none;text-align:right}
        .dc-cv{font-family:var(--dc-mono);font-variant-numeric:tabular-nums;font-weight:700;font-size:17px;color:var(--text-primary)}
        .dc-cbar{height:4px;background:var(--bg-elevated);border-radius:3px;margin-top:8px;overflow:hidden}
        .dc-cbar i{display:block;height:100%;width:0;background:var(--dc-accent);border-radius:3px;transition:width 1s cubic-bezier(.2,.7,.2,1)}
        [data-dc-reveal].dc-in .dc-cbar i{width:var(--w)}

        .dc-two{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}
        @media(max-width:1000px){.dc-two{grid-template-columns:1fr}}

        .dc-dline{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--border-hairline);font-size:13px;text-decoration:none}
        .dc-dline:first-child{padding-top:2px}
        .dc-dline:last-child{border-bottom:none;padding-bottom:2px}
        .dc-dd{font-family:var(--dc-mono);font-size:10px;font-weight:700;border-radius:6px;padding:4px 8px;flex:none}
        .dc-d1{background:color-mix(in srgb,var(--dc-crit) 12%,transparent);color:var(--dc-crit)}
        .dc-d2{background:color-mix(in srgb,var(--dc-amber) 14%,transparent);color:var(--dc-amber)}
        .dc-d3{background:var(--bg-elevated);color:var(--text-tertiary)}
        .dc-dt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary)}
        .dc-dline:hover .dc-dt{color:var(--dc-accent)}
        .dc-da{font-family:var(--dc-mono);font-size:10.5px;color:var(--text-tertiary);flex:none}

        .dc-prow{display:flex;align-items:center;gap:13px;padding:11px 0;border-bottom:1px solid var(--border-hairline);text-decoration:none}
        .dc-prow:first-child{padding-top:2px}
        .dc-prow:last-child{border-bottom:none;padding-bottom:2px}
        .dc-psc{font-family:var(--dc-mono);font-weight:700;font-size:13px;width:36px;height:36px;flex:none;border-radius:8px;
          display:flex;align-items:center;justify-content:center;background:var(--accent-tint,rgba(12,107,90,.07));
          color:var(--dc-accent);border:1px solid color-mix(in srgb,var(--dc-accent) 20%,transparent)}
        .dc-pn{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .dc-prow:hover .dc-pn{color:var(--dc-accent)}
        .dc-pm{font-family:var(--dc-mono);font-size:10.5px;color:var(--text-tertiary);flex:none}
        .dc-empty{font-size:12.5px;color:var(--text-tertiary);padding:14px 0 2px}

        @media(prefers-reduced-motion:reduce){
          [data-dc-reveal]{transition:none;opacity:1;transform:none}
          .dc-cbar i{transition:none}
        }
      `}</style>

      {/* ── FIG.01 · CRA Bank Intelligence ─────────────────────────────── */}
      <div className="dc-fig">
        <span className="dc-fn">FIG. 01</span>
        <h2>CRA Bank Intelligence</h2>
        <span className="dc-fm">{cra.meta}</span>
      </div>
      <div className="dc-card" data-dc-reveal>
        {cra.rows.length === 0 ? (
          <p className="dc-empty">No CRA banks currently reach your service area. Confirm your primary address in Settings and re-run the CRA refresh.</p>
        ) : cra.rows.map((r, i) => (
          <div key={i} className="dc-bankrow">
            <div className="dc-bmain">
              <div className="dc-bname">
                {r.name}
                <span className={`dc-tag ${r.relationship === 'existing' ? 'exist' : 'pros'}`}>{REL_LABEL[r.relationship]}</span>
                <span className={`dc-tag ${r.action === 'open' ? 'open' : r.action === 'deepen' ? 'exist' : 'warnt'}`}>{ACTION_LABEL[r.action]}</span>
                {r.einPending && <span className="dc-tag warnt">EIN pending</span>}
              </div>
              <div className="dc-bdesc">{r.rationale}</div>
              {r.chips.length > 0 && (
                <div className="dc-chips">
                  {r.chips.map((c, j) => (
                    <span key={j} className="dc-chip">{c.name} <b>{c.amount}</b></span>
                  ))}
                  {r.more > 0 && <span className="dc-chip">+{r.more} more</span>}
                </div>
              )}
            </div>
            <div className="dc-conf">
              <div className="dc-cv" data-count={r.confidence}>0</div>
              <div className="dc-cbar"><i style={{ '--w': `${Math.max(0, Math.min(100, r.confidence))}%` } as React.CSSProperties} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* ── FIG.02 Deadlines · FIG.03 Funder prospects ─────────────────── */}
      <div className="dc-two" style={{ marginTop: 22 }}>
        <div>
          <div className="dc-fig">
            <span className="dc-fn">FIG. 02</span>
            <h2>Urgent deadlines</h2>
            <span className="dc-fm">{deadlines.length ? `${deadlines.length} within 14 days` : 'none within 14 days'}</span>
          </div>
          <div className="dc-card" data-dc-reveal>
            {deadlines.length === 0 ? (
              <p className="dc-empty">No deadlines closing within 14 days.</p>
            ) : deadlines.map((d, i) => (
              <Link key={i} href={d.href} className="dc-dline">
                <span className={`dc-dd ${d.days <= 1 ? 'dc-d1' : d.days <= 7 ? 'dc-d2' : 'dc-d3'}`}>{d.days}d</span>
                <span className="dc-dt">{d.title}</span>
                <span className="dc-da">{d.agency}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="dc-fig">
            <span className="dc-fn">FIG. 03</span>
            <h2>Funder prospects</h2>
            <span className="dc-fm">ranked by peer-anchored fit</span>
          </div>
          <div className="dc-card" data-dc-reveal>
            {funders.length === 0 ? (
              <p className="dc-empty">Funder prospects appear once the 990 peer-graph ingest and scorer have run.</p>
            ) : funders.map((f, i) => {
              const inner = (
                <>
                  <span className="dc-psc" data-count={f.score}>0</span>
                  <span className="dc-pn">{f.name}</span>
                  <span className="dc-pm">{f.peers} peers · {f.amount}</span>
                </>
              );
              return f.href
                ? <Link key={i} href={f.href} className="dc-prow">{inner}</Link>
                : <div key={i} className="dc-prow">{inner}</div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
