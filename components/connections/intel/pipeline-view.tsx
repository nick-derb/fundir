'use client';

// Pipeline — the board. Eight lanes in travel order plus a closed shelf;
// one accent stripe per lane, cards you can drag between them. Dropping on
// "Not a fit" asks for a reason, because reasons feed the score.

import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { CalendarClock, Check, Loader2, X } from 'lucide-react';
import type { LeadRow, PipelineState } from '@/lib/network/queries';
import { BOARD_COLUMNS, CLOSED_STATES, DISMISSAL_REASONS, IN_MOTION, OPEN_STATES, daysUntil, dismissalLabel, type DismissalReason } from '@/lib/network/pipeline';
import { SERIF, MONO, Avatar, OrgMark, TypeChip, ConfChip, Eyebrow, STATUS_LABEL, hueFor, SLATE, AMBER, INFO, initialsOf } from './shared';

const STRIPE: Record<string, string> = { NEW: SLATE, RESEARCHING: SLATE, INTRODUCTION_NEEDED: AMBER, INTRO_REQUESTED: AMBER, CONTACTED: INFO, MEETING: INFO, PROPOSAL: 'var(--accent)', AWAITING_DECISION: 'var(--accent)', WON: 'var(--accent)', LOST: 'var(--text-tertiary)', DEFERRED: SLATE, NOT_A_FIT: 'var(--text-tertiary)' };

export interface TeamMember { id: string; email: string | null; name: string }

