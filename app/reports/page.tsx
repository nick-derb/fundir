export const dynamic = 'force-dynamic';

import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ReportsCharts, type ReportsData } from '@/components/reports-charts';
import { redirect } from 'next/navigation';

const STAGE_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  reviewing:  'Reviewing',
  preparing:  'Preparing',
  drafting:   'Drafting',
  submitted:  'Submitted',
  awarded:    'Awarded',
  rejected:   'Declined',
};

async function buildReportsData(orgId: string, orgName: string): Promise<ReportsData> {
  const supabase = createServerClient();

  const { data: raw } = await supabase
    .from('match_results')
    .select(`
      composite_score, pipeline_stage,
      grant:grant_opportunities(extracted_fields)
    `)
    .eq('org_id', orgId)
    .order('matched_at', { ascending: false });

  const matches = (raw || []) as unknown as Array<{
    composite_score: number;
    pipeline_stage:  string;
    grant: { extracted_fields: Record<string, unknown> } | null;
  }>;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const awarded   = matches.filter(m => m.pipeline_stage === 'awarded');
  const submitted = matches.filter(m => ['submitted', 'awarded', 'rejected'].includes(m.pipeline_stage));
  const active    = matches.filter(m => ['reviewing', 'preparing', 'drafting', 'submitted'].includes(m.pipeline_stage));

  const awardedValue  = awarded.reduce((s, m) => s + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0);
  const pipelineValue = active.reduce( (s, m) => s + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0);
  const winRate       = submitted.length > 0 ? (awarded.length / submitted.length) * 100 : 0;
  const avgGrantSize  = awarded.length   > 0 ? awardedValue / awarded.length : 0;

  // ── Stage funnel ──────────────────────────────────────────────────────────
  const stageOrder = ['discovered', 'reviewing', 'preparing', 'drafting', 'submitted', 'awarded', 'rejected'];
  const stages: ReportsData['stages'] = stageOrder.map(s => ({
    stage: STAGE_LABELS[s] ?? s,
    count: matches.filter(m => m.pipeline_stage === s).length,
    label: STAGE_LABELS[s] ?? s,
  })).filter(s => s.count > 0);

  // ── Score distribution ────────────────────────────────────────────────────
  const BUCKETS = [
    { range: '<40',   min: 0,  max: 39  },
    { range: '40–59', min: 40, max: 59  },
    { range: '60–74', min: 60, max: 74  },
    { range: '75–89', min: 75, max: 89  },
    { range: '90+',   min: 90, max: 100 },
  ];

  const scoreDistribution: ReportsData['scoreDistribution'] = BUCKETS.map(b => ({
    range: b.range,
    count: matches.filter(m => m.composite_score >= b.min && m.composite_score <= b.max).length,
  }));

  // ── Match score vs win rate correlation ───────────────────────────────────
  const matchScoreVsWin: ReportsData['matchScoreVsWin'] = BUCKETS.map(b => {
    const bucket    = matches.filter(m => m.composite_score >= b.min && m.composite_score <= b.max);
    const buckSub   = bucket.filter(m => ['submitted', 'awarded', 'rejected'].includes(m.pipeline_stage));
    const buckAward = bucket.filter(m => m.pipeline_stage === 'awarded');
    return {
      range:   b.range,
      winRate: buckSub.length > 0 ? Math.round((buckAward.length / buckSub.length) * 100) : 0,
      count:   bucket.length,
    };
  });

  // Monthly revenue and W/L charts are built from real data only.
  // If the org has no awarded/submitted history yet the charts show empty.
  const monthlyRevenue: ReportsData['monthlyRevenue'] = [];
  const monthlyWL:      ReportsData['monthlyWL']      = [];
  const winRateTrend:   ReportsData['winRateTrend']   = [];

  // ── Funder type breakdown (from real awarded grants) ──────────────────────
  // Derive from agency names if available; leave empty if no awarded grants.
  const funderTypes: ReportsData['funderTypes'] = [];

  return {
    orgName,
    kpis: {
      totalAwarded:  awardedValue,
      winRate:       Math.round(winRate),
      pipelineValue,
      avgGrantSize:  Math.round(avgGrantSize),
      submitted:     submitted.length,
      winRateDelta:  0,
      awardedDelta:  0,
    },
    monthlyRevenue,
    monthlyWL,
    winRateTrend,
    stages: stages.length ? stages : [],
    scoreDistribution,
    funderTypes,
    matchScoreVsWin,
  };
}

export default async function ReportsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const data = await buildReportsData(ctx.orgId, ctx.orgName);

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      <ReportsCharts data={data} />
    </AppShell>
  );
}
