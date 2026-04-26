export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { DiscoveryControls } from '@/components/discovery-controls';
import { GrantTable } from '@/components/grant-table';
import { MatchResult } from '@/types';
import {
  Search, Shield, Target, Filter, Landmark, ChevronRight, Sparkles,
} from 'lucide-react';
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
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="border-b border-[#e2e8f0] bg-white px-8 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-4 h-4 text-[#0d9488]" />
                <h1 className="text-[20px] font-bold text-[#0f172a]">Grant Discovery</h1>
              </div>
              <p className="text-[13px] text-[#64748b]">
                Grants.gov federal opportunities · AI extraction · hard-exclusion filtering · composite match scoring
              </p>
            </div>
            <Link href="/foundations"
              className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#0d9488]/30 text-[13px] font-semibold text-[#0d9488] hover:bg-[#f0fdfa] transition-all">
              <Landmark className="w-3.5 h-3.5" />
              Foundation Map
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Filter intelligence strip */}
          <div className="flex items-center gap-4 p-3 rounded-[8px] bg-[#f0fdfa] border border-[#99f6e4]">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#0d9488]" />
              <span className="text-[11px] font-bold text-[#0d9488]">Smart Filtering Active</span>
            </div>
            <div className="h-3.5 w-px bg-[#99f6e4]" />
            {[
              { label: 'International/foreign-aid grants', detail: 'auto-excluded' },
              { label: 'Defense/military agencies',        detail: 'auto-excluded' },
              { label: 'Score < 32 / 100',                detail: 'not stored' },
              { label: 'Geographic mismatches',            detail: 'penalized' },
            ].map(({ label, detail }) => (
              <div key={label} className="flex items-center gap-1 text-[11px]">
                <Filter className="w-3 h-3 text-[#64748b]" />
                <span className="text-[#475569]">{label}</span>
                <span className="font-semibold text-[#0d9488]">({detail})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Controls panel */}
          <div className="lg:col-span-1 space-y-4">
            <DiscoveryControls />

            {/* Last run stats */}
            {lastRun && (
              <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-4">
                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Last Discovery Run</p>
                <div className="space-y-2">
                  {[
                    { label: 'Scanned',     value: lastRun.grants_discovered ?? 0, color: '#64748b' },
                    { label: 'Stored',      value: lastRun.grants_new ?? 0,        color: '#0d9488' },
                    { label: 'High match',  value: lastRun.high_matches ?? 0,      color: '#16a34a' },
                    { label: 'Med match',   value: lastRun.medium_matches ?? 0,    color: '#d97706' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[12px] text-[#64748b]">{label}</span>
                      <span className="text-[13px] font-bold tabular-nums" style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#94a3b8] mt-2">
                  {new Date(lastRun.started_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )}

            {/* Foundation CTA */}
            <div className="rounded-xl border border-[#6366f1]/20 p-4"
              style={{ background: 'linear-gradient(135deg, #faf5ff, #f5f3ff)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#6366f1]" />
                <span className="text-[11px] font-bold text-[#6366f1]">Pro Tip</span>
              </div>
              <p className="text-[11px] text-[#6b21a8] leading-relaxed mb-3">
                90% of private foundation funding never appears here. Check the Foundation Map to discover funders
                that already support Chicago youth organizations.
              </p>
              <Link href="/foundations"
                className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-[6px] text-[11px] font-bold text-white transition-all"
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
                <h2 className="text-[15px] font-bold text-[#0f172a]">
                  Federal Grant Matches
                  <span className="ml-2 text-[13px] font-normal text-[#64748b]">({recentMatches.length})</span>
                </h2>
                {recentMatches.length > 0 && (
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    {highCount > 0 && <span className="text-[#16a34a] font-semibold">{highCount} high-match</span>}
                    {highCount > 0 && medCount > 0 && ' · '}
                    {medCount > 0 && <span className="text-[#d97706] font-semibold">{medCount} moderate</span>}
                    {' '} · pre-filtered for relevance
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <Target className="w-3.5 h-3.5 text-[#0d9488]" />
                <span className="text-[#94a3b8]">Min score threshold: 32</span>
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
