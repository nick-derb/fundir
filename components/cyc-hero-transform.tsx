'use client';

/* ==================================================================
   CycHeroTransform — post-login hero for a Fundir tenant workspace.

   ~6.4s (uniformly tunable via TIME_SCALE), plays once per browser session
   (sessionStorage-gated), then holds a completely static rest state.

   Integration notes (vs. the original .jsx drop):
   - Fonts are self-hosted via Fontsource (imported below) instead of a
     Google Fonts @import — this app can't do build-time font fetches
     and we avoid an external runtime request. Family names are the
     Fontsource variable families ('Inter Variable' / 'JetBrains Mono
     Variable').
   - Once-per-session gating uses sessionStorage keyed by tenant, not a
     module-scope flag, so it survives reloads within a session.
   - Bind org/tagline/locality/site to the tenant record via props.
================================================================== */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

const CYC = { teal: '#55BBB7', green: '#74B843', gray: '#919195' };
const DOOR = '#01AAC5';
const INK = '#14181A';
const RULE = '#D9DDDB';
const MUTED = '#6B7371';
const PAPER = '#FBFBFA';
const FUNDIR = '#0C6B5A';

/* ----------------------------- geometry ----------------------------- */

const BASE = 300;

const BLOCKS: Array<[number, number, number]> = [
  [40, 240, 34], [78, 214, 26], [108, 252, 40], [152, 196, 30],
  [186, 232, 44], [234, 168, 28], [266, 246, 34], [354, 210, 24],
  [382, 176, 38], [424, 244, 30], [458, 150, 34], [496, 222, 40],
  [578, 258, 44], /* <- the block the camera commits to */
  [628, 200, 30], [662, 238, 36], [702, 158, 32], [738, 214, 42],
  [826, 226, 28], [858, 190, 40], [902, 248, 32], [938, 208, 36],
  [978, 236, 30], [1012, 176, 34], [1050, 244, 42], [1096, 212, 26],
  [1126, 250, 34],
];

const SPIRES: Array<[string, number]> = [
  ['M304 300L304 140L316 140L316 120L322 120L322 104L338 104L338 120L344 120L344 140L350 140L350 300', 304],
  ['M326 104L326 62M332 104L332 68', 326],
  ['M540 300L549 104L571 104L580 300', 540],
  ['M554 104L554 58M566 104L566 64', 554],
  ['M786 300L786 170L792 170L792 146L797 146L797 126L811 126L811 146L816 146L816 170L822 170L822 300', 786],
  ['M804 126L804 74', 804],
];

const TRAILS: Array<[number, number, number]> = [[60, 900, 316], [120, 1010, 330], [200, 760, 344]];

const outline = (x: number, t: number, w: number) => `M${x} ${BASE}L${x} ${t}L${x + w} ${t}L${x + w} ${BASE}`;
const floors = (x: number, t: number, w: number) => {
  let d = '';
  for (let y = t + 17; y < BASE - 8; y += 17) d += `M${x + 3} ${y}L${x + w - 3} ${y}`;
  return d;
};
const stagger = (x: number) => `${((x / 1200) * 0.62).toFixed(2)}s`;

/* facade */
const ARCH_Y = 286;
const ARCH_R = 24;
const ARCHES = [464, 524, 676, 736];
const archPath = (cx: number) =>
  `M${cx - ARCH_R} 320L${cx - ARCH_R} ${ARCH_Y}A${ARCH_R} ${ARCH_R} 0 0 1 ${cx + ARCH_R} ${ARCH_Y}L${cx + ARCH_R} 320Z`;

const UPPER = [457, 517, 577, 637, 697];
const upperWindow = (x: number) => {
  const y = 150, w = 46, h = 62;
  return (
    `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z` +
    `M${x + w / 2} ${y}L${x + w / 2} ${y + h}` +
    `M${x} ${y + h / 3}L${x + w} ${y + h / 3}` +
    `M${x} ${y + (2 * h) / 3}L${x + w} ${y + (2 * h) / 3}`
  );
};

