'use client';

/**
 * <FunderBrief> — the Funder Dossier template.
 *
 * Single reusable component that renders identically for every funder on
 * the Funder Prospects view. Matches funder-dossier-reference.html in
 * layout, hierarchy, and motion. No per-funder special-casing.
 *
 * Structure (mirrors the reference):
 *   <BriefHeader>      (in <FunderProspectRow> — the clickable row head)
 *   <GlanceGauge>      animated peer-fit ring (factor bars omitted — sub-scores
 *                       not surfaced by the scorer yet, per brief: do not invent)
 *   <StatTiles>        peers funded · disclosed · typical grant · rec. ask · cadence
 *   <AskBand>          signature: grant-size distribution + recommended band
 *   <PeerLedger>       proportional-bar rows, sorted desc, evidence links
 *   <WarmPath>         3-node flow: You → shared grantee → Funder
 *   <RiskCallout>      calm left-border callout, severity tag
 *   <BriefBackground>  de-emphasized prose
 *   <SourceList>       numbered, linked, with amounts
 *   <CiteRef>          inline citation chip used inside prose
 *
 * Linked interactions:
 *   - Ask Band marker ⇄ Ledger row (shared peer id; hover highlights both)
 *   - Citation chip ⇄ Source row (hover highlights + scrolls into view)
 *
 * Motion (cubic-bezier(.2,.7,.2,1)):
 *   - Expand: max-height 0 → 3000px, ~420ms
 *   - Section stagger: opacity + translateY(8px → 0), ~70ms apart
 *   - Gauge arc: stroke-dashoffset 0 → value, ~900ms
 *   - Score count-up: ~700ms
 *   - Factor / ledger bars: width 0 → target, ~700ms
 *   - Ask band markers: drop-in with 80ms stagger
 *   - Tile count-ups: ~700ms
 *   - All gated on prefers-reduced-motion (final state, no transitions)
 *
 * Bugs fixed at render time (per brief):
 *   - Strip leading whitespace + punctuation left after [TODO: ...] removal
 *   - Capitalize the first character of each rendered field
 *   - The ragged 3-card row from v1 is gone (replaced by StatTiles + AskBand)
 */

import {
  useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore,
  type CSSProperties, type ReactNode,
} from 'react';
import {
  ChevronDown, ExternalLink, ArrowRight, AlertTriangle, Compass,
} from 'lucide-react';
import type { FunderIntelRow } from '@/lib/funder-intel/repo';

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export interface BriefShape {
  sections?: {
    background?:             string;
    who_they_fund_like_you?: string;
    typical_grant_size?:     string;
    cadence?:                string;
    entry_point?:            string;
    red_flags?:              string;
    suggested_ask_range?:    string;
  };
  citations?: Array<{
    id:             number;
    grants_made_id: string;
    label:          string;
    source_url:     string;
  }>;
  todo_count?: number;
}

interface ParsedEdge {
  id:         number;          // citation id (1-indexed)
  peerId:     string;          // grants_made_id — stable across hover linking
  peer:       string;
  fy:         string | null;
  amount:     number | null;   // dollars
  source_url: string;
}

interface AskRange { min: number; max: number; }

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

/** Strip leading whitespace + punctuation (left over from [TODO: ...] removal)
 *  and capitalize the first character. Idempotent. */
function cleanFieldText(text: string | undefined | null): string {
  if (!text) return '';
  let s = text.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\s.,;:—–-]+/, '').trim();
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

/** Compact $-formatter. 1500 → $1.5K · 1_250_000 → $1.3M. Always with K/M suffix
 *  unless < $1K. */
function fmtCompactDollar(n: number): { value: string; unit: string } {
  if (n >= 1_000_000_000) return { value: (n / 1_000_000_000).toFixed(1).replace(/\.0$/, ''), unit: 'B' };
  if (n >= 1_000_000)     return { value: (n / 1_000_000).toFixed(1).replace(/\.0$/, ''),     unit: 'M' };
  if (n >= 1_000)         return { value: String(Math.round(n / 1_000)),                       unit: 'K' };
  return { value: String(Math.round(n)), unit: '' };
}

function fmtMoney(n: number): string {
  const { value, unit } = fmtCompactDollar(n);
  return `$${value}${unit}`;
}

/** Parse one citation label like "Funder → Peer FY2024 $150K" into structured
 *  fields. Defensive — anything we can't parse falls back to raw values. */
function parseEdge(c: NonNullable<BriefShape['citations']>[number]): ParsedEdge {
  const m = c.label.match(/→\s*(.+?)\s+(FY\d{2,4})\s+\$([\d.,]+)([KMB]?)/i);
  let amount: number | null = null;
  if (m) {
    const raw = Number(m[3].replace(/,/g, ''));
    const unit = m[4]?.toUpperCase();
    amount = unit === 'B' ? raw * 1_000_000_000
           : unit === 'M' ? raw * 1_000_000
           : unit === 'K' ? raw * 1_000
                          : raw;
  }
  return {
    id:         c.id,
    peerId:     c.grants_made_id || `cite-${c.id}`,
    peer:       m?.[1]?.trim() ?? c.label,
    fy:         m?.[2] ?? null,
    amount,
    source_url: c.source_url,
  };
}

