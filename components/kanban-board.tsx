'use client';
import { useState } from 'react';
import {
  DndContext, DragEndEvent, closestCenter, DragOverlay, DragStartEvent, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MatchResult, PipelineStage } from '@/types';
import { updatePipelineStage } from '@/actions/discovery';
import { getDaysUntil } from '@/lib/utils';
import Link from 'next/link';
import { DollarSign, Calendar } from 'lucide-react';
import type { EligibilitySignal } from '@/lib/990-screener';
import { logActivity } from '@/lib/team-activity';

// One canvas card per column with a single accent stripe — instead of 5
// different background tints + headers (which made the board feel like 5
// products living next to each other). The stripe carries the stage
// identity; the rest is canvas + ink rhythm matching the rest of the app.
const COLUMNS: { id: PipelineStage; label: string; stripe: string }[] = [
  { id: 'discovered', label: 'Discovered', stripe: 'bg-ink-2'           },
  { id: 'reviewing',  label: 'Reviewing',  stripe: 'bg-action'          },
  { id: 'preparing',  label: 'Preparing',  stripe: 'bg-signal-maybe'    },
  { id: 'drafting',   label: 'Drafting',   stripe: 'bg-signal-maybe'    },
  { id: 'submitted',  label: 'Submitted',  stripe: 'bg-signal-pursue'   },
];

function ScorePill({ score }: { score: number }) {
  const cls = score >= 70 ? 'bg-signal-pursue-soft text-signal-pursue ring-signal-pursue/20'
            : score >= 40 ? 'bg-signal-maybe-soft  text-signal-maybe  ring-signal-maybe/20'
                          : 'bg-signal-skip-soft   text-signal-skip   ring-signal-skip/20';
  return (
    <span className={`inline-flex items-center justify-center h-6 px-2 rounded-sm text-caption font-semibold ring-1 flex-shrink-0 tabular-nums ${cls}`}>
      {score.toFixed(0)}
    </span>
  );
}

function MiniSignalBar({ signals }: { signals?: EligibilitySignal[] }) {
  if (!signals?.length) return null;
  const match    = signals.filter(s => s.status === 'match').length;
  const mismatch = signals.filter(s => s.status === 'mismatch').length;
  const likely   = signals.filter(s => s.status === 'likely').length;
  const total    = signals.length;
  return (
    <div className="flex gap-0.5 h-1 rounded-full overflow-hidden mt-2 bg-canvas-2">
      <div className="bg-signal-pursue" style={{ width: `${(match    / total) * 100}%` }} />
      <div className="bg-signal-maybe"  style={{ width: `${(likely   / total) * 100}%` }} />
      <div className="bg-signal-skip"   style={{ width: `${(mismatch / total) * 100}%` }} />
    </div>
  );
}