const dentils = () => {
  let d = '';
  for (let x = 432; x <= 768; x += 15) d += `M${x} 112L${x} 124`;
  return d;
};

/* mark */
const R = 26;
const LOCK_Y = 168;
const MARK = {
  teal: { x: 96, y: LOCK_Y, r: R },
  green: { x: 96 + 1.481 * R, y: LOCK_Y, r: R },
  gray: { x: 96 + 0.731 * R, y: LOCK_Y + 1.404 * R, r: R },
};
const SRC = {
  teal: { x: 600, y: ARCH_Y, r: 34 },
  green: { x: 736, y: ARCH_Y, r: ARCH_R },
  gray: { x: 464, y: ARCH_Y, r: ARCH_R },
};
const MID = {
  teal: { x: 380, y: 148, r: 30 },
  green: { x: 476, y: 116, r: 26 },
  gray: { x: 300, y: 222, r: 26 },
};

/* ------------------------------ defaults ---------------------------- */

export interface HeroOrg {
  name: string[] | string;
  tagline: string;
  locality: string;
  site: string;
}

export const CYC_TENANT: HeroOrg = {
  name: ['Chicago', 'Youth', 'Centers'],
  tagline: 'Where possibility lives',
  locality: 'North Lawndale',
  site: 'Sidney Epstein Center',
};

/* ------------------------------- styles ----------------------------- */

// One knob to slow (or speed up) the whole sequence: every time literal — both
// in the CSS below and in the inline --d delays — is multiplied by TIME_SCALE,
// so phases stay in sync. 1 = the original ~4.9s; 1.3 ≈ 6.4s.
const TIME_SCALE = 1.3;
const scaleTimes = (str: string): string =>
  str.replace(/(\d*\.?\d+)s(?=[\s,;})]|$)/g, (_m, n) => `${+(parseFloat(n) * TIME_SCALE).toFixed(3)}s`);

type Vars = React.CSSProperties & Record<`--${string}`, string>;
const v = (d: string): Vars => ({ '--d': scaleTimes(d) } as Vars);

const flight = (
  name: string,
  a: { x: number; y: number; r: number },
  m: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
) => `
@keyframes ${name}{
 0%{transform:translate(${a.x}px,${a.y}px) scale(${a.r});opacity:0}
 12%{opacity:1}
 52%{transform:translate(${m.x}px,${m.y}px) scale(${m.r})}
 100%{transform:translate(${b.x}px,${b.y}px) scale(${b.r});opacity:1}
}`;

