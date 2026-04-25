export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BarChart3, TrendingUp, DollarSign, Target, Award, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getReportsData() {
  const supabase = createServerClient();

  const [matchesRes, runsRes] = await Promise.all([
    supabase
      .from('match_results')
      .select(`
        id, composite_score, pipeline_stage, financial_score, matched_at,
        grant:grant_opportunities(title, agency_name, agency_code, close_date, extracted_fields)
      `)
      .order('matched_at', { ascending: false }),
    supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(12),
  ]);

  const matches = (matchesRes.data || []) as unknown as Array<{
    id: string;
    composite_score: number;
    pipeline_stage: string;
    financial_score: number;
    matched_at: string;
    grant: { title: string; agency_name: string; agency_code: string; close_date: string | null; extracted_fields: Record<string, unknown> } | null;
  }>;

  const runs = runsRes.data || [];

  // ── KPIs ──
  const total = matches.length;
  const active = matches.filter(m => ['reviewing', 'preparing', 'drafting', 'submitted'].includes(m.pipeline_stage)).length;
  const awarded = matches.filter(m => m.pipeline_stage === 'awarded').length;
  const submitted = matches.filter(m => ['submitted', 'awarded', 'rejected'].includes(m.pipeline_stage)).length;
  const winRate = submitted > 0 ? Math.round((awarded / submitted) * 100) : 0;
  const avgScore = total > 0 ? Math.round(matches.reduce((s, m) => s + m.composite_score, 0) / total) : 0;

  const pipelineValue = matches
    .filter(m => ['reviewing', 'preparing', 'drafting', 'submitted'].includes(m.pipeline_stage))
    .reduce((sum, m) => sum + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0);

  const awardedValue = matches
    .filter(m => m.pipeline_stage === 'awarded')
    .reduce((sum, m) => sum + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0);

  // ── Pipeline funnel ──
  const stageOrder = ['discovered', 'reviewing', 'preparing', 'drafting', 'submitted', 'awarded'];
  const stageCounts = stageOrder.map(s => ({
    stage: s,
    count: matches.filter(m => m.pipeline_stage === s).length,
    rejected: s === 'discovered' ? matches.filter(m => m.pipeline_stage === 'rejected').length : 0,
  }));

  // ── Score distribution ──
  const scoreBuckets = [
    { label: 'Excellent  90+', min: 90, max: 100, color: '#16a34a' },
    { label: 'Strong  75–89',  min: 75, max: 89,  color: '#0d9488' },
    { label: 'Good  60–74',    min: 60, max: 74,  color: '#2563eb' },
    { label: 'Moderate  40–59',min: 40, max: 59,  color: '#d97706' },
    { label: 'Low  <40',       min: 0,  max: 39,  color: '#dc2626' },
  ].map(b => ({
    ...b,
    count: matches.filter(m => m.composite_score >= b.min && m.composite_score <= b.max).length,
  }));
  const maxBucketCount = Math.max(...scoreBuckets.map(b => b.count), 1);

  // ── Agency breakdown ──
  const agencyMap: Record<string, { count: number; totalScore: number; awardedCount: number }> = {};
  for (const m of matches) {
    const agency = m.grant?.agency_name || 'Unknown';
    if (!agencyMap[agency]) agencyMap[agency] = { count: 0, totalScore: 0, awardedCount: 0 };
    agencyMap[agency].count++;
    agencyMap[agency].totalScore += m.composite_score;
    if (m.pipeline_stage === 'awarded') agencyMap[agency].awardedCount++;
  }
  const topAgencies = Object.entries(agencyMap)
    .map(([name, d]) => ({ name, count: d.count, avgScore: Math.round(d.totalScore / d.count), awardedCount: d.awardedCount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const maxAgencyCount = Math.max(...topAgencies.map(a => a.count), 1);

  // ── Upcoming deadlines ──
  const now = new Date();
  const upcoming = matches
    .filter(m => m.grant?.close_date && new Date(m.grant.close_date) >= now && !['rejected', 'awarded'].includes(m.pipeline_stage))
    .sort((a, b) => new Date(a.grant!.close_date!).getTime() - new Date(b.grant!.close_date!).getTime())
    .slice(0, 8);

  // ── Discovery history ──
  const discoveryHistory = runs.slice(0, 8).reverse().map(r => ({
    date: r.started_at,
    discovered: r.grants_discovered,
    high: r.high_matches,
    medium: r.medium_matches,
  }));
  const maxDiscovered = Math.max(...discoveryHistory.map(r => r.discovered), 1);

  return {
    total, active, awarded, submitted, winRate, avgScore,
    pipelineValue, awardedValue,
    stageCounts, scoreBuckets, maxBucketCount,
    topAgencies, maxAgencyCount,
    upcoming, discoveryHistory, maxDiscovered,
    runs,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: bg }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div className="text-[28px] font-bold text-[#0f172a] leading-none mb-1">{value}</div>
      <div className="text-[12px] font-medium text-[#64748b]">{label}</div>
      {sub && <div className="text-[11px] text-[#94a3b8] mt-0.5">{sub}</div>}
    </div>
  );
}

const STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
  discovered: { label: 'Discovered',  color: '#64748b', bg: '#f1f5f9' },
  reviewing:  { label: 'Reviewing',   color: '#2563eb', bg: '#eff6ff' },
  preparing:  { label: 'Preparing',   color: '#7c3aed', bg: '#faf5ff' },
  drafting:   { label: 'Drafting',    color: '#c2410c', bg: '#fff7ed' },
  submitted:  { label: 'Submitted',   color: '#0d9488', bg: '#f0fdfa' },
  awarded:    { label: 'Awarded',     color: '#16a34a', bg: '#f0fdf4' },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportsPage() {
  const d = await getReportsData();

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <BarChart3 className="w-5 h-5 text-[#0d9488]" />
              <h1 className="text-[22px] font-bold text-[#0f172a]">Reports & Analytics</h1>
            </div>
            <p className="text-[13px] text-[#64748b]">Grant pipeline performance · Chicago Youth Centers</p>
          </div>
          <div className="text-[11px] text-[#94a3b8]">Live · refreshes on each visit</div>
        </div>

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Total Tracked"       value={String(d.total)}                    sub="all grants in pipeline"                  icon={Target}    color="#2563eb" bg="#eff6ff" />
          <KpiCard label="Active Pipeline"     value={String(d.active)}                   sub="reviewing → submitted"                   icon={TrendingUp} color="#0d9488" bg="#f0fdfa" />
          <KpiCard label="Pipeline Value"      value={d.pipelineValue > 0 ? formatCurrency(d.pipelineValue) : '—'} sub="active grants award ceiling" icon={DollarSign} color="#7c3aed" bg="#faf5ff" />
          <KpiCard label="Win Rate"            value={d.submitted > 0 ? `${d.winRate}%` : '—'} sub={`${d.awarded} awarded / ${d.submitted} submitted`} icon={Award} color="#16a34a" bg="#f0fdf4" />
        </div>

        {/* ── Row 2: Pipeline Funnel + Score Distribution ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Pipeline Funnel */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Pipeline Funnel</h2>
              <p className="text-[11px] text-[#64748b] mt-0.5">Grant progression across all stages</p>
            </div>
            <div className="p-5 space-y-2.5">
              {d.stageCounts.map(({ stage, count }) => {
                const meta = STAGE_META[stage] || { label: stage, color: '#64748b', bg: '#f8fafc' };
                const pct = d.total > 0 ? (count / d.total) * 100 : 0;
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-[#0f172a]">{meta.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold tabular-nums" style={{ color: meta.color }}>{count}</span>
                        <span className="text-[11px] text-[#94a3b8] w-8 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
              {/* Rejected */}
              {(() => {
                const rejCount = d.stageCounts[0]?.rejected || 0;
                const pct = d.total > 0 ? (rejCount / d.total) * 100 : 0;
                if (!rejCount) return null;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-[#dc2626]">Rejected</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold tabular-nums text-[#dc2626]">{rejCount}</span>
                        <span className="text-[11px] text-[#94a3b8] w-8 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#dc2626' }} />
                    </div>
                  </div>
                );
              })()}
            </div>
            {d.awardedValue > 0 && (
              <div className="mx-5 mb-5 p-3 bg-[#f0fdf4] rounded-lg border border-[#bbf7d0] flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#16a34a]">Total Awards Secured</span>
                <span className="text-[14px] font-bold text-[#16a34a]">{formatCurrency(d.awardedValue)}</span>
              </div>
            )}
          </div>

          {/* Score Distribution */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Match Score Distribution</h2>
              <p className="text-[11px] text-[#64748b] mt-0.5">Composite score across all {d.total} tracked grants</p>
            </div>
            <div className="p-5">
              {/* Bar chart */}
              <div className="flex items-end gap-3 h-32 mb-4">
                {d.scoreBuckets.map(b => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: b.color }}>{b.count}</span>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${b.count > 0 ? Math.max(4, (b.count / d.maxBucketCount) * 80) : 2}px`,
                          background: b.color,
                          opacity: b.count > 0 ? 1 : 0.15,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                {d.scoreBuckets.map(b => (
                  <div key={b.label} className="flex-1 text-center">
                    <div className="text-[9px] text-[#94a3b8] leading-tight">{b.label.split('  ').map((l, i) => <div key={i}>{l}</div>)}</div>
                  </div>
                ))}
              </div>
              {/* Summary */}
              <div className="mt-4 pt-4 border-t border-[#f1f5f9] grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#f8fafc] rounded-lg">
                  <p className="text-[11px] text-[#94a3b8]">Average Score</p>
                  <p className="text-[20px] font-bold text-[#0f172a]">{d.avgScore}<span className="text-[12px] text-[#94a3b8] ml-0.5">/100</span></p>
                </div>
                <div className="p-3 bg-[#f0fdf4] rounded-lg">
                  <p className="text-[11px] text-[#94a3b8]">High Match (≥75)</p>
                  <p className="text-[20px] font-bold text-[#16a34a]">
                    {d.scoreBuckets.filter(b => b.min >= 75).reduce((s, b) => s + b.count, 0)}
                    <span className="text-[12px] text-[#94a3b8] ml-0.5">grants</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 3: Agency Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Grants by Agency</h2>
              <p className="text-[11px] text-[#64748b] mt-0.5">Top funders by grant volume in pipeline</p>
            </div>
            <div className="divide-y divide-[#f8fafc]">
              {d.topAgencies.length === 0 ? (
                <p className="p-5 text-[13px] text-[#94a3b8]">Run discovery to populate agency data.</p>
              ) : d.topAgencies.map((agency, i) => (
                <div key={agency.name} className="flex items-center gap-4 px-5 py-3 hover:bg-[#f8fafc] transition-colors">
                  <span className="text-[12px] font-bold text-[#94a3b8] w-4 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#0f172a] truncate">{agency.name}</p>
                    <div className="mt-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0d9488] rounded-full"
                        style={{ width: `${(agency.count / d.maxAgencyCount) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-[#0f172a] tabular-nums">{agency.count}</p>
                      <p className="text-[10px] text-[#94a3b8]">grants</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold tabular-nums" style={{ color: agency.avgScore >= 70 ? '#16a34a' : agency.avgScore >= 40 ? '#d97706' : '#dc2626' }}>
                        {agency.avgScore}
                      </p>
                      <p className="text-[10px] text-[#94a3b8]">avg score</p>
                    </div>
                    {agency.awardedCount > 0 && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-[#f0fdf4] rounded-full">
                        <CheckCircle className="w-3 h-3 text-[#16a34a]" />
                        <span className="text-[11px] font-semibold text-[#16a34a]">{agency.awardedCount} awarded</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming deadlines mini-list */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0d9488]" />
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Upcoming Deadlines</h2>
            </div>
            <div className="divide-y divide-[#f8fafc]">
              {d.upcoming.length === 0 ? (
                <p className="p-5 text-[13px] text-[#94a3b8]">No upcoming deadlines.</p>
              ) : d.upcoming.map(m => {
                const days = Math.ceil((new Date(m.grant!.close_date!).getTime() - Date.now()) / 86400000);
                return (
                  <div key={m.id} className="px-4 py-3">
                    <p className="text-[12px] font-semibold text-[#0f172a] line-clamp-1">{m.grant?.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[11px] text-[#64748b]">{formatDate(m.grant?.close_date)}</p>
                      <span className={`text-[11px] font-bold ${days <= 7 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-[#64748b]'}`}>
                        {days === 0 ? 'Today' : `${days}d`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Row 4: Discovery History ── */}
        {d.discoveryHistory.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Discovery Run History</h2>
              <p className="text-[11px] text-[#64748b] mt-0.5">Grants discovered per pipeline run</p>
            </div>
            <div className="p-5">
              <div className="flex items-end gap-2 h-24">
                {d.discoveryHistory.map((run, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-[#94a3b8] tabular-nums">{run.discovered}</span>
                    <div className="w-full flex flex-col items-center justify-end gap-0.5" style={{ height: '60px' }}>
                      {run.high > 0 && (
                        <div className="w-full rounded-sm bg-[#16a34a]" style={{ height: `${Math.max(2, (run.high / d.maxDiscovered) * 60)}px` }} />
                      )}
                      {run.medium > 0 && (
                        <div className="w-full rounded-sm bg-[#d97706]" style={{ height: `${Math.max(2, (run.medium / d.maxDiscovered) * 60)}px` }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#16a34a]" /><span className="text-[11px] text-[#64748b]">High match</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#d97706]" /><span className="text-[11px] text-[#64748b]">Medium match</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ── Pipeline runs log ── */}
        {d.runs.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Discovery Run Log</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#f1f5f9]">
                    {['Run Date', 'Discovered', 'New', 'High Match', 'Med Match', 'Duration'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.runs.slice(0, 8).map(run => (
                    <tr key={run.id} className="border-t border-[#f8fafc] hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3 text-[#475569]">{new Date(run.started_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-[#0f172a] tabular-nums">{run.grants_discovered}</td>
                      <td className="px-4 py-3 font-semibold text-[#0d9488] tabular-nums">{run.grants_new}</td>
                      <td className="px-4 py-3 font-semibold text-[#16a34a] tabular-nums">{run.high_matches}</td>
                      <td className="px-4 py-3 font-semibold text-[#d97706] tabular-nums">{run.medium_matches}</td>
                      <td className="px-4 py-3 text-[#64748b]">{run.duration_seconds != null ? `${run.duration_seconds}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
