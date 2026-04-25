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

const COLUMNS: { id: PipelineStage; label: string; accent: string; bg: string; header: string }[] = [
  { id: 'discovered', label: 'Discovered', accent: '#64748b', bg: '#f8fafc', header: '#f1f5f9' },
  { id: 'reviewing',  label: 'Reviewing',  accent: '#2563eb', bg: '#eff6ff', header: '#dbeafe' },
  { id: 'preparing',  label: 'Preparing',  accent: '#7c3aed', bg: '#faf5ff', header: '#ede9fe' },
  { id: 'drafting',   label: 'Drafting',   accent: '#d97706', bg: '#fffbeb', header: '#fef3c7' },
  { id: 'submitted',  label: 'Submitted',  accent: '#16a34a', bg: '#f0fdf4', header: '#dcfce7' },
];

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  return (
    <span className="inline-flex items-center justify-center h-6 px-2 rounded text-[11px] font-bold border flex-shrink-0 tabular-nums"
      style={{ color, background: color + '15', borderColor: color + '40' }}>
      {score.toFixed(0)}
    </span>
  );
}

function MiniSignalBar({ signals }: { signals?: EligibilitySignal[] }) {
  if (!signals?.length) return null;
  const match   = signals.filter(s => s.status === 'match').length;
  const mismatch = signals.filter(s => s.status === 'mismatch').length;
  const likely  = signals.filter(s => s.status === 'likely').length;
  const total   = signals.length;
  return (
    <div className="flex gap-0.5 h-1 rounded-full overflow-hidden mt-2">
      <div className="rounded-full bg-[#16a34a]" style={{ width: `${(match / total) * 100}%` }} />
      <div className="rounded-full bg-[#d97706]" style={{ width: `${(likely / total) * 100}%` }} />
      <div className="rounded-full bg-[#dc2626]" style={{ width: `${(mismatch / total) * 100}%` }} />
      <div className="flex-1 rounded-full bg-[#e2e8f0]" />
    </div>
  );
}

function KanbanCard({ match }: { match: MatchResult }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: match.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };
  const days  = getDaysUntil(match.grant?.close_date);
  const award = match.grant?.extracted_fields?.award_ceiling || match.grant?.extracted_fields?.award_floor;

  const deadlineColor = days === null ? 'text-[#94a3b8]'
    : days <= 7 ? 'text-red-600 font-bold'
    : days <= 14 ? 'text-orange-600 font-semibold'
    : days < 30 ? 'text-amber-600'
    : 'text-[#94a3b8]';

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Link href={`/grant/${match.grant_id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="bg-white rounded-[8px] border border-[#e2e8f0] p-3 cursor-grab active:cursor-grabbing hover:border-[#0d9488]/50 hover:shadow-md transition-all group">
          {/* Title + score */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-[12px] font-semibold text-[#0f172a] line-clamp-2 flex-1 leading-snug group-hover:text-[#0d9488] transition-colors">
              {match.grant?.title}
            </h4>
            <ScorePill score={match.composite_score} />
          </div>

          {/* Agency */}
          <p className="text-[10px] text-[#94a3b8] mb-2.5 truncate font-medium">{match.grant?.agency_name}</p>

          {/* Deadline + Award */}
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-1 text-[10px] ${deadlineColor}`}>
              <Calendar className="w-3 h-3" />
              {days === null ? 'No deadline'
                : days < 0 ? 'Closed'
                : days === 0 ? 'Due today'
                : `${days}d left`}
            </div>
            {award && (
              <div className="flex items-center gap-0.5 text-[10px] text-[#64748b] font-medium">
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
      </Link>
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
      <div className={`rounded-[10px] overflow-hidden border transition-all ${isOver ? 'border-[#0d9488] shadow-lg shadow-[#0d9488]/10' : 'border-[#e2e8f0]'}`}
        style={{ background: col.bg }}>
        {/* Column header */}
        <div className="px-3 py-2.5 border-b border-[#e2e8f0]" style={{ background: col.header }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: col.accent }} />
              <h3 className="text-[13px] font-bold text-[#0f172a]">{col.label}</h3>
            </div>
            <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded-full"
              style={{ background: col.accent }}>
              {count}
            </span>
          </div>
          {totalPotential > 0 && (
            <p className="text-[10px] font-medium ml-4" style={{ color: col.accent }}>
              {totalPotential >= 1_000_000
                ? `$${(totalPotential / 1_000_000).toFixed(1)}M`
                : `$${(totalPotential / 1_000).toFixed(0)}K`} potential
            </p>
          )}
        </div>

        <div ref={setNodeRef} className="p-2 space-y-2 min-h-[100px]">
          {children}
          {count === 0 && (
            <div className={`h-16 border-2 border-dashed rounded-[8px] flex items-center justify-center transition-colors ${isOver ? 'border-[#0d9488] bg-[#f0fdfa]' : 'border-[#e2e8f0]'}`}>
              <span className="text-[11px] text-[#94a3b8]">Drop here</span>
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
      }
      return;
    }
    const overMatch = matches.find(m => m.id === overId);
    if (overMatch) {
      const match = matches.find(m => m.id === matchId);
      if (match && match.pipeline_stage !== overMatch.pipeline_stage) {
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, pipeline_stage: overMatch.pipeline_stage } : m));
        await updatePipelineStage(matchId, overMatch.pipeline_stage);
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
          <div className="bg-white rounded-[8px] border-2 border-[#0d9488] p-3 shadow-2xl w-64">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="text-[12px] font-semibold text-[#0f172a] line-clamp-2">{activeMatch.grant?.title}</h4>
              <ScorePill score={activeMatch.composite_score} />
            </div>
            <p className="text-[10px] text-[#94a3b8] truncate">{activeMatch.grant?.agency_name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
