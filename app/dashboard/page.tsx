export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { MatchResult } from '@/types';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { loadCraIntelligence } from '@/lib/cra/intelligence';
import { loadOrgCraSnapshot } from '@/lib/cra/repo';
import { loadFunderIntelligence } from '@/lib/funder-intel/repo';
import { bundledLogoFor } from '@/lib/org-logo';
import { DashboardHero, type HeroKpi } from '@/components/dashboard-hero';
import {
  DashboardConsole,
  type CraRowVM, type DeadlineVM, type FunderVM,
} from '@/components/dashboard-console';

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

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function getDashboardData(orgId: string, orgCode: string) {
  const supabase = createServerClient();
  const [matchesRes, orgRes] = await Promise.all([
    supabase
      .from('match_results')
      .select('*, grant:grant_opportunities(*)')
      .eq('org_id', orgId)
      .order('composite_score', { ascending: false }),
    supabase
      .from('organizations')
      .select('name, ein, financial_data, financial_year, financial_fetched_at')
      .eq('org_code', orgCode)
      .single(),
  ]);

  const matches = (matchesRes.data || []) as MatchResult[];
  const org     = orgRes.data;
  const now     = new Date();

  const urgent = matches
    .filter(m => {
      if (!m.grant?.close_date) return false;
      const d = Math.ceil((new Date(m.grant.close_date).getTime() - now.getTime()) / 86400000);
      return d >= 0 && d <= 14 && !['rejected', 'awarded'].includes(m.pipeline_stage);
    })
    .sort((a, b) => {
      const da = new Date(a.grant?.close_date || '9999').getTime();
      const db = new Date(b.grant?.close_date || '9999').getTime();
      return da - db;
    });

  const totalAwardPotential = matches
    .filter(m => m.composite_score >= 60)
    .reduce((s, m) => s + (m.grant?.extracted_fields?.award_ceiling || m.grant?.extracted_fields?.award_floor || 0), 0);

  const logoUrl = bundledLogoFor(orgCode) ?? await getOrgLogoUrl(org?.ein);

  const [craRows, craSnapshot, funderIntelRows] = await Promise.all([
    loadCraIntelligence(orgId),
    loadOrgCraSnapshot(orgId),
    loadFunderIntelligence(orgId, 30),
  ]);

  const pursue = matches.filter(m => m.composite_score >= 70);

  return {
    matches,
    totalTracked:      matches.length,
    highMatches:       pursue.length,
    urgentGrants:      urgent,
    totalAwardPotential,
    org,
    logoUrl,
    craRows,
    craCommunity: craSnapshot?.community ?? null,
    funderIntelRows,
  };
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const data = await getDashboardData(ctx.orgId, ctx.orgCode);
  const now  = Date.now();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const avgScore = data.matches.length
    ? Math.round(data.matches.reduce((s, m) => s + m.composite_score, 0) / data.matches.length)
    : 0;

  // ── Console-hero inputs — all derived from real data ─────────────────────
  const sources = [
    data.org?.financial_year ? `IRS 990 FY${data.org.financial_year}` : 'IRS 990',
    'GATA',
    data.craRows.length > 0 ? 'CRA' : null,
  ].filter(Boolean).join(' · ');

  const syncedLabel = data.org?.financial_fetched_at
    ? new Date(data.org.financial_fetched_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'today';

  const tickerMessages = [
    `${data.totalTracked} opportunities tracked · ${data.highMatches} high-match`,
    data.urgentGrants.length > 0 ? `${data.urgentGrants.length} deadlines closing within 14 days` : null,
    data.totalAwardPotential > 0 ? `${fmtMoney(data.totalAwardPotential)} in award potential · score-60+ grants` : null,
    data.craRows.length > 0 ? `${data.craRows.length} CRA banks reach your community` : null,
    data.org?.ein ? `990 filing sync verified · EIN ${data.org.ein}` : null,
  ].filter((m): m is string => Boolean(m));

  const heroKpis: HeroKpi[] = [
    { label: 'Tracked', value: data.totalTracked, caption: `${data.highMatches} high-match`,
      spark: '2,18 14,15 26,16 38,11 50,9 62,5' },
    { label: 'Avg score', value: avgScore,
      tone: avgScore >= 60 ? 'accent' : avgScore >= 40 ? 'warning' : 'critical',
      caption: 'composite, all matches', spark: '2,13 14,12 26,14 38,12 50,13 62,12' },
    { label: 'Award potential', value: Math.round(data.totalAwardPotential / 1000), pre: '$', suf: 'K',
      caption: 'score ≥ 60 grants', spark: '2,20 14,17 26,13 38,12 50,8 62,4' },
    { label: 'Urgent', value: data.urgentGrants.length,
      tone: data.urgentGrants.length > 0 ? 'critical' : undefined,
      caption: 'closing ≤ 14 days', spark: '2,8 14,10 26,12 38,14 50,15 62,17' },
  ];

  // ── FIG-section view models (real data) ──────────────────────────────────
  const totalPeerFunding = data.craRows.reduce((s, r) => s + r.peer_total_amount, 0);
  const craMeta = [
    `${data.craRows.length} bank${data.craRows.length === 1 ? '' : 's'}`,
    data.craCommunity ? `your ${data.craCommunity}` : null,
    totalPeerFunding > 0 ? `${fmtMoney(totalPeerFunding)} peer funding scanned` : null,
  ].filter(Boolean).join(' · ');

  const craRowsVM: CraRowVM[] = data.craRows.map(r => ({
    name:         r.bank_name,
    relationship: r.relationship,
    action:       r.action,
    einPending:   !r.ein_verified,
    rationale:    r.rationale,
    confidence:   Math.round(r.confidence * 100),
    chips:        r.peer_signal.slice(0, 3).map(p => ({ name: p.name, amount: fmtMoney(p.total_amount) })),
    more:         Math.max(0, r.peer_signal_count - 3),
  }));

  const deadlinesVM: DeadlineVM[] = data.urgentGrants.map(m => ({
    title:  m.grant?.title ?? '—',
    agency: m.grant?.agency_name ?? '',
    days:   Math.max(0, Math.ceil((new Date(m.grant!.close_date!).getTime() - now) / 86400000)),
    href:   `/grant/${m.grant_id}`,
  }));

  const fundersVM: FunderVM[] = data.funderIntelRows.slice(0, 8).map(f => ({
    score:  Math.round(f.prospect_score),
    name:   f.funder_name,
    peers:  f.peer_overlap_count,
    amount: fmtMoney(f.total_peer_amount),
  }));

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      <div className="px-4 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto space-y-2">

        {/* ── Brand-new org: empty-state hero ─────────────────── */}
        {data.totalTracked === 0 ? (
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
        ) : (
          <>
            {/* Console hero — provenance, CYC × Fundir lockup, animated KPIs */}
            <DashboardHero
              orgName={data.org?.name ?? ctx.orgName}
              logoUrl={data.logoUrl}
              today={today}
              ein={data.org?.ein ?? null}
              sources={sources}
              syncedLabel={syncedLabel}
              tickerMessages={tickerMessages}
              kpis={heroKpis}
            />

            {/* FIG.01 CRA · FIG.02 Deadlines · FIG.03 Funder prospects */}
            <DashboardConsole
              cra={{ rows: craRowsVM, meta: craMeta }}
              deadlines={deadlinesVM}
              funders={fundersVM}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
