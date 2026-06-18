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
  ClipboardList, FileText, Info, Shield, Sparkles,
  Clock, ChevronRight, FolderOpen,
} from 'lucide-react';
import { ScoreBadge } from '@/components/ui/score-badge';
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

const SIGNAL_CONFIG: Record<SignalStatus, { icon: ElementType; cls: string; label: string }> = {
  match:    { icon: CheckCircle, cls: 'bg-signal-pursue-soft text-signal-pursue ring-signal-pursue/20', label: 'Confirmed' },
  likely:   { icon: MinusCircle, cls: 'bg-signal-maybe-soft  text-signal-maybe  ring-signal-maybe/20',  label: 'Likely'    },
  unknown:  { icon: HelpCircle,  cls: 'bg-canvas-2           text-ink-2          ring-canvas-3',         label: 'Unknown'   },
  mismatch: { icon: XCircle,     cls: 'bg-signal-skip-soft   text-signal-skip    ring-signal-skip/20',   label: 'Risk'      },
};

const SOURCE_BADGE: Record<NonNullable<EligibilitySignal['source']>, { label: string; cls: string }> = {
  irs_990:       { label: 'IRS 990',       cls: 'bg-canvas-2     text-ink-1    ring-canvas-3'    },
  self_reported: { label: 'Self-Reported', cls: 'bg-action-soft  text-action   ring-action/20'   },
  estimated:     { label: 'Estimated',     cls: 'bg-signal-maybe-soft text-signal-maybe ring-signal-maybe/20' },
  'n/a':         { label: 'N/A',           cls: 'bg-canvas-2     text-ink-2    ring-canvas-3'    },
};

function SignalWeightBar({ weight }: { weight?: number }) {
  if (!weight) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="h-1 w-16 bg-canvas-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-action" style={{ width: `${weight * 100}%` }} />
      </div>
      <span className="text-eyebrow text-ink-3 font-medium">{Math.round(weight * 100)}% weight</span>
    </div>
  );
}

