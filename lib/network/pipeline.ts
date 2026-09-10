// Phase 9 — the lead workflow: stages, dismissal reasons, and the one place
// where the team's judgement flows back into the score.
//
// Dismissals are data. When the team marks a funder "not a fit", or two
// paths through the same board member fail to hold up, the next lead of that
// shape should start lower — deterministically, with the reason written
// into the score breakdown, never as a hidden weight.

import { PIPELINE_STATES, type PipelineState } from '@/lib/network/queries';
import type { ScoreComponent } from '@/lib/network/scoring';

export { PIPELINE_STATES };
export type { PipelineState };

export const OPEN_STATES: PipelineState[] = ['NEW', 'RESEARCHING', 'INTRODUCTION_NEEDED', 'INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'AWAITING_DECISION', 'DEFERRED'];
export const CLOSED_STATES: PipelineState[] = ['WON', 'LOST', 'NOT_A_FIT'];
export const IN_MOTION: PipelineState[] = ['INTRODUCTION_NEEDED', 'INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'AWAITING_DECISION'];

/** Board columns, in the order a lead travels. Closed states collapse into one lane. */
export const BOARD_COLUMNS: Array<{ id: PipelineState; label: string; hint: string }> = [
  { id: 'NEW', label: 'New', hint: 'Surfaced by Fundir, not yet looked at' },
  { id: 'RESEARCHING', label: 'Researching', hint: 'Reading the evidence, checking fit' },
  { id: 'INTRODUCTION_NEEDED', label: 'Intro needed', hint: 'Worth pursuing; no ask made yet' },
  { id: 'INTRO_REQUESTED', label: 'Intro requested', hint: 'A CYC person has been asked to introduce' },
  { id: 'CONTACTED', label: 'Contacted', hint: 'First outreach sent' },
  { id: 'MEETING', label: 'Meeting', hint: 'Conversation scheduled or held' },
  { id: 'PROPOSAL', label: 'Proposal', hint: 'Proposal or LOI in progress' },
  { id: 'AWAITING_DECISION', label: 'Awaiting decision', hint: 'Submitted; waiting on the funder' },
];

export const DISMISSAL_REASONS = [
  { id: 'no_program_fit', label: 'Program fit is wrong', feeds: 'type' },
  { id: 'no_geographic_fit', label: 'Does not fund our geography', feeds: 'target' },
  { id: 'too_small', label: 'Grants too small to pursue', feeds: 'target' },
  { id: 'no_relationship_path', label: 'The path does not hold up', feeds: 'via' },
  { id: 'declined_before', label: 'Declined CYC before', feeds: 'target' },
  { id: 'already_in_progress', label: 'Already being worked elsewhere', feeds: null },
  { id: 'duplicate', label: 'Duplicate of another lead', feeds: null },
  { id: 'other', label: 'Other', feeds: null },
] as const;
export type DismissalReason = typeof DISMISSAL_REASONS[number]['id'];
export const isDismissalReason = (v: unknown): v is DismissalReason => DISMISSAL_REASONS.some(r => r.id === v);
export const dismissalLabel = (id: string | null | undefined) => DISMISSAL_REASONS.find(r => r.id === id)?.label ?? (id ? id.replace(/_/g, ' ') : '');

export const OUTCOME_STATES: PipelineState[] = ['WON', 'LOST'];

/** Plain labels for exports (no React). */
export const STATUS_LABEL_PLAIN: Record<string, string> = {
  NEW: 'New', RESEARCHING: 'Researching', INTRODUCTION_NEEDED: 'Intro needed', INTRO_REQUESTED: 'Intro requested', CONTACTED: 'Contacted',
  MEETING: 'Meeting', PROPOSAL: 'Proposal', AWAITING_DECISION: 'Awaiting decision', WON: 'Won', LOST: 'Lost', DEFERRED: 'Deferred', NOT_A_FIT: 'Not a fit',
};

/** What the team has closed, in the shape the feedback rules need. */
export interface ClosedLead { id: string; pipeline_status: PipelineState; dismissal_reason: string | null; target_org_id: string | null; via_person_id: string | null; insight_type: string | null }

export interface Feedback {
  targets: Map<string, { reasons: DismissalReason[] }>;          // target org → why it was dismissed
  types: Map<string, number>;                                     // insight type → dismissals that blame the lead shape
  vias: Map<string, number>;                                      // CYC person → dismissals that blame the path
}

export function buildFeedback(closed: ClosedLead[]): Feedback {
  const f: Feedback = { targets: new Map(), types: new Map(), vias: new Map() };
  for (const l of closed) {
    if (l.pipeline_status !== 'NOT_A_FIT' && l.pipeline_status !== 'LOST') continue;
    const reason = isDismissalReason(l.dismissal_reason) ? l.dismissal_reason : null;
    const meta = DISMISSAL_REASONS.find(r => r.id === reason);
    if (l.target_org_id && (meta?.feeds === 'target' || l.pipeline_status === 'LOST')) { const t = f.targets.get(l.target_org_id) ?? { reasons: [] }; if (reason) t.reasons.push(reason); f.targets.set(l.target_org_id, t); }
    if (meta?.feeds === 'type' && l.insight_type) f.types.set(l.insight_type, (f.types.get(l.insight_type) ?? 0) + 1);
    if (meta?.feeds === 'via' && l.via_person_id) f.vias.set(l.via_person_id, (f.vias.get(l.via_person_id) ?? 0) + 1);
  }
  return f;
}

/**
 * Adjustments for one OPEN lead. Each is a named, negative score component;
 * the caller appends them to the breakdown's penalties so the reason is visible.
 */
export function feedbackAdjustments(lead: { id: string; target_org_id: string | null; via_person_id: string | null; insight_type: string | null; pipeline_status: PipelineState }, f: Feedback, names: { via?: (id: string) => string | undefined } = {}): ScoreComponent[] {
  if (!OPEN_STATES.includes(lead.pipeline_status)) return [];
  const out: ScoreComponent[] = [];
  const t = lead.target_org_id ? f.targets.get(lead.target_org_id) : undefined;
  if (t) {
    const why = t.reasons.length ? t.reasons.map(dismissalLabel).join('; ').toLowerCase() : 'lost';
    out.push({ key: 'team_feedback_target', label: `Team closed a lead on this funder before (${why})`, points: -15 });
  }
  const n = lead.insight_type ? f.types.get(lead.insight_type) ?? 0 : 0;
  if (n >= 2) out.push({ key: 'team_feedback_type', label: `Team dismissed ${n} ${lead.insight_type} leads for program fit`, points: -5 });
  const v = lead.via_person_id ? f.vias.get(lead.via_person_id) ?? 0 : 0;
  if (v >= 2) out.push({ key: 'team_feedback_via', label: `${names.via?.(lead.via_person_id!) ?? 'This person'}'s paths have not held up ${v} times`, points: -5 });
  return out;
}

export const daysUntil = (iso: string | null | undefined, now = new Date()): number | null => {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  return Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86_400_000);
};
