export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { GrantTable } from '@/components/grant-table';
import { OrgLogo } from '@/components/org-logo';
import { MatchResult } from '@/types';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Flame, Sparkles } from 'lucide-react';
import { GrantCard } from '@/components/ui/grant-card';
import { RecommendationGroup } from '@/components/ui/recommendation-group';
import { ConcentrationPanel } from '@/components/concentration-panel';
import { loadLatestConcentration } from '@/lib/discovery/concentration';
import { CraIntelligencePanel } from '@/components/cra-intelligence-panel';
import { loadCraIntelligence } from '@/lib/cra/intelligence';
import { FunderIntelligencePanel } from '@/components/funder-intelligence-panel';
import { loadFunderIntelligence } from '@/lib/funder-intel/repo';
import { loadOrgCraSnapshot } from '@/lib/cra/repo';
import { bundledLogoFor } from '@/lib/org-logo';

// ── Logo auto-fetch via ProPublica EIN → website → Clearbit ──────────────────
async function getOrgLogoUrl(ein?: string | null): Promise<string | null> {
  if (!ein) return null;
  try {
    const einClean = ein.replace(/[-\s]/g, '');
    const res = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/organizations/${einClean}.json`,
      { next: { revalidate: 604800 }, signal: AbortSignal.timeout(2500) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const website: string | undefined = json.organization?.website;
    if (!website) return null;
    const href = website.startsWith('http') ? website : `https://${website}`;
    const domain = new URL(href).hostname.replace(/^www\./, '');
    return `https://logo.clearbit.com/${domain}`;
  } catch {
    return null;
  }
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function getDashboardData(orgId: string, orgCode: string) {
  const supabase = createServerClient();
  const [matchesRes, opportunitiesRes, orgRes] = await Promise.all([
    // Fetch every match. The previous .limit(100) cap distorted the
    // triage counts: when CYC had 197 matches, the top-100-by-score slice
    // hid ~95% of the Skip bucket and reported it as "3" instead of the
    // real ~140. PostgREST's default ceiling is 1000 which comfortably
    // covers a single org's match set; if any tenant exceeds that we
    // switch to a paginated fetch.
    supabase
      .from('match_results')
      .select('*, grant:grant_opportunities(*)')
      .eq('org_id', orgId)
      .order('composite_score', { ascending: false }),
    supabase
      .from('grant_opportunities')
      .select('id, close_date, status')
      .eq('status', 'posted'),
    supabase
      .from('organizations')
      .select('name, ein, financial_data, financial_year, financial_fetched_at')
      .eq('org_code', orgCode)
      .single(),
  ]);

  const matches       = (matchesRes.data || []) as MatchResult[];
  const opportunities = opportunitiesRes.data || [];
  const org           = orgRes.data;
  const now           = new Date();

  const upcoming = opportunities.filter(o => {
    if (!o.close_date) return false;
    const d = Math.ceil((new Date(o.close_date).getTime() - now.getTime()) / 86400000);
    return d >= 0 && d <= 30;
  });

  const urgent = matches.filter(m => {
    if (!m.grant?.close_date) return false;
    const d = Math.ceil((new Date(m.grant.close_date).getTime() - now.getTime()) / 86400000);
    return d >= 0 && d <= 14;
  });

  const totalAwardPotential = matches
    .filter(m => m.composite_score >= 60)
    .reduce((sum, m) => sum + (m.grant?.extracted_fields?.award_ceiling || m.grant?.extracted_fields?.award_floor || 0), 0);

  const pipelineActive = matches.filter(m =>
    ['reviewing', 'preparing', 'drafting'].includes(m.pipeline_stage)
  ).length;

  // Prefer the bundled logo (instant, never breaks) over the ProPublica
  // → Clearbit chain (network round-trip, coverage-gappy).
  const logoUrl = bundledLogoFor(orgCode) ?? await getOrgLogoUrl(org?.ein);
  // Phase 6: latest funding-concentration snapshot. Null until the user
  // runs /api/admin/compute-concentration once; ConcentrationPanel
  // renders the empty-state CTA in that case.
  const concentration = await loadLatestConcentration(orgId);

  // Phase 7 / Workstream A: CRA bank intelligence — the prospect list
  // ranked by relationship + peer-funding signal. craSnapshot carries
  // the tract's community label for the panel's empty-state copy.
  // Phase 7 / Workstream B8: funder-intelligence panel — ranked prospect
  // funders with cited briefs. Empty until B2 ingest + B5 scoring runs.
  const [craRows, craSnapshot, funderIntelRows] = await Promise.all([
    loadCraIntelligence(orgId),
    loadOrgCraSnapshot(orgId),
    loadFunderIntelligence(orgId, 30),
  ]);

  // Win-triage buckets — pursue/maybe/skip per DESIGN_SYSTEM.md §2.9.
  // Thresholds match the rest of the matcher (≥70 pursue, ≥50 maybe).
  const pursue = matches.filter(m => m.composite_score >= 70);
  const maybe  = matches.filter(m => m.composite_score >= 50 && m.composite_score < 70);
  const skip   = matches.filter(m => m.composite_score < 50);

  return {
    matches,
    totalTracked:      matches.length,
    highMatches:       pursue.length,
    upcomingDeadlines: upcoming.length,
    urgentGrants:      urgent.sort((a, b) => {
      const da = new Date(a.grant?.close_date || '9999').getTime();
      const db = new Date(b.grant?.close_date || '9999').getTime();
      return da - db;
    }),
    totalAwardPotential,
    pipelineActive,
    triagePursue: pursue.slice(0, 5),
    triageMaybe:  maybe.slice(0, 5),
    triageSkip:   skip.slice(0, 8),
    triageCounts: { pursue: pursue.length, maybe: maybe.length, skip: skip.length },
    org,
    logoUrl,
    concentration,
    craRows,
    craCommunity: craSnapshot?.community ?? null,
    funderIntelRows,
  };
}

function formatGrantCardEyebrow(match: MatchResult): string {
  const award = match.grant?.extracted_fields?.award_ceiling || match.grant?.extracted_fields?.award_floor;
  const parts: string[] = [];
  if (award) parts.push(`Up to ${formatCompactPublic(award)}`);
  if (match.grant?.agency_code) parts.push(match.grant.agency_code);
  if (match.grant?.aln_codes?.length) parts.push(`ALN ${match.grant.aln_codes[0]}`);
  return parts.join(' · ');
}

/**
 * Single-line rationale for the GrantCard inline slot. Strips the
 * "Best program fit: X." prefix (already surfaced as matchedProgram on
 * the score badge) and trims the trailing planning verb that's generic
 * ("Recommend immediate eligibility review and application planning.").
 * Caps at ~180 chars so the card stays compact.
 */
function buildRationale(match: MatchResult): string | undefined {
  const r = match.recommendation;
  if (!r) return undefined;
  // Strip leading "Best program fit: <name>. " prefix.
  const stripped = r.replace(/^Best program fit:[^.]+\.\s*/i, '');
  // Strip trailing generic planning advice; the body of the rationale is
  // the interesting part.
  const trimmed = stripped
    .replace(/\s*Recommend [^.]+\.\s*$/i, '')
    .replace(/\s*Verify full eligibility[^.]+\.\s*$/i, '');
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed;
}

function formatCompactPublic(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysUntil(close: string | null | undefined): number | null {
  if (!close) return null;
  const ms = new Date(close).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86400000);
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ── KpiCard ─────────────────────────────────────────────────────────────────
// Operations-console KPI tile. Section-label eyebrow + mono KPI value + a
// caption sub-line. Hairline border, no shadow, no fill — semantic tone (if
// any) reads only as a 3px left border. Tone is intentionally optional: most
// KPIs have no value-judgement attached.
function KpiCard({
  label, value, caption, tone,
}: {
  label:   string;
  value:   string;
  caption?: string;
  tone?:   'success' | 'warning' | 'critical' | 'info';
}) {
  const toneBorder =
      tone === 'success'  ? 'border-l-[3px] border-l-success'
    : tone === 'warning'  ? 'border-l-[3px] border-l-warning'
    : tone === 'critical' ? 'border-l-[3px] border-l-critical'
    : tone === 'info'     ? 'border-l-[3px] border-l-info'
                          : '';
  return (
    <div className={`bg-surface border border-hairline rounded-sm px-4 py-3 ${toneBorder}`}>
      <p className="text-eyebrow uppercase text-secondary">{label}</p>
      <p className="font-mono text-kpi text-primary mt-1.5">{value}</p>
      {caption && <p className="text-caption text-tertiary mt-0.5">{caption}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const data = await getDashboardData(ctx.orgId, ctx.orgCode);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const avgScore = data.matches.length
    ? Math.round(data.matches.reduce((s, m) => s + m.composite_score, 0) / data.matches.length)
    : 0;

  // Pipeline stage strip — one accent + neutral ramp, no rainbow.
  // The brief is firm on ≤1 accent + neutrals per chart. We carry the
  // accent on the two stages closest to a submitted state (drafting +
  // submitted), and use ink shades for earlier funnel stages.
  const STAGES = [
    { stage: 'discovered', label: 'Discovered', color: 'var(--ink-300)' },
    { stage: 'reviewing',  label: 'Reviewing',  color: 'var(--ink-400)' },
    { stage: 'preparing',  label: 'Preparing',  color: 'var(--ink-500)' },
    { stage: 'drafting',   label: 'Drafting',   color: 'var(--accent)' },
    { stage: 'submitted',  label: 'Submitted',  color: 'var(--success)' },
  ];

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      <div className="px-4 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto space-y-5">

        {/* ── Brand-new org: empty-state hero ─────────────────── */}
        {data.totalTracked === 0 && (
          <div className="bg-surface border border-hairline rounded-sm px-6 md:px-10 py-10 md:py-12 max-w-3xl">
            <p className="text-eyebrow uppercase text-accent mb-3">Welcome to Fundir</p>
            <h2 className="text-display text-primary leading-tight mb-3">
              Let&apos;s find your first matching grants
            </h2>
            <p className="text-body text-muted leading-relaxed mb-6 max-w-xl">
              Run discovery once and Fundir will surface federal and foundation grants
              matched to {data.org?.name ?? ctx.orgName}&apos;s mission, programs, and
              financial profile — scored, ranked, and reverse-screened against your 990.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/discover"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-body-strong bg-accent text-accent-on hover:bg-accent-hover transition-colors">
                <Sparkles className="w-3.5 h-3.5" />
                Run your first discovery
              </Link>
              <Link href="/settings"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-body-strong text-primary border border-hairline bg-surface hover:bg-elevated transition-colors">
                Sync 990 financials
              </Link>
            </div>
          </div>
        )}

        {/* ── Page header ─────────────────────────────────────────── */}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {data.logoUrl && <OrgLogo src={data.logoUrl} alt={ctx.orgName} />}
              <div className="min-w-0">
                <p className="text-eyebrow uppercase text-tertiary">{today}</p>
                <h1 className="text-h1 text-primary truncate">
                  {data.org?.name ?? ctx.orgName}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/discover"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-body-strong bg-accent text-accent-on hover:bg-accent-hover transition-colors">
                <Sparkles className="w-3.5 h-3.5" />
                Run discovery
              </Link>
              <Link href="/pipeline"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-body-strong text-primary border border-hairline bg-surface hover:bg-elevated transition-colors">
                Open pipeline
              </Link>
            </div>
          </div>

          {/* ── KPI strip — equal cards on a 4-col grid ───────────────
             Section-label eyebrow + mono KPI value + caption sub-line.
             No drop shadow; hairline border only. Delta slot is left
             out for now — it'd require period-over-period data we
             don't yet compute. */}
          {data.totalTracked > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <KpiCard
                label="Tracked"
                value={String(data.totalTracked)}
                caption={`${data.highMatches} high-match`}
              />
              <KpiCard
                label="Avg score"
                value={String(avgScore)}
                tone={avgScore >= 60 ? 'success' : avgScore >= 40 ? 'warning' : 'critical'}
                caption="composite, all matches"
              />
              <KpiCard
                label="Award potential"
                value={formatCompact(data.totalAwardPotential)}
                caption="score ≥ 60 grants"
              />
              <KpiCard
                label="Urgent"
                value={String(data.urgentGrants.length)}
                tone={data.urgentGrants.length > 0 ? 'critical' : undefined}
                caption="closing ≤ 14 days"
              />
            </div>
          )}
        </div>

        {/* ── Funding concentration (Phase 6) ───────────────────── */}
        {/* Surfaces only when there's actual financial data to compute against.
            Without a snapshot the panel renders the small CTA empty-state. */}
        {data.totalTracked > 0 && (
          <ConcentrationPanel snapshot={data.concentration} />
        )}

        {/* ── CRA bank intelligence (Phase 7 / Workstream A) ────── */}
        {/* The differentiator panel. Banks whose CRA assessment area covers
            the org's primary tract, ranked by relationship + peer-funding
            signal. Existing → Deepen; Prospect+peer → Open (warm); cold
            prospects → Monitor. Hidden when the org has no tract or no
            covering banks. */}
        {data.craRows.length > 0 && (
          <CraIntelligencePanel rows={data.craRows} community={data.craCommunity} />
        )}

        {/* ── Funder intelligence (Phase 7 / Workstream B8) ─────── */}
        {/* Ranked prospect funders backing peers like this org. Each row
            expands to a Claude-generated brief citing real grants_made
            rows. Empty until B2 (990 ingest) + B5 (scorer) + B6 (brief
            generator) run. */}
        {data.funderIntelRows.length > 0 && (
          <FunderIntelligencePanel
            rows={data.funderIntelRows}
            org_name={data.org?.name ?? ctx.orgName}
          />
        )}

        {/* ── Main content row ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Top opportunities (2/3 on desktop, full-width on mobile) */}
          <div className="lg:col-span-2 rounded-sm border border-hairline bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-hairline flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-eyebrow uppercase text-secondary">Top opportunities</h2>
                <span className="text-eyebrow uppercase text-tertiary">· by match score</span>
              </div>
              <Link href="/discover" className="text-caption text-accent hover:text-accent-hover flex items-center gap-1 transition-colors">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Win-triage primitive — Pursue/Maybe/Skip sections via the
                design-system <RecommendationGroup>. The Skip section is a
                feature: saying no is the value the directories can't deliver
                (DESIGN_SYSTEM.md §2.9). */}
            <div className="px-5 py-5">
              {data.totalTracked === 0 ? (
                <div className="text-center text-caption text-tertiary py-6">
                  No matches yet. Run discovery from <Link href="/discover" className="text-accent hover:text-accent-hover transition-colors">/discover</Link>.
                </div>
              ) : (
                <RecommendationGroup
                  pursue={{
                    count: data.triageCounts.pursue,
                    children: data.triagePursue.map(m => (
                      <GrantCard
                        key={m.id}
                        href={`/grant/${m.grant_id}`}
                        title={m.grant?.title ?? '—'}
                        funder={m.grant?.agency_name ?? ''}
                        eyebrow={formatGrantCardEyebrow(m)}
                        score={m.composite_score}
                        recommendation="pursue"
                        rationale={buildRationale(m)}
                        deadlineDays={daysUntil(m.grant?.close_date)}
                        deadlineDate={m.grant?.close_date}
                      />
                    )),
                  }}
                  maybe={{
                    count: data.triageCounts.maybe,
                    children: data.triageMaybe.map(m => (
                      <GrantCard
                        key={m.id}
                        href={`/grant/${m.grant_id}`}
                        title={m.grant?.title ?? '—'}
                        funder={m.grant?.agency_name ?? ''}
                        eyebrow={formatGrantCardEyebrow(m)}
                        score={m.composite_score}
                        recommendation="maybe"
                        rationale={buildRationale(m)}
                        deadlineDays={daysUntil(m.grant?.close_date)}
                        deadlineDate={m.grant?.close_date}
                      />
                    )),
                  }}
                  skip={{
                    count: data.triageCounts.skip,
                    children: data.triageSkip.map(m => (
                      <GrantCard
                        key={m.id}
                        href={`/grant/${m.grant_id}`}
                        title={m.grant?.title ?? '—'}
                        funder={m.grant?.agency_name ?? ''}
                        eyebrow={formatGrantCardEyebrow(m)}
                        score={m.composite_score}
                        recommendation="skip"
                        rationale={buildRationale(m)}
                        reason={m.recommendation ?? undefined}
                        deadlineDays={daysUntil(m.grant?.close_date)}
                        deadlineDate={m.grant?.close_date}
                      />
                    )),
                  }}
                />
              )}
            </div>

            {/* Pipeline distribution */}
            {data.totalTracked > 0 && (
              <div className="px-5 py-4 border-t border-hairline">
                <p className="text-eyebrow uppercase text-tertiary mb-2">Pipeline</p>
                <div className="flex gap-0.5 h-1 mb-2 bg-elevated">
                  {STAGES.map(({ stage, color }) => {
                    const count = data.matches.filter(m => m.pipeline_stage === stage).length;
                    const pct = (count / data.totalTracked) * 100;
                    return pct > 0 ? (
                      <div key={stage} className="h-full" style={{ width: `${pct}%`, background: color }} />
                    ) : null;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {STAGES.map(({ stage, label, color }) => {
                    const count = data.matches.filter(m => m.pipeline_stage === stage).length;
                    return count > 0 ? (
                      <div key={stage} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-caption text-secondary">
                          {label} <span className="font-mono font-semibold text-primary">{count}</span>
                        </span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Urgent deadlines (1/3) */}
          <div className="rounded-sm border border-hairline bg-surface overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-hairline flex items-center gap-2">
              <Flame className={`w-3.5 h-3.5 ${data.urgentGrants.length > 0 ? 'text-critical' : 'text-tertiary'}`} />
              <h2 className="text-eyebrow uppercase text-secondary">Urgent deadlines</h2>
              {data.urgentGrants.length > 0 && (
                <span className="ml-auto font-mono text-eyebrow font-semibold px-1.5 py-0.5 text-critical bg-critical-tint rounded-sm">
                  {data.urgentGrants.length}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto theme-divide">
              {data.urgentGrants.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
                  <p className="text-body font-medium text-muted">No urgent deadlines</p>
                  <p className="text-caption mt-1 text-tertiary">
                    All grants have &gt; 14 days remaining
                  </p>
                </div>
              ) : (
                data.urgentGrants.map(match => {
                  const days = Math.ceil(
                    (new Date(match.grant!.close_date!).getTime() - Date.now()) / 86400000
                  );
                  // Per brief: ≤1d → critical, ≤7d → warning, else neutral.
                  const badgeCls =
                      days <= 1 ? 'text-critical bg-critical-tint'
                    : days <= 7 ? 'text-warning  bg-warning-tint'
                                : 'text-secondary bg-elevated';
                  return (
                    <Link key={match.id} href={`/grant/${match.grant_id}`}>
                      <div className="row-urgent-hover px-4 py-3 group">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-caption font-medium text-primary line-clamp-2 group-hover:text-accent transition-colors leading-snug">
                            {match.grant?.title}
                          </p>
                          <span className={`font-mono text-eyebrow font-semibold tabular-nums px-1.5 py-0.5 rounded-sm shrink-0 ${badgeCls}`}>
                            {days}d
                          </span>
                        </div>
                        <p className="text-eyebrow text-tertiary truncate">
                          {match.grant?.agency_name}
                        </p>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 border-t border-hairline">
              <Link href="/discover" className="flex items-center justify-center gap-1 text-caption text-accent hover:text-accent-hover transition-colors">
                View all deadlines <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Full match list — demoted behind a disclosure ────────── */}
        {data.matches.length === 0 ? (
          <div className="rounded-sm border border-dashed border-hairline bg-surface p-12 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-tertiary" />
            <p className="text-body font-medium mb-4 text-muted">No grant matches yet.</p>
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-body-strong bg-accent text-accent-on hover:bg-accent-hover transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run your first discovery
            </Link>
          </div>
        ) : (
          <details className="group bg-surface border border-hairline rounded-sm">
            <summary className="flex items-center justify-between gap-2 px-5 py-3 cursor-pointer list-none">
              <div>
                <h2 className="text-h2 text-primary">All matches</h2>
                <p className="text-caption mt-0.5 text-secondary">
                  {data.totalTracked} opportunities · click to expand the full table
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 transition-transform group-open:rotate-90 text-tertiary" />
            </summary>
            <div className="border-t border-hairline">
              <GrantTable matches={data.matches} />
            </div>
          </details>
        )}

      </div>
    </AppShell>
  );
}