export function PipelineView({ leads, team, selectedId, onOpen, onChanged, readOnly }: { leads: LeadRow[]; team: TeamMember[]; selectedId: string | null; onOpen: (id: string) => void; onChanged: () => Promise<void> | void; readOnly?: boolean }) {
  // Optimistic copy of the leads; re-derived when the server list changes (setState-during-render pattern).
  const [local, setLocal] = useState(leads);
  const [seen, setSeen] = useState(leads);
  if (leads !== seen) { setSeen(leads); setLocal(leads); }
  const [dragging, setDragging] = useState<LeadRow | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [askReason, setAskReason] = useState<{ lead: LeadRow; to: PipelineState } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => { const m = new Map<string, LeadRow[]>(); for (const l of local) { const a = m.get(l.pipeline_status) ?? []; a.push(l); m.set(l.pipeline_status, a); } for (const a of m.values()) a.sort((x, y) => (daysUntil(x.next_action_date) ?? 9e9) - (daysUntil(y.next_action_date) ?? 9e9) || y.score - x.score); return m; }, [local]);
  const inMotion = local.filter(l => IN_MOTION.includes(l.pipeline_status)).length;
  const due = local.filter(l => OPEN_STATES.includes(l.pipeline_status) && l.next_action_date && (daysUntil(l.next_action_date) ?? 99) <= 7).length;
  const overdue = local.filter(l => OPEN_STATES.includes(l.pipeline_status) && l.next_action_date && (daysUntil(l.next_action_date) ?? 0) < 0).length;
  const won = local.filter(l => l.pipeline_status === 'WON').length;
  const nameOf = (owner: string | null) => (owner ? team.find(t => t.email === owner || t.id === owner)?.name ?? owner.split('@')[0] : null);

  async function move(lead: LeadRow, to: PipelineState, dismissal_reason?: DismissalReason) {
    if (readOnly || lead.pipeline_status === to) return;
    if (to === 'NOT_A_FIT' && !dismissal_reason) { setAskReason({ lead, to }); return; }
    const prev = local;
    setLocal(ls => ls.map(l => (l.id === lead.id ? { ...l, pipeline_status: to, dismissal_reason: dismissal_reason ?? l.dismissal_reason } : l)));
    setSaving(lead.id);
    try {
      const res = await fetch(`/api/network/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline_status: to, dismissal_reason }) });
      if (!res.ok) throw new Error();
      await onChanged();
    } catch { setLocal(prev); }
    finally { setSaving(null); }
  }
  const onDragStart = (e: DragStartEvent) => setDragging(local.find(l => l.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => { const lead = local.find(l => l.id === e.active.id); setDragging(null); if (lead && e.over) move(lead, e.over.id as PipelineState); };

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>Chicago Youth Centers · Network intelligence</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Pipeline</h1>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '62ch' }}>Drag a lead as the work moves. Closing one as &ldquo;not a fit&rdquo; asks why, and the reason lowers the score of the next lead of the same shape — the team&rsquo;s judgement, written into the number.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(104px,1fr))', gap: 10, flex: '0 1 520px' }}>
          <Kpi label="In motion" value={inMotion} accent />
          <Kpi label="Due this week" value={due} />
          <Kpi label="Overdue" value={overdue} tone={overdue ? 'var(--critical)' : undefined} />
          <Kpi label="Won" value={won} />
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(228px, 1fr)', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'start' }}>
          {BOARD_COLUMNS.map(col => (
            <Lane key={col.id} id={col.id} label={col.label} hint={col.hint} count={(byStage.get(col.id) ?? []).length} stripe={STRIPE[col.id]}>
              {(byStage.get(col.id) ?? []).map(l => <Card key={l.id} lead={l} owner={nameOf(l.owner)} saving={saving === l.id} active={l.id === selectedId} onOpen={() => onOpen(l.id)} readOnly={readOnly} />)}
            </Lane>
          ))}
        </div>
        {/* closed shelf: also drop targets */}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {(['DEFERRED', ...CLOSED_STATES] as PipelineState[]).map(s => (
            <Shelf key={s} id={s} label={STATUS_LABEL[s]} stripe={STRIPE[s]} count={(byStage.get(s) ?? []).length} open={showClosed} onToggle={() => setShowClosed(v => !v)}>
              {showClosed && (byStage.get(s) ?? []).map(l => <Card key={l.id} lead={l} owner={nameOf(l.owner)} saving={saving === l.id} active={l.id === selectedId} onOpen={() => onOpen(l.id)} readOnly={readOnly} compact />)}
            </Shelf>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{dragging ? <div style={{ transform: 'rotate(1.5deg)', boxShadow: 'var(--shadow-overlay)', borderRadius: 10 }}><Card lead={dragging} owner={nameOf(dragging.owner)} onOpen={() => {}} ghost /></div> : null}</DragOverlay>
      </DndContext>

      {askReason && <ReasonDialog lead={askReason.lead} onCancel={() => setAskReason(null)} onPick={r => { const a = askReason; setAskReason(null); move(a.lead, a.to, r); }} />}
    </div>
  );
}

function Lane({ id, label, hint, count, stripe, children }: { id: string; label: string; hint: string; count: number; stripe: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="ni-card" style={{ minHeight: 280, display: 'flex', flexDirection: 'column', borderColor: isOver ? 'var(--accent)' : undefined, background: isOver ? 'var(--accent-tint)' : undefined, transition: 'background .14s, border-color .14s' }}>
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border-hairline)' }} title={hint}>
        <span style={{ display: 'block', width: 28, height: 2, borderRadius: 1, background: stripe, marginBottom: 7 }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</b><span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{count}</span></div>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>{children}{count === 0 && <span className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 11, padding: '10px 4px' }}>{hint}</span>}</div>
    </div>
  );
}

function Shelf({ id, label, stripe, count, open, onToggle, children }: { id: string; label: string; stripe: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="ni-card" style={{ borderStyle: 'dashed', borderColor: isOver ? 'var(--accent)' : undefined, background: isOver ? 'var(--accent-tint)' : 'transparent', transition: 'background .14s, border-color .14s' }}>
      <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none', background: 'none', font: 'inherit', cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: stripe }} /><b style={{ fontSize: 12, fontWeight: 500 }}>{label}</b><span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{count}</span><span style={{ flex: 1 }} /><span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{open ? 'hide' : 'drop here'}</span>
      </button>
      {open && <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>}
    </div>
  );
}

function Card({ lead, owner, saving, active, onOpen, readOnly, ghost, compact }: { lead: LeadRow; owner: string | null; saving?: boolean; active?: boolean; onOpen: () => void; readOnly?: boolean; ghost?: boolean; compact?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled: readOnly || ghost });
  const days = daysUntil(lead.next_action_date);
  const dueTone = days === null ? 'var(--text-tertiary)' : days < 0 ? 'var(--critical)' : days <= 7 ? AMBER : 'var(--text-secondary)';
  const h = hueFor(lead.insight_type);
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
      style={{ background: 'var(--bg-surface)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hairline)'}`, borderLeft: `3px solid ${h.color}`, borderRadius: 10, padding: compact ? '8px 10px' : '10px 12px', cursor: readOnly ? 'pointer' : 'grab', opacity: isDragging ? 0.3 : 1, boxShadow: active ? '0 0 0 3px var(--accent-tint)' : undefined, transition: 'box-shadow .14s, border-color .14s', width: ghost ? 228 : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <OrgMark name={lead.target?.name ?? lead.trustee?.name ?? '?'} size={22} accent={lead.score >= 70} />
        <b style={{ fontSize: 12.5, fontWeight: 500, minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.target?.name ?? lead.trustee?.name}</b>
        {saving ? <Loader2 className="animate-spin" style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} /> : <b className="fd-mono" style={{ fontSize: 11.5, color: lead.score >= 70 ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: MONO }}>{lead.score}</b>}
      </div>
      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
          <TypeChip type={lead.insight_type} />
          <ConfChip confidence={lead.confidence} />
        </div>
      )}
      {!compact && lead.via && <p className="fd-caption" style={{ margin: '7px 0 0', color: 'var(--text-secondary)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>via {lead.via.name}{lead.trustee ? ` → ${lead.trustee.name}` : ''}</p>}
      {(lead.next_action || owner || lead.dismissal_reason) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minWidth: 0 }}>
          {lead.dismissal_reason ? <span className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{dismissalLabel(lead.dismissal_reason)}</span> : lead.next_action ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1, fontSize: 11, color: dueTone }}><CalendarClock style={{ width: 11, height: 11, flex: 'none' }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.next_action}</span>{days !== null && <b className="fd-mono" style={{ fontSize: 10, flex: 'none', fontFamily: MONO }}>{days < 0 ? `${-days}d late` : days === 0 ? 'today' : `${days}d`}</b>}</span> : <span style={{ flex: 1 }} />}
          {owner && <span title={owner} style={{ width: 20, height: 20, borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontFamily: MONO, fontSize: 8.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{initialsOf(owner)}</span>}
        </div>
      )}
    </div>
  );
}