function FinancialAssessment({ signals, score }: { signals: EligibilitySignal[]; score: number }) {
  if (!signals?.length) {
    return (
      <div className="bg-canvas-1 rounded-lg ring-1 ring-dashed ring-canvas-3 p-6 text-center">
        <Shield className="w-8 h-8 text-canvas-3 mx-auto mb-3" />
        <p className="text-body font-medium text-ink-1 mb-1">990 screening not available</p>
        <p className="text-caption text-ink-2">
          Go to <Link href="/settings" className="text-action hover:text-action-hover underline font-medium">Settings</Link> to enable financial screening.
        </p>
      </div>
    );
  }

  const isPreQual     = !signals.some(s => s.status === 'mismatch' && ['Budget Fit', 'Financial Stability'].includes(s.factor));
  const scoreVariant  = score >= 70 ? 'pursue' : score >= 40 ? 'maybe' : 'skip';
  const scoreClass    = scoreVariant === 'pursue' ? 'text-signal-pursue'
                      : scoreVariant === 'maybe'  ? 'text-signal-maybe'
                                                  : 'text-signal-skip';
  const hasSelfData   = signals.some(s => s.source === 'self_reported');
  const matchCount    = signals.filter(s => s.status === 'match').length;
  const likelyCount   = signals.filter(s => s.status === 'likely').length;
  const mismatchCount = signals.filter(s => s.status === 'mismatch').length;

  return (
    <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-canvas-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-action-soft text-action flex items-center justify-center">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-h2 font-semibold text-ink-0">990 eligibility assessment</h2>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-[28px] font-semibold tabular-nums leading-none ${scoreClass}`}>
              {score.toFixed(0)}
            </span>
            <span className="text-caption text-ink-2">/100</span>
          </div>
        </div>

        {/* Mini signal summary */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex gap-0.5 h-1.5 flex-1 rounded-full overflow-hidden bg-canvas-2">
            <div className="bg-signal-pursue" style={{ width: `${(matchCount    / signals.length) * 100}%` }} />
            <div className="bg-signal-maybe"  style={{ width: `${(likelyCount   / signals.length) * 100}%` }} />
            <div className="bg-signal-skip"   style={{ width: `${(mismatchCount / signals.length) * 100}%` }} />
          </div>
          <span className="text-eyebrow text-ink-2 flex-shrink-0">{signals.length} signals</span>
        </div>

        <p className="text-caption text-ink-2 mt-2 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasSelfData ? 'bg-action' : 'bg-ink-2'}`} />
          {hasSelfData ? 'IRS 990 + self-reported data' : 'IRS Form 990 financial data'}
        </p>
      </div>

      {/* Pre-qual banner */}
      <div className={`px-5 py-2.5 flex items-center gap-2 border-b text-caption font-semibold ${
        isPreQual
          ? 'bg-signal-pursue-soft text-signal-pursue border-signal-pursue/20'
          : 'bg-signal-skip-soft   text-signal-skip   border-signal-skip/20'
      }`}>
        {isPreQual
          ? <><CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> No hard financial disqualifiers</>
          : <><XCircle    className="w-3.5 h-3.5 flex-shrink-0" /> Financial risk flags — review before applying</>
        }
      </div>

      {/* Signals */}
      <div className="divide-y divide-canvas-3">
        {signals.map(signal => {
          const cfg    = SIGNAL_CONFIG[signal.status];
          const Icon   = cfg.icon;
          const srcCfg = signal.source ? SOURCE_BADGE[signal.source] : null;
          return (
            <div key={signal.factor} className="px-5 py-3.5 hover:bg-canvas-2/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ring-1 ${cfg.cls}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-body font-semibold text-ink-0">{signal.factor}</span>
                    <span className={`text-eyebrow font-semibold px-1.5 py-0.5 rounded-sm ${cfg.cls.replace(/ring-[\w/-]+/, '')}`}>
                      {cfg.label}
                    </span>
                    {srcCfg && signal.source !== 'n/a' && (
                      <span className={`text-eyebrow font-semibold px-1.5 py-0.5 rounded-sm ring-1 ${srcCfg.cls}`}>
                        {srcCfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-caption font-medium text-ink-1 mb-0.5">{signal.headline}</p>
                  <p className="text-caption text-ink-2 leading-relaxed">{signal.detail}</p>
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

const STAGE_STYLE: Record<string, string> = {
  discovered: 'bg-canvas-2          text-ink-1',
  reviewing:  'bg-action-soft       text-action',
  preparing:  'bg-signal-maybe-soft text-signal-maybe',
  drafting:   'bg-signal-maybe-soft text-signal-maybe',
  submitted:  'bg-signal-pursue-soft text-signal-pursue',
  awarded:    'bg-signal-pursue-soft text-signal-pursue',
  rejected:   'bg-signal-skip-soft  text-signal-skip',
};

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_STYLE[stage] ?? STAGE_STYLE.discovered;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-caption font-semibold capitalize ring-1 ring-canvas-3 ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {stage}
    </span>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'opportunity', label: 'Opportunity',    icon: Info },
  { key: 'funder',      label: 'Funder & 990',   icon: Shield },
  { key: 'workspace',   label: 'Workspace',      icon: FolderOpen },
] as const;
type TabKey = typeof TABS[number]['key'];

const WORKSPACE_SECTIONS = [
  { key: 'draft',     label: 'Draft',     icon: Sparkles },
  { key: 'tasks',     label: 'Tasks',     icon: ClipboardList },
  { key: 'notes',     label: 'Notes',     icon: FileText },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
] as const;
type WorkspaceSection = typeof WORKSPACE_SECTIONS[number]['key'];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function GrantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; section?: string }>;
}) {
  const [{ id }, { tab: rawTab, section: rawSection }, ctx] = await Promise.all([params, searchParams, getAuthContext()]);
  if (!ctx) redirect('/login');
  const tab: TabKey = (TABS.map(t => t.key) as string[]).includes(rawTab ?? '')
    ? (rawTab as TabKey)
    : 'opportunity';
  const workspaceSection: WorkspaceSection =
    (WORKSPACE_SECTIONS.map(s => s.key) as string[]).includes(rawSection ?? '')
      ? (rawSection as WorkspaceSection)
      : 'draft';

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

  const reasons = buildMatchReasons(
    score,
    fields,
    { agency_name: grant?.agency_name, aln_codes: grant?.aln_codes },
    orgState,
  );
  const categoryToFactor: Record<ReasonCategory, FactorKey> = {
    mission:     'semantic',
    eligibility: 'eligibility',
    geography:   'eligibility',
    population:  'eligibility',
    financial:   'financial_990',
    strategic:   'strategic',
    compliance:  'eligibility',
  };
  const reasonItems: EvidenceItem[] = reasons.map(r => ({
    text:   r.text,
    factor: categoryToFactor[r.category],
  }));
  const rec: Recommendation = score.composite >= 70 ? 'pursue'
                            : score.composite >= 50 ? 'maybe'
                                                    : 'skip';

  // Aggregate badge counts (workspace tab shows them as inner-nav pills).
  const openNotes = note?.body?.trim() ? 1 : 0;
  const hasDraft  = draftRow ? 1 : 0;

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      {/* ── Light hero on canvas ─────────────────────────────────── */}
      <div className="bg-canvas-0 border-b border-canvas-3">
        <div className="px-4 sm:px-6 md:px-8 py-5 max-w-7xl mx-auto">
          <Link href="/dashboard"
            className="inline-flex items-center gap-1.5 text-caption text-ink-2 hover:text-ink-0 mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            <ChevronRight className="w-3 h-3" />
            <span>Grant Detail</span>
          </Link>

          <div className="flex items-start gap-4">
            <ScoreBadge score={match.composite_score} size="lg" />

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                <h1 className="text-h1 font-semibold text-ink-0 leading-tight flex-1 min-w-0 break-words">
                  {grant?.title}
                </h1>
                <div className="shrink-0">
                  <StageBadge stage={match.pipeline_stage} />
                </div>
              </div>

              <p className="text-body text-ink-1 mb-3 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-ink-2 shrink-0" />
                <span className="truncate">{grant?.agency_name}</span>
              </p>

              {/* Single tight metadata row — deadline, amount, ALN */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-caption text-ink-1">
                <span className={`inline-flex items-center gap-1.5 ${deadlineUrgent ? 'text-alert font-semibold' : ''}`}>
                  <Clock className={`w-3.5 h-3.5 ${deadlineUrgent ? 'text-alert' : 'text-ink-2'}`} />
                  {grant?.close_date ? `Closes ${formatDate(grant.close_date)}` : 'No deadline'}
                  {days !== null && days >= 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-sm text-eyebrow font-semibold tabular-nums ${
                      deadlineUrgent ? 'bg-signal-skip-soft text-signal-skip' : 'bg-canvas-2 text-ink-2'
                    }`}>{days}d</span>
                  )}
                </span>
                {award && (
                  <span className="inline-flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-ink-2" />
                    {fields.award_floor && fields.award_ceiling
                      ? `${formatCurrency(fields.award_floor)} – ${formatCurrency(fields.award_ceiling)}`
                      : formatCurrency(award)}
                  </span>
                )}
                {grant?.aln_codes?.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-ink-2" />
                    ALN {grant.aln_codes.join(', ')}
                  </span>
                )}
                {grant?.opportunity_number && (
                  <a href={`https://grants.gov/search-results-detail/${grant.source_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-action hover:text-action-hover font-semibold transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on Grants.gov
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 py-5 max-w-7xl mx-auto">
        {/* ── Tab bar — light, design-token-aligned ── */}
        <div className="flex items-center gap-1 mb-5 border-b border-canvas-3" role="tablist">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <Link
                key={key}
                href={`/grant/${id}?tab=${key}`}
                role="tab"
                aria-selected={active}
                className={`flex items-center gap-2 px-4 py-2.5 -mb-px text-body font-semibold border-b-2 transition-colors ${
                  active
                    ? 'border-action text-action'
                    : 'border-transparent text-ink-2 hover:text-ink-0'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </div>

        {/* ── Single full-width content column ── */}
        <div className="space-y-4 max-w-4xl">

          {/* ════════════════════════════════════════════════════════════
              OPPORTUNITY TAB
             ════════════════════════════════════════════════════════════ */}
          {tab === 'opportunity' && (
            <>
              {/* "Why it's a match" — THE prominent panel */}
              {reasonItems.length > 0 && (
                <div className="bg-canvas-1 rounded-lg shadow-flat p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-sm flex items-center justify-center bg-action-soft text-action">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">
                        Why it&apos;s a match
                      </p>
                    </div>
                    <RecommendationPill recommendation={rec} />
                  </div>
                  {match.recommendation && (
                    <p className="text-body text-ink-1 leading-relaxed mb-3 pb-3 border-b border-canvas-3">
                      {match.recommendation}
                    </p>
                  )}
                  <EvidenceList items={reasonItems} />
                  <p className="text-caption text-ink-3 mt-4 pt-3 border-t border-canvas-3">
                    Summarized by Fundir from your org profile, CRA tract, and funder 990s.
                  </p>
                </div>
              )}

              {/* Instrumentl-style label:value metadata block */}
              <MetadataBlock fields={fields} />

              {/* Synopsis */}
              {grant?.synopsis && (
                <div className="bg-canvas-1 rounded-lg shadow-flat p-5">
                  <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-3">Synopsis</p>
                  <p className="text-body text-ink-0 leading-relaxed">{grant.synopsis}</p>
                </div>
              )}

              {/* Eligibility flags */}
              {match.eligibility_flags?.length > 0 && (
                <div className="bg-signal-maybe-soft ring-1 ring-signal-maybe/20 rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-signal-maybe" />
                    <p className="text-eyebrow font-semibold text-signal-maybe uppercase tracking-wider">Eligibility notes</p>
                  </div>
                  <ul className="space-y-2">
                    {(match.eligibility_flags as string[]).map((flag, i) => (
                      <li key={i} className="text-body text-ink-0 flex items-start gap-2">
                        <span className="text-signal-maybe mt-0.5 flex-shrink-0">•</span>{flag}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key requirements (when extracted) */}
              {fields.key_requirements?.length > 0 && (
                <div className="bg-canvas-1 rounded-lg shadow-flat p-5">
                  <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-3">Key requirements</p>
                  <ul className="space-y-2.5">
                    {fields.key_requirements.map((req: string, i: number) => (
                      <li key={i} className="flex items-start gap-2.5 text-body text-ink-0">
                        <CheckCircle className="w-4 h-4 text-action mt-0.5 flex-shrink-0" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              FUNDER & 990 TAB
             ════════════════════════════════════════════════════════════ */}
          {tab === 'funder' && (
            <>
              <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
                <div className="px-5 py-4 border-b border-canvas-3">
                  <h2 className="text-h2 font-semibold text-ink-0">Match score breakdown</h2>
                  <p className="text-caption text-ink-2 mt-0.5">6-factor composite</p>
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
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              WORKSPACE TAB — inner nav over Draft / Tasks / Notes / Documents
             ════════════════════════════════════════════════════════════ */}
          {tab === 'workspace' && (
            <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
              {/* Inner-nav pill row */}
              <div className="flex items-center gap-1 px-3 pt-3 pb-0 border-b border-canvas-3 overflow-x-auto">
                {WORKSPACE_SECTIONS.map(({ key, label, icon: Icon }) => {
                  const active = workspaceSection === key;
                  const badge =
                      key === 'tasks' && openTasks > 0 ? openTasks
                    : key === 'notes' && openNotes > 0 ? '•'
                    : key === 'draft' && hasDraft  > 0 ? '•'
                    : null;
                  return (
                    <Link
                      key={key}
                      href={`/grant/${id}?tab=workspace&section=${key}`}
                      className={`flex items-center gap-1.5 px-3 py-2 -mb-px text-body font-semibold border-b-2 transition-colors whitespace-nowrap ${
                        active
                          ? 'border-action text-action'
                          : 'border-transparent text-ink-2 hover:text-ink-0'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                      {badge !== null && (
                        <span className={`min-w-[18px] text-center text-eyebrow font-semibold px-1.5 py-0.5 rounded-sm ${
                          active ? 'bg-action text-canvas-1' : 'bg-canvas-2 text-ink-2'
                        }`}>
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              <div className="p-5">
                {workspaceSection === 'draft' && (
                  <DraftViewer draft={draftRow} grantId={match.grant_id} />
                )}
                {workspaceSection === 'tasks' && (
                  <GrantTasks grantId={match.grant_id} initialTasks={tasks} />
                )}
                {workspaceSection === 'notes' && (
                  <GrantNotes grantId={match.grant_id} initialBody={note?.body ?? ''} updatedAt={note?.updated_at} />
                )}
                {workspaceSection === 'documents' && (
                  <GrantWorkspace
                    matchId={id}
                    grantTitle={grant?.title ?? 'Grant'}
                    orgCode={ctx.orgCode}
                    googleConnected={googleConnected}
                    microsoftConnected={microsoftConnected}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ── Instrumentl-style label:value metadata block ─────────────────────────────
//
// One canvas card; each row is `label  ·  value` (or value as chip array).
// Mirrors the Instrumentl grant detail panel: Deadline / Grant amount /
// Fields of work / Applicant type / Funding uses / Geography.

function MetadataBlock({ fields }: { fields: Record<string, unknown> }) {
  const f = fields as {
    award_floor?:           number | null;
    award_ceiling?:         number | null;
    grant_duration_months?: number | null;
    cost_sharing_required?: boolean | null;
    cost_sharing_percentage?: number | null;
    geographic_scope?:      string | null;
    program_areas?:         string[];
    target_population?:     string[];
    eligible_entity_types?: string[];
    compliance_frameworks?: string[];
    confidence_score?:      number | null;
  };

  const amount =
    f.award_floor && f.award_ceiling ? `${formatCurrency(f.award_floor)} – ${formatCurrency(f.award_ceiling)}`
    : f.award_ceiling                ? `Up to ${formatCurrency(f.award_ceiling)}`
    : f.award_floor                  ? `From ${formatCurrency(f.award_floor)}`
                                     : null;

  const costShare =
    f.cost_sharing_required === true  ? `Yes (${f.cost_sharing_percentage ?? '?'}%)`
  : f.cost_sharing_required === false ? 'Not required'
                                      : null;

  type Row = { label: string; value: React.ReactNode };
  const rows: Row[] = [];
  if (amount)                                  rows.push({ label: 'Grant amount',    value: amount });
  if (f.grant_duration_months)                 rows.push({ label: 'Duration',        value: `${f.grant_duration_months} months` });
  if (f.geographic_scope)                      rows.push({ label: 'Geography',       value: f.geographic_scope });
  if (f.eligible_entity_types?.length)         rows.push({ label: 'Applicant type',  value: <ChipRow items={f.eligible_entity_types} tone="eligibility" /> });
  if (f.program_areas?.length)                 rows.push({ label: 'Fields of work',  value: <ChipRow items={f.program_areas}         tone="pursue"      /> });
  if (f.target_population?.length)             rows.push({ label: 'Target',          value: <ChipRow items={f.target_population}     tone="strategic"   /> });
  if (f.compliance_frameworks?.length)         rows.push({ label: 'Compliance',      value: <ChipRow items={f.compliance_frameworks} tone="neutral"     /> });
  if (costShare)                               rows.push({ label: 'Cost share',      value: costShare });

  if (rows.length === 0) return null;

  return (
    <div className="bg-canvas-1 rounded-lg shadow-flat p-5">
      <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-4">Details</p>
      <dl className="space-y-3">
        {rows.map(r => (
          <div key={r.label} className="grid grid-cols-[140px_1fr] gap-3 items-start">
            <dt className="text-caption text-ink-2 pt-0.5">{r.label}</dt>
            <dd className="text-body text-ink-0">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Chip array used inside the MetadataBlock value column.
function ChipRow({ items, tone }: { items: string[]; tone: 'eligibility' | 'pursue' | 'strategic' | 'neutral' }) {
  const cls =
      tone === 'pursue'      ? 'bg-signal-pursue-soft text-signal-pursue'
    : tone === 'eligibility' ? 'bg-action-soft        text-action'
    : tone === 'strategic'   ? 'bg-signal-maybe-soft  text-signal-maybe'
                             : 'bg-canvas-2           text-ink-1';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(x => (
        <span key={x} className={`inline-flex items-center px-2 py-0.5 rounded-sm text-caption font-medium ${cls}`}>
          {x}
        </span>
      ))}
    </div>
  );
}
