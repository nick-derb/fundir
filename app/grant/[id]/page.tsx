export const dynamic = 'force-dynamic';

import type { ElementType } from 'react';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ScoreBreakdownChart } from '@/components/score-breakdown';
import { GrantTasks } from '@/components/grant-tasks';
import { GrantNotes } from '@/components/grant-notes';
import { getTasks } from '@/actions/tasks';
import { getNote } from '@/actions/notes';
import { ScoreBreakdown } from '@/types';
import { formatDate, getDaysUntil, formatCurrency } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, DollarSign, Building2, Tag, AlertCircle,
  ExternalLink, CheckCircle, HelpCircle, XCircle, MinusCircle,
  ClipboardList, FileText, BarChart2, Info,
} from 'lucide-react';
import type { EligibilitySignal, SignalStatus } from '@/lib/990-screener';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getGrantDetail(matchId: string) {
  const supabase = createServerClient();
  const { data: match } = await supabase
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .eq('grant_id', matchId)
    .single();
  return match;
}

// ── 990 Assessment ───────────────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<SignalStatus, { icon: ElementType; color: string; bg: string; border: string; label: string }> = {
  match:    { icon: CheckCircle,  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Confirmed' },
  likely:   { icon: MinusCircle, color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Likely' },
  unknown:  { icon: HelpCircle,   color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'Unknown' },
  mismatch: { icon: XCircle,      color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Risk' },
};


const SOURCE_BADGE: Record<NonNullable<EligibilitySignal['source']>, { label: string; color: string }> = {
  irs_990:       { label: 'IRS 990',       color: '#6366f1' },
  self_reported: { label: 'Self-Reported',  color: '#0d9488' },
  estimated:     { label: 'Estimated',      color: '#d97706' },
  'n/a':         { label: 'N/A',            color: '#94a3b8' },
};

function FinancialAssessment({ signals, score }: { signals: EligibilitySignal[]; score: number }) {
  if (!signals?.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-5 text-center">
        <p className="text-[12px] text-[#94a3b8]">
          990 data not synced —{' '}
          <Link href="/settings" className="text-[#0d9488] hover:underline">go to Settings</Link> to enable financial screening.
        </p>
      </div>
    );
  }

  const isPreQual   = !signals.some(s => s.status === 'mismatch' && ['Budget Fit', 'Financial Stability'].includes(s.factor));
  const scoreColor  = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const hasSelfData = signals.some(s => s.source === 'self_reported');

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-[#0f172a]">990 Eligibility Assessment</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#6366f1]" />
            <p className="text-[11px] text-[#64748b]">
              {hasSelfData ? 'IRS 990 + self-reported current data' : 'IRS Form 990 financial profile'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-baseline gap-1 justify-end">
            <span className="text-[24px] font-bold tabular-nums leading-none" style={{ color: scoreColor }}>{score.toFixed(0)}</span>
            <span className="text-[11px] text-[#94a3b8]">/100</span>
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">{signals.length} signals</p>
        </div>
      </div>

      {/* Pre-qual banner */}
      <div className={`px-5 py-2 flex items-center gap-2 border-b border-[#f1f5f9] text-[12px] font-medium ${isPreQual ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fef2f2] text-[#dc2626]'}`}>
        {isPreQual
          ? <><CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> No hard financial disqualifiers</>
          : <><XCircle    className="w-3.5 h-3.5 flex-shrink-0" /> Financial risk flags present — review before applying</>
        }
      </div>

      {/* Signals */}
      <div className="divide-y divide-[#f8fafc]">
        {signals.map((signal) => {
          const cfg    = SIGNAL_CONFIG[signal.status];
          const Icon   = cfg.icon;
          const srcCfg = signal.source ? SOURCE_BADGE[signal.source] : null;
          return (
            <div key={signal.factor} className="px-5 py-3 hover:bg-[#f8fafc] transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <Icon className="w-3 h-3" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[12px] font-semibold text-[#0f172a]">{signal.factor}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                    {srcCfg && signal.source !== 'n/a' && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border"
                        style={{ color: srcCfg.color, borderColor: srcCfg.color + '40', background: srcCfg.color + '0D' }}>
                        {srcCfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-[#475569] mb-0.5">{signal.headline}</p>
                  <p className="text-[10px] text-[#94a3b8] leading-relaxed">{signal.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stage badge ───────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    discovered: { bg: '#f1f5f9', text: '#64748b' },
    reviewing:  { bg: '#eff6ff', text: '#2563eb' },
    preparing:  { bg: '#faf5ff', text: '#7c3aed' },
    drafting:   { bg: '#fff7ed', text: '#c2410c' },
    submitted:  { bg: '#f0fdf4', text: '#16a34a' },
    awarded:    { bg: '#f0fdf4', text: '#15803d' },
    rejected:   { bg: '#fef2f2', text: '#dc2626' },
  };
  const style = map[stage] || { bg: '#f1f5f9', text: '#64748b' };
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold capitalize"
      style={{ background: style.bg, color: style.text }}>
      {stage}
    </span>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview', label: 'Overview',     icon: Info },
  { key: 'data',     label: 'Grant Data',   icon: BarChart2 },
  { key: 'tasks',    label: 'Tasks',        icon: ClipboardList },
  { key: 'notes',    label: 'Notes',        icon: FileText },
] as const;
type TabKey = typeof TABS[number]['key'];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function GrantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const tab: TabKey = (TABS.map(t => t.key) as string[]).includes(rawTab ?? '') ? (rawTab as TabKey) : 'overview';

  const match = await getGrantDetail(id);
  if (!match) notFound();

  const grant  = match.grant;
  const days   = getDaysUntil(grant?.close_date);
  const score: ScoreBreakdown = {
    composite:     match.composite_score,
    semantic:      match.semantic_similarity,
    eligibility:   match.eligibility_score,
    financial_990: match.financial_score ?? 50,
    historical:    match.historical_score,
    strategic:     match.strategic_score,
  };
  const fields       = grant?.extracted_fields || {};
  const deadlineColor = days === null ? 'text-[#64748b]' : days < 14 ? 'text-red-600' : days < 30 ? 'text-amber-600' : 'text-[#64748b]';
  const award        = fields.award_floor || fields.award_ceiling;

  // Load tasks and notes in parallel (only needed for those tabs, but cheap)
  const [tasks, note] = await Promise.all([
    getTasks(match.grant_id),
    getNote(match.grant_id),
  ]);

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-7xl mx-auto">

        {/* Breadcrumb */}
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] text-[#64748b] hover:text-[#0d9488] mb-5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>

        {/* ── Grant header ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-6 mb-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-[20px] font-bold text-[#0f172a] leading-snug">{grant?.title}</h1>
            <StageBadge stage={match.pipeline_stage} />
          </div>
          <div className="flex flex-wrap gap-4 text-[13px] text-[#64748b]">
            <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-[#94a3b8]" />{grant?.agency_name}</span>
            {grant?.aln_codes?.length > 0 && (
              <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-[#94a3b8]" />ALN {grant.aln_codes.join(', ')}</span>
            )}
            <span className={`flex items-center gap-1.5 ${deadlineColor}`}>
              <Calendar className="w-3.5 h-3.5" />
              {grant?.close_date ? `Closes ${formatDate(grant.close_date)}` : 'No deadline'}
              {days !== null && days >= 0 && <span className="font-semibold ml-1">({days}d)</span>}
            </span>
            {award && (
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-[#94a3b8]" />
                {fields.award_floor && fields.award_ceiling
                  ? `${formatCurrency(fields.award_floor)} – ${formatCurrency(fields.award_ceiling)}`
                  : formatCurrency(award)}
              </span>
            )}
          </div>
          {grant?.opportunity_number && (
            <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
              <a
                href={`https://grants.gov/search-results-detail/${grant.source_id}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-[#0d9488] hover:underline font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on Grants.gov · #{grant.opportunity_number}
              </a>
            </div>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center gap-1 mb-4 bg-white rounded-xl border border-[#e2e8f0] shadow-card px-2 py-2">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            const badge = key === 'tasks' && tasks.filter(t => !t.completed).length;
            return (
              <Link
                key={key}
                href={`/grant/${id}?tab=${key}`}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                  active
                    ? 'bg-[#0d9488] text-white shadow-sm'
                    : 'text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge ? (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${active ? 'bg-white/20 text-white' : 'bg-[#0d9488] text-white'}`}>
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {/* ── Main layout: left content + right sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Left: tab content (3/5 width) */}
          <div className="lg:col-span-3 space-y-4">

            {/* OVERVIEW TAB */}
            {tab === 'overview' && (
              <>
                {grant?.synopsis && (
                  <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-6">
                    <p className="text-[12px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-3">Synopsis</p>
                    <p className="text-[13px] text-[#475569] leading-relaxed">{grant.synopsis}</p>
                  </div>
                )}

                {match.recommendation && (
                  <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
                    <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Fundir Assessment</p>
                    <p className="text-[13px] text-[#475569] leading-relaxed">{match.recommendation}</p>
                  </div>
                )}

                {match.eligibility_flags?.length > 0 && (
                  <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      <p className="text-[13px] font-semibold text-amber-800">Eligibility Notes</p>
                    </div>
                    <ul className="space-y-1.5">
                      {match.eligibility_flags.map((flag: string, i: number) => (
                        <li key={i} className="text-[13px] text-amber-700 flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>{flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* GRANT DATA TAB */}
            {tab === 'data' && (
              <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Extracted Grant Data</h2>
                  <p className="text-[11px] text-[#64748b] mt-0.5">Structured fields extracted from grant text</p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {fields.eligible_entity_types?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Eligible Entity Types</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.eligible_entity_types.map((t: string) => (
                            <span key={t} className="px-2.5 py-1 bg-[#eff6ff] text-[#2563eb] rounded-full text-[11px] font-medium border border-[#bfdbfe]">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {fields.target_population?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Target Population</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.target_population.map((p: string) => (
                            <span key={p} className="px-2.5 py-1 bg-[#faf5ff] text-[#7c3aed] rounded-full text-[11px] font-medium border border-[#ddd6fe]">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {fields.program_areas?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Program Areas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.program_areas.map((a: string) => (
                            <span key={a} className="px-2.5 py-1 bg-[#f0fdf4] text-[#16a34a] rounded-full text-[11px] font-medium border border-[#bbf7d0]">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {fields.compliance_frameworks?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Compliance Requirements</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.compliance_frameworks.map((f: string) => (
                            <span key={f} className="px-2.5 py-1 bg-[#f8fafc] text-[#475569] rounded-full text-[11px] font-medium border border-[#e2e8f0]">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Key details grid */}
                  <div className="mt-5 pt-5 border-t border-[#f1f5f9] grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { label: 'Award Floor',     value: fields.award_floor    ? formatCurrency(fields.award_floor)    : '—' },
                      { label: 'Award Ceiling',   value: fields.award_ceiling  ? formatCurrency(fields.award_ceiling)  : '—' },
                      { label: 'Duration',        value: fields.grant_duration_months ? `${fields.grant_duration_months} months` : '—' },
                      { label: 'Cost Share',      value: fields.cost_sharing_required === true ? `Yes (${fields.cost_sharing_percentage ?? '?'}%)` : fields.cost_sharing_required === false ? 'Not required' : '—' },
                      { label: 'Geography',       value: fields.geographic_scope || '—' },
                      { label: 'Confidence',      value: fields.confidence_score != null ? `${Math.round((fields.confidence_score as number) * 100)}%` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 bg-[#f8fafc] rounded-lg border border-[#f1f5f9]">
                        <p className="text-[10px] text-[#94a3b8] mb-1">{label}</p>
                        <p className="text-[13px] font-semibold text-[#0f172a]">{value}</p>
                      </div>
                    ))}
                  </div>

                  {fields.key_requirements?.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-[#f1f5f9]">
                      <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-3">Key Requirements</p>
                      <ul className="space-y-2">
                        {fields.key_requirements.map((req: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-[13px] text-[#475569]">
                            <span className="text-[#0d9488] font-bold mt-0.5 flex-shrink-0">·</span>
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TASKS TAB */}
            {tab === 'tasks' && (
              <GrantTasks grantId={match.grant_id} initialTasks={tasks} />
            )}

            {/* NOTES TAB */}
            {tab === 'notes' && (
              <GrantNotes grantId={match.grant_id} initialBody={note?.body ?? ''} updatedAt={note?.updated_at} />
            )}
          </div>

          {/* Right: score + 990 (always visible) (2/5 width) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
                <h2 className="text-[13px] font-semibold text-[#0f172a]">Match Score Breakdown</h2>
              </div>
              <div className="p-5">
                <ScoreBreakdownChart score={score} />
              </div>
            </div>

            <FinancialAssessment
              signals={match.financial_signals ?? []}
              score={match.financial_score ?? 50}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
