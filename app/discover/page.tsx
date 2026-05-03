export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { DiscoveryControls } from '@/components/discovery-controls';
import { GrantTable } from '@/components/grant-table';
import { MatchResult } from '@/types';
import { Search, Target, Landmark, ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

async function getRecentGrants() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .order('matched_at', { ascending: false })
    .limit(50);
  return (data || []) as MatchResult[];
}

async function getPipelineStats() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('pipeline_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export default async function DiscoverPage() {
  const [recentMatches, lastRun] = await Promise.all([
    getRecentGrants(),
    getPipelineStats(),
  ]);

  const highCount = recentMatches.filter(m => m.composite_score >= 70).length;
  const medCount  = recentMatches.filter(m => m.composite_score >= 40 && m.composite_score < 70).length;

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-7xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Search className="w-4 h-4 text-[#0d9488]" />
              <h1 className="text-[20px] font-bold text-[#111827]">Grant Discovery</h1>
            </div>
            <p className="text-[13px] text-[#6b7280]">
              Grants.gov federal opportunities · AI extraction · composite match scoring
            </p>
          </div>
          <Link href="/foundations"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] border border-[#e2e8f0] text-[13px] font-semibold text-[#374151] hover:bg-[#f9fafb] transition-all">
            <Landmark className="w-3.5 h-3.5 text-[#6b7280]" />
            Foundation Map
            <ChevronRight className="w-3 h-3 text-[#9ca3af]" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* Controls panel */}
          <div className="lg:col-span-1 space-y-4">
            <DiscoveryControls />

            {/* Last run stats */}
            {lastRun && (
              <div className="bg-white rounded-[10px] border border-[#e8ecf0] p-4">
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3">Last Discovery Run</p>
                <div className="space-y-2">
                  {[
                    { label: 'Scanned',    value: lastRun.grants_discovered ?? 0, color: '#6b7280' },
                    { label: 'Stored',     value: lastRun.grants_new ?? 0,        color: '#0d9488' },
                    { label: 'High match', value: lastRun.high_matches ?? 0,      color: '#16a34a' },
                    { label: 'Med match',  value: lastRun.medium_matches ?? 0,    color: '#d97706' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[12px] text-[#6b7280]">{label}</span>
                      <span className="text-[13px] font-bold tabular-nums" style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#9ca3af] mt-2">
                  {new Date(lastRun.started_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )}

            {/* Foundation CTA */}
            <div className="bg-white rounded-[10px] border border-[#e8ecf0] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#6366f1]" />
                <span className="text-[11px] font-bold text-[#6366f1]">Pro Tip</span>
              </div>
              <p className="text-[12px] text-[#6b7280] leading-relaxed mb-3">
                90% of private foundation funding never appears in federal listings. Check the Foundation Map.
              </p>
              <Link href="/foundations"
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-[6px] text-[12px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                <Landmark className="w-3 h-3" />
                Open Foundation Map
              </Link>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-[15px] font-bold text-[#111827]">
                  Federal Grant Matches
                  <span className="ml-2 text-[13px] font-normal text-[#6b7280]">({recentMatches.length})</span>
                </h2>
                {recentMatches.length > 0 && (
                  <p className="text-[11px] text-[#6b7280] mt-0.5">
                    {highCount > 0 && <span className="text-[#16a34a] font-semibold">{highCount} high-match</span>}
                    {highCount > 0 && medCount > 0 && ' · '}
                    {medCount > 0 && <span className="text-[#d97706] font-semibold">{medCount} moderate</span>}
                    {' · '}pre-filtered for relevance
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                <Target className="w-3.5 h-3.5" />
                Min score: 32
              </div>
            </div>
            <GrantTable
              matches={recentMatches}
              emptyMessage="Run discovery to find and score grant opportunities."
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