/** Pull an explicit dollar range out of prose. Handles "$75,000 to $100,000",
 *  "$75K–$100K", "$150-200K", "$1.5M-2M", etc. Returns null when no range can
 *  be confidently extracted — never fabricates. */
function parseAskRange(text: string | undefined | null): AskRange | null {
  if (!text) return null;
  const s = text.replace(/\s+/g, ' ');
  // Match a left $-value, separator, optional second $, right value.
  const re = /\$\s*([\d.,]+)\s*([KMB]?)\s*(?:to|–|—|-|through)\s*\$?\s*([\d.,]+)\s*([KMB]?)/i;
  const m = s.match(re);
  if (!m) return null;
  const lUnit = m[2]?.toUpperCase();
  const rUnit = m[4]?.toUpperCase() || lUnit;
  const scale = (u: string | undefined) =>
      u === 'B' ? 1_000_000_000
    : u === 'M' ? 1_000_000
    : u === 'K' ? 1_000
                : 1;
  const lo = Number(m[1].replace(/,/g, '')) * scale(lUnit);
  const hi = Number(m[3].replace(/,/g, '')) * scale(rUnit);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;
  return { min: lo, max: hi };
}

/** Pull a short cadence label (Annual / Rolling / etc.) out of prose. */
function parseCadenceLabel(text: string | undefined | null): string | null {
  if (!text) return null;
  const s = cleanFieldText(text);
  const m = s.match(/\b(annual(?:ly)?|rolling|quarterly|biennial(?:ly)?|monthly|continuous|by\s+invitation)\b/i);
  if (!m) return null;
  const w = m[1].toLowerCase();
  if (w.startsWith('annual')) return 'Annual';
  if (w.startsWith('biennial')) return 'Biennial';
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function median(nums: number[]): number | null {
  const xs = nums.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function mean(nums: number[]): number | null {
  const xs = nums.filter(n => Number.isFinite(n));
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Round a value up to the next "nice" axis bound (e.g. $250K → $300K). */
function niceCeil(v: number): number {
  if (v <= 0) return 100_000;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const r   = v / mag;
  const step = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return step * mag;
}

// ════════════════════════════════════════════════════════════════════════════
// Hooks
// ════════════════════════════════════════════════════════════════════════════

const REDUCE_MOTION_MQ = '(prefers-reduced-motion: reduce)';
function subscribeReduceMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCE_MOTION_MQ);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function getReduceMotion() { return window.matchMedia(REDUCE_MOTION_MQ).matches; }
function getReduceMotionServer() { return false; }

function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribeReduceMotion, getReduceMotion, getReduceMotionServer);
}

/** requestAnimationFrame-based numeric count-up. Calls `set` with intermediate
 *  values and ends at `target`. Returns a cleanup that cancels. */
