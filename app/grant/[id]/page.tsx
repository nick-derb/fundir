export const dynamic = 'force-dynamic';

import type { ElementType } from 'react';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { ScoreBreakdownChart } from '@/components/score-breakdown';
import { FinancialVerdict } from '@/components/financial-verdict';
import { GrantTasks } from '@/components/grant-tasks';
import { buildMatchReasons, type ReasonCategory } from '@/lib/match-reasons';
import { getOrgConfig } from '@/lib/config/loader';
import { loadOrgCraSnapshot } from '@/lib/cra/repo';
import { grantRequiresLmi } from '@/lib/matching';
import {
  loadFunderAffinitySnapshot, computeFunderAffinity,
} from '@/lib/factors/funder-affinity';
import { DraftViewer, type DraftRecord } from '@/components/draft-viewer';
import { EvidenceList, type EvidenceItem, type FactorKey } from '@/components/ui/evidence-list';
import { RecommendationPill, type Recommendation } from '@/components/ui/recommendation-pill';
import { GrantNotes } from '@/components/grant-notes';
import { GrantWorkspace } from '@/components/grant-workspace';
import { getTasks } from '@/actions/tasks';
import { getNote } from '@/actions/notes';
import { getAllIntegrations } from '@/lib/oauth-tokens';
import { ScoreBreakdown } from '@/types';
import { formatDate, getDaysUntil, formatCurrency } from '@/lib/utils';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, DollarSign, Building2, Tag, AlertCircle,
  ExternalLink, CheckCircle, HelpCircle, XCircle, MinusCircle,
  ClipboardList, FileText, BarChart2, Info, Shield, Sparkles,
  Clock, ChevronRight, FolderOpen,
} from 'lucide-react';
import type { EligibilitySignal, SignalStatus } from '@/lib/990-screener';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getGrantDetail(matchId: string, orgId: string) {
  const supabase = createServerClient();
  const { data: match } = await supabase
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .eq('grant_id', matchId)
    .eq('org_id', orgId)
    .single();
  return match;
}

async function loadDraftForOrgOpportunity(orgId: string, opportunityId: string): Promise<DraftRecord | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('drafts')
    .select('id, content, source_citations, status, tokens_used, generated_at')
    .eq('organization_id', orgId)
    .eq('opportunity_id', opportunityId)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as DraftRecord;
}

