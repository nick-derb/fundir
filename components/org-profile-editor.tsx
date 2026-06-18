'use client';

/**
 * <OrgProfileEditor> — operations-console redesign.
 *
 * Same data + same server actions as before. Goals:
 *   1. Less scrolling — a Snapshot KPI strip at the top gives at-a-glance
 *      feedback on the org's current state, updating live as the user types.
 *   2. Minimized boxes — each Section collapses (max-height animation),
 *      and its header carries a mono summary so the user doesn't need to
 *      open it just to see what's inside.
 *   3. Motion that matches Financials — scroll-reveal on first-visible,
 *      smooth collapse animation, all gated on prefers-reduced-motion.
 *
 * Default open: Current Year Financials only. Everything else is closed,
 * with rich summaries surfaced in the header.
 */

import {
  useState, useTransition, useEffect, useRef, useMemo,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { saveOrgProfile, addGrantRecord, removeGrantRecord } from '@/actions/org-profile';
import type { OrgProfileData, GrantRecord } from '@/actions/org-profile';
import { formatCurrency } from '@/lib/utils';
import {
  Save, Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  DollarSign, Users, Target, Award,
  Clock, TrendingUp, ChevronDown, FileText,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════
// Motion helpers — local copies kept self-contained for this redesign
// ════════════════════════════════════════════════════════════════════════════

const REDUCE_MQ = '(prefers-reduced-motion: reduce)';
function subReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE_MQ);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function useReduceMotion(): boolean {
  return useSyncExternalStore(
    subReduce,
    () => window.matchMedia(REDUCE_MQ).matches,
    () => false,
  );
}

function useSeen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { setSeen(true); io.disconnect(); break; }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

function revealStyle(seen: boolean, reduce: boolean, delayMs = 0): CSSProperties {
  return {
    opacity:    seen || reduce ? 1 : 0,
    transform:  seen || reduce ? 'none' : 'translateY(10px)',
    transition: reduce ? 'none' : `opacity 500ms cubic-bezier(.2,.7,.2,1) ${delayMs}ms, transform 500ms cubic-bezier(.2,.7,.2,1) ${delayMs}ms`,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Shared form styles (token-driven)
// ════════════════════════════════════════════════════════════════════════════

const INPUT = 'w-full px-3 py-2 border border-hairline rounded-md text-[13px] text-primary placeholder:text-tertiary bg-surface focus:outline-none focus:ring-2 focus:border-accent transition-colors';
const LABEL = 'block font-mono text-[10.5px] font-semibold text-secondary uppercase tracking-[0.08em] mb-1.5';

function fmtMoney(n: number): string {
  if (!n) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

// ════════════════════════════════════════════════════════════════════════════
// Collapsible Section — animated max-height, header always visible
// ════════════════════════════════════════════════════════════════════════════

interface SectionProps {
  title:       string;
  sub?:        string;
  icon:        React.ElementType;
  /** Mono summary shown in the header (right-aligned). Visible whether
   *  the section is open or closed — that's the whole point. */
  summary?:    React.ReactNode;
  defaultOpen?: boolean;
  children:    React.ReactNode;
}

function Section({ title, sub, icon: Icon, summary, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen]    = useState(defaultOpen);
  const reduce             = useReduceMotion();
  const [ref, seen]        = useSeen<HTMLDivElement>();

  return (
    <section
      ref={ref}
      className={`bg-surface border rounded-[10px] overflow-hidden transition-colors ${open ? 'border-ink-300' : 'border-hairline'}`}
      style={revealStyle(seen, reduce)}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-elevated transition-colors"
      >
        <div className="w-8 h-8 rounded-md flex items-center justify-center bg-accent-tint flex-shrink-0">
          <Icon className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-primary leading-tight">{title}</p>
          {sub && <p className="text-[11px] text-tertiary mt-0.5 truncate">{sub}</p>}
        </div>
        {summary && (
          <div className="font-mono text-[11px] text-secondary tabular-nums flex-shrink-0 hidden sm:block">
            {summary}
          </div>
        )}
        <ChevronDown
          className={`w-4 h-4 text-tertiary flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          style={{ transitionTimingFunction: 'cubic-bezier(.2,.7,.2,1)' }}
        />
      </button>
      <div
        aria-hidden={!open}
        className="overflow-hidden"
        style={{
          maxHeight:  open ? 3000 : 0,
          transition: reduce ? 'none' : 'max-height 420ms cubic-bezier(.2,.7,.2,1)',
        }}
      >
        <div className="px-5 pt-4 pb-5 border-t border-hairline">{children}</div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Snapshot KPI — small, live, derived from current state
// ════════════════════════════════════════════════════════════════════════════

type KpiTone = 'accent' | 'success' | 'warning' | 'critical' | 'neutral';
const TONE_BORDER: Record<KpiTone, string> = {
  accent:   'border-l-accent',
  success:  'border-l-success',
  warning:  'border-l-warning',
  critical: 'border-l-critical',
  neutral:  'border-l-ink-300',
};

function SnapshotKpi({
  label, value, sub, tone = 'neutral', delay = 0,
}: { label: string; value: string; sub?: string; tone?: KpiTone; delay?: number }) {
  const reduce = useReduceMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`bg-surface border border-hairline border-l-[3px] ${TONE_BORDER[tone]} rounded-sm px-4 py-3`}
      style={revealStyle(seen, reduce, delay)}
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
        {label}
      </p>
      <p className="font-mono text-[18px] font-bold tabular-nums text-primary mt-1.5 leading-none">
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[10px] text-tertiary tabular-nums mt-1">
          {sub}
        </p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Form-cell helpers
// ════════════════════════════════════════════════════════════════════════════

function CurrencyInput({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-[13px] text-tertiary">$</span>
        <input
          type="number" min={0} step={1000}
          value={value || ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className={INPUT + ' pl-7'}
          placeholder="0"
        />
      </div>
      {hint && <p className="text-[10.5px] text-tertiary mt-1">{hint}</p>}
    </div>
  );
}

function PctInput({ label, value, onChange, tone }: {
  label: string; value: number; onChange: (v: number) => void; tone: KpiTone;
}) {
  const barCol =
    tone === 'critical' ? 'bg-critical' :
    tone === 'warning'  ? 'bg-warning'  :
    tone === 'success'  ? 'bg-success'  :
    tone === 'accent'   ? 'bg-accent'   :
                          'bg-ink-300';
  const valCol =
    tone === 'critical' ? 'text-critical' :
    tone === 'warning'  ? 'text-warning'  :
    tone === 'success'  ? 'text-success'  :
    tone === 'accent'   ? 'text-accent'   :
                          'text-tertiary';
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <input
          type="number" min={0} max={100} step={1}
          value={value || ''}
          onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          className={INPUT + ' pr-8 font-mono tabular-nums'}
          placeholder="0"
        />
        <span className={`absolute right-3 top-2.5 text-[12px] font-bold ${valCol}`}>%</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barCol}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, transitionDuration: '500ms', transitionTimingFunction: 'cubic-bezier(.2,.7,.2,1)' }}
        />
      </div>
    </div>
  );
}

function TagInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [input, setInput] = useState('');
  function add() {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  }
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-tint text-accent border border-hairline rounded-md text-[11px] font-medium"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter(x => x !== v))}
              className="hover:text-critical transition-colors ml-0.5"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder || 'Type and press Enter'}
          className={INPUT + ' flex-1'}
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 bg-elevated border border-hairline rounded-md text-[12px] text-muted hover:bg-page transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GrantRecordTable — token-migrated, mono-tabular numerals
// ════════════════════════════════════════════════════════════════════════════

function GrantRecordTable({
  list, records, orgCode, showYear = true, showDate = false, showStatus = false,
}: {
  list:         'grant_history' | 'pending_grants' | 'awarded_grants';
  records:      GrantRecord[];
  orgCode:      string;
  showYear?:    boolean;
  showDate?:    boolean;
  showStatus?:  boolean;
}) {
  const [adding, setAdding]   = useState(false);
  const [isPending, start]    = useTransition();
  const [funder, setFunder]   = useState('');
  const [program, setProgram] = useState('');
  const [amount, setAmount]   = useState('');
  const [year, setYear]       = useState(String(new Date().getFullYear()));
  const [date, setDate]       = useState('');
  const [status, setStatus]   = useState('');

  function handleAdd() {
    if (!funder.trim() || !amount) return;
    start(async () => {
      await addGrantRecord(orgCode, list, {
        funder:  funder.trim(),
        program: program.trim(),
        amount:  Number(amount),
        ...(showYear   ? { year: Number(year) }      : {}),
        ...(showDate   ? { submitted_date: date }     : {}),
        ...(showStatus ? { status: status.trim() }   : {}),
      });
      setFunder(''); setProgram(''); setAmount(''); setDate(''); setStatus('');
      setAdding(false);
    });
  }

  function handleRemove(id: string) {
    start(async () => { await removeGrantRecord(orgCode, list, id); });
  }

  const total = records.reduce((s, r) => s + r.amount, 0);

  const headerCellCls = 'text-left px-3 py-2 font-mono font-semibold text-tertiary uppercase tracking-[0.08em] text-[10px]';

  return (
    <div>
      {records.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-md border border-hairline">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-elevated border-b border-hairline">
                <th className={headerCellCls}>Funder</th>
                <th className={headerCellCls}>Program</th>
                {showYear   && <th className={headerCellCls}>Year</th>}
                {showDate   && <th className={headerCellCls}>Submitted</th>}
                {showStatus && <th className={headerCellCls}>Status</th>}
                <th className={headerCellCls + ' text-right'}>Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-t border-hairline hover:bg-elevated transition-colors group">
                  <td className="px-3 py-2.5 font-medium text-primary">{r.funder}</td>
                  <td className="px-3 py-2.5 text-secondary max-w-[160px] truncate">{r.program || '—'}</td>
                  {showYear   && <td className="px-3 py-2.5 font-mono tabular-nums text-secondary">{r.year || '—'}</td>}
                  {showDate   && <td className="px-3 py-2.5 font-mono tabular-nums text-secondary">{r.submitted_date ? new Date(r.submitted_date).toLocaleDateString() : '—'}</td>}
                  {showStatus && <td className="px-3 py-2.5 text-secondary">{r.status || '—'}</td>}
                  <td className="px-3 py-2.5 text-right font-semibold font-mono tabular-nums text-accent">{formatCurrency(r.amount)}</td>
                  <td className="px-2">
                    <button
                      type="button"
                      onClick={() => handleRemove(r.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-tertiary hover:text-critical transition-all"
                      aria-label={`Remove ${r.funder}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {records.length > 1 && (
              <tfoot>
                <tr className="border-t border-hairline bg-elevated">
                  <td
                    colSpan={1 + (showYear || showDate ? 1 : 0) + (showStatus ? 1 : 0) + 1}
                    className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary"
                  >
                    Total · <span className="tabular-nums">{records.length}</span> grants
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] font-bold text-primary font-mono tabular-nums">
                    {formatCurrency(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {adding ? (
        <div className="p-3 bg-accent-tint rounded-md border border-hairline">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={funder}  onChange={e => setFunder(e.target.value)}  placeholder="Funder name *"     className={INPUT} />
            <input value={program} onChange={e => setProgram(e.target.value)} placeholder="Program / purpose" className={INPUT} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-[12px] text-tertiary">$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Amount *"
                className={INPUT + ' pl-6 font-mono tabular-nums'}
              />
            </div>
            {showYear   && <input type="number" value={year}   onChange={e => setYear(e.target.value)}   placeholder="Year"   className={INPUT + ' font-mono tabular-nums'} />}
            {showDate   && <input type="date"   value={date}   onChange={e => setDate(e.target.value)}                       className={INPUT + ' font-mono'} />}
            {showStatus && <input               value={status} onChange={e => setStatus(e.target.value)} placeholder="Status" className={INPUT} />}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!funder.trim() || !amount || isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-md text-[12px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-3 py-1.5 text-[12px] text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-ink-300 rounded-md text-[12px] text-secondary hover:border-accent hover:text-accent transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Add entry
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main editor
// ════════════════════════════════════════════════════════════════════════════

interface OrgProfileEditorProps {
  orgCode:   string;
  orgName:   string;
  ein:       string;
  profile:   OrgProfileData;
  updatedAt: string | null;
  updatedBy: string | null;
  userEmail: string;
  fy990:     number | null;
}

export function OrgProfileEditor({
  orgCode, orgName, ein, profile: initialProfile, updatedAt, updatedBy, userEmail, fy990,
}: OrgProfileEditorProps) {
  const [profile, setProfile] = useState<OrgProfileData>(initialProfile);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg]       = useState('');
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof OrgProfileData>(key: K, value: OrgProfileData[K]) {
    setProfile(p => ({ ...p, [key]: value }));
  }

  function handleSave() {
    setSaveStatus('saving');
    startTransition(async () => {
      const result = await saveOrgProfile(orgCode, profile, userEmail);
      if (result.success) {
        setSaveStatus('saved');
        setSaveMsg(result.error || 'All changes saved.');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setSaveMsg(result.error || 'Save failed.');
      }
    });
  }

  const pctSum = profile.current_govt_revenue_pct
    + profile.current_private_grants_pct
    + profile.current_program_revenue_pct
    + profile.current_other_revenue_pct;
  const pctWarning = pctSum > 0 && Math.abs(pctSum - 100) > 5;

  // Derived for header summaries (collapsed sections show these).
  const capacitySummary = useMemo(() => {
    const parts: string[] = [];
    if (profile.num_full_time_staff)          parts.push(`${profile.num_full_time_staff} FT`);
    if (profile.num_part_time_staff)          parts.push(`${profile.num_part_time_staff} PT`);
    if (profile.num_volunteers)               parts.push(`${profile.num_volunteers.toLocaleString()} vol`);
    if (profile.num_program_sites)            parts.push(`${profile.num_program_sites} sites`);
    return parts.length ? parts.join(' · ') : null;
  }, [profile]);

  const missionSummary = useMemo(() => {
    const parts: string[] = [];
    if (profile.strategic_priorities?.length) parts.push(`${profile.strategic_priorities.length} priorities`);
    if (profile.key_funders?.length)          parts.push(`${profile.key_funders.length} funders`);
    if (profile.accreditations?.length)       parts.push(`${profile.accreditations.length} accredits`);
    return parts.length ? parts.join(' · ') : null;
  }, [profile]);

  const histTotal = profile.grant_history.reduce((s, r) => s + r.amount, 0);
  const pendTotal = profile.pending_grants.reduce((s, r) => s + r.amount, 0);
  const awdTotal  = profile.awarded_grants.reduce((s, r) => s + r.amount, 0);

  const govtTone: KpiTone = profile.current_govt_revenue_pct >= 50 ? 'critical' : 'accent';
  const reservesTone: KpiTone =
    profile.current_months_reserves >= 3 ? 'success' :
    profile.current_months_reserves >= 2 ? 'warning' : 'critical';

  return (
    <div className="space-y-4">

      {/* ── Sticky save bar ── */}
      <div className="sticky top-12 z-30 bg-surface/95 backdrop-blur border border-hairline rounded-[10px] px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-primary truncate">{orgName}</p>
          <p className="font-mono text-[10.5px] text-tertiary tabular-nums">
            EIN <span>{ein.replace(/(\d{2})(\d{7})/, '$1-$2')}</span>
            {updatedAt && (
              <> · Last saved <span>{new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></>
            )}
            {updatedBy && <span className="font-sans"> by {updatedBy}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-success">
              <CheckCircle className="w-3.5 h-3.5" />{saveMsg}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-critical">
              <AlertCircle className="w-3.5 h-3.5" />{saveMsg}
            </span>
          )}
          {pctWarning && (
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-warning flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              Revenue %s sum to <span className="tabular-nums">{pctSum}%</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-md text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            {isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : <><Save className="w-3.5 h-3.5" /> Save changes</>}
          </button>
        </div>
      </div>

      {/* ── 990 vs Self-reported banner ── */}
      {fy990 && (
        <div className="bg-surface border border-hairline border-l-[3px] border-l-warning rounded-[10px] px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-warning">
              IRS 990 data reflects FY<span className="font-mono tabular-nums">{fy990}</span> — typically 12–18 months behind
            </p>
            <p className="text-[11.5px] text-muted mt-0.5 leading-relaxed">
              Use this profile to enter current-year actuals. Fundir uses both your 990 (historical credibility) and this self-reported data (current matching). Funders only see what you include in applications — this is for internal matching.
            </p>
          </div>
        </div>
      )}

      {/* ── Snapshot KPI strip — live, derived from current state ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <SnapshotKpi label="Budget"     value={fmtMoney(profile.current_annual_budget)}   tone="accent"        delay={0}   />
        <SnapshotKpi label="Revenue"    value={fmtMoney(profile.current_annual_revenue)}  tone="accent"        delay={60}  />
        <SnapshotKpi label="Net assets" value={fmtMoney(profile.current_net_assets)}      tone="accent"        delay={120} />
        <SnapshotKpi label="Reserves"   value={`${profile.current_months_reserves || 0}mo`} sub="3–6mo healthy" tone={reservesTone} delay={180} />
        <SnapshotKpi label="Govt"       value={`${profile.current_govt_revenue_pct || 0}%`} sub="of revenue"   tone={govtTone}     delay={240} />
      </div>

      {/* ── Current Year Financials ── */}
      <Section
        title="Current Year Financials"
        sub="Self-reported actuals — overrides 990 lag in matching"
        icon={DollarSign}
        defaultOpen
        summary={
          <>
            FYE: {profile.fiscal_year_end || '—'}{' '}
            <span className="text-tertiary">·</span>{' '}
            <span className={pctSum > 0 && Math.abs(pctSum - 100) <= 5 ? 'text-success' : pctSum > 0 ? 'text-warning' : 'text-tertiary'}>
              {pctSum}% revenue mix
            </span>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className={LABEL}>Fiscal year end</label>
            <select
              value={profile.fiscal_year_end}
              onChange={e => update('fiscal_year_end', e.target.value)}
              className={INPUT}
            >
              {['December 31','September 30','June 30','March 31'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <CurrencyInput label="Current annual budget"  value={profile.current_annual_budget}  onChange={v => update('current_annual_budget', v)}  hint="Board-approved operating budget" />
          <CurrencyInput label="Current annual revenue" value={profile.current_annual_revenue} onChange={v => update('current_annual_revenue', v)} />
          <CurrencyInput label="Current net assets"     value={profile.current_net_assets}     onChange={v => update('current_net_assets', v)}     hint="Total assets minus total liabilities" />
          <div>
            <label className={LABEL}>Months of operating reserves</label>
            <input
              type="number" min={0} max={120} step={0.1}
              value={profile.current_months_reserves || ''}
              onChange={e => update('current_months_reserves', Number(e.target.value) || 0)}
              className={INPUT + ' font-mono tabular-nums'}
              placeholder="e.g. 3.5"
            />
          </div>
        </div>

        <p className="text-[12px] font-semibold text-primary mb-2.5">
          Revenue composition
          <span className={`ml-2 font-mono text-[11px] font-normal tabular-nums ${pctWarning ? 'text-warning' : 'text-tertiary'}`}>
            ({pctSum}% — should total 100%)
          </span>
        </p>
        {/* Stacked bar preview */}
        {pctSum > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-4">
            {[
              { pct: profile.current_govt_revenue_pct,    bg: profile.current_govt_revenue_pct >= 50 ? 'var(--critical)' : 'var(--accent)' },
              { pct: profile.current_private_grants_pct,  bg: 'var(--info)' },
              { pct: profile.current_program_revenue_pct, bg: 'var(--accent-bright)' },
              { pct: profile.current_other_revenue_pct,   bg: 'var(--ink-300)' },
            ].filter(s => s.pct > 0).map((s, i, arr) => (
              <div
                key={i}
                style={{
                  width: `${s.pct}%`,
                  background: s.bg,
                  borderTopLeftRadius:    i === 0           ? 9999 : 0,
                  borderBottomLeftRadius: i === 0           ? 9999 : 0,
                  borderTopRightRadius:   i === arr.length-1 ? 9999 : 0,
                  borderBottomRightRadius:i === arr.length-1 ? 9999 : 0,
                  transition: 'width 500ms cubic-bezier(.2,.7,.2,1)',
                }}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PctInput label="Government grants %"     value={profile.current_govt_revenue_pct}    onChange={v => update('current_govt_revenue_pct', v)}    tone={profile.current_govt_revenue_pct >= 50 ? 'critical' : 'accent'} />
          <PctInput label="Private grants & gifts %" value={profile.current_private_grants_pct}  onChange={v => update('current_private_grants_pct', v)}  tone="accent" />
          <PctInput label="Program service revenue %" value={profile.current_program_revenue_pct} onChange={v => update('current_program_revenue_pct', v)} tone="success" />
          <PctInput label="Other revenue %"          value={profile.current_other_revenue_pct}   onChange={v => update('current_other_revenue_pct', v)}   tone="neutral" />
        </div>
      </Section>

      {/* ── Organizational Capacity ── */}
      <Section
        title="Organizational Capacity"
        sub="Staffing, programs, service delivery metrics"
        icon={Users}
        summary={capacitySummary}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {([
            { label: 'Full-time staff',                      key: 'num_full_time_staff'           as const },
            { label: 'Part-time staff',                      key: 'num_part_time_staff'           as const },
            { label: 'Volunteers',                           key: 'num_volunteers'                as const },
            { label: 'Participants served annually',         key: 'participants_served_annually'  as const },
            { label: 'Program sites',                        key: 'num_program_sites'             as const },
          ]).map(({ label, key }) => (
            <div key={key}>
              <label className={LABEL}>{label}</label>
              <input
                type="number" min={0}
                value={profile[key] || ''}
                onChange={e => update(key, Number(e.target.value) || 0)}
                className={INPUT + ' font-mono tabular-nums'}
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <TagInput
          label="Accreditations & certifications"
          values={profile.accreditations}
          onChange={v => update('accreditations', v)}
          placeholder="e.g. NAEYC, GATA, United Way Member Agency"
        />
      </Section>

      {/* ── Mission & Strategy ── */}
      <Section
        title="Mission & Strategy"
        sub="Narrative used in grant matching and application context"
        icon={Target}
        summary={missionSummary}
      >
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Mission statement</label>
            <textarea
              value={profile.mission_statement}
              onChange={e => update('mission_statement', e.target.value)}
              rows={4}
              className={INPUT + ' resize-none'}
              placeholder="Your organization's mission statement…"
            />
          </div>
          <div>
            <label className={LABEL}>Geographic service area</label>
            <input
              value={profile.geographic_service_area}
              onChange={e => update('geographic_service_area', e.target.value)}
              className={INPUT}
              placeholder="e.g. Chicago South and West sides — Cook County"
            />
          </div>
          <TagInput
            label="Strategic priorities (current)"
            values={profile.strategic_priorities}
            onChange={v => update('strategic_priorities', v)}
            placeholder="e.g. Workforce development expansion, Head Start capacity"
          />
          <div>
            <label className={LABEL}>Capacity & infrastructure notes</label>
            <textarea
              value={profile.capacity_notes}
              onChange={e => update('capacity_notes', e.target.value)}
              rows={3}
              className={INPUT + ' resize-none'}
              placeholder="Financial management systems, audit status, key infrastructure…"
            />
          </div>
          <TagInput
            label="Key funders (current relationships)"
            values={profile.key_funders}
            onChange={v => update('key_funders', v)}
            placeholder="e.g. Chicago Community Trust, MacArthur Foundation"
          />
        </div>
      </Section>

      {/* ── Grant History ── */}
      <Section
        title="Grant History"
        sub="Past awards — improves historical win-rate scoring"
        icon={Award}
        summary={
          profile.grant_history.length > 0
            ? <><span className="tabular-nums">{profile.grant_history.length}</span> grants · <span className="text-primary">{fmtMoney(histTotal)}</span></>
            : <span className="text-tertiary italic">none added</span>
        }
      >
        <p className="text-[11.5px] text-tertiary mb-4">
          Previous grants received. Used internally to improve match scoring — we factor in existing funder relationships and award patterns.
        </p>
        <GrantRecordTable list="grant_history" records={profile.grant_history} orgCode={orgCode} showYear />
      </Section>

      {/* ── Pending Applications ── */}
      <Section
        title="Pending Applications"
        sub="In-flight grant applications not yet in the pipeline"
        icon={Clock}
        summary={
          profile.pending_grants.length > 0
            ? <><span className="tabular-nums">{profile.pending_grants.length}</span> pending · <span className="text-primary">{fmtMoney(pendTotal)}</span></>
            : <span className="text-tertiary italic">none added</span>
        }
      >
        <p className="text-[11.5px] text-tertiary mb-4">
          Applications currently under review by funders. Tracking these prevents duplicate applications and helps forecast cash flow.
        </p>
        <GrantRecordTable list="pending_grants" records={profile.pending_grants} orgCode={orgCode} showYear={false} showDate showStatus />
      </Section>

      {/* ── Active & Recent Awards ── */}
      <Section
        title="Active & Recent Awards"
        sub="Confirmed grants currently being implemented"
        icon={TrendingUp}
        summary={
          profile.awarded_grants.length > 0
            ? <><span className="tabular-nums">{profile.awarded_grants.length}</span> active · <span className="text-primary">{fmtMoney(awdTotal)}</span></>
            : <span className="text-tertiary italic">none added</span>
        }
      >
        <p className="text-[11.5px] text-tertiary mb-4">
          Active awards — useful for tracking reporting obligations, period of performance, and overall portfolio health.
        </p>
        <GrantRecordTable list="awarded_grants" records={profile.awarded_grants} orgCode={orgCode} showYear />
      </Section>

      {/* ── Data policy notice ── */}
      <div className="bg-surface border border-hairline rounded-[10px] px-4 py-3 flex items-start gap-3">
        <FileText className="w-4 h-4 text-tertiary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[12px] font-semibold text-muted">Data security & privacy</p>
          <p className="text-[11.5px] text-tertiary leading-relaxed mt-0.5">
            This profile is stored securely in your organization&apos;s private workspace and is never shared with funders or third parties.
            It is used exclusively to improve grant match accuracy within Fundir. All financial figures are self-reported and are not verified against external sources.
          </p>
        </div>
      </div>

    </div>
  );
}