const CSS = scaleTimes(`
.cyc-hero{position:relative;width:100%;background:${PAPER};border:1px solid ${RULE};border-radius:8px;overflow:hidden}
.cyc-hero svg{display:block;width:100%;height:auto}
.cyc-hero text{font-family:'JetBrains Mono Variable',ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.cyc-hero .word{font-family:'Inter Variable',system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:800;letter-spacing:-.018em}

/* rest state IS the base state — no animation, no motion */
.sk-live{opacity:0}
.sk-ghost{opacity:.045}
.facade{opacity:0}
.reticle{opacity:0}
.locator{opacity:0}
.mk-teal{transform:translate(${MARK.teal.x}px,${MARK.teal.y}px) scale(${MARK.teal.r})}
.mk-green{transform:translate(${MARK.green.x}px,${MARK.green.y}px) scale(${MARK.green.r})}
.mk-gray{transform:translate(${MARK.gray.x}px,${MARK.gray.y}px) scale(${MARK.gray.r})}
.wipe{width:780px}

/* the run */
.animate .sk-live{animation:skIn .16s linear forwards,push 1.5s cubic-bezier(.55,0,.85,.42) 1.10s forwards}
.animate .draw{stroke-dashoffset:1;animation:draw .55s cubic-bezier(.3,.7,.4,1) var(--d,0s) forwards}
.animate .sk-ghost{opacity:0;animation:ghostIn .6s ease-out 3.55s forwards}
.animate .facade{animation:facadeIn .9s cubic-bezier(.2,.7,.3,1) 1.80s forwards,facadeOut .4s ease-in 3.25s forwards}
.animate .reticle{opacity:1;animation:retOut .25s ease-in 2.55s forwards}
.animate .ret-tl{animation:retTL 1.6s cubic-bezier(.5,0,.2,1) .65s forwards}
.animate .ret-tr{animation:retTR 1.6s cubic-bezier(.5,0,.2,1) .65s forwards}
.animate .ret-bl{animation:retBL 1.6s cubic-bezier(.5,0,.2,1) .65s forwards}
.animate .ret-br{animation:retBR 1.6s cubic-bezier(.5,0,.2,1) .65s forwards}
.animate .locator{opacity:1}
.animate .loc{opacity:0;animation:locStep 1.05s ease-out var(--d) forwards}
.animate .doorfill{opacity:0;animation:doorIn .35s ease-out 2.75s forwards}
.animate .arch-src{animation:archOut .28s ease-in 3.05s forwards}
.animate .mk-teal{animation:flyTeal .8s cubic-bezier(.45,.05,.2,1) 3.10s both}
.animate .mk-green{animation:flyGreen .8s cubic-bezier(.45,.05,.2,1) 3.19s both}
.animate .mk-gray{animation:flyGray .8s cubic-bezier(.45,.05,.2,1) 3.28s both}
.animate .wipe{width:0;animation:wipe .62s cubic-bezier(.2,.8,.3,1) 3.88s forwards}
.animate .rest{opacity:0;animation:restIn .45s ease-out var(--d,4.1s) forwards}

@keyframes skIn{to{opacity:1}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes push{0%{transform:scale(1);opacity:1}55%{opacity:.5}100%{transform:scale(3.6);opacity:0}}
@keyframes ghostIn{to{opacity:.045}}
@keyframes facadeIn{0%{transform:scale(.34);opacity:0}25%{opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes facadeOut{to{opacity:0}}
@keyframes retOut{to{opacity:0}}
@keyframes retTL{to{transform:translate(504px,164px) scale(.62)}}
@keyframes retTR{to{transform:translate(-504px,164px) scale(.62)}}
@keyframes retBL{to{transform:translate(504px,-12px) scale(.62)}}
@keyframes retBR{to{transform:translate(-504px,-12px) scale(.62)}}
@keyframes locStep{0%{opacity:0}18%{opacity:1}80%{opacity:1}100%{opacity:0}}
@keyframes doorIn{to{opacity:1}}
@keyframes archOut{to{opacity:0}}
@keyframes wipe{to{width:780px}}
@keyframes restIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
${flight('flyTeal', SRC.teal, MID.teal, MARK.teal)}
${flight('flyGreen', SRC.green, MID.green, MARK.green)}
${flight('flyGray', SRC.gray, MID.gray, MARK.gray)}

.cyc-replay{position:absolute;top:14px;right:16px;font-family:'JetBrains Mono Variable',ui-monospace,monospace;font-size:10px;
 letter-spacing:.14em;color:${MUTED};background:${PAPER};border:1px solid ${RULE};border-radius:4px;padding:5px 9px;
 cursor:pointer;opacity:0;transition:opacity .18s ease,color .18s ease,border-color .18s ease}
.cyc-hero:hover .cyc-replay,.cyc-replay:focus-visible{opacity:1}
.cyc-replay:hover{color:${INK};border-color:#B9C0BD}
.cyc-replay:focus-visible{outline:2px solid ${FUNDIR};outline-offset:2px}

@media (prefers-reduced-motion: reduce){
 .animate *{animation:none!important}
 .animate .sk-live,.animate .facade,.animate .reticle,.animate .locator{opacity:0!important}
 .animate .sk-ghost{opacity:.045!important}
 .animate .rest{opacity:1!important;transform:none!important}
 .animate .wipe{width:780px!important}
}
`);

/* ---------------------------- skyline body --------------------------- */