// ── 990 Assessment ───────────────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<SignalStatus, { icon: ElementType; color: string; bg: string; border: string; label: string }> = {
  match:    { icon: CheckCircle,  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Confirmed' },
  likely:   { icon: MinusCircle, color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Likely' },
  unknown:  { icon: HelpCircle,   color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'Unknown' },
  mismatch: { icon: XCircle,      color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Risk' },
};

const SOURCE_BADGE: Record<NonNullable<EligibilitySignal['source']>, { label: string; color: string }> = {
  irs_990:       { label: 'IRS 990',      color: '#6366f1' },
  self_reported: { label: 'Self-Reported', color: '#0d9488' },
  estimated:     { label: 'Estimated',     color: '#d97706' },
  'n/a':         { label: 'N/A',           color: '#94a3b8' },
};

function SignalWeightBar({ weight }: { weight?: number }) {
  if (!weight) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="h-1 w-16 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-[#0d9488]" style={{ width: `${weight * 100}%` }} />
      </div>
      <span className="text-[9px] text-[#94a3b8] font-medium">{Math.round(weight * 100)}% weight</span>
    </div>
  );
}

function FinancialAssessment({ signals, score }: { signals: EligibilitySignal[]; score: number }) {
  if (!signals?.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-6 text-center">
        <Shield className="w-8 h-8 text-[#e2e8f0] mx-auto mb-3" />
        <p className="text-[13px] font-medium text-[#64748b] mb-1">990 screening not available</p>
        <p className="text-[12px] text-[#94a3b8]">
          Go to{' '}
          <Link href="/settings" className="text-[#0d9488] hover:underline font-medium">Settings</Link>
          {' '}to enable financial screening.
        </p>
      </div>
    );
  }

  const isPreQual   = !signals.some(s => s.status === 'mismatch' && ['Budget Fit', 'Financial Stability'].includes(s.factor));
  const scoreColor  = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const hasSelfData = signals.some(s => s.source === 'self_reported');
  const matchCount  = signals.filter(s => s.status === 'match').length;
  const mismatchCount = signals.filter(s => s.status === 'mismatch').length;

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[5px] bg-[#6366f1]/10 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-[#6366f1]" />
            </div>
            <h2 className="text-[13px] font-bold text-[#0f172a]">990 Eligibility Assessment</h2>
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-1 justify-end">
              <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: scoreColor }}>
                {score.toFixed(0)}
              </span>
              <span className="text-[12px] text-[#94a3b8]">/100</span>
            </div>
          </div>
        </div>

        {/* Mini signal summary */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex gap-0.5 h-1.5 flex-1 rounded-full overflow-hidden">
            <div className="rounded-full bg-[#16a34a]" style={{ width: `${(matchCount / signals.length) * 100}%` }} />
            <div className="rounded-full bg-[#d97706]"
              style={{ width: `${(signals.filter(s => s.status === 'likely').length / signals.length) * 100}%` }} />
            <div className="rounded-full bg-[#dc2626]" style={{ width: `${(mismatchCount / signals.length) * 100}%` }} />
            <div className="flex-1 rounded-full bg-[#e2e8f0]" />
          </div>
          <span className="text-[10px] text-[#94a3b8] flex-shrink-0">{signals.length} signals</span>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: hasSelfData ? '#0d9488' : '#6366f1' }} />
          <p className="text-[10px] text-[#64748b]">
            {hasSelfData ? 'IRS 990 + self-reported data' : 'IRS Form 990 financial data'}
          </p>
        </div>
      </div>

      {/* Pre-qual banner */}
      <div className={`px-5 py-2.5 flex items-center gap-2 border-b text-[12px] font-semibold ${
        isPreQual ? 'bg-[#f0fdf4] text-[#16a34a] border-[#dcfce7]' : 'bg-[#fef2f2] text-[#dc2626] border-[#fee2e2]'
      }`}>
        {isPreQual
          ? <><CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> No hard financial disqualifiers</>
          : <><XCircle className="w-3.5 h-3.5 flex-shrink-0" /> Financial risk flags — review before applying</>
        }
      </div>

      {/* Signals */}
      <div className="divide-y divide-[#f8fafc]">
        {signals.map((signal) => {
          const cfg   = SIGNAL_CONFIG[signal.status];
          const Icon  = cfg.icon;
          const srcCfg = signal.source ? SOURCE_BADGE[signal.source] : null;
          return (
            <div key={signal.factor} className="px-5 py-3.5 hover:bg-[#fafbff] transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <Icon className="w-3 h-3" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[12px] font-semibold text-[#0f172a]">{signal.factor}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                    {srcCfg && signal.source !== 'n/a' && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border"
                        style={{ color: srcCfg.color, borderColor: srcCfg.color + '40', background: srcCfg.color + '0D' }}>
                        {srcCfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-[#475569] mb-0.5">{signal.headline}</p>
                  <p className="text-[10px] text-[#94a3b8] leading-relaxed">{signal.detail}</p>
                  <SignalWeightBar weight={(signal as EligibilitySignal & { weight?: number }).weight} />
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
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    discovered: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
    reviewing:  { bg: '#eff6ff', text: '#2563eb', dot: '#2563eb' },
    preparing:  { bg: '#faf5ff', text: '#7c3aed', dot: '#7c3aed' },
    drafting:   { bg: '#fff7ed', text: '#c2410c', dot: '#d97706' },
    submitted:  { bg: '#f0fdf4', text: '#16a34a', dot: '#16a34a' },
    awarded:    { bg: '#f0fdf4', text: '#15803d', dot: '#15803d' },
    rejected:   { bg: '#fef2f2', text: '#dc2626', dot: '#dc2626' },
  };
  const style = map[stage] || { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' };
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold capitalize"
      style={{ background: style.bg, color: style.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
      {stage}
    </span>
  );
}

// ── Score Arc ─────────────────────────────────────────────────────────────────

function LargeScoreArc({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const r = 28, cx = 34, cy = 34, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-[68px] h-[68px] flex-shrink-0">
      <svg width="68" height="68" viewBox="0 0 68 68" className="rotate-[-90deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold leading-none" style={{ color }}>{score.toFixed(0)}</span>
        <span className="text-[9px] text-[#94a3b8]">/100</span>
      </div>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',   label: 'Overview',   icon: Info },
  { key: 'data',       label: 'Grant Data', icon: BarChart2 },
  { key: 'draft',      label: 'Draft',      icon: Sparkles },
  { key: 'tasks',      label: 'Tasks',      icon: ClipboardList },
  { key: 'notes',      label: 'Notes',      icon: FileText },
  { key: 'workspace',  label: 'Documents',  icon: FolderOpen },
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
  const [{ id }, { tab: rawTab }, ctx] = await Promise.all([params, searchParams, getAuthContext()]);
  if (!ctx) redirect('/login');
  const tab: TabKey = (TABS.map(t => t.key) as string[]).includes(rawTab ?? '') ? (rawTab as TabKey) : 'overview';

  const match = await getGrantDetail(id, ctx.orgId);
  if (!match) notFound();

  const grant  = match.grant;
  const days   = getDaysUntil(grant?.close_date);
  const fields        = grant?.extracted_fields || {};
  const deadlineUrgent = days !== null && days >= 0 && days <= 14;
  const award         = fields.award_floor || fields.award_ceiling;

  const [tasks, note, integrations, orgConfig, craSnapshot, draftRow] = await Promise.all([
    getTasks(match.grant_id),
    getNote(match.grant_id),
    getAllIntegrations(ctx.orgCode),
    getOrgConfig(ctx.orgCode),
    loadOrgCraSnapshot(ctx.orgId),
    loadDraftForOrgOpportunity(ctx.orgId, match.grant_id),
  ]);

  // Phase 3D: compute funder affinity live. Sequential after the
  // Promise.all so craSnapshot.census_tract can feed the bank-AA gate.
  const affinitySnapshot = await loadFunderAffinitySnapshot(
    ctx.orgId,
    orgConfig?.region?.geo_scope?.states ?? [],
    craSnapshot?.census_tract ?? null,
    orgConfig?.segment?.funder_categories ?? [],
  );
  const funderId = (grant?.funder_id as string | null) ?? null;
  const funderAffinity = await computeFunderAffinity(funderId, affinitySnapshot);
  // Org's primary state derives from its region config. Falls back to '' so
  // buildMatchReasons skips the state-specific bullets cleanly rather than
  // claiming a state the org isn't in.
  const orgState = orgConfig?.region?.geo_scope?.states?.[0] ?? '';

  // Phase 4: derive craEvidence live from the snapshot + grant fields.
  // match_results doesn't store the evidence, so we recompute on every
  // render. The snapshot read is cheap (already in this Promise.all) and
  // grantRequiresLmi is a pure regex check.
  const craEvidence = craSnapshot ? {
    lmi_match:    (craSnapshot.lmi_status === 'low' || craSnapshot.lmi_status === 'moderate')
                    && grantRequiresLmi(fields),
    lmi_status:   craSnapshot.lmi_status,
    bank_funders: craSnapshot.bank_funders.slice(0, 6).map(b => b.name),
    community:    craSnapshot.community,
  } : undefined;

  const score: ScoreBreakdown = {
    composite:     match.composite_score,
    semantic:      match.semantic_similarity,
    eligibility:   match.eligibility_score,
    financial_990: match.financial_score ?? 50,
    historical:    match.historical_score,
    strategic:     match.strategic_score,
    funder_affinity:        funderAffinity.score * 100,
    funderAffinityEvidence: funderAffinity.evidence,
    craEvidence,
  };

  const googleConnected    = integrations.some(i => i.provider === 'google');
  const microsoftConnected = integrations.some(i => i.provider === 'microsoft');

  const openTasks = tasks.filter(t => !t.completed).length;

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      {/* ── Dark hero header ──────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-[#1e293b]"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1a2236 60%, #0f172a 100%)' }}>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        {/* Teal glow */}
        {match.composite_score >= 60 && (
          <div className="absolute top-0 right-1/3 w-64 h-32 rounded-full opacity-10 blur-3xl"
            style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }} />
        )}

        <div className="relative px-4 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <Link href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[12px] text-[#64748b] hover:text-[#94a3b8] mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#94a3b8]">Grant Detail</span>
          </Link>

          <div className="flex items-start gap-5">
            <LargeScoreArc score={match.composite_score} />

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-[22px] font-bold text-white leading-snug">{grant?.title}</h1>
                <StageBadge stage={match.pipeline_stage} />
              </div>

              <div className="flex flex-wrap gap-4 text-[13px] text-[#94a3b8]">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#64748b]" />
                  {grant?.agency_name}
                </span>
                {grant?.aln_codes?.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#64748b]" />
                    ALN {grant.aln_codes.join(', ')}
                  </span>
                )}
                <span className={`flex items-center gap-1.5 ${deadlineUrgent ? 'text-red-400 font-semibold' : ''}`}>
                  <Clock className={`w-3.5 h-3.5 ${deadlineUrgent ? 'text-red-400' : 'text-[#64748b]'}`} />
                  {grant?.close_date ? `Closes ${formatDate(grant.close_date)}` : 'No deadline'}
                  {days !== null && days >= 0 && (
                    <span className={`font-bold ml-1 px-1.5 py-0.5 rounded text-[11px] ${
                      deadlineUrgent ? 'bg-red-900/50 text-red-300' : 'bg-white/10 text-[#94a3b8]'
                    }`}>{days}d</span>
                  )}
                </span>
                {award && (
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-[#64748b]" />
                    {fields.award_floor && fields.award_ceiling
                      ? `${formatCurrency(fields.award_floor)} – ${formatCurrency(fields.award_ceiling)}`
                      : formatCurrency(award)}
                  </span>
                )}
              </div>

              {grant?.opportunity_number && (
                <div className="mt-3">
                  <a href={`https://grants.gov/search-results-detail/${grant.source_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12px] text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on Grants.gov · #{grant.opportunity_number}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 py-5 max-w-7xl mx-auto">
        {/* ── Tab bar ── */}
        <div className="flex items-center gap-1 mb-5 bg-white rounded-xl border border-[#e2e8f0] shadow-card px-2 py-2">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            const badge = key === 'tasks' && openTasks > 0 ? openTasks : null;
            return (
              <Link
                key={key}
                href={`/grant/${id}?tab=${key}`}
                className={`flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-semibold transition-all ${
                  active
                    ? 'bg-[#0f172a] text-white shadow-sm'
                    : 'text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge !== null && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                    active ? 'bg-[#0d9488] text-white' : 'bg-[#0d9488] text-white'
                  }`}>
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Main layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Left: tab content (3/5) */}
          <div className="lg:col-span-3 space-y-4">

            {/* OVERVIEW TAB */}
            {tab === 'overview' && (
              <>
                {(() => {
                  const reasons = buildMatchReasons(
                    score,
                    fields,
                    { agency_name: grant?.agency_name, aln_codes: grant?.aln_codes },
                    orgState,
                  );
                  if (!reasons.length) return null;
                  // Map match-reason categories onto the design-system
                  // FactorKey so the colored leading dot + factor tag
                  // surface correctly in the EvidenceList. The mapping
                  // collapses geography/population/compliance into the
                  // eligibility factor — they're sub-signals of it.
                  const categoryToFactor: Record<ReasonCategory, FactorKey> = {
                    mission:     'semantic',
                    eligibility: 'eligibility',
                    geography:   'eligibility',
                    population:  'eligibility',
                    financial:   'financial_990',
                    strategic:   'strategic',
                    compliance:  'eligibility',
                  };
                  const items: EvidenceItem[] = reasons.map(r => ({
                    text:   r.text,
                    factor: categoryToFactor[r.category],
                  }));
                  // Pursue/Maybe/Skip pill mirrors the dashboard
                  // RecommendationGroup thresholds.
                  const rec: Recommendation = score.composite >= 70
                    ? 'pursue'
                    : score.composite >= 50
                      ? 'maybe'
                      : 'skip';
                  return (
                    <div className="bg-canvas-1 rounded-lg shadow-flat p-5">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-[5px] flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #0a4d3c, #0891b2)' }}>
                            <Sparkles className="w-3.5 h-3.5 text-white" />
                          </div>
                          <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">
                            Why it&apos;s a match
                          </p>
                        </div>
                        <RecommendationPill recommendation={rec} />
                      </div>
                      <EvidenceList items={items} />
                      <p className="text-caption text-ink-3 mt-4 pt-3 border-t border-canvas-3">
                        Derived deterministically from Fundir&apos;s composite score and extracted grant data.
                      </p>
                    </div>
                  );
                })()}

                {match.recommendation && (
                  <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-[5px] flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest">Fundir Assessment</p>
                    </div>
                    <p className="text-[13px] text-[#475569] leading-relaxed">{match.recommendation}</p>
                  </div>
                )}

                {grant?.synopsis && (
                  <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Synopsis</p>
                    <p className="text-[13px] text-[#475569] leading-relaxed">{grant.synopsis}</p>
                  </div>
                )}

                {match.eligibility_flags?.length > 0 && (
                  <div className="rounded-xl border border-amber-200 p-5" style={{ background: '#fffbeb' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      <p className="text-[13px] font-bold text-amber-800">Eligibility Notes</p>
                    </div>
                    <ul className="space-y-2">
                      {(match.eligibility_flags as string[]).map((flag, i) => (
                        <li key={i} className="text-[13px] text-amber-700 flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span>{flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key metadata quick-view */}
                {(fields.award_floor || fields.award_ceiling || fields.grant_duration_months || fields.geographic_scope) && (
                  <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Key Details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {fields.award_floor && (
                        <div className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                          <p className="text-[10px] text-[#94a3b8] mb-1">Award Floor</p>
                          <p className="text-[14px] font-bold text-[#0f172a]">{formatCurrency(fields.award_floor)}</p>
                        </div>
                      )}
                      {fields.award_ceiling && (
                        <div className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                          <p className="text-[10px] text-[#94a3b8] mb-1">Award Ceiling</p>
                          <p className="text-[14px] font-bold text-[#0f172a]">{formatCurrency(fields.award_ceiling)}</p>
                        </div>
                      )}
                      {fields.grant_duration_months && (
                        <div className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                          <p className="text-[10px] text-[#94a3b8] mb-1">Duration</p>
                          <p className="text-[14px] font-bold text-[#0f172a]">{fields.grant_duration_months} months</p>
                        </div>
                      )}
                      {fields.geographic_scope && (
                        <div className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                          <p className="text-[10px] text-[#94a3b8] mb-1">Geography</p>
                          <p className="text-[14px] font-bold text-[#0f172a]">{fields.geographic_scope}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* GRANT DATA TAB */}
            {tab === 'data' && (
              <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <h2 className="text-[14px] font-bold text-[#0f172a]">Extracted Grant Data</h2>
                  <p className="text-[11px] text-[#64748b] mt-0.5">Structured fields extracted from grant opportunity text</p>
                </div>
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {fields.eligible_entity_types?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">Eligible Entity Types</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.eligible_entity_types.map((t: string) => (
                            <span key={t} className="px-2.5 py-1 bg-[#eff6ff] text-[#2563eb] rounded-full text-[11px] font-semibold border border-[#bfdbfe]">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {fields.target_population?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">Target Population</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.target_population.map((p: string) => (
                            <span key={p} className="px-2.5 py-1 bg-[#faf5ff] text-[#7c3aed] rounded-full text-[11px] font-semibold border border-[#ddd6fe]">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {fields.program_areas?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">Program Areas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.program_areas.map((a: string) => (
                            <span key={a} className="px-2.5 py-1 bg-[#f0fdf4] text-[#16a34a] rounded-full text-[11px] font-semibold border border-[#bbf7d0]">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {fields.compliance_frameworks?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">Compliance Requirements</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.compliance_frameworks.map((f: string) => (
                            <span key={f} className="px-2.5 py-1 bg-[#f8fafc] text-[#475569] rounded-full text-[11px] font-semibold border border-[#e2e8f0]">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-[#f1f5f9] grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { label: 'Award Floor',   value: fields.award_floor    ? formatCurrency(fields.award_floor)    : '—' },
                      { label: 'Award Ceiling', value: fields.award_ceiling  ? formatCurrency(fields.award_ceiling)  : '—' },
                      { label: 'Duration',      value: fields.grant_duration_months ? `${fields.grant_duration_months} months` : '—' },
                      { label: 'Cost Share',    value: fields.cost_sharing_required === true ? `Yes (${fields.cost_sharing_percentage ?? '?'}%)` : fields.cost_sharing_required === false ? 'Not required' : '—' },
                      { label: 'Geography',     value: fields.geographic_scope || '—' },
                      { label: 'Confidence',    value: fields.confidence_score != null ? `${Math.round((fields.confidence_score as number) * 100)}%` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                        <p className="text-[10px] text-[#94a3b8] mb-1">{label}</p>
                        <p className="text-[13px] font-bold text-[#0f172a]">{value}</p>
                      </div>
                    ))}
                  </div>

                  {fields.key_requirements?.length > 0 && (
                    <div className="pt-4 border-t border-[#f1f5f9]">
                      <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Key Requirements</p>
                      <ul className="space-y-2.5">
                        {fields.key_requirements.map((req: string, i: number) => (
                          <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#475569]">
                            <CheckCircle className="w-4 h-4 text-[#0d9488] mt-0.5 flex-shrink-0" />
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DRAFT TAB (Phase 6 cont) */}
            {tab === 'draft' && (
              <DraftViewer draft={draftRow} />
            )}

            {/* TASKS TAB */}
            {tab === 'tasks' && (
              <GrantTasks grantId={match.grant_id} initialTasks={tasks} />
            )}

            {/* NOTES TAB */}
            {tab === 'notes' && (
              <GrantNotes grantId={match.grant_id} initialBody={note?.body ?? ''} updatedAt={note?.updated_at} />
            )}

            {/* WORKSPACE TAB */}
            {tab === 'workspace' && (
              <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[5px] bg-[#f0fdfa] flex items-center justify-center">
                    <FolderOpen className="w-3.5 h-3.5 text-[#0d9488]" />
                  </div>
                  <div>
                    <h2 className="text-[13px] font-bold text-[#0f172a]">Grant Documents</h2>
                    <p className="text-[11px] text-[#64748b]">
                      Cloud storage workspace · LOI, narrative, budget, cover letter
                    </p>
                  </div>
                </div>
                <div className="p-5">
                  <GrantWorkspace
                    matchId={id}
                    grantTitle={grant?.title ?? 'Grant'}
                    orgCode={ctx.orgCode}
                    googleConnected={googleConnected}
                    microsoftConnected={microsoftConnected}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: score + 990 (2/5) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
                <h2 className="text-[13px] font-bold text-[#0f172a]">Match Score Breakdown</h2>
                <p className="text-[11px] text-[#94a3b8] mt-0.5">6-factor composite scoring</p>
              </div>
              <div className="p-5">
                <ScoreBreakdownChart score={score} />
              </div>
            </div>

            <FinancialAssessment
              signals={match.financial_signals ?? []}
              score={match.financial_score ?? 50}
            />

            <FinancialVerdict grantId={match.grant_id} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