export function ReasonDialog({ lead, onCancel, onPick }: { lead: LeadRow; onCancel: () => void; onPick: (r: DismissalReason) => void }) {
  const [pick, setPick] = useState<DismissalReason | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onCancel]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <button aria-label="Cancel" onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,.38)', backdropFilter: 'blur(2px)', border: 'none', cursor: 'default' }} />
      <div role="dialog" aria-modal="true" aria-label="Why is this not a fit?" className="ni-rise" style={{ position: 'relative', width: 'min(440px,100%)', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 14, boxShadow: 'var(--shadow-overlay)', padding: '20px 22px', fontFamily: "'Inter',-apple-system,sans-serif" }}>
        <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Not a fit</Eyebrow>
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.4rem', lineHeight: 1.15, letterSpacing: '-.012em', margin: '0 0 6px' }}>Why is {lead.target?.name ?? 'this lead'} not a fit?</h2>
        <p className="fd-caption" style={{ margin: '0 0 14px', color: 'var(--text-secondary)' }}>The reason is recorded and shapes future scores: a funder closed for program fit will not resurface at the top of Discover.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DISMISSAL_REASONS.map(r => (
            <button key={r.id} type="button" onClick={() => setPick(r.id)} aria-pressed={pick === r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${pick === r.id ? 'var(--accent)' : 'var(--border-hairline)'}`, background: pick === r.id ? 'var(--accent-tint)' : 'var(--bg-surface)', font: 'inherit', fontSize: 12.5, cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, border: `1.5px solid ${pick === r.id ? 'var(--accent)' : 'var(--border-strong)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{pick === r.id && <Check style={{ width: 9, height: 9, color: 'var(--accent)' }} />}</span>
              {r.label}
              {r.feeds && <span className="fd-mono" style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>feeds score</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="ni-ghost" onClick={onCancel}><X style={{ width: 12, height: 12 }} />Cancel</button>
          <button type="button" className="ni-primary" disabled={!pick} style={{ opacity: pick ? 1 : 0.5 }} onClick={() => pick && onPick(pick)}>Close lead</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, tone }: { label: string; value: number; accent?: boolean; tone?: string }) {
  return (
    <div className="ni-kpi" style={accent ? { borderColor: 'rgba(12,107,90,.28)' } : undefined}>
      <span className="fd-eyebrow" style={{ display: 'block', color: accent ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 6, fontSize: 10 }}>{label}</span>
      <b className="fd-kpi" style={{ fontSize: 22, color: tone ?? (accent ? 'var(--accent)' : undefined), fontFamily: MONO }}>{value}</b>
    </div>
  );
}

export { Avatar };