function Skyline({ animated }: { animated?: boolean }) {
  const paths = useMemo(() => {
    const out: Array<{ k: string; d: string; delay: string; o: number }> = [];
    BLOCKS.forEach(([x, t, w], i) => {
      out.push({ k: `o${i}`, d: outline(x, t, w), delay: stagger(x), o: 1 });
      const f = floors(x, t, w);
      if (f) out.push({ k: `f${i}`, d: f, delay: stagger(x), o: 0.3 });
    });
    SPIRES.forEach(([d, x], i) => out.push({ k: `s${i}`, d, delay: stagger(x), o: 1 }));
    return out;
  }, []);

  return (
    <g fill="none" stroke={INK} strokeWidth="1" vectorEffect="non-scaling-stroke">
      {paths.map((p) => (
        <path
          key={p.k}
          className={animated ? 'draw' : undefined}
          d={p.d}
          pathLength="1"
          strokeDasharray={animated ? '1' : undefined}
          strokeOpacity={p.o}
          style={animated ? v(p.delay) : undefined}
        />
      ))}
      <path
        className={animated ? 'draw' : undefined}
        d={`M24 ${BASE}L1176 ${BASE}`}
        pathLength="1"
        strokeDasharray={animated ? '1' : undefined}
        style={animated ? v('0.62s') : undefined}
      />
      {TRAILS.map(([x1, x2, y], i) => (
        <path
          key={`t${i}`}
          className={animated ? 'draw' : undefined}
          d={`M${x1} ${y}L${x2} ${y}`}
          pathLength="1"
          strokeDasharray={animated ? '1' : undefined}
          strokeOpacity="0.35"
          style={animated ? v(`${0.72 + i * 0.07}s`) : undefined}
        />
      ))}
    </g>
  );
}

/* ----------------------------- component ---------------------------- */

