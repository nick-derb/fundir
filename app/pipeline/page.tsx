export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { KanbanBoard } from '@/components/kanban-board';
import { MatchResult } from '@/types';
import { redirect } from 'next/navigation';
import { Sparkles, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

async function getPipelineMatches(orgId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .eq('org_id', orgId)
    .order('composite_score', { ascending: false });
  return (data || []) as MatchResult[];
}

export default async function PipelinePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const matches = await getPipelineMatches(ctx.orgId);

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

  const formatPotential = (n: number): string =>
      n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000     ? `$${(n / 1_000).toFixed(0)}K`
                     : '$0';

  return (
    <AppShell
      orgName={ctx.orgName}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      {/* ── Light hero on canvas ────────────────────────────────── */}
      <div className="bg-canvas-0 border-b border-canvas-3">
        <div className="px-4 sm:px-6 md:px-8 py-5 max-w-7xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-h1 font-semibold text-ink-0 leading-tight">Grant pipeline</h1>
              <p className="text-caption text-ink-2 mt-1">
                Drag between stages · {matches.length} total · click a grant title to open detail
              </p>
            </div>
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-body font-semibold bg-action text-canvas-1 hover:bg-action-hover transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run discovery
            </Link>
          </div>

          {/* Single tight metric row — three numbers, label:value rhythm */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 mt-4 text-caption text-ink-2">
            <span>
              Active <strong className="text-h2 font-semibold text-ink-0 tabular-nums ml-1">{activeCount}</strong>
            </span>
            <span>
              Urgent <strong className={`text-h2 font-semibold tabular-nums ml-1 ${urgentCount > 0 ? 'text-signal-skip' : 'text-ink-0'}`}>{urgentCount}</strong>
            </span>
            <span>
              Potential <strong className="text-h2 font-semibold text-ink-0 tabular-nums ml-1">{formatPotential(totalPotential)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── Board ───────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 md:px-8 py-6 overflow-x-auto bg-canvas-0" style={{ minHeight: 'calc(100vh - 160px)' }}>
        {matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 max-w-md mx-auto text-center">
            <div className="w-12 h-12 rounded-md bg-canvas-2 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5 text-ink-2" />
            </div>
            <p className="text-h2 font-semibold text-ink-0 mb-1">No grants in pipeline</p>
            <p className="text-body text-ink-2 mb-5">Run discovery to find and track grant opportunities.</p>
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-body font-semibold bg-action text-canvas-1 hover:bg-action-hover transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run discovery
            </Link>
          </div>
        ) : (
          <KanbanBoard initialMatches={matches} />
        )}
      </div>
    </AppShell>
  );
}
