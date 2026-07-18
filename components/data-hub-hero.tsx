'use client';

// Data Hub hero — adapted from the landing-sections reference: data-source
// icons travel along roads into the Fundir app tile. Reframed for the Data
// Hub: it's CYC's OWN numbers and documents flowing in (site metrics,
// program outcomes, 990s, OneDrive documents), not external sources.

import { useEffect, useRef } from 'react';

const ROADS = [
  "M -30 170 H 300 Q 344 170 344 214 V 306 Q 344 350 388 350 H 452",
  "M 1150 120 H 836 Q 792 120 792 164 V 258 Q 792 302 748 302 H 672",
  "M -30 520 H 262 Q 306 520 306 476 V 440 Q 306 396 350 396 H 452",
  "M 1150 566 H 884 Q 840 566 840 522 V 440 Q 840 396 796 396 H 672",
  "M 560 -30 V 56 Q 560 100 604 100 H 986 Q 1030 100 1030 56 V -30",
  "M 128 670 V 596 Q 128 552 172 552 H 440",
];

// gold = site metrics · blue = program outcomes · teal = filings · sage = documents
type Tone = 'gold' | 'blue' | 'teal' | 'sage';

interface Traveler {
  tone: Tone;
  road: number;
  duration: number;
  delay: number;
  icon: React.ReactNode;
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const TRAVELERS: Traveler[] = [
  // clipboard (site pulse)
  { tone: 'gold', road: 0, duration: 13, delay: 0, icon: (
    <svg viewBox="0 0 24 24" {...S}><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/></svg>) },
  // dollar (financials)
  { tone: 'teal', road: 0, duration: 13, delay: 6.5, icon: (
    <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.4-2.5 1.8-2.5.8-2.5 1.8 1 1.7 2.5 1.7 2.5-.7 2.5-1.7"/></svg>) },
  // bar chart (attendance / enrollment)
  { tone: 'gold', road: 1, duration: 14, delay: 2, icon: (
    <svg viewBox="0 0 24 24" {...S}><path d="M4 20V9M10 20V4M16 20v-8M21 20H3"/></svg>) },
  // people (youth served)
  { tone: 'blue', road: 1, duration: 14, delay: 9, icon: (
    <svg viewBox="0 0 24 24" {...S}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M14.5 20c.4-2.3 1.6-3.8 3.4-4.2"/></svg>) },
  // graduation (program outcomes)
  { tone: 'blue', road: 2, duration: 15, delay: 1, icon: (
    <svg viewBox="0 0 24 24" {...S}><path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5V16c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7v-4.5M20.5 10v5"/></svg>) },
  // map pin (sites)
  { tone: 'sage', road: 2, duration: 15, delay: 8, icon: (
    <svg viewBox="0 0 24 24" {...S}><path d="M12 21s-6.5-5.3-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.7 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.3"/></svg>) },
  // document (990s)
  { tone: 'teal', road: 3, duration: 13.6, delay: 4, icon: (
    <svg viewBox="0 0 24 24" {...S}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 13h5M10 17h5"/></svg>) },
  // shield (audited statements)
  { tone: 'teal', road: 3, duration: 13.6, delay: 10.5, icon: (
    <svg viewBox="0 0 24 24" {...S}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>) },
  // folder (OneDrive documents)
  { tone: 'sage', road: 4, duration: 16, delay: 3, icon: (
    <svg viewBox="0 0 24 24" {...S}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>) },
  // calendar (monthly pulse)
  { tone: 'gold', road: 5, duration: 11, delay: 5.5, icon: (
    <svg viewBox="0 0 24 24" {...S}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>) },
];

const LEGEND = [
  { tone: 'gold' as Tone, label: 'Site metrics · attendance, enrollment' },
  { tone: 'blue' as Tone, label: 'Program outcomes' },
  { tone: 'teal' as Tone, label: '990s & audited financials' },
  { tone: 'sage' as Tone, label: 'Documents · OneDrive' },
];

export function DataHubHero({ orgName = 'Chicago Youth Centers' }: { orgName?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const short = orgName.split(/\s+/).map(w => w[0]).join('').toUpperCase();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      es => es.forEach(e => e.target.classList.toggle('dh-in', e.isIntersecting)),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    root.querySelectorAll('[data-dh-reveal]').forEach(n => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="dh-hero">
      <style>{`
        .dh-hero{--dh-gold:var(--warning,#C0852B);--dh-blue:var(--info,#3E6CA8);--dh-teal:#15917A;--dh-sage:var(--accent,#0C6B5A);
          background:var(--bg-surface);border-bottom:1px solid var(--border-hairline);overflow:hidden}
        .dh-center{max-width:880px;margin:0 auto;text-align:center;padding:44px 26px 0}
        .dh-pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:7px 14px;font-size:11px;font-weight:700;
          letter-spacing:.08em;text-transform:uppercase;color:var(--accent);background:var(--accent-tint,rgba(12,107,90,.10))}
        .dh-h2{font-size:clamp(26px,3.6vw,38px);font-weight:800;letter-spacing:-.025em;line-height:1.08;margin:16px 0 0;color:var(--text-primary)}
        .dh-sub{color:var(--text-secondary);font-size:14.5px;line-height:1.65;max-width:64ch;margin:14px auto 0}
        [data-dh-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
        [data-dh-reveal].dh-in{opacity:1;transform:none}

        .dh-stagewrap{position:relative;margin:0 auto;width:1120px;max-width:100%;height:540px}
        .dh-stage{position:absolute;left:50%;top:0;width:1120px;height:640px;transform:translateX(-50%) scale(.84);transform-origin:top center}
        .dh-stage svg.dh-roads{position:absolute;inset:0;width:1120px;height:640px}
        .dh-road{fill:none;stroke:var(--bg-elevated);stroke-width:13;stroke-linecap:round;stroke-linejoin:round}
        .dh-roadline{fill:none;stroke:var(--bg-surface);stroke-width:2;stroke-dasharray:8 10;stroke-linecap:round;opacity:.9}

        .dh-badge{position:absolute;width:56px;height:56px;border-radius:50%;background:var(--bg-surface);border:1px solid var(--border-hairline);
          box-shadow:0 10px 24px rgba(23,28,60,.10),0 2px 6px rgba(23,28,60,.05);
          display:flex;align-items:center;justify-content:center;offset-rotate:0deg;opacity:0}
        .dh-badge svg{width:24px;height:24px}
        .dh-gold{color:var(--dh-gold)} .dh-blue{color:var(--dh-blue)} .dh-teal{color:var(--dh-teal)} .dh-sage{color:var(--dh-sage)}
        @keyframes dhTravel{0%{offset-distance:0%;opacity:0}6%{opacity:1}80%{opacity:1}92%{offset-distance:100%;opacity:0}100%{offset-distance:100%;opacity:0}}

        .dh-hero3d{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:380px;height:380px;pointer-events:none}
        .dh-contact{position:absolute;left:50%;top:73%;width:300px;height:86px;transform:translateX(-50%);
          background:radial-gradient(closest-side,rgba(28,38,66,.28),transparent 72%);filter:blur(8px)}
        .dh-float{position:absolute;inset:0;animation:dhBob 6.5s ease-in-out infinite}
        @keyframes dhBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        .dh-app3d{position:absolute;left:50%;top:50%;width:252px;height:252px;
          transform:translate(-50%,-56%) perspective(1250px) rotateX(52deg) rotateZ(-40deg);
          transform-style:preserve-3d;border-radius:42px;background:linear-gradient(145deg,#FFFFFF,#EDF0F5)}
        .dh-app3d::before{content:"";position:absolute;inset:0;border-radius:42px;
          background:linear-gradient(145deg,#DEE3EA,#CBD2DC);transform:translateZ(-20px)}
        .dh-app3d::after{content:"";position:absolute;inset:0;border-radius:42px;
          background:linear-gradient(115deg,rgba(255,255,255,.85),rgba(255,255,255,0) 48%);
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.85), inset 0 -18px 30px rgba(96,110,138,.10)}
        .dh-facemark{position:absolute;inset:11%;transform:translateZ(2px) rotate(-1deg);display:flex;align-items:center;justify-content:center}
        .dh-facemark svg{width:100%;height:auto;filter:drop-shadow(6px 10px 10px rgba(20,60,48,.22))}

        .dh-legend{display:flex;justify-content:center;gap:26px;flex-wrap:wrap;padding:2px 20px 34px}
        .dh-src{font-size:12.5px;color:var(--text-tertiary);display:flex;align-items:center;gap:8px;font-weight:500}
        .dh-src i{width:8px;height:8px;border-radius:3px;display:inline-block}
        .dh-i-gold{background:var(--dh-gold)} .dh-i-blue{background:var(--dh-blue)} .dh-i-teal{background:var(--dh-teal)} .dh-i-sage{background:var(--dh-sage)}

        @media(max-width:1120px){
          .dh-stagewrap{height:auto}
          .dh-stage{position:relative;left:auto;top:auto;transform:none;width:100%;height:auto;padding:10px 0 20px}
          .dh-stage svg.dh-roads,.dh-badge{display:none}
          .dh-hero3d{position:relative;left:auto;top:auto;transform:none;margin:0 auto;height:360px}
        }
        @media(prefers-reduced-motion:reduce){
          .dh-badge{animation:none!important;offset-distance:40%;opacity:1}
          .dh-float{animation:none}
          [data-dh-reveal]{transition:none;opacity:1;transform:none}
        }
      `}</style>

      <div className="dh-center">
        <span className="dh-pill" data-dh-reveal>{short} Data Hub</span>
        <h2 className="dh-h2 dh-in" data-dh-reveal style={{ transitionDelay: '.07s' }}>
          Every number {short} reports,<br />in one place.
        </h2>
        <p className="dh-sub" data-dh-reveal style={{ transitionDelay: '.14s' }}>
          Attendance, enrollment, program outcomes, 990s — site directors and staff add them
          here, and everything lands in one shared workbook in {short}&rsquo;s OneDrive.
          Add it once and everyone sees it: on this page, in Excel, and in every
          grant application Fundir helps build.
        </p>
      </div>

      <div className="dh-stagewrap" data-dh-reveal style={{ transitionDelay: '.18s' }}>
        <div className="dh-stage">
          <svg className="dh-roads" viewBox="0 0 1120 640" aria-hidden="true">
            {ROADS.map((d, i) => <path key={`r${i}`} className="dh-road" d={d} />)}
            {ROADS.map((d, i) => <path key={`l${i}`} className="dh-roadline" d={d} />)}
          </svg>

          {TRAVELERS.map((t, i) => (
            <div
              key={i}
              className={`dh-badge dh-${t.tone}`}
              style={{
                offsetPath: `path('${ROADS[t.road]}')`,
                animation: `dhTravel ${t.duration}s linear infinite`,
                animationDelay: `${t.delay}s`,
              } as React.CSSProperties}
            >
              {t.icon}
            </div>
          ))}

          <div className="dh-hero3d">
            <div className="dh-contact" />
            <div className="dh-float">
              <div className="dh-app3d">
                <div className="dh-facemark">
                  <svg viewBox="0 0 128 108" role="img" aria-label="Fundir">
                    <circle cx="68" cy="54" r="40" fill="var(--accent, #0C6B5A)" />
                    <circle cx="68" cy="54" r="40" fill="none" stroke="rgba(10,40,30,.14)" strokeWidth="1.4" />
                    <ellipse cx="55" cy="36" rx="19" ry="10" fill="#FFFFFF" opacity=".10" />
                    <g fill="rgba(6,52,42,.30)" transform="translate(1.1,1.5)">
                      <rect x="10" y="42" width="76" height="10.5" rx="2" />
                      <polygon points="86,33.5 112,47.2 86,61" />
                      <rect x="44" y="59" width="30" height="10.5" rx="2" />
                      <rect x="36" y="59" width="10.5" height="38" rx="3" transform="rotate(11 41.2 59)" />
                    </g>
                    <g fill="#FFFFFF">
                      <rect x="10" y="42" width="76" height="10.5" rx="2" />
                      <polygon points="86,33.5 112,47.2 86,61" />
                      <rect x="44" y="59" width="30" height="10.5" rx="2" />
                      <rect x="36" y="59" width="10.5" height="38" rx="3" transform="rotate(11 41.2 59)" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dh-legend" data-dh-reveal>
        {LEGEND.map(l => (
          <span key={l.label} className="dh-src"><i className={`dh-i-${l.tone}`} />{l.label}</span>
        ))}
      </div>
    </div>
  );
}
