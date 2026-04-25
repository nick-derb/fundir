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

const COLUMNS: { id: PipelineStage; label: string; accent: string; bg: string }[] = [
  { id: 'discovered', label: 'Discovered', accent: '#64748b', bg: '#f8fafc' },
  { id: 'reviewing',  label: 'Reviewing',  accent: '#2563eb', bg: '#eff6ff' },
  { id: 'preparing',  label: 'Preparing',  accent: '#7c3aed', bg: '#faf5ff' },
  { id: 'drafting',   label: 'Drafting',   accent: '#d97706', bg: '#fffbeb' },
  { id: 'submitted',  label: 'Submitted',  accent: '#16a34a', bg: '#f0fdf4' },
];

function ScoreDot({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  return (
    <span
      className="inline-flex items-center justify-center w-9 h-7 rounded text-[11px] font-bold border flex-shrink-0"
      style={{ color, background: color + '15', borderColor: color + '40' }}
    >
      {score.toFixed(0)}
    </span>
  );
}

function KanbanCard({ match }: { match: MatchResult }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: match.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const days = getDaysUntil(match.grant?.close_date);
  const deadlineColor = days === null ? 'text-[#94a3b8]' : days < 14 ? 'text-red-600 font-semibold' : days < 30 ? 'text-amber-600' : 'text-[#64748b]';

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Link href={`/grant/${match.grant_id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="bg-white rounded-[6px] border border-[#e2e8f0] p-3 cursor-grab active:cursor-grabbing hover:border-[#0d9488]/40 hover:shadow-card transition-all">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h4 className="text-[12px] font-semibold text-[#0f172a] line-clamp-2 flex-1 leading-snug">
              {match.grant?.title}
            </h4>
            <ScoreDot score={match.composite_score} />
          </div>
          <p className="text-[11px] text-[#94a3b8] mb-2 truncate">{match.grant?.agency_name}</p>
          <p className={`text-[11px] ${deadlineColor}`}>
            {days === null ? 'No deadline' : days < 0 ? 'Closed' : `${days}d left`}
          </p>
        </div>
      </Link>
    </div>
  );
}

function DroppableColumn({ col, children, count }: {
  col: typeof COLUMNS[number];
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef } = useDroppable({ id: col.id });
  return (
    <div className="flex-shrink-0 w-60">
      <div className="rounded-lg overflow-hidden border border-[#e2e8f0]" style={{ background: col.bg }}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#e2e8f0] bg-white">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: col.accent }} />
            <h3 className="text-[13px] font-semibold text-[#0f172a]">{col.label}</h3>
          </div>
          <span className="text-[11px] font-semibold text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-full border border-[#e2e8f0]">
            {count}
          </span>
        </div>
        <div ref={setNodeRef} className="p-2.5 space-y-2 min-h-[120px]">
          {children}
          {count === 0 && (
            <div className="h-16 border-2 border-dashed border-[#e2e8f0] rounded-[6px] flex items-center justify-center">
              <span className="text-[11px] text-[#94a3b8]">Drop here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function KanbanBoard({ initialMatches }: { initialMatches: MatchResult[] }) {
  const [matches, setMatches] = useState(initialMatches);
  const [activeMatch, setActiveMatch] = useState<MatchResult | null>(null);

  const getColumnMatches = (stage: PipelineStage) => matches.filter(m => m.pipeline_stage === stage);

  function handleDragStart(event: DragStartEvent) {
    setActiveMatch(matches.find(m => m.id === event.active.id) || null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveMatch(null);
    if (!over) return;
    const matchId = active.id as string;
    const overId = over.id as string;
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
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const colMatches = getColumnMatches(col.id);
          return (
            <DroppableColumn key={col.id} col={col} count={colMatches.length}>
              <SortableContext items={colMatches.map(m => m.id)} strategy={verticalListSortingStrategy}>
                {colMatches.map(match => <KanbanCard key={match.id} match={match} />)}
              </SortableContext>
            </DroppableColumn>
          );
        })}
      </div>
      <DragOverlay>
        {activeMatch ? (
          <div className="bg-white rounded-[6px] border-2 border-[#0d9488] p-3 shadow-drop w-60">
            <h4 className="text-[12px] font-semibold text-[#0f172a] line-clamp-2">{activeMatch.grant?.title}</h4>
            <p className="text-[11px] text-[#94a3b8] mt-1 truncate">{activeMatch.grant?.agency_name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