function animateCount(
  target: number,
  ms: number,
  set: (v: number) => void,
  reduce: boolean,
): () => void {
  if (reduce) { set(target); return () => {}; }
  let raf = 0;
  let start = 0;
  const tick = (t: number) => {
    if (!start) start = t;
    const p = Math.min((t - start) / ms, 1);
    set(Math.round(p * target));
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Render an element with the standard "reveal" pattern: starts at
 *  opacity 0 + translateY(8px); after mount + per-block delay flips to
 *  visible. Re-runs whenever `seq` changes (i.e. row reopens). */
function useRevealOnSeq(seq: number, delayMs: number, reduce: boolean): {
  style: CSSProperties;
} {
  const [revealed, setRevealed] = useState(reduce);
  useEffect(() => {
    // Intentional reset-on-dep-change: when `seq` increments (row reopened)
    // we replay the fade-in. setState is what schedules the next paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reduce) { setRevealed(true); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), delayMs);
    return () => clearTimeout(t);
  }, [seq, delayMs, reduce]);
  return {
    style: {
      opacity:   revealed ? 1 : 0,
      transform: revealed ? 'none' : 'translateY(8px)',
      transition: reduce ? 'none' : 'opacity 420ms cubic-bezier(.2,.7,.2,1), transform 420ms cubic-bezier(.2,.7,.2,1)',
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CiteRef — inline citation chip
// ════════════════════════════════════════════════════════════════════════════

interface CiteContextValue {
  setHotSrc:  (id: number | null) => void;
  scrollSrc:  (id: number) => void;
}

interface CiteRefProps {
  n:        number;
  ctx:      CiteContextValue;
  label?:   string;   // tooltip
}

function CiteRef({ n, ctx, label }: CiteRefProps) {
  return (
    <button
      type="button"
      onMouseEnter={() => { ctx.setHotSrc(n); ctx.scrollSrc(n); }}
      onMouseLeave={() => ctx.setHotSrc(null)}
      onFocus={() => { ctx.setHotSrc(n); ctx.scrollSrc(n); }}
      onBlur={() => ctx.setHotSrc(null)}
      title={label ?? `Source ${n}`}
      aria-label={`Source ${n}${label ? ` — ${label}` : ''}`}
      className="font-mono text-[9px] font-semibold text-accent bg-accent-tint rounded-sm px-1 mx-0.5 inline-block align-super leading-none cursor-pointer hover:bg-accent hover:text-white transition-colors"
      style={{ position: 'relative', top: -2 }}
    >
      {n}
    </button>
  );
}

/** Render a prose string, substituting `{{cite:N}}` markers with <CiteRef />
 *  and (optionally) stripping `[TODO: ...]` markers. */
function renderProse(
  text: string,
  citations: NonNullable<BriefShape['citations']>,
  ctx: CiteContextValue,
  showTodos: boolean,
): ReactNode {
  const citeById = new Map(citations.map(c => [c.id, c]));
  // First strip TODOs (or keep, depending on toggle).
  const TODO_RE = /\[TODO:[^\]]*\]/g;
  const cleaned = showTodos ? text : text.replace(TODO_RE, '');
  const final   = cleanFieldText(cleaned);

  const out: ReactNode[] = [];
  const CITE_RE = /\{\{cite:(\d+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = CITE_RE.exec(final)) !== null) {
    if (m.index > last) out.push(final.slice(last, m.index));
    const id = Number(m[1]);
    out.push(<CiteRef key={`c-${m.index}`} n={id} ctx={ctx} label={citeById.get(id)?.label} />);
    last = m.index + m[0].length;
  }
  if (last < final.length) out.push(final.slice(last));
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// GlanceGauge — animated peer-fit ring
// ════════════════════════════════════════════════════════════════════════════

interface GlanceGaugeProps {
  score:   number;          // 0-100
  seq:     number;          // re-trigger animations
  reduce:  boolean;
}

function GlanceGauge({ score, seq, reduce }: GlanceGaugeProps) {
  const arcRef = useRef<SVGCircleElement>(null);
  const [displayScore, setDisplayScore] = useState(reduce ? score : 0);
  const C = 2 * Math.PI * 50; // 314.16

  useEffect(() => {
    const arc = arcRef.current;
    if (!arc) return;
    // Reset on seq/score change so the gauge replays each open.
    arc.style.transition = 'none';
    arc.setAttribute('stroke-dashoffset', String(C));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayScore(reduce ? score : 0);
    const cancel = animateCount(score, 900, setDisplayScore, reduce);
    const t = setTimeout(() => {
      arc.style.transition = reduce ? 'none' : 'stroke-dashoffset 900ms cubic-bezier(.2,.7,.2,1)';
      arc.setAttribute('stroke-dashoffset', String(C * (1 - score / 100)));
    }, 120);
    return () => { cancel(); clearTimeout(t); };
  }, [seq, score, reduce, C]);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 120 120" className="w-[120px] h-[120px]">
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--ink-100)" strokeWidth="9" />
        <circle
          ref={arcRef}
          cx="60" cy="60" r="50" fill="none"
          stroke="var(--accent)" strokeWidth="9" strokeLinecap="round"
          transform="rotate(-90 60 60)"
          strokeDasharray={C}
          strokeDashoffset={C}
        />
        <text
          x="60" y="62" textAnchor="middle" dominantBaseline="middle"
          fontFamily="var(--font-geist-mono), ui-monospace, monospace"
          fontWeight="700" fontSize="30" fill="var(--ink-900)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {displayScore}
        </text>
        <text
          x="60" y="82" textAnchor="middle"
          fontFamily="var(--font-geist-mono), ui-monospace, monospace"
          fontSize="9" letterSpacing="1.5" fill="var(--ink-400)"
        >
          PEER-FIT
        </text>
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// StatTiles — 5 mini-cards
// ════════════════════════════════════════════════════════════════════════════

interface StatTilesProps {
  peersFunded:     number;
  totalDisclosed:  number;
  typicalGrant:    number | null;
  recAsk:          AskRange | null;
  cadence:         string | null;
  seq:             number;
  reduce:          boolean;
}

function StatTile({
  label, children,
}: { label: string; children: ReactNode }) {
  return (
    <div className="border border-hairline rounded-[7px] px-[13px] py-3 bg-page">
      <div className="font-mono text-[9px] tracking-[0.08em] uppercase text-secondary">{label}</div>
      <div className="font-mono font-semibold text-[18px] mt-[5px] -tracking-[0.01em] text-primary leading-tight">
        {children}
      </div>
    </div>
  );
}

function CountedNumber({ target, ms, reduce, seq, suffix }: {
  target: number; ms: number; reduce: boolean; seq: number; suffix?: ReactNode;
}) {
  const [v, setV] = useState(reduce ? target : 0);
  useEffect(() => {
    // Reset on seq/target change so the count-up replays each open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(reduce ? target : 0);
    return animateCount(target, ms, setV, reduce);
  }, [target, ms, reduce, seq]);
  return <>{v}{suffix}</>;
}

function StatTiles({
  peersFunded, totalDisclosed, typicalGrant, recAsk, cadence, seq, reduce,
}: StatTilesProps) {
  const disc = totalDisclosed > 0 ? fmtCompactDollar(totalDisclosed) : null;
  const typ  = typicalGrant != null ? fmtCompactDollar(typicalGrant) : null;
  const askLabel = recAsk
    ? `${fmtMoney(recAsk.min).replace('$','$')}–${fmtMoney(recAsk.max).replace('$','')}`
    : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
      <StatTile label="Peers funded">
        <CountedNumber target={peersFunded} ms={700} reduce={reduce} seq={seq} />
      </StatTile>
      <StatTile label="Disclosed">
        {disc ? <>${disc.value}<small className="text-[12px] text-secondary font-medium">{disc.unit}</small></> : '—'}
      </StatTile>
      <StatTile label="Typical grant">
        {typ ? <>${typ.value}<small className="text-[12px] text-secondary font-medium">{typ.unit}</small></> : '—'}
      </StatTile>
      <StatTile label="Rec. ask">
        <span className="text-[14px] text-accent">{askLabel ?? '—'}</span>
      </StatTile>
      <StatTile label="Cadence">
        <span className="text-[14px]">{cadence ?? '—'}</span>
      </StatTile>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AskBand — hand-rolled SVG distribution
// ════════════════════════════════════════════════════════════════════════════

interface AskBandProps {
  edges:    ParsedEdge[];          // peers with non-null amounts
  range:    AskRange | null;       // recommended ask range
  hot:      string | null;         // peerId currently highlighted
  onHot:    (id: string | null) => void;
  seq:      number;
  reduce:   boolean;
}

function AskBand({ edges, range, hot, onHot, seq, reduce }: AskBandProps) {
  // Hooks must run unconditionally (rules-of-hooks). We render `null` after.
  const [bandOn, setBandOn] = useState(reduce);
  const [dotsOn, setDotsOn] = useState<boolean[]>(() => edges.map(() => reduce));

  useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBandOn(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDotsOn(edges.map(() => true));
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBandOn(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDotsOn(edges.map(() => false));
    const tBand = setTimeout(() => setBandOn(true), 260);
    const tDots = edges.map((_, i) =>
      setTimeout(() => setDotsOn(prev => {
        const next = [...prev];
        next[i] = true;
        return next;
      }), 260 + i * 80),
    );
    return () => { clearTimeout(tBand); tDots.forEach(clearTimeout); };
  }, [seq, edges, reduce]);

  const amounts = edges.map(e => e.amount).filter((n): n is number => n != null);
  if (amounts.length === 0) return null;

  const rawMax = Math.max(...amounts, range?.max ?? 0);
  const maxAmt = Math.max(niceCeil(rawMax), 100_000);
  const X0 = 40, X1 = 880, span = X1 - X0;
  const x = (v: number) => X0 + (v / maxAmt) * span;
  const ticks = [0, maxAmt * 0.25, maxAmt * 0.5, maxAmt * 0.75, maxAmt];
  const avg = mean(amounts);
  const maxAmount = Math.max(...amounts);

  return (
    <div className="border border-hairline rounded-[10px] px-[22px] py-5 pb-2.5 bg-surface">
      <svg viewBox="0 0 900 170" preserveAspectRatio="xMidYMid meet" className="w-full h-[170px] block overflow-visible">
        {/* Recommended band */}
        {range && (() => {
          const bx = x(range.min);
          const bw = x(range.max) - x(range.min);
          return (
            <g style={{
              opacity: bandOn ? 1 : 0,
              transition: reduce ? 'none' : 'opacity 500ms cubic-bezier(.2,.7,.2,1)',
            }}>
              <rect x={bx} y={55} width={bw} height={56} rx={6}
                    fill="var(--accent-tint)"
                    stroke="rgba(12,107,90,.28)" strokeWidth={1} />
              <text x={bx + bw / 2} y={48} textAnchor="middle"
                    fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                    fontSize={10} fontWeight={600} fill="var(--accent)"
                    letterSpacing={0.3}>
                RECOMMENDED {fmtMoney(range.min).toUpperCase()}–{fmtMoney(range.max).replace('$','').toUpperCase()}
              </text>
            </g>
          );
        })()}

        {/* Axis */}
        <line x1={X0} y1={120} x2={X1} y2={120}
              stroke="var(--ink-200)" strokeWidth={1.5} />
        {ticks.map(v => (
          <g key={v}>
            <line x1={x(v)} y1={116} x2={x(v)} y2={124} stroke="var(--ink-200)" strokeWidth={1} />
            <text x={x(v)} y={140} textAnchor="middle"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                  fontSize={10} fill="var(--ink-400)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoney(v)}
            </text>
          </g>
        ))}

        {/* Avg marker */}
        {avg != null && (
          <g style={{
            opacity: bandOn ? 1 : 0,
            transition: reduce ? 'none' : 'opacity 500ms cubic-bezier(.2,.7,.2,1)',
          }}>
            <path d={`M ${x(avg)} 128 l -5 8 h 10 z`} fill="var(--ink-500)" />
            <text x={x(avg)} y={150} textAnchor="middle"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                  fontSize={9.5} fill="var(--ink-500)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
              avg {fmtMoney(avg)}
            </text>
          </g>
        )}

        {/* Peer dots */}
        {edges.map((e, i) => {
          if (e.amount == null) return null;
          const cx       = x(e.amount);
          const isInBand = range != null && e.amount >= range.min && e.amount <= range.max;
          const isRisk   = e.amount === maxAmount && !isInBand;
          const isHot    = hot === e.peerId;
          const stroke   = isInBand ? 'var(--accent)' : isRisk ? 'var(--warning)' : 'var(--ink-400)';
          const fill     = isInBand ? 'var(--accent)' : isRisk ? 'var(--warning)' : 'var(--surface)';
          return (
            <g key={e.peerId}
               onMouseEnter={() => onHot(e.peerId)}
               onMouseLeave={() => onHot(null)}
               style={{ cursor: 'pointer' }}>
              <circle
                cx={cx} cy={120}
                r={isHot ? 9 : 6}
                fill={fill} stroke={stroke}
                strokeWidth={isHot ? 3 : 2}
                style={{
                  opacity:   dotsOn[i] ? 1 : 0,
                  transform: dotsOn[i] ? 'none' : 'translateY(-12px)',
                  transformOrigin: `${cx}px 120px`,
                  transition: reduce ? 'none' : 'opacity 500ms cubic-bezier(.2,.7,.2,1), transform 500ms cubic-bezier(.2,.7,.2,1), r 150ms cubic-bezier(.2,.7,.2,1), stroke-width 150ms cubic-bezier(.2,.7,.2,1)',
                }}
              />
              <text x={cx} y={104} textAnchor="middle"
                    fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                    fontSize={10} fontWeight={600} fill="var(--ink-600)"
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      opacity: dotsOn[i] ? 1 : 0,
                      transition: reduce ? 'none' : 'opacity 500ms cubic-bezier(.2,.7,.2,1)',
                    }}>
                {fmtMoney(e.amount)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PeerLedger — proportional bars, sorted desc
// ════════════════════════════════════════════════════════════════════════════

interface PeerLedgerProps {
  edges:    ParsedEdge[];
  range:    AskRange | null;
  hot:      string | null;
  onHot:    (id: string | null) => void;
  seq:      number;
  reduce:   boolean;
}

function PeerLedger({ edges, range, hot, onHot, seq, reduce }: PeerLedgerProps) {
  const sorted = useMemo(
    () => [...edges].filter(e => e.amount != null)
                    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    [edges],
  );

  const [widths, setWidths] = useState<number[]>(() => sorted.map(() => reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWidths(sorted.map(() => 1));
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWidths(sorted.map(() => 0));
    const timers = sorted.map((_, i) =>
      setTimeout(() => setWidths(prev => {
        const n = [...prev];
        n[i] = 1;
        return n;
      }), 200 + i * 40),
    );
    return () => timers.forEach(clearTimeout);
  }, [seq, sorted, reduce]);

  if (sorted.length === 0) return null;
  const maxAmt = sorted[0]?.amount ?? 1;
  const maxAmount = sorted[0]?.amount ?? 0;

  return (
    <ul className="flex flex-col">
      {sorted.map((e, i) => {
        const amt = e.amount ?? 0;
        const ratio = amt / (maxAmt || 1);
        const isInBand = range != null && amt >= range.min && amt <= range.max;
        const isRisk   = amt === maxAmount && !isInBand;
        const isHot    = hot === e.peerId;
        const barCol   = isInBand ? 'bg-accent' : isRisk ? 'bg-warning' : 'bg-ink-300';
        return (
          <li
            key={e.peerId}
            onMouseEnter={() => onHot(e.peerId)}
            onMouseLeave={() => onHot(null)}
            className={`grid grid-cols-[1fr_64px_96px_22px] items-center gap-3 px-2.5 py-2.5 rounded-lg transition-colors ${isHot ? 'bg-elevated' : 'hover:bg-elevated'}`}
          >
            <div className="flex flex-col min-w-0">
              <span className="text-[13.5px] font-medium text-primary truncate">{e.peer}</span>
              <span className="h-1 bg-ink-100 rounded-[3px] mt-1.5 overflow-hidden">
                <span
                  className={`block h-full rounded-[3px] ${barCol}`}
                  style={{
                    width: `${widths[i] ? ratio * 100 : 0}%`,
                    transition: reduce ? 'none' : 'width 700ms cubic-bezier(.2,.7,.2,1)',
                  }}
                />
              </span>
            </div>
            <span className="font-mono text-[11px] text-secondary tabular-nums">
              {e.fy ?? '—'}
            </span>
            <span className="font-mono text-[13px] font-semibold text-primary tabular-nums text-right">
              {fmtMoney(amt)}
            </span>
            <a
              href={e.source_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open source for ${e.peer}`}
              className="text-tertiary hover:text-accent justify-self-center transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// WarmPath — 3-node flow (You → shared grantee → Funder)
// ════════════════════════════════════════════════════════════════════════════

interface WarmPathProps {
  funderName:    string;
  orgName:       string;
  topPeerNames:  string[];
  entryPoint:    string;
  citations:     NonNullable<BriefShape['citations']>;
  ctx:           CiteContextValue;
  showTodos:     boolean;
}

function WarmPath({
  funderName, orgName, topPeerNames, entryPoint, citations, ctx, showTodos,
}: WarmPathProps) {
  const peers = topPeerNames.slice(0, 2).join(' · ');
  return (
    <div className="border border-hairline rounded-[10px] p-[18px] bg-surface">
      <div className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-secondary font-semibold">
        Warm path in
      </div>
      <div className="flex items-stretch mt-3">
        <div className="flex-1 border border-accent rounded-[8px] px-[11px] py-2.5 bg-accent-tint text-center">
          <div className="font-mono text-[8.5px] tracking-[0.08em] uppercase text-tertiary">You</div>
          <div className="text-[12px] font-semibold mt-1 leading-tight text-primary truncate">{orgName}</div>
        </div>
        <div className="flex items-center px-2 text-ink-300 text-base">→</div>
        <div className="flex-1 border border-hairline rounded-[8px] px-[11px] py-2.5 bg-page text-center">
          <div className="font-mono text-[8.5px] tracking-[0.08em] uppercase text-tertiary">Via shared grantee</div>
          <div className="text-[12px] font-semibold mt-1 leading-tight text-primary truncate" title={peers}>
            {peers || 'Top peer'}
          </div>
        </div>
        <div className="flex items-center px-2 text-ink-300 text-base">→</div>
        <div className="flex-1 border border-dashed border-hairline rounded-[8px] px-[11px] py-2.5 bg-page text-center">
          <div className="font-mono text-[8.5px] tracking-[0.08em] uppercase text-tertiary">Funder</div>
          <div className="text-[12px] font-semibold mt-1 leading-tight text-primary truncate" title={funderName}>{funderName}</div>
        </div>
      </div>
      {entryPoint && (
        <p className="text-[12.5px] text-secondary mt-3 leading-[1.5]">
          {renderProse(entryPoint, citations, ctx, showTodos)}
        </p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RiskCallout
// ════════════════════════════════════════════════════════════════════════════

function RiskCallout({
  text, citations, ctx, showTodos,
}: {
  text:       string;
  citations:  NonNullable<BriefShape['citations']>;
  ctx:        CiteContextValue;
  showTodos:  boolean;
}) {
  return (
    <div className="border border-hairline border-l-[3px] border-l-warning rounded-[10px] px-[18px] py-4 bg-surface">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-3.5 h-3.5 text-warning" />
        <span className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-warning font-semibold">
          Differentiation risk
        </span>
      </div>
      <p className="text-[13px] text-muted leading-[1.55]">
        {renderProse(text, citations, ctx, showTodos)}
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BriefBackground
// ════════════════════════════════════════════════════════════════════════════

function BriefBackground({
  text, citations, ctx, showTodos,
}: {
  text:       string;
  citations:  NonNullable<BriefShape['citations']>;
  ctx:        CiteContextValue;
  showTodos:  boolean;
}) {
  return (
    <p className="text-[13.5px] text-muted leading-[1.6] max-w-[78ch]">
      {renderProse(text, citations, ctx, showTodos)}
    </p>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SourceList — numbered rows, linked
// ════════════════════════════════════════════════════════════════════════════

interface SourceListProps {
  edges:    ParsedEdge[];
  hot:      number | null;
  funderId: string;
  funderName: string;
  registerRef: (id: number, el: HTMLDivElement | null) => void;
}

function SourceList({ edges, hot, funderId, funderName, registerRef }: SourceListProps) {
  return (
    <div className="border-t border-hairline pt-[18px] mt-[26px]">
      <div className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-secondary font-semibold mb-2.5">
        Sources · {edges.length} disclosed grant edges
      </div>
      <div>
        {edges.map(e => (
          <div
            key={e.id}
            id={`fbrief-src-${funderId}-${e.id}`}
            ref={el => registerRef(e.id, el)}
            className={`flex items-center gap-3 px-2.5 py-2 rounded-[7px] text-[12.5px] transition-colors ${hot === e.id ? 'bg-accent-tint' : ''}`}
          >
            <span className="font-mono text-[10px] font-semibold text-tertiary w-[18px] h-[18px] border border-hairline rounded-sm flex items-center justify-center flex-none tabular-nums">
              {e.id}
            </span>
            <a
              href={e.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-accent transition-colors inline-flex items-center gap-1 min-w-0"
              title={`Open source for ${e.peer}`}
            >
              <span className="truncate">
                {funderName} → <b className="text-primary font-semibold">{e.peer}</b>{e.fy ? ` · ${e.fy}` : ''}
              </span>
            </a>
            <span className="font-mono ml-auto text-secondary tabular-nums whitespace-nowrap">
              {e.amount != null ? `${fmtMoney(e.amount)} ↗` : '↗'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FunderBrief — the dossier
// ════════════════════════════════════════════════════════════════════════════

export interface FunderDossierData {
  funder_id:        string;
  funder_name:      string;
  funder_type:      string;
  funder_ein:       string | null;
  score:            number;          // 0-100
  peers_funded:     number;
  total_disclosed:  number;
  most_recent_fy:   number | null;
  top_peers:        string[];
  tracked_status:   string | null;
  brief:            BriefShape | null;
  org_name:         string;          // tenant org name for the warm-path "You" node
}

interface FunderBriefProps {
  data:    FunderDossierData;
  /** Increments each time the parent re-opens this brief. Used to re-trigger
   *  animations. */
  playSeq: number;
}

export function FunderBrief({ data, playSeq }: FunderBriefProps) {
  const reduce = useReduceMotion();
  const brief  = data.brief;
  const s      = brief?.sections ?? {};

  const [showTodos, setShowTodos] = useState(false);

  // Citations + parsed edges
  const citations = brief?.citations ?? [];
  const edges     = useMemo(() => citations.map(parseEdge), [citations]);
  const edgesWithAmt = useMemo(() => edges.filter(e => e.amount != null), [edges]);

  // Derived stats
  const typicalGrant = useMemo(
    () => median(edgesWithAmt.map(e => e.amount!)),
    [edgesWithAmt],
  );
  const recAsk = useMemo(() => parseAskRange(s.suggested_ask_range), [s.suggested_ask_range]);
  const cadenceLabel = useMemo(() => parseCadenceLabel(s.cadence), [s.cadence]);

  // Linked hover (chart ↔ ledger)
  const [hotPeer, setHotPeer] = useState<string | null>(null);

  // Citation ↔ source highlight + scroll-into-view
  const [hotSrc, setHotSrc] = useState<number | null>(null);
  const sourceRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const registerRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) sourceRefs.current.set(id, el);
    else sourceRefs.current.delete(id);
  }, []);
  const scrollSrc = useCallback((id: number) => {
    const el = sourceRefs.current.get(id);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [reduce]);
  const ctx: CiteContextValue = useMemo(() => ({ setHotSrc, scrollSrc }), [setHotSrc, scrollSrc]);

  // Section reveal staggers — each block fades in 70ms apart.
  // (Tiles share r0 with the glance block; they animate as one row.)
  const r0 = useRevealOnSeq(playSeq, 0,    reduce);    // glance + tiles
  const r2 = useRevealOnSeq(playSeq, 140,  reduce);    // ask band
  const r3 = useRevealOnSeq(playSeq, 210,  reduce);    // ledger
  const r4 = useRevealOnSeq(playSeq, 280,  reduce);    // approach (warm + risk)
  const r5 = useRevealOnSeq(playSeq, 350,  reduce);    // background
  const r6 = useRevealOnSeq(playSeq, 420,  reduce);    // sources
  const r7 = useRevealOnSeq(playSeq, 490,  reduce);    // footer

  if (!brief?.sections) {
    return (
      <div className="px-[22px] py-4 text-caption text-tertiary">
        Brief not generated yet. Run{' '}
        <code className="font-mono bg-elevated px-1 py-0.5 rounded-sm">
          POST /api/admin/generate-funder-brief
        </code>{' '}for this funder.
      </div>
    );
  }

  const todoCount = brief.todo_count ?? 0;

  return (
    <div className="pt-1 pb-[26px] px-[22px] border-t border-ink-100 space-y-[26px]">

      {/* ── AT A GLANCE — gauge only (factor sub-scores not surfaced yet) ── */}
      <div style={r0.style} className="grid sm:grid-cols-[200px_1fr] gap-[22px] pt-[22px] pb-1.5 items-center">
        <GlanceGauge score={Math.round(data.score)} seq={playSeq} reduce={reduce} />
        <StatTiles
          peersFunded={data.peers_funded}
          totalDisclosed={data.total_disclosed}
          typicalGrant={typicalGrant}
          recAsk={recAsk}
          cadence={cadenceLabel}
          seq={playSeq}
          reduce={reduce}
        />
      </div>

      {/* ── ASK BAND ── */}
      {edgesWithAmt.length > 0 && (
        <section style={r2.style}>
          <div className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-secondary font-semibold mb-3">
            Grant size &amp; recommended ask
          </div>
          <AskBand
            edges={edgesWithAmt}
            range={recAsk}
            hot={hotPeer}
            onHot={setHotPeer}
            seq={playSeq}
            reduce={reduce}
          />
        </section>
      )}

      {/* ── TWO-COL: Ledger | Approach ── */}
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-[22px]">
        {/* Peer Ledger */}
        {edgesWithAmt.length > 0 && (
          <div style={r3.style}>
            <div className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-secondary font-semibold mb-2.5">
              Peers they fund · {edgesWithAmt.length}
            </div>
            <PeerLedger
              edges={edgesWithAmt}
              range={recAsk}
              hot={hotPeer}
              onHot={setHotPeer}
              seq={playSeq}
              reduce={reduce}
            />
          </div>
        )}

        {/* Approach: Warm path + Risk callout */}
        <div style={r4.style} className="flex flex-col gap-[18px]">
          {s.entry_point && (
            <WarmPath
              funderName={data.funder_name}
              orgName={data.org_name}
              topPeerNames={data.top_peers}
              entryPoint={s.entry_point}
              citations={citations}
              ctx={ctx}
              showTodos={showTodos}
            />
          )}
          {s.red_flags && (
            <RiskCallout
              text={s.red_flags}
              citations={citations}
              ctx={ctx}
              showTodos={showTodos}
            />
          )}
        </div>
      </div>

      {/* ── BACKGROUND ── */}
      {s.background && (
        <section style={r5.style}>
          <div className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-secondary font-semibold mb-3">
            Background
          </div>
          <BriefBackground text={s.background} citations={citations} ctx={ctx} showTodos={showTodos} />
        </section>
      )}

      {/* ── SOURCES ── */}
      {edges.length > 0 && (
        <div style={r6.style}>
          <SourceList
            edges={edges}
            hot={hotSrc}
            funderId={data.funder_id}
            funderName={data.funder_name}
            registerRef={registerRef}
          />
        </div>
      )}

      {/* ── Unverified-fields toggle ── */}
      {todoCount > 0 && (
        <div style={r7.style} className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowTodos(v => !v)}
            aria-pressed={showTodos}
            className="text-[12.5px] text-secondary border border-hairline bg-surface rounded-[7px] px-[13px] py-[7px] inline-flex items-center gap-[7px] hover:text-primary hover:border-ink-300 transition-colors"
          >
            <span className="font-mono tabular-nums">{todoCount}</span>
            {showTodos
              ? ' unverified fields shown · Hide'
              : ' unverified fields hidden · Show all'}
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FunderProspectRow — controlled list row replacing the old <details> pattern.
// Owns the open state so animations re-play on each open.
// ════════════════════════════════════════════════════════════════════════════

interface FunderProspectRowProps {
  row:      FunderIntelRow;
  orgName:  string;
}

function asBrief(b: unknown): BriefShape | null {
  return (b && typeof b === 'object') ? (b as BriefShape) : null;
}

const FUNDER_TYPE_LABEL: Record<string, string> = {
  private_foundation:   'FOUNDATION',
  community_foundation: 'COMM. FOUNDATION',
  corporate:            'CORPORATE',
  bank:                 'BANK',
  federal_agency:       'FEDERAL',
  state_local:          'STATE/LOCAL',
};

function scoreToneCls(s100: number): string {
  // 0-100 scale. Accent tone for ≥65, warning for 40-64, neutral below.
  if (s100 >= 65) return 'bg-accent-tint text-accent border-accent';
  if (s100 >= 40) return 'bg-warning-tint text-warning border-warning';
  return 'bg-elevated text-tertiary border-hairline';
}

export function FunderProspectRow({ row, orgName }: FunderProspectRowProps) {
  const [open, setOpen]       = useState(false);
  const [playSeq, setPlaySeq] = useState(0);

  const score100 = Math.round(row.prospect_score * 100);
  const briefData: FunderDossierData = useMemo(() => ({
    funder_id:       row.funder_id,
    funder_name:     row.funder_name,
    funder_type:     row.funder_type,
    funder_ein:      row.funder_ein,
    score:           score100,
    peers_funded:    row.peer_overlap_count,
    total_disclosed: row.total_peer_amount,
    most_recent_fy:  row.most_recent_fy,
    top_peers:       row.top_peers,
    tracked_status:  row.tracked_status,
    brief:           asBrief(row.brief),
    org_name:        orgName,
  }), [row, score100, orgName]);

  const handleToggle = useCallback(() => {
    setOpen(o => {
      const nextOpen = !o;
      if (nextOpen) setPlaySeq(s => s + 1);
      return nextOpen;
    });
  }, []);

  const bodyId = `fbrief-body-${row.funder_id}`;

  return (
    <li
      className={`bg-surface border rounded-[10px] mt-3.5 overflow-hidden transition-colors duration-200 ${open ? 'border-ink-300' : 'border-hairline'}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full flex items-center gap-[18px] px-[22px] py-[18px] cursor-pointer select-none text-left"
      >
        <span className={`font-mono font-bold text-[18px] w-[46px] h-[46px] flex-none rounded-[9px] flex items-center justify-center border tabular-nums ${scoreToneCls(score100)}`}>
          {score100}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold -tracking-[0.01em] flex items-center gap-2.5 flex-wrap">
            <span className="truncate text-primary">{row.funder_name}</span>
            {row.funder_type && (
              <span className="font-mono text-[9.5px] tracking-[0.1em] text-tertiary border border-hairline rounded-[5px] px-[7px] py-[3px] font-semibold">
                {FUNDER_TYPE_LABEL[row.funder_type] ?? row.funder_type.toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-secondary text-[12.5px] mt-[5px]">
            <b className="font-semibold font-mono text-muted">{row.peer_overlap_count}</b> peers funded ·{' '}
            <b className="font-semibold font-mono text-muted">{fmtMoney(row.total_peer_amount)}</b> disclosed
            {row.most_recent_fy != null && <> · <b className="font-semibold font-mono text-muted">FY{row.most_recent_fy}</b></>}
            {row.top_peers.length > 0 && (
              <> · {row.top_peers.slice(0, 2).join(', ')}{row.top_peers.length > 2 ? ` +${row.top_peers.length - 2}` : ''}</>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-secondary text-[12.5px] flex-none">
          {row.has_brief
            ? <><span className="w-1.5 h-1.5 rounded-full bg-success" /> Ready</>
            : <><span className="w-1.5 h-1.5 rounded-full bg-ink-300" /> Pending</>}
          <ChevronDown
            className={`w-3.5 h-3.5 text-tertiary transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            style={{ transitionTimingFunction: 'cubic-bezier(.2,.7,.2,1)' }}
          />
        </div>
      </button>

      <div
        id={bodyId}
        aria-hidden={!open}
        className="overflow-hidden"
        style={{
          maxHeight:  open ? 3000 : 0,
          transition: 'max-height 420ms cubic-bezier(.2,.7,.2,1)',
        }}
      >
        {open && <FunderBrief data={briefData} playSeq={playSeq} />}
      </div>
    </li>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Tiny header marker (used in the funder-intelligence-panel.tsx as a label,
// available here as a convenience export so the panel can also surface the
// "Funder Prospects" eyebrow consistently if it wants to).
// ════════════════════════════════════════════════════════════════════════════

export function FunderProspectsEyebrow({ count }: { count: number }) {
  return (
    <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-accent font-semibold flex items-center gap-2">
      <Compass className="w-3.5 h-3.5" />
      Funder Prospects
      {count > 0 && <span className="font-mono tabular-nums text-tertiary font-normal">· {count}</span>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Re-export <ArrowRight> for convenience callers (kept tiny, no re-import)
// ════════════════════════════════════════════════════════════════════════════

export { ArrowRight as DossierArrow };
