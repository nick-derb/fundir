'use client';

/**
 * <FinancialsOverview> — analyst console for the Financials → Overview tab.
 *
 * Matches financials-overview-reference.html. Hand-rolled inline SVG for
 * every chart (no D3 / Recharts). All data is passed in via props so the
 * component is reusable across orgs.
 *
 * Layout:
 *   <KpiStrip>             5 compact cards w/ mono value + delta + sparkline + status dot
 *   <RevenueTrajectory>    revenue area+line on top, net-result bars below (shared x)
 *   <CompositeHealth>      score ring + (optional) 5 weighted driver bars
 *   <RevenueConcentration> stacked bar + key + single-program callout
 *   <LiquidityRunway>      months scale with healthy band + math chips + LOC chip
 *   <ExpenseAllocation>    stacked bar (Program / M&G / FR) + verdict
 *   <FlagsBoard>           severity bar + left-border flag cards
 *
 * Motion: subtle cubic-bezier(.2,.7,.2,1); count-ups, line-draw,
 * bar-grow, ring-arc, scroll-reveal via IntersectionObserver. All gated
 * behind prefers-reduced-motion.
 */

import {
  useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { AlertTriangle, Zap } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export interface FinancialsOverviewData {
  // Health
  healthScore:      number;                // 0-100 composite
  healthVerdict:    string;                // "Strong" | "Needs attention" | "Critical"
  healthSubcopy:    string;                // 1-line "why the score is what it is"
  healthDrivers?:   HealthDriver[];        // omit to render ring-only (no fabrication)

  // KPI strip
  totalRevenue:        number;
  totalRevenueYoYPct?: number;             // optional, only show delta if known

  netResult:        number;                // can be negative
  netResultPrior?:  number;

  liquidityMonths:  number;                // e.g. 2.4
  liquidityHealthy: { min: number; max: number };   // e.g. {min:3, max:6}

  govtDependencyPct:        number;        // e.g. 74.6
  govtDependencyThreshold:  number;        // critical above this (default 50)

  // Sparkline series — pass only what you actually have.
  revenueSparklinePoints?: number[];       // 3-7 points (will scale automatically)
  netSparklinePoints?:     number[];

  // Revenue trajectory (signature chart)
  revenueSeries: TrajectoryYear[];         // 3 actuals + optional 1 forecast

  // Revenue concentration
  concentration: {
    segments:           ConcSegment[];
    dominantProgram?:   { name: string; amount: number };
    governmentPct:      number;
    governmentAmount:   number;
    totalRevenue:       number;
    callout?:           string;
    thresholdPct:       number;            // default 60
  };

  // Liquidity
  liquidity: {
    months:          number;
    financialAssets: number;
    payables:        number;               // positive number; subtracted from assets
    netLiquid:       number;
    healthyMin:      number;
    healthyMax:      number;
    scaleMax:        number;               // x-axis ceiling (months), e.g. 6
    lineOfCredit?:   { drawn: number; limit: number; note?: string };
  };

  // Expense allocation
  expense: {
    programPct:           number;
    managementGeneralPct: number;
    fundraisingPct:       number;
    benchmarkLabel?:      string;          // e.g. "4★ Charity Navigator threshold met"
  };

  // Flags
  flags: FlagRow[];
}

export interface HealthDriver {
  label: string;
  value: number;                           // 0-100
  tone:  'success' | 'warning' | 'critical';
}

export interface TrajectoryYear {
  label:       string;                     // "FY2023"
  revenue:     number;
  net:         number | null;              // null = not yet booked (forecast year)
  isForecast?: boolean;
}

export type ConcTone = 'critical' | 'warning' | 'accent' | 'info' | 'neutral' | 'muted';
export interface ConcSegment {
  label: string;
  pct:   number;
  tone:  ConcTone;
}

export interface FlagRow {
  severity:       'critical' | 'warning' | 'info';
  headline:       string;
  category:       string;
  body:           string;
  recommendation: string;
  chip:           string;
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

function fmtCompactDollar(n: number): { value: string; unit: '' | 'K' | 'M' | 'B' } {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return { value: (a / 1_000_000_000).toFixed(1).replace(/\.0$/, ''), unit: 'B' };
  if (a >= 1_000_000)     return { value: (a / 1_000_000).toFixed(1).replace(/\.0$/, ''),     unit: 'M' };
  if (a >= 1_000)         return { value: String(Math.round(a / 1_000)),                       unit: 'K' };
  return { value: String(Math.round(a)), unit: '' };
}

function fmtSignedCompactDollar(n: number): string {
  const { value, unit } = fmtCompactDollar(n);
  return n < 0 ? `($${value}${unit})` : `$${value}${unit}`;
}

const REDUCE_MQ = '(prefers-reduced-motion: reduce)';
function subReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE_MQ);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function getReduce()       { return window.matchMedia(REDUCE_MQ).matches; }
function getReduceServer() { return false; }
function useReduceMotion(): boolean {
  return useSyncExternalStore(subReduce, getReduce, getReduceServer);
}

/** rAF-based numeric count-up. Returns cancel. */
function animateCount(
  target: number,
  ms: number,
  set: (v: number) => void,
  reduce: boolean,
): () => void {
  if (reduce) { set(target); return () => {}; }
  let raf = 0, start = 0;
  const tick = (t: number) => {
    if (!start) start = t;
    const p = Math.min((t - start) / ms, 1);
    set(p * target);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** IntersectionObserver-based "have I been seen?" hook. Latches true once
 *  the element first becomes visible, so animations only play once per
 *  mount (the brief asks for scroll-in reveal, not re-trigger). */
function useSeen<T extends HTMLElement>(opts: IntersectionObserverInit = { threshold: 0.15 }) {
  const ref  = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { setSeen(true); io.disconnect(); break; }
      }
    }, opts);
    io.observe(el);
    return () => io.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, seen] as const;
}

