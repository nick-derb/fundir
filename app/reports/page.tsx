export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ReportsCharts, type ReportsData } from '@/components/reports-charts';

// ── Static CYC baseline data (12-month trailing) ──────────────────────────────

const CYC_MONTHLY_REVENUE: ReportsData['monthlyRevenue'] = [
  { month: 'May',  awarded:  85_000, requested: 200_000 },
  { month: 'Jun',  awarded:       0, requested: 150_000 },
  { month: 'Jul',  awarded: 125_000, requested: 180_000 },
  { month: 'Aug',  awarded:       0, requested:  95_000 },
  { month: 'Sep',  awarded: 230_000, requested: 300_000 },
  { month: 'Oct',  awarded:  75_000, requested: 175_000 },
  { month: 'Nov',  awarded:       0, requested: 120_000 },
  { month: 'Dec',  awarded:  95_000, requested: 140_000 },
  { month: 'Jan',  awarded:       0, requested: 200_000 },
  { month: 'Feb',  awarded: 180_000, requested: 250_000 },
  { month: 'Mar',  awarded:       0, requested: 175_000 },
  { month: 'Apr',  awarded: 290_000, requested: 350_000 },
];

const CYC_MONTHLY_WL: ReportsData['monthlyWL'] = [
  { month: 'May', won: 2, lost: 1, pending: 3 },
  { month: 'Jun', won: 0, lost: 2, pending: 4 },
  { month: 'Jul', won: 3, lost: 1, pending: 2 },
  { month: 'Aug', won: 0, lost: 1, pending: 5 },
  { month: 'Sep', won: 4, lost: 0, pending: 3 },
  { month: 'Oct', won: 1, lost: 2, pending: 4 },
  { month: 'Nov', won: 0, lost: 3, pending: 2 },
  { month: 'Dec', won: 2, lost: 1, pending: 3 },
  { month: 'Jan', won: 0, lost: 2, pending: 5 },
  { month: 'Feb', won: 3, lost: 1, pending: 2 },
  { month: 'Mar', won: 0, lost: 1, pending: 4 },
  { month: 'Apr', won: 5, lost: 0, pending: 3 },
];

const CYC_WIN_RATE_TREND: ReportsData['winRateTrend'] = [
  { month: 'May', rate: 40 },
  { month: 'Jun', rate: 0 },
  { month: 'Jul', rate: 60 },
  { month: 'Aug', rate: 0 },
  { month: 'Sep', rate: 57 },
  { month: 'Oct', rate: 33 },
  { month: 'Nov', rate: 0 },
  { month: 'Dec', rate: 50 },
  { month: 'Jan', rate: 0 },
  { month: 'Feb', rate: 60 },
  { month: 'Mar', rate: 0 },
  { month: 'Apr', rate: 63 },
];

const CYC_FUNDER_TYPES: ReportsData['funderTypes'] = [
  { name: 'Government (Federal)',  value: 2_450_000, pct: 47 },
  { name: 'Government (State/City)', value: 980_000, pct: 19 },
  { name: 'Foundations',           value: 780_000,  pct: 15 },
  { name: 'Corporate Philanthropy', value: 520_000,  pct: 10 },
  { name: 'Other / Individual',    value: 470_000,  pct: 9  },
];

// ── Stage label map ───────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  reviewing:  'Reviewing',
  preparing:  'Preparing',
  drafting:   'Drafting',
  submitted:  'Submitted',
  awarded:    'Awarded',
  rejected:   'Declined',
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function buildReportsData(): Promise<ReportsData> {
  const supabase = createServerClient();

  const { data: raw } = await supabase
    .from('match_results')
    .select(`
      composite_score, pipeline_stage,
      grant:grant_opportunities(extracted_fields)
    `)
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

  // ── Score distribution ─────────────────────────────────────────────────────
  const scoreDistribution: ReportsData['scoreDistribution'] = [
    { range: '<40',   min: 0,  max: 39  },
    { range: '40–59', min: 40, max: 59  },
    { range: '60–74', min: 60, max: 74  },
    { range: '75–89', min: 75, max: 89  },
    { range: '90+',   min: 90, max: 100 },
  ].map(b => ({
    range: b.range,
    count: matches.filter(m => m.composite_score >= b.min && m.composite_score <= b.max).length,
  }));

  // ── Match score vs win rate correlation ───────────────────────────────────
  const matchScoreVsWin: ReportsData['matchScoreVsWin'] = [
    { range: '<40',   min: 0,  max: 39  },
    { range: '40–59', min: 40, max: 59  },
    { range: '60–74', min: 60, max: 74  },
    { range: '75–89', min: 75, max: 89  },
    { range: '90+',   min: 90, max: 100 },
  ].map(b => {
    const bucket    = matches.filter(m => m.composite_score >= b.min && m.composite_score <= b.max);
    const buckSub   = bucket.filter(m => ['submitted', 'awarded', 'rejected'].includes(m.pipeline_stage));
    const buckAward = bucket.filter(m => m.pipeline_stage === 'awarded');
    const computedRate = buckSub.length > 0
      ? Math.round((buckAward.length / buckSub.length) * 100)
      : 0;
    // blend with CYC benchmark if no data yet
    const benchmark: Record<string, number> = { '<40': 12, '40–59': 22, '60–74': 38, '75–89': 55, '90+': 72 };
    return {
      range:   b.range,
      winRate: bucket.length > 5 ? computedRate : (benchmark[b.range] ?? 0),
      count:   bucket.length,
    };
  });

  return {
    kpis: {
      totalAwarded:  awardedValue  || 1_080_000,
      winRate:       winRate       || 48,
      pipelineValue: pipelineValue || 2_340_000,
      avgGrantSize:  avgGrantSize  || 270_000,
      submitted:     submitted.length || 18,
      winRateDelta:  5,
      awardedDelta:  145_000,
    },
    monthlyRevenue: CYC_MONTHLY_REVENUE,
    monthlyWL:      CYC_MONTHLY_WL,
    winRateTrend:   CYC_WIN_RATE_TREND,
    stages:         stages.length ? stages : [
      { stage: 'Discovered', count: 0, label: 'Discovered' },
    ],
    scoreDistribution,
    funderTypes:    CYC_FUNDER_TYPES,
    matchScoreVsWin,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportsPage() {
  const data = await buildReportsData();
  return (
    <AppShell>
      <ReportsCharts data={data} />
    </AppShell>
  );
}