export function CycHeroTransform({
  org = CYC_TENANT,
  wordmark = 'FUNDIR.AI',
  storageKey = 'fundir:hero:cyc',
  onSequenceEnd,
}: {
  org?: HeroOrg;
  wordmark?: string;
  storageKey?: string;
  onSequenceEnd?: () => void;
}) {
  const [run, setRun] = useState(false);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Decide on the client only (avoids a hydration mismatch): render the static
  // rest state on the server, then play once if this session hasn't yet.
  useEffect(() => {
    let played = false;
    try { played = sessionStorage.getItem(storageKey) === '1'; } catch { /* private mode */ }
    if (!played) {
      try { sessionStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
      setRun(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!run) return;
    timer.current = setTimeout(() => onSequenceEnd && onSequenceEnd(), Math.round(4900 * TIME_SCALE));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [run, nonce, onSequenceEnd]);

  const replay = () => {
    setRun(false);
    setNonce((n) => n + 1);
    requestAnimationFrame(() => requestAnimationFrame(() => setRun(true)));
  };

  const name = Array.isArray(org.name) ? org.name : String(org.name).split(' ');
  const tint = [CYC.teal, CYC.green, CYC.gray];

  return (
    <div className="cyc-hero">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <svg
        key={nonce}
        className={run ? 'animate' : undefined}
        viewBox="0 0 1200 360"
        role="img"
        aria-label={`${name.join(' ')} — ${org.tagline}`}
      >
        <defs>
          <clipPath id="cyc-wipe">
            <rect className="wipe" x="184" y="128" width="780" height="120" />
          </clipPath>
        </defs>

        {/* rest-state watermark — the city you came from, held at 4.5% */}
        <g className="sk-ghost" transform="translate(168 56) scale(0.72)">
          <Skyline />
        </g>

        {/* ACT 1 — the city */}
        <g className="sk-live" style={{ transformOrigin: '600px 285px' }}>
          <Skyline animated />
        </g>

        {/* ACT 2 — 2.7 million people down to one block */}
        <g className="reticle" stroke={FUNDIR} strokeWidth="1" strokeOpacity="0.55" fill="none">
          <path className="ret-tl" d="M24 62L24 36L50 36" style={{ transformOrigin: '24px 36px' }} />
          <path className="ret-tr" d="M1150 36L1176 36L1176 62" style={{ transformOrigin: '1176px 36px' }} />
          <path className="ret-bl" d="M24 306L24 332L50 332" style={{ transformOrigin: '24px 332px' }} />
          <path className="ret-br" d="M1150 332L1176 332L1176 306" style={{ transformOrigin: '1176px 332px' }} />
        </g>

        {/* (locator step-text removed per request — the reticle animation stays) */}

        {/* ACT 3 — the center */}
        <g className="facade" style={{ transformOrigin: '600px 285px' }}>
          <g fill="none" stroke={INK} strokeWidth="1">
            <path d="M600 96L600 34M452 96L452 76L472 76L472 96M700 96L700 76L720 76L720 96" />
            <circle cx="600" cy="30" r="4" />
            <path d="M424 96L776 96M424 96L424 124L776 124L776 96M430 108L770 108" />
            <path d={dentils()} strokeOpacity="0.45" />
            <path d="M430 124L430 332L770 332L770 124" />
            <path d="M430 236L770 236M430 241L770 241" strokeOpacity="0.5" />
            {UPPER.map((x) => (
              <path key={x} d={upperWindow(x)} strokeOpacity="0.75" />
            ))}
            {ARCHES.map((cx) => (
              <path key={cx} className="arch-src" d={archPath(cx)} strokeOpacity="0.8" />
            ))}
            {ARCHES.map((cx) => (
              <path key={`p${cx}`} d={`M${cx - 24} 300L${cx + 24} 300M${cx} 300L${cx} 320`} strokeOpacity="0.35" />
            ))}
            <path className="arch-src" d="M560 332L560 262A40 40 0 0 1 640 262L640 332" />
            <path className="arch-src" d="M568 332L568 266A32 32 0 0 1 632 266L632 332" strokeOpacity="0.6" />
            <path className="arch-src" d="M572 286L628 286M600 286L600 254M580 286L588 258M620 286L612 258" strokeOpacity="0.4" />
            {/* projecting sign — the mark, foreshadowed at 1/8 scale */}
            <path d="M558 268L524 262M524 250L524 282L488 282L488 250Z" strokeOpacity="0.7" />
            <g strokeOpacity="0.85">
              <circle cx="502" cy="262" r="6" />
              <circle cx="511" cy="262" r="6" />
              <circle cx="506" cy="271" r="6" />
            </g>
            <path d="M396 340L804 340M380 352L820 352" strokeOpacity="0.3" />
            <path d="M470 340L462 352M600 340L600 352M730 340L738 352" strokeOpacity="0.25" />
          </g>
          <g className="doorfill">
            <rect x="578" y="288" width="44" height="42" fill={DOOR} />
            <path d="M600 288L600 330" stroke={PAPER} strokeWidth="1.2" />
          </g>
        </g>

        {/* ACT 4 — three arches become the mark */}
        <g className="mk-teal">
          <circle r="1" fill={CYC.teal} />
        </g>
        <g className="mk-green">
          <circle r="1" fill={CYC.green} stroke={PAPER} strokeWidth={2 / R} />
        </g>
        <g className="mk-gray">
          <circle r="1" fill={CYC.gray} stroke={PAPER} strokeWidth={2 / R} />
        </g>

        <g clipPath="url(#cyc-wipe)">
          <text className="word" x="188" y="180" fontSize="44">
            {name.map((w, i) => (
              <tspan key={w + i} fill={tint[i % 3]} dx={i ? 10 : 0}>
                {w.toUpperCase()}
              </tspan>
            ))}
          </text>
        </g>

        {/* REST */}
        <text className="rest" x="188" y="208" fill={MUTED} fontSize="11.5" letterSpacing="0.3em" style={v('4.10s')}>
          {org.tagline.toUpperCase()}
        </text>
        <text className="rest" x="56" y="44" fill={MUTED} fontSize="10.5" letterSpacing="0.2em" style={v('4.20s')}>
          {wordmark}
        </text>
      </svg>

      <button className="cyc-replay" type="button" onClick={replay}>
        REPLAY
      </button>
    </div>
  );
}