/** Standard reveal style — fades + slides up when `seen` flips true. */
function revealStyle(seen: boolean, reduce: boolean, delayMs = 0): CSSProperties {
  return {
    opacity:    seen || reduce ? 1 : 0,
    transform:  seen || reduce ? 'none' : 'translateY(10px)',
    transition: reduce ? 'none' : `opacity 500ms cubic-bezier(.2,.7,.2,1) ${delayMs}ms, transform 500ms cubic-bezier(.2,.7,.2,1) ${delayMs}ms`,
  };
}

const TONE_VAR: Record<ConcTone, string> = {
  critical: 'var(--critical)',
  warning:  'var(--warning)',
  accent:   'var(--accent)',
  info:     'var(--info)',
  neutral:  'var(--ink-600)',
  muted:    'var(--ink-300)',
};

// ════════════════════════════════════════════════════════════════════════════
// MiniSparkline — tiny SVG inside a KPI card
// ════════════════════════════════════════════════════════════════════════════

interface SparklineProps {
  /** Numeric series; auto-scaled to the SVG height. Provide ≥2 points or null. */
  points:  number[] | null | undefined;
  color:   string;     // CSS var like 'var(--accent)'
  height?: number;
  /** When true, draws bars instead of a line. */
  bars?:   boolean;
  /** Highlight last bar (e.g. current period). */
  highlightLast?: boolean;
}

function MiniSparkline({
  points, color, height = 22, bars = false, highlightLast = false,
}: SparklineProps) {
  if (!points || points.length < 2) return <div style={{ height }} />;
  const W = 80;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 3;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);

  if (bars) {
    const n = points.length;
    const barW = (W - (n + 1) * 2) / n;
    return (
      <svg viewBox={`0 0 ${W} ${height}`} className="block" style={{ height }}>
        {points.map((v, i) => {
          const yy = y(v);
          const isLast = i === n - 1;
          return (
            <rect
              key={i}
              x={2 + i * (barW + 2)}
              y={yy}
              width={barW}
              height={height - pad - yy + pad}
              fill={isLast && highlightLast ? color : 'var(--ink-200)'}
            />
          );
        })}
      </svg>
    );
  }

  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * W} ${y(v)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block" style={{ height }}>
      <polyline
        points={d.replace(/M |L /g, '').replace(/\s+/g, ' ').trim().split(' ').reduce((acc, n, i, arr) => {
          if (i % 2 === 0) return acc + n + ',' + arr[i + 1] + ' ';
          return acc;
        }, '').trim()}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// KpiStrip — 5 cards
// ════════════════════════════════════════════════════════════════════════════

type KpiTone = 'good' | 'warn' | 'crit' | 'neutral';
const TONE_DOT: Record<KpiTone, string> = {
  good:    'bg-success',
  warn:    'bg-warning',
  crit:    'bg-critical',
  neutral: 'bg-ink-300',
};
const TONE_TEXT: Record<KpiTone, string> = {
  good:    'text-success',
  warn:    'text-warning',
  crit:    'text-critical',
  neutral: 'text-secondary',
};

interface KpiCardProps {
  label:    string;
  tone:     KpiTone;
  /** Render-prop for the value (so callers can include unit suffix, color, count-up). */
  value:    React.ReactNode;
  delta?:   { tone: KpiTone; label: string };
  sparkline?: React.ReactNode;
  delay?:   number;
}

function KpiCard({ label, tone, value, delta, sparkline, delay = 0 }: KpiCardProps) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const reduce = useReduceMotion();
  return (
    <div
      ref={ref}
      className="bg-surface border border-hairline rounded-[12px] px-4 py-[15px] flex flex-col"
      style={{ ...revealStyle(seen, reduce, delay), boxShadow: '0 1px 2px rgba(11,18,32,0.04)' }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-secondary">
          {label}
        </span>
        <span className={`w-[7px] h-[7px] rounded-full ${TONE_DOT[tone]}`} />
      </div>
      <div className="font-mono font-bold text-[25px] leading-none mt-[9px] -tracking-[0.02em] tabular-nums text-primary">
        {value}
      </div>
      {delta && (
        <div className={`font-mono text-[11px] mt-2 flex items-center gap-1.5 ${TONE_TEXT[delta.tone]}`}>
          {delta.label}
        </div>
      )}
      {sparkline && <div className="mt-[9px]">{sparkline}</div>}
    </div>
  );
}

function CountedNumber({ target, ms, dec = 0, suffix = '', reduce }: {
  target: number; ms: number; dec?: number; suffix?: string; reduce: boolean;
}) {
  const [v, setV] = useState(reduce ? target : 0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(reduce ? target : 0);
    return animateCount(target, ms, setV, reduce);
  }, [target, ms, reduce]);
  return <>{v.toFixed(dec)}{suffix}</>;
}

