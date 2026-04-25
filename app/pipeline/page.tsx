export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { KanbanBoard } from '@/components/kanban-board';
import { MatchResult } from '@/types';
import { KanbanSquare } from 'lucide-react';

async function getPipelineMatches() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .order('composite_score', { ascending: false });
  return (data || []) as MatchResult[];
}

export default async function PipelinePage() {
  const matches = await getPipelineMatches();

  return (
    <AppShell>
      <div className="px-8 py-6">
        <div className="flex items-center gap-2 mb-1">
          <KanbanSquare className="w-4 h-4 text-[#0d9488]" />
          <h1 className="text-[22px] font-bold text-[#0f172a]">Grant Pipeline</h1>
        </div>
        <p className="text-[13px] text-[#64748b] mb-6">
          Drag and drop grants between stages to track your development process
        </p>
        {matches.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-[#e2e8f0] p-14 text-center">
            <p className="text-[14px] text-[#64748b]">No grants in pipeline yet. Run discovery to get started.</p>
          </div>
        ) : (
          <KanbanBoard initialMatches={matches} />
        )}
      </div>
    </AppShell>
  );
}
