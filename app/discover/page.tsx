export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { DiscoveryControls } from '@/components/discovery-controls';
import { GrantTable } from '@/components/grant-table';
import { MatchResult } from '@/types';
import { Zap } from 'lucide-react';

async function getRecentGrants() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .order('matched_at', { ascending: false })
    .limit(50);
  return (data || []) as MatchResult[];
}

export default async function DiscoverPage() {
  const recentMatches = await getRecentGrants();

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-[#0d9488]" />
            <h1 className="text-[22px] font-bold text-[#0f172a]">Grant Discovery</h1>
          </div>
          <p className="text-[13px] text-[#64748b]">
            Search Grants.gov · AI extraction · composite match scoring
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls panel */}
          <div className="lg:col-span-1">
            <DiscoveryControls />
          </div>

          {/* Results */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-[#0f172a]">
                Recently Discovered
                <span className="ml-2 text-[13px] font-normal text-[#64748b]">({recentMatches.length})</span>
              </h2>
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