function KpiStrip({ data }: { data: FinancialsOverviewData }) {
  const reduce = useReduceMotion();
  const { value: revV, unit: revU } = fmtCompactDollar(data.totalRevenue);
  const { value: netV, unit: netU } = fmtCompactDollar(data.netResult);

  const healthTone: KpiTone =
    data.healthScore >= 70 ? 'good' :
    data.healthScore >= 45 ? 'warn' : 'crit';
  const revYoYTone: KpiTone =
    data.totalRevenueYoYPct == null ? 'neutral' :
    data.totalRevenueYoYPct >= 0    ? 'good' : 'crit';
  const netTone: KpiTone = data.netResult >= 0 ? 'good' : 'crit';
  const liqTone: KpiTone =
    data.liquidityMonths >= data.liquidityHealthy.min ? 'good' :
    data.liquidityMonths >= data.liquidityHealthy.min - 1 ? 'warn' : 'crit';
  const govtTone: KpiTone = data.govtDependencyPct >= data.govtDependencyThreshold ? 'crit' : 'good';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 -mt-[18px] relative z-[2]">
      <KpiCard
        label="Health"
        tone={healthTone}
        value={<CountedNumber target={data.healthScore} ms={900} reduce={reduce} />}
        delta={{ tone: healthTone, label: data.healthVerdict.toLowerCase() }}
        sparkline={
          <MiniSparkline
            points={[80, 75, 60, data.healthScore]}
            color={healthTone === 'good' ? 'var(--success)' : healthTone === 'warn' ? 'var(--warning)' : 'var(--critical)'}
          />
        }
        delay={0}
      />
      <KpiCard
        label="Total revenue"
        tone={revYoYTone}
        value={<>${revV}<small className="text-[14px] text-secondary font-medium">{revU}</small></>}
        delta={data.totalRevenueYoYPct != null ? {
          tone: revYoYTone,
          label: `${data.totalRevenueYoYPct >= 0 ? '▲ +' : '▼ '}${data.totalRevenueYoYPct.toFixed(1)}% YoY`,
        } : undefined}
        sparkline={
          data.revenueSparklinePoints
            ? <MiniSparkline points={data.revenueSparklinePoints} color="var(--accent)" />
            : undefined
        }
        delay={60}
      />
      <KpiCard
        label="Net result"
        tone={netTone}
        value={
          <span className={netTone === 'crit' ? 'text-critical' : ''}>
            {data.netResult < 0 ? `($${netV}${netU})` : `+$${netV}${netU}`}
          </span>
        }
        delta={data.netResultPrior != null ? {
          tone: netTone,
          label: data.netResult < 0
            ? `▼ from ${data.netResultPrior >= 0 ? `+${fmtSignedCompactDollar(data.netResultPrior)}` : fmtSignedCompactDollar(data.netResultPrior)}`
            : `▲ from ${fmtSignedCompactDollar(data.netResultPrior)}`,
        } : undefined}
        sparkline={
          data.netSparklinePoints
            ? <MiniSparkline points={data.netSparklinePoints} color={netTone === 'crit' ? 'var(--critical)' : 'var(--success)'} />
            : undefined
        }
        delay={120}
      />
      <KpiCard
        label="Liquidity"
        tone={liqTone}
        value={
          <>
            <CountedNumber target={data.liquidityMonths} ms={900} dec={1} reduce={reduce} />
            <small className="text-[14px] text-secondary font-medium">mo</small>
          </>
        }
        delta={{
          tone: liqTone,
          label: liqTone === 'good'
            ? `at ${data.liquidityHealthy.min}–${data.liquidityHealthy.max} target`
            : `below ${data.liquidityHealthy.min}–${data.liquidityHealthy.max} target`,
        }}
        delay={180}
      />
      <KpiCard
        label="Govt dependency"
        tone={govtTone}
        value={
          <span className={govtTone === 'crit' ? 'text-critical' : ''}>
            <CountedNumber target={data.govtDependencyPct} ms={900} dec={1} suffix="%" reduce={reduce} />
          </span>
        }
        delta={{
          tone: govtTone,
          label: govtTone === 'crit'
            ? `> ${data.govtDependencyThreshold}% critical`
            : `under ${data.govtDependencyThreshold}% threshold`,
        }}
        delay={240}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RevenueTrajectory — area+line on top, net bars below; shared x-axis
// ════════════════════════════════════════════════════════════════════════════

interface TrajectoryProps {
  series: TrajectoryYear[];
}

function RevenueTrajectory({ series }: TrajectoryProps) {
  const reduce = useReduceMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const lineRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const fcRef   = useRef<SVGPathElement>(null);
  const [barProgress, setBarProgress] = useState(reduce ? 1 : 0);

  // Drop nulls from revenue scale; net values may include nulls (forecast year).
  const actualRevs = series.filter(s => !s.isForecast).map(s => s.revenue);
  const hasEnoughData = actualRevs.length >= 2;

  const lastForecast = series.find(s => s.isForecast);
  const allRevs = series.map(s => s.revenue);

  // Chart geometry (matches reference: viewBox 640 × 314)
  const VB_W = 640, VB_H = 314;
  // Left margin (X0) reserves a clean lane for the y-axis labels so they
  // don't collide with the leftmost data-point label. Right margin (X1)
  // does the same on the trailing side.
  const X0 = 65, X1 = 600;
  const span = X1 - X0;
  const n = series.length;
  const px = (i: number) => X0 + (i / (n - 1)) * span;

  // Revenue panel: y 30..180, scale 0..ceil(max)
  const REV_TOP = 30, REV_BOT = 180;
  const rawMax = Math.max(...allRevs);
  const rMax = niceCeil(rawMax);
  const ry = (v: number) => REV_BOT - (v / rMax) * (REV_BOT - REV_TOP);

  // Net panel: y 200..288, zero line at y 258
  const NET_TOP = 200, NET_BOT = 288, NET_ZERO = 258;
  const actualNets = series.map(s => s.net).filter((v): v is number => v != null);
  const netMax = Math.max(0, ...actualNets, ...actualNets.map(v => -v)); // symmetric
  const nPos = Math.max(0.5, Math.max(0, ...actualNets));
  const nNeg = Math.min(-0.5, Math.min(0, ...actualNets));
  // Use a single scale around 0
  const _ = netMax; void _;
  const ny = (v: number) => {
    if (v >= 0) {
      return NET_ZERO - (v / nPos) * (NET_ZERO - NET_TOP);
    }
    return NET_ZERO + (Math.abs(v) / Math.abs(nNeg)) * (NET_BOT - NET_ZERO);
  };

  // Build line/area paths from non-forecast years
  const solidYears   = series.filter(s => !s.isForecast);
  const solidPath = solidYears.length > 0
    ? 'M ' + solidYears.map((s, i) => `${px(i)} ${ry(s.revenue)}`).join(' L ')
    : '';
  const areaPath = solidYears.length > 0
    ? solidPath + ` L ${px(solidYears.length - 1)} ${REV_BOT} L ${px(0)} ${REV_BOT} Z`
    : '';
  // Forecast: dashed segment from last actual to forecast
  let fcPath = '';
  if (lastForecast) {
    const fcIndex = series.indexOf(lastForecast);
    const lastActIndex = fcIndex - 1;
    if (lastActIndex >= 0) {
      fcPath = `M ${px(lastActIndex)} ${ry(series[lastActIndex].revenue)} L ${px(fcIndex)} ${ry(lastForecast.revenue)}`;
    }
  }

  // y gridlines (rev panel)
  const yTicks: number[] = [0, rMax / 3, (2 * rMax) / 3, rMax];

  // Animation on first-seen
  useEffect(() => {
    if (!seen) return;
    if (reduce) {
      if (lineRef.current) lineRef.current.setAttribute('stroke-dashoffset', '0');
      if (areaRef.current) areaRef.current.style.opacity = '1';
      if (fcRef.current)   fcRef.current.style.opacity = '1';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBarProgress(1);
      return;
    }
    const t1 = setTimeout(() => {
      if (lineRef.current) {
        lineRef.current.style.transition = 'stroke-dashoffset 1100ms cubic-bezier(.2,.7,.2,1)';
        lineRef.current.setAttribute('stroke-dashoffset', '0');
      }
      if (areaRef.current) {
        areaRef.current.style.transition = 'opacity 900ms';
        areaRef.current.style.opacity = '1';
      }
      if (fcRef.current) {
        fcRef.current.style.transition = 'opacity 600ms 600ms';
        fcRef.current.style.opacity = '1';
      }
    }, 150);
    const t2 = setTimeout(() => setBarProgress(1), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [seen, reduce]);

  if (!hasEnoughData) return null;

  return (
    <div
      ref={ref}
      className="bg-surface border border-hairline rounded-[12px] px-[22px] py-5"
      style={revealStyle(seen, reduce, 0)}
    >
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-secondary">
          Revenue &amp; bottom line
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">
          {series[0].label}–{series[series.length - 1].label} · $M
        </span>
      </div>
      <p className="text-[12px] text-secondary mb-3.5">
        Revenue trajectory with year-end surplus/deficit annotated.
        {lastForecast && ' Final year is a trend extrapolation.'}
      </p>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet"
           className="w-full h-[300px] block overflow-visible">
        <defs>
          <linearGradient id="fin-rev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Revenue gridlines */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={X0} y1={ry(v)} x2={X1} y2={ry(v)} stroke="var(--ink-100)" strokeWidth={1} />
            <text x={4} y={ry(v) + 3} textAnchor="start"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                  fontSize={9} fill="var(--ink-400)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
              ${(v / 1_000_000).toFixed(0)}M
            </text>
          </g>
        ))}

        {/* Revenue area + line (solid years) */}
        <path ref={areaRef} d={areaPath} fill="url(#fin-rev-grad)" style={{ opacity: 0 }} />
        <path
          ref={lineRef}
          d={solidPath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="900"
          strokeDashoffset="900"
        />
        {/* Forecast dashed segment */}
        {fcPath && (
          <path
            ref={fcRef}
            d={fcPath}
            fill="none"
            stroke="var(--ink-400)"
            strokeWidth={2}
            strokeDasharray="4 4"
            style={{ opacity: 0 }}
          />
        )}

        {/* Revenue dots + labels */}
        {series.map((s, i) => {
          const cx = px(i), cy = ry(s.revenue);
          const labelY = cy - 12;
          if (s.isForecast) {
            return (
              <g key={s.label}>
                <circle cx={cx} cy={cy} r={4} fill="var(--ink-50)" stroke="var(--ink-400)" strokeWidth={2} />
                <text x={cx} y={labelY} textAnchor="middle"
                      fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                      fontSize={11} fontWeight={600} fill="var(--ink-400)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ~${(s.revenue / 1_000_000).toFixed(1)}M
                </text>
              </g>
            );
          }
          return (
            <g key={s.label}>
              <circle cx={cx} cy={cy} r={4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />
              <text x={cx} y={labelY} textAnchor="middle"
                    fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                    fontSize={11} fontWeight={600} fill="var(--ink-700)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${(s.revenue / 1_000_000).toFixed(1)}M
              </text>
            </g>
          );
        })}

        {/* Zero line for net panel */}
        <line x1={X0} y1={NET_ZERO} x2={X1} y2={NET_ZERO} stroke="var(--ink-300)" strokeWidth={1} />
        <text x={4} y={NET_ZERO + 3} textAnchor="start"
              fontFamily="var(--font-geist-mono), ui-monospace, monospace"
              fontSize={9} fill="var(--ink-400)"
              style={{ fontVariantNumeric: 'tabular-nums' }}>
          $0
        </text>

        {/* Net bars */}
        {series.map((s, i) => {
          const cx = px(i);
          if (s.net == null) {
            return (
              <text key={s.label} x={cx} y={NET_ZERO + 16} textAnchor="middle"
                    fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                    fontSize={10} fontWeight={600} fill="var(--ink-300)">
                proj
              </text>
            );
          }
          const isPos = s.net >= 0;
          const col = isPos ? 'var(--success)' : 'var(--critical)';
          const yTarget = isPos ? ny(s.net) : NET_ZERO;
          const hTarget = Math.abs(ny(s.net) - NET_ZERO);
          const y = NET_ZERO + (yTarget - NET_ZERO) * barProgress;
          const h = hTarget * barProgress;
          const labelY = isPos ? yTarget - 6 : yTarget + hTarget + 13;
          return (
            <g key={s.label}>
              <rect x={cx - 26} y={y} width={52} height={h} rx={3} fill={col}
                    style={{ transition: reduce ? 'none' : 'y 700ms cubic-bezier(.2,.7,.2,1), height 700ms cubic-bezier(.2,.7,.2,1)' }} />
              <text x={cx} y={labelY} textAnchor="middle"
                    fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                    fontSize={10} fontWeight={600} fill={col}
                    style={{ fontVariantNumeric: 'tabular-nums', opacity: barProgress ? 1 : 0, transition: reduce ? 'none' : 'opacity 400ms 600ms' }}>
                {isPos ? `+${fmtSignedCompactDollar(s.net)}` : fmtSignedCompactDollar(s.net)}
              </text>
            </g>
          );
        })}

        {/* X-axis year labels */}
        {series.map((s, i) => (
          <text key={s.label} x={px(i)} y={310} textAnchor="middle"
                fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                fontSize={10}
                fill={s.isForecast ? 'var(--ink-300)' : 'var(--ink-400)'}>
            {s.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1_000_000;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const r   = v / mag;
  const step = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return step * mag;
}

// ════════════════════════════════════════════════════════════════════════════
// CompositeHealth — ring + (optional) driver bars
// ════════════════════════════════════════════════════════════════════════════

interface CompositeHealthProps {
  score:    number;
  verdict:  string;
  subcopy:  string;
  drivers?: HealthDriver[];
}

function CompositeHealth({ score, verdict, subcopy, drivers }: CompositeHealthProps) {
  const reduce = useReduceMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const arcRef = useRef<SVGCircleElement>(null);
  const [displayScore, setDisplayScore] = useState(reduce ? score : 0);
  const C = 2 * Math.PI * 40; // ≈ 251.33

  const verdictTone =
    score >= 70 ? 'text-success' :
    score >= 45 ? 'text-warning' : 'text-critical';
  const arcCol =
    score >= 70 ? 'var(--success)' :
    score >= 45 ? 'var(--warning)' : 'var(--critical)';

  useEffect(() => {
    if (!seen) return;
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayScore(score);
      if (arcRef.current) arcRef.current.setAttribute('stroke-dashoffset', String(C * (1 - score / 100)));
      return;
    }
    const cancel = animateCount(score, 1000, v => setDisplayScore(Math.round(v)), reduce);
    const t = setTimeout(() => {
      if (arcRef.current) {
        arcRef.current.style.transition = 'stroke-dashoffset 1000ms cubic-bezier(.2,.7,.2,1)';
        arcRef.current.setAttribute('stroke-dashoffset', String(C * (1 - score / 100)));
      }
    }, 200);
    return () => { cancel(); clearTimeout(t); };
  }, [seen, score, reduce, C]);

  return (
    <div
      ref={ref}
      className="bg-surface border border-hairline rounded-[12px] px-[22px] py-5"
      style={revealStyle(seen, reduce, 60)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-secondary">
          Composite health
        </span>
      </div>
      <p className="text-[12px] text-secondary mb-4">
        {drivers && drivers.length > 0
          ? 'Why the score is what it is — weighted drivers.'
          : 'Composite of program efficiency, liquidity, revenue stability and concentration.'}
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <svg viewBox="0 0 96 96" className="w-24 h-24 flex-none">
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--ink-100)" strokeWidth="8" />
            <circle
              ref={arcRef}
              cx="48" cy="48" r="40" fill="none"
              stroke={arcCol} strokeWidth="8" strokeLinecap="round"
              transform="rotate(-90 48 48)"
              strokeDasharray={C}
              strokeDashoffset={C}
            />
            <text x="48" y="50" textAnchor="middle" dominantBaseline="middle"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                  fontWeight="700" fontSize="26" fill="var(--ink-900)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
              {displayScore}
            </text>
            <text x="48" y="66" textAnchor="middle"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                  fontSize="8" letterSpacing="1.2" fill="var(--ink-400)">
              / 100
            </text>
          </svg>
          <div className="min-w-0 flex-1">
            <div className={`font-mono text-[12px] font-semibold uppercase tracking-[0.08em] ${verdictTone}`}>
              {verdict}
            </div>
            <p className="text-[12px] text-secondary mt-1 leading-[1.45]">
              {subcopy}
            </p>
          </div>
        </div>

        {drivers && drivers.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {drivers.map((d, i) => (
              <DriverRow key={d.label} driver={d} seen={seen} reduce={reduce} delay={300 + i * 90} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DriverRow({ driver, seen, reduce, delay }: {
  driver: HealthDriver; seen: boolean; reduce: boolean; delay: number;
}) {
  const tone =
    driver.tone === 'success' ? 'var(--success)' :
    driver.tone === 'warning' ? 'var(--warning)' : 'var(--critical)';
  return (
    <div className="grid grid-cols-[96px_1fr_34px] items-center gap-[11px]">
      <span className="text-[11.5px] text-muted">{driver.label}</span>
      <span className="h-1.5 bg-ink-100 rounded overflow-hidden">
        <span className="block h-full rounded"
              style={{
                width: seen || reduce ? `${Math.max(0, Math.min(100, driver.value))}%` : 0,
                background: tone,
                transition: reduce ? 'none' : `width 800ms cubic-bezier(.2,.7,.2,1) ${delay}ms`,
              }} />
      </span>
      <span className="font-mono text-[11px] tabular-nums text-muted text-right">{driver.value}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RevenueConcentration — stacked bar + key + callout
// ════════════════════════════════════════════════════════════════════════════

function RevenueConcentration({ data }: { data: FinancialsOverviewData['concentration'] }) {
  const reduce = useReduceMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const above = data.governmentPct >= data.thresholdPct;
  const totalPct = data.segments.reduce((s, x) => s + x.pct, 0);
  return (
    <div
      ref={ref}
      className="bg-surface border border-hairline rounded-[12px] px-[22px] py-5"
      style={revealStyle(seen, reduce, 0)}
    >
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-secondary">
          Revenue concentration
        </span>
        {above && (
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-critical bg-critical-tint rounded-md px-2 py-1">
            Above {data.thresholdPct}% threshold
          </span>
        )}
      </div>
      <p className="text-[12px] text-secondary mb-3">
        <span className="font-mono tabular-nums">${(data.governmentAmount / 1_000_000).toFixed(2)}M</span>{' '}
        of{' '}
        <span className="font-mono tabular-nums">${(data.totalRevenue / 1_000_000).toFixed(2)}M</span>{' '}
        is government.
        {data.dominantProgram && (
          <> One program — <strong className="text-primary">{data.dominantProgram.name}</strong> — drives{' '}
          ~<span className="font-mono tabular-nums">{((data.dominantProgram.amount / data.totalRevenue) * 100).toFixed(0)}%</span>{' '}
          of revenue.</>
        )}
      </p>

      <div className="flex h-[34px] rounded-[8px] overflow-hidden border border-hairline">
        {data.segments.map((seg, i) => (
          <div key={i}
               style={{
                 width: seen || reduce ? `${(seg.pct / totalPct) * 100}%` : 0,
                 background: TONE_VAR[seg.tone],
                 transition: reduce ? 'none' : `width 900ms cubic-bezier(.2,.7,.2,1) ${100 + i * 70}ms`,
               }} />
        ))}
      </div>

      <div className="flex flex-wrap gap-[14px] mt-3">
        {data.segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-2 text-[12px] text-muted">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TONE_VAR[seg.tone] }} />
            {seg.label} <b className="font-mono text-primary font-semibold tabular-nums">{seg.pct.toFixed(seg.pct < 10 ? 1 : 0)}%</b>
          </span>
        ))}
      </div>

      {data.callout && (
        <div className="mt-3.5 border border-hairline border-l-[3px] border-l-critical rounded-lg px-3 py-2.5 text-[12.5px] text-muted leading-[1.5]">
          {data.callout}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LiquidityRunway — months scale + math chips + LOC chip
// ════════════════════════════════════════════════════════════════════════════

function LiquidityRunway({ data }: { data: FinancialsOverviewData['liquidity'] }) {
  const reduce = useReduceMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();

  const max = Math.max(data.scaleMax, data.healthyMax, data.months);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const fillW = seen || reduce ? `${pct(data.months)}%` : 0;
  const tone = data.months >= data.healthyMin ? 'good' : data.months >= data.healthyMin - 1 ? 'warn' : 'crit';
  const fillCol = tone === 'good' ? 'var(--success)' : tone === 'warn' ? 'var(--warning)' : 'var(--critical)';

  const ticks = [0, max / 3, (2 * max) / 3, max];

  return (
    <div
      ref={ref}
      className="bg-surface border border-hairline rounded-[12px] px-[22px] py-5"
      style={revealStyle(seen, reduce, 60)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-secondary">
          Liquidity runway
        </span>
      </div>
      <p className="text-[12px] text-secondary mb-3">
        Net liquid assets cover{' '}
        <span className="font-mono tabular-nums">~{data.months.toFixed(1)}</span>{' '}
        months of operations. Healthy is{' '}
        <span className="font-mono tabular-nums">{data.healthyMin}–{data.healthyMax}</span>.
      </p>

      <div className="relative h-[46px] my-6">
        {/* Track */}
        <div className="absolute left-0 right-0 top-[18px] h-2.5 bg-ink-100 rounded-md" />
        {/* Healthy band */}
        <div
          className="absolute top-[18px] h-2.5 bg-success-tint border border-success rounded-none"
          style={{
            left: `${pct(data.healthyMin)}%`,
            width: `${pct(data.healthyMax) - pct(data.healthyMin)}%`,
            borderWidth: 1,
          }}
        />
        <div
          className="absolute font-mono text-[8.5px] text-success"
          style={{
            top: -2,
            left: `${(pct(data.healthyMin) + pct(data.healthyMax)) / 2}%`,
            transform: 'translateX(-50%)',
          }}
        >
          HEALTHY {data.healthyMin}–{data.healthyMax}
        </div>
        {/* Fill (current value, from 0 to current) */}
        <div
          className="absolute top-[18px] h-2.5 rounded-md"
          style={{
            left: 0,
            width: fillW,
            background: fillCol,
            transition: reduce ? 'none' : 'width 1000ms cubic-bezier(.2,.7,.2,1)',
          }}
        />
        {/* Marker */}
        <div
          className="absolute top-[8px] w-[2px] h-[30px] bg-ink-700"
          style={{
            left: `${pct(data.months)}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <span
            className={`absolute font-mono text-[11px] font-semibold whitespace-nowrap ${tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-critical'}`}
            style={{ top: -20, left: '50%', transform: 'translateX(-50%)' }}
          >
            {data.months.toFixed(1)} mo
          </span>
        </div>
        {/* Ticks */}
        {ticks.map((v, i) => (
          <span
            key={i}
            className="absolute font-mono text-[9px] text-tertiary"
            style={{ top: 34, left: `${pct(v)}%`, transform: 'translateX(-50%)', fontVariantNumeric: 'tabular-nums' }}
          >
            {v.toFixed(v < 10 ? 0 : 0)}{i === ticks.length - 1 ? '+' : ''}
          </span>
        ))}
      </div>

      {/* Math chips */}
      <div className="flex items-center gap-2 flex-wrap mt-[18px] font-mono text-[12px]">
        <ChipPiece label="Fin. assets" value={fmtSignedCompactDollar(data.financialAssets)} />
        <span className="text-tertiary font-semibold">−</span>
        <ChipPiece label="Payables"    value={fmtSignedCompactDollar(Math.abs(data.payables))} />
        <span className="text-tertiary font-semibold">=</span>
        <ChipPiece label="Net liquid"  value={fmtSignedCompactDollar(data.netLiquid)} accent={tone === 'good' ? 'success' : 'warning'} />
      </div>

      {/* LOC chip */}
      {data.lineOfCredit && (
        <div className="mt-4 border border-hairline border-l-[3px] border-l-critical rounded-lg px-3 py-2.5">
          <div className="text-[12.5px] text-muted font-medium">
            ⚠ Line of credit drawn{data.lineOfCredit.note ? ` — ${data.lineOfCredit.note}` : ''}
          </div>
          <div className="h-1.5 bg-ink-100 rounded mt-2 overflow-hidden">
            <div
              className="h-full bg-critical rounded"
              style={{
                width: seen || reduce ? `${Math.min(100, (data.lineOfCredit.drawn / data.lineOfCredit.limit) * 100)}%` : 0,
                transition: reduce ? 'none' : 'width 800ms cubic-bezier(.2,.7,.2,1)',
              }}
            />
          </div>
          <div className="font-mono text-[10.5px] text-secondary mt-1.5 tabular-nums">
            ${(data.lineOfCredit.drawn / 1000).toFixed(0)}K drawn of $
            {(data.lineOfCredit.limit / 1_000_000).toFixed(1)}M limit
          </div>
        </div>
      )}
    </div>
  );
}

function ChipPiece({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'warning' | 'critical' }) {
  const borderCls =
    accent === 'success'  ? 'border-success' :
    accent === 'warning'  ? 'border-warning' :
    accent === 'critical' ? 'border-critical' : 'border-hairline';
  const valueCls =
    accent === 'success'  ? 'text-success' :
    accent === 'warning'  ? 'text-warning' :
    accent === 'critical' ? 'text-critical' : 'text-primary';
  return (
    <span className={`border ${borderCls} rounded-md px-2.5 py-1.5 bg-page inline-flex flex-col leading-tight`}>
      <span className="text-[8.5px] uppercase tracking-[0.06em] text-tertiary font-semibold">{label}</span>
      <span className={`mt-0.5 font-semibold tabular-nums ${valueCls}`}>{value}</span>
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ExpenseAllocation — single stacked bar
// ════════════════════════════════════════════════════════════════════════════

function ExpenseAllocation({ data }: { data: FinancialsOverviewData['expense'] }) {
  const reduce = useReduceMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="bg-surface border border-hairline rounded-[12px] px-[22px] py-5 mt-4"
      style={revealStyle(seen, reduce, 0)}
    >
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-secondary">
          Where every dollar goes
        </span>
        {data.benchmarkLabel && (
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-success">
            {data.programPct.toFixed(0)}¢ to program · {data.benchmarkLabel}
          </span>
        )}
      </div>
      <div className="flex h-[30px] rounded-[8px] overflow-hidden border border-hairline mt-1">
        <AllocSeg pct={data.programPct}           bg="var(--accent)"  label={`PROGRAM ${data.programPct.toFixed(0)}%`} fg="#fff"           seen={seen} reduce={reduce} delay={0} />
        <AllocSeg pct={data.managementGeneralPct} bg="var(--ink-500)" label={`M&G ${data.managementGeneralPct.toFixed(1)}%`} fg="#fff"     seen={seen} reduce={reduce} delay={70} />
        <AllocSeg pct={data.fundraisingPct}       bg="var(--ink-300)" label={`FR ${data.fundraisingPct.toFixed(1)}%`} fg="var(--ink-700)" seen={seen} reduce={reduce} delay={140} />
      </div>
    </div>
  );
}

function AllocSeg({ pct, bg, label, fg, seen, reduce, delay }: {
  pct: number; bg: string; label: string; fg: string; seen: boolean; reduce: boolean; delay: number;
}) {
  return (
    <div
      className="h-full flex items-center justify-center font-mono text-[10px] font-semibold whitespace-nowrap overflow-hidden"
      style={{
        width: seen || reduce ? `${pct}%` : 0,
        background: bg,
        color: fg,
        transition: reduce ? 'none' : `width 900ms cubic-bezier(.2,.7,.2,1) ${delay}ms`,
      }}
    >
      {label}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FlagsBoard — severity bar + flag cards
// ════════════════════════════════════════════════════════════════════════════

function FlagsBoard({ flags }: { flags: FlagRow[] }) {
  const reduce = useReduceMotion();
  const counts = useMemo(() => ({
    critical: flags.filter(f => f.severity === 'critical').length,
    warning:  flags.filter(f => f.severity === 'warning').length,
    info:     flags.filter(f => f.severity === 'info').length,
  }), [flags]);
  const total = flags.length || 1;
  return (
    <div>
      <div className="flex items-center gap-4 mt-6 mb-3.5 flex-wrap">
        <h2 className="text-h2 text-primary -tracking-[0.01em] m-0 font-semibold">Intelligence Flags</h2>
        <div className="flex h-2 rounded-md overflow-hidden w-[200px] border border-hairline">
          <span className="bg-critical h-full" style={{ width: `${(counts.critical / total) * 100}%` }} />
          <span className="bg-warning h-full"  style={{ width: `${(counts.warning  / total) * 100}%` }} />
          <span className="bg-info h-full"     style={{ width: `${(counts.info     / total) * 100}%` }} />
        </div>
        <div className="font-mono text-[11px] text-secondary flex gap-[14px] tabular-nums">
          <span><b className="text-primary font-semibold">{counts.critical}</b> critical</span>
          <span><b className="text-primary font-semibold">{counts.warning}</b> warning</span>
          <span><b className="text-primary font-semibold">{counts.info}</b> info</span>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {flags.map((f, i) => (
          <FlagCard key={i} flag={f} reduce={reduce} delay={i * 70} />
        ))}
      </div>
    </div>
  );
}

function FlagCard({ flag, reduce, delay }: { flag: FlagRow; reduce: boolean; delay: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const sev =
    flag.severity === 'critical' ? { left: 'border-l-critical', text: 'text-critical', tintBg: 'bg-critical-tint' } :
    flag.severity === 'warning'  ? { left: 'border-l-warning',  text: 'text-warning',  tintBg: 'bg-warning-tint'  }
                                 : { left: 'border-l-info',     text: 'text-info',     tintBg: 'bg-info-tint'     };
  return (
    <div
      ref={ref}
      className={`bg-surface border border-hairline border-l-[3px] ${sev.left} rounded-[12px] px-5 py-4`}
      style={revealStyle(seen, reduce, delay)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`text-[15px] font-semibold flex items-center gap-2 ${sev.text}`}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {flag.headline}
        </div>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary flex-none mt-1">
          {flag.category}
        </span>
      </div>
      <p className="text-[12.5px] text-muted leading-[1.55] mt-2.5">{flag.body}</p>
      <div className="flex items-center gap-3 justify-between mt-3 pt-3 border-t border-hairline">
        <span className="text-[12px] text-muted leading-[1.45] flex items-start gap-1.5">
          <Zap className={`w-3 h-3 flex-shrink-0 mt-0.5 ${sev.text}`} />
          {flag.recommendation}
        </span>
        <span className={`font-mono text-[10.5px] font-semibold rounded-md px-2 py-1 whitespace-nowrap tabular-nums ${sev.tintBg} ${sev.text}`}>
          {flag.chip}
        </span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main: <FinancialsOverview data={data} />
// ════════════════════════════════════════════════════════════════════════════

export function FinancialsOverview({ data }: { data: FinancialsOverviewData }) {
  return (
    <div className="space-y-4">
      <KpiStrip data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4 mt-[18px]">
        <RevenueTrajectory series={data.revenueSeries} />
        <CompositeHealth
          score={data.healthScore}
          verdict={data.healthVerdict}
          subcopy={data.healthSubcopy}
          drivers={data.healthDrivers}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <RevenueConcentration data={data.concentration} />
        <LiquidityRunway data={data.liquidity} />
      </div>

      <ExpenseAllocation data={data.expense} />

      <FlagsBoard flags={data.flags} />
    </div>
  );
}
