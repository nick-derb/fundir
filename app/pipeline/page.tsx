export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { KanbanBoard } from '@/components/kanban-board';
import { MatchResult, PipelineStage } from '@/types';
import { LayoutGrid, TrendingUp, Clock, DollarSign, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

async function getPipelineMatches() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .order('composite_score', { ascending: false });
  return (data || []) as MatchResult[];
}

const STAGE_ORDER: PipelineStage[] = ['discovered', 'reviewing', 'preparing', 'drafting', 'submitted'];

export default async function PipelinePage() {
  const matches = await getPipelineMatches();

  const stageCounts = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = matches.filter(m => m.pipeline_stage === s).length;
    return acc;
  }, {} as Record<PipelineStage, number>);

  const totalPotential = matches
    .filter(m => ['reviewing', 'preparing', 'drafting', 'submitted'].includes(m.pipeline_stage))
    .reduce((s, m) => s + (m.grant?.extracted_fields?.award_ceiling || m.grant?.extracted_fields?.award_floor || 0), 0);

  const activeCount = matches.filter(m =>
    ['reviewing', 'preparing', 'drafting'].includes(m.pipeline_stage)
  ).length;

  const urgentCount = matches.filter(m => {
    if (!m.grant?.close_date) return false;
    const d = Math.ceil((new Date(m.grant.close_date).getTime() - Date.now()) / 86400000);
    return d >= 0 && d <= 14;
  }).length;

  return (
    <AppShell>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="border-b border-[#e2e8f0] bg-white px-8 py-5">
        <div className="max-w-full flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid className="w-4 h-4 text-[#0d9488]" />
              <h1 className="text-[20px] font-bold text-[#0f172a]">Grant Pipeline</h1>
            </div>
            <p className="text-[13px] text-[#64748b]">
              Drag and drop grants between stages · {matches.length} total opportunities
            </p>
          </div>
          <Link
            href="/discover"
            className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-semibold text-white transition-all shadow-sm"
            style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}
          >
            + Add Grants
          </Link>
        </div>

        {/* Pipeline stats strip */}
        <div className="flex items-center gap-6 mt-4">
          {[
            { label: 'Active',     value: activeCount,    icon: TrendingUp, color: '#2563eb' },
            { label: 'Urgent',     value: urgentCount,    icon: Clock,      color: urgentCount > 0 ? '#dc2626' : '#94a3b8' },
            {
              label: 'Potential',
              value: totalPotential >= 1_000_000
                ? `$${(totalPotential / 1_000_000).toFixed(1)}M`
                : totalPotential >= 1_000
                ? `$${(totalPotential / 1_000).toFixed(0)}K`
                : '$0',
              icon: DollarSign, color: '#0d9488',
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-[5px] flex items-center justify-center" style={{ background: color + '15' }}>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#0f172a] leading-none">{value}</p>
                <p className="text-[10px] text-[#94a3b8] font-medium">{label}</p>
              </div>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-4">
            {STAGE_ORDER.map(s => (
              <div key={s} className="text-center">
                <p className="text-[14px] font-bold text-[#0f172a]">{stageCounts[s]}</p>
                <p className="text-[10px] text-[#94a3b8] capitalize">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Board ───────────────────────────────────────────────── */}
      <div className="px-8 py-6 overflow-x-auto" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', minHeight: 'calc(100vh - 160px)' }}>
        {matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center mb-4 shadow-sm">
              <AlertTriangle className="w-7 h-7 text-[#cbd5e1]" />
            </div>
            <p className="text-[15px] font-semibold text-[#64748b] mb-2">No grants in pipeline</p>
            <p className="text-[13px] text-[#94a3b8] mb-5">Run discovery to find and track grant opportunities</p>
            <Link
              href="/discover"
              className="px-5 py-2.5 rounded-[8px] text-[13px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}
            >
              Run Discovery →
            </Link>
          </div>
        ) : (
          <KanbanBoard initialMatches={matches} />
        )}
      </div>
    </AppShell>
  );
}
