export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { FederalExposure } from '@/components/federal-exposure';
import { GrantTable } from '@/components/grant-table';
import { FinancialSnapshot } from '@/components/financial-snapshot';
import { MatchResult } from '@/types';
import { ComputedFinancials, Filing990 } from '@/lib/propublica';
import Link from 'next/link';
import { RefreshCw, TrendingUp, Target, Clock, AlertTriangle } from 'lucide-react';

async function getDashboardData() {
  const supabase = createServerClient();
  const [matchesRes, opportunitiesRes, orgRes] = await Promise.all([
    supabase
      .from('match_results')
      .select('*, grant:grant_opportunities(*)')
      .order('composite_score', { ascending: false })
      .limit(100),
    supabase
      .from('grant_opportunities')
      .select('id, close_date, status')
      .eq('status', 'posted'),
    supabase
      .from('organizations')
      .select('name, ein, financial_data, financial_year, financial_fetched_at')
      .eq('org_code', 'CYC2025')
      .single(),
  ]);

  const matches = (matchesRes.data || []) as MatchResult[];
  const opportunities = opportunitiesRes.data || [];
  const org = orgRes.data;

  const now = new Date();
  const upcoming = opportunities.filter(o => {
    if (!o.close_date) return false;
    const days = Math.ceil((new Date(o.close_date).getTime() - now.getTime()) / 86400000);
    return days >= 0 && days <= 30;
  });

  return {
    matches,
    totalTracked: matches.length,
    highMatches: matches.filter(m => m.composite_score >= 70).length,
    mediumMatches: matches.filter(m => m.composite_score >= 40 && m.composite_score < 70).length,
    upcomingDeadlines: upcoming.length,
    org,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const financialData = data.org?.financial_data as {
    computed: ComputedFinancials;
    latest: Filing990;
    history: Filing990[];
  } | null;

  const statCards = [
    { label: 'Total Tracked',  value: data.totalTracked,      icon: TrendingUp, color: '#2563eb', bg: '#eff6ff' },
    { label: 'High Match ≥70', value: data.highMatches,       icon: Target,     color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Medium Match',   value: data.mediumMatches,     icon: TrendingUp, color: '#d97706', bg: '#fffbeb' },
    { label: 'Deadlines <30d', value: data.upcomingDeadlines, icon: Clock,      color: '#dc2626', bg: '#fef2f2' },
  ];

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-7xl mx-auto">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a]">Dashboard</h1>
            <p className="text-[13px] text-[#64748b] mt-0.5">Chicago Youth Centers · Grant Intelligence</p>
          </div>
          <Link
            href="/discover"
            className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#0f766e] transition-colors shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Run Discovery
          </Link>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-lg border border-[#e2e8f0] p-4 shadow-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#64748b]">{label}</span>
                <div className="w-7 h-7 rounded-[6px] flex items-center justify-center" style={{ background: bg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
              </div>
              <div className="text-[28px] font-bold" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Financial snapshot (990) ── */}
        {financialData ? (
          <div className="mb-6">
            <FinancialSnapshot
              orgName={data.org?.name ?? 'Organization'}
              ein={data.org?.ein ?? ''}
              computed={financialData.computed}
              latest={financialData.latest}
              history={financialData.history ?? []}
              fetchedAt={data.org?.financial_fetched_at ?? ''}
              filingYear={data.org?.financial_year ?? 0}
            />
          </div>
        ) : (
          <div className="mb-6 bg-white rounded-lg border border-dashed border-[#e2e8f0] p-5 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-[#0f172a]">990 Financial Analysis not yet synced</p>
              <p className="text-[12px] text-[#64748b] mt-0.5">
                Go to Settings → Sync from 990 to load your IRS financial data
              </p>
            </div>
            <Link
              href="/settings"
              className="px-3 py-1.5 text-[12px] font-semibold text-[#0d9488] border border-[#0d9488]/30 rounded-[6px] hover:bg-[#f0fdfa] transition-colors whitespace-nowrap"
            >
              Sync now →
            </Link>
          </div>
        )}

        {/* ── Federal exposure alert ── */}
        <div className="mb-6">
          <FederalExposure />
        </div>

        {/* ── Grant table ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-[#0f172a]">Grant Matches</h2>
            <Link href="/pipeline" className="text-[13px] text-[#0d9488] hover:underline font-medium">
              View pipeline →
            </Link>
          </div>
          {data.matches.length === 0 ? (
            <div className="bg-white rounded-lg border border-dashed border-[#e2e8f0] p-14 text-center">
              <AlertTriangle className="w-8 h-8 text-[#cbd5e1] mx-auto mb-3" />
              <p className="text-[14px] text-[#64748b] mb-4">No grant matches yet.</p>
              <Link
                href="/discover"
                className="px-4 py-2 bg-[#0d9488] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#0f766e] transition-colors"
              >
                Run your first discovery →
              </Link>
            </div>
          ) : (
            <GrantTable matches={data.matches} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