function KanbanCard({ match }: { match: MatchResult }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: match.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };
  const days  = getDaysUntil(match.grant?.close_date);
  const award = match.grant?.extracted_fields?.award_ceiling || match.grant?.extracted_fields?.award_floor;

  const deadlineCls = days === null    ? 'text-ink-2'
                    : days <= 7        ? 'text-signal-skip  font-semibold'
                    : days <= 14       ? 'text-signal-maybe font-semibold'
                                       : 'text-ink-2';

  // dnd-kit listeners live on the OUTER wrapper so the card stays
  // draggable. Only the grant title navigates — its <Link> stops the
  // pointer-down event from reaching the listeners, otherwise the
  // dnd-kit drag would intercept the click before navigation could fire.
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-canvas-1 rounded-md ring-1 ring-canvas-3 p-3 cursor-grab active:cursor-grabbing hover:ring-action/40 hover:shadow-lift transition-shadow"
    >
      {/* Title + score */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <Link
          href={`/grant/${match.grant_id}`}
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          className="flex-1 text-caption font-semibold text-ink-0 line-clamp-2 leading-snug cursor-pointer hover:text-action hover:underline transition-colors"
        >
          {match.grant?.title}
        </Link>
        <ScorePill score={match.composite_score} />
      </div>

      {/* Agency */}
      <p className="text-eyebrow text-ink-2 mb-2 truncate">{match.grant?.agency_name}</p>

      {/* Deadline + Award */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1 text-eyebrow ${deadlineCls}`}>
          <Calendar className="w-3 h-3" />
          {days === null      ? 'No deadline'
            : days < 0        ? 'Closed'
            : days === 0      ? 'Due today'
                              : `${days}d left`}
        </div>
        {award && (
          <div className="flex items-center gap-0.5 text-eyebrow text-ink-1">
            <DollarSign className="w-3 h-3" />
            {award >= 1_000_000
              ? `${(award / 1_000_000).toFixed(1)}M`
              : `${(award / 1_000).toFixed(0)}K`}
          </div>
        )}
      </div>

      {/* 990 signal mini-bar */}
      <MiniSignalBar signals={match.financial_signals} />
    </div>
  );
}

function DroppableColumn({ col, children, count, totalPotential }: {
  col: typeof COLUMNS[number];
  children: React.ReactNode;
  count: number;
  totalPotential: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div className="flex-shrink-0 w-64">
      <div className={`bg-canvas-1 rounded-lg overflow-hidden ring-1 transition-shadow ${
        isOver ? 'ring-action shadow-lift' : 'ring-canvas-3'
      }`}>
        {/* Single accent stripe carries the stage identity */}
        <div className={`h-1 ${col.stripe}`} />

        {/* Column header */}
        <div className="px-3 py-2.5 border-b border-canvas-3">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-ink-0">{col.label}</h3>
            <span className="text-eyebrow font-semibold tabular-nums px-1.5 py-0.5 rounded-sm bg-canvas-2 text-ink-1">
              {count}
            </span>
          </div>
          {totalPotential > 0 && (
            <p className="text-caption text-ink-2 mt-0.5 tabular-nums">
              {totalPotential >= 1_000_000
                ? `$${(totalPotential / 1_000_000).toFixed(1)}M`
                : `$${(totalPotential / 1_000).toFixed(0)}K`} potential
            </p>
          )}
        </div>

        {/* Each column scrolls independently. Without max-h the tallest column
            dictated whole-page height (~28k px on mobile when "discovered"
            had 100 cards). Now: column is capped, drag-drop still works
            inside the scroll region. */}
        <div
          ref={setNodeRef}
          className="p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-260px)] overflow-y-auto"
        >
          {children}
          {count === 0 && (
            <div className={`h-16 border-2 border-dashed rounded-md flex items-center justify-center transition-colors ${
              isOver ? 'border-action bg-action-soft' : 'border-canvas-3'
            }`}>
              <span className="text-caption text-ink-2">Drop here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function KanbanBoard({ initialMatches }: { initialMatches: MatchResult[] }) {
  const [matches, setMatches]     = useState(initialMatches);
  const [activeMatch, setActiveMatch] = useState<MatchResult | null>(null);

  const getColumnMatches = (stage: PipelineStage) => matches.filter(m => m.pipeline_stage === stage);

  const getColumnPotential = (stage: PipelineStage) =>
    matches
      .filter(m => m.pipeline_stage === stage)
      .reduce((s, m) => s + (m.grant?.extracted_fields?.award_ceiling || m.grant?.extracted_fields?.award_floor || 0), 0);

  function handleDragStart(event: DragStartEvent) {
    setActiveMatch(matches.find(m => m.id === event.active.id) || null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveMatch(null);
    if (!over) return;
    const matchId = active.id as string;
    const overId  = over.id as string;
    const targetCol = COLUMNS.find(c => c.id === overId);
    if (targetCol) {
      const match = matches.find(m => m.id === matchId);
      if (match && match.pipeline_stage !== targetCol.id) {
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, pipeline_stage: targetCol.id } : m));
        await updatePipelineStage(matchId, targetCol.id);
        logActivity({
          action: 'pipeline_move',
          entityType: 'grant',
          entityId: matchId,
          entityTitle: match.grant?.title ?? undefined,
          metadata: { from: match.pipeline_stage, to: targetCol.id },
        });
      }
      return;
    }
    const overMatch = matches.find(m => m.id === overId);
    if (overMatch) {
      const match = matches.find(m => m.id === matchId);
      if (match && match.pipeline_stage !== overMatch.pipeline_stage) {
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, pipeline_stage: overMatch.pipeline_stage } : m));
        await updatePipelineStage(matchId, overMatch.pipeline_stage);
        logActivity({
          action: 'pipeline_move',
          entityType: 'grant',
          entityId: matchId,
          entityTitle: match.grant?.title ?? undefined,
          metadata: { from: match.pipeline_stage, to: overMatch.pipeline_stage },
        });
      }
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-6">
        {COLUMNS.map(col => {
          const colMatches  = getColumnMatches(col.id);
          const potential   = getColumnPotential(col.id);
          return (
            <DroppableColumn key={col.id} col={col} count={colMatches.length} totalPotential={potential}>
              <SortableContext items={colMatches.map(m => m.id)} strategy={verticalListSortingStrategy}>
                {colMatches.map(match => <KanbanCard key={match.id} match={match} />)}
              </SortableContext>
            </DroppableColumn>
          );
        })}
      </div>
      <DragOverlay>
        {activeMatch ? (
          <div className="bg-canvas-1 rounded-md ring-2 ring-action p-3 shadow-lift w-64">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="text-caption font-semibold text-ink-0 line-clamp-2">{activeMatch.grant?.title}</h4>
              <ScorePill score={activeMatch.composite_score} />
            </div>
            <p className="text-eyebrow text-ink-2 truncate">{activeMatch.grant?.agency_name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
