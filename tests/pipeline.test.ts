import { describe, it, expect } from 'vitest';
import { buildFeedback, feedbackAdjustments, daysUntil, isDismissalReason, BOARD_COLUMNS, OPEN_STATES } from '@/lib/network/pipeline';

const closed = [
  { id: '1', pipeline_status: 'NOT_A_FIT' as const, dismissal_reason: 'declined_before', target_org_id: 'mccormick', via_person_id: 'doherty', insight_type: 'Warm Introduction' },
  { id: '2', pipeline_status: 'NOT_A_FIT' as const, dismissal_reason: 'no_program_fit', target_org_id: 'abbvie', via_person_id: null, insight_type: 'Untapped Funder' },
  { id: '3', pipeline_status: 'NOT_A_FIT' as const, dismissal_reason: 'no_program_fit', target_org_id: 'kresge', via_person_id: null, insight_type: 'Untapped Funder' },
  { id: '4', pipeline_status: 'NOT_A_FIT' as const, dismissal_reason: 'no_relationship_path', target_org_id: 'grainger', via_person_id: 'ramsey', insight_type: 'Warm Introduction' },
  { id: '5', pipeline_status: 'NOT_A_FIT' as const, dismissal_reason: 'no_relationship_path', target_org_id: 'grainger', via_person_id: 'ramsey', insight_type: 'Warm Introduction' },
  { id: '6', pipeline_status: 'WON' as const, dismissal_reason: null, target_org_id: 'joyce', via_person_id: null, insight_type: 'Untapped Funder' },
  { id: '7', pipeline_status: 'NOT_A_FIT' as const, dismissal_reason: 'duplicate', target_org_id: 'polk', via_person_id: null, insight_type: 'Untapped Funder' },
];

describe('dismissal feedback', () => {
  const f = buildFeedback(closed);
  it('remembers funders the team closed for a substantive reason, not duplicates or wins', () => {
    expect(f.targets.has('mccormick')).toBe(true);
    expect(f.targets.has('polk')).toBe(false);
    expect(f.targets.has('joyce')).toBe(false);
  });
  it('penalises a new lead on a dismissed funder, a lead shape dismissed twice, and a path that failed twice — each with a written reason', () => {
    const a = feedbackAdjustments({ id: 'n1', target_org_id: 'mccormick', via_person_id: null, insight_type: 'Warm Introduction', pipeline_status: 'NEW' }, f);
    expect(a).toHaveLength(1); expect(a[0].points).toBe(-15); expect(a[0].label).toContain('declined cyc before');
    const b = feedbackAdjustments({ id: 'n2', target_org_id: 'new-funder', via_person_id: null, insight_type: 'Untapped Funder', pipeline_status: 'NEW' }, f);
    expect(b.map(x => x.key)).toEqual(['team_feedback_type']);
    const c = feedbackAdjustments({ id: 'n3', target_org_id: 'x', via_person_id: 'ramsey', insight_type: 'Shared Board', pipeline_status: 'RESEARCHING' }, f, { via: () => 'Sean Ramsey' });
    expect(c[0].label).toContain("Sean Ramsey's paths have not held up 2 times");
  });
  it('never touches closed leads', () => {
    expect(feedbackAdjustments({ id: 'n4', target_org_id: 'mccormick', via_person_id: null, insight_type: null, pipeline_status: 'WON' }, f)).toEqual([]);
  });
  it('validates reasons and keeps the board in travel order', () => {
    expect(isDismissalReason('no_program_fit')).toBe(true);
    expect(isDismissalReason('because')).toBe(false);
    expect(BOARD_COLUMNS.map(c => c.id)).toEqual(OPEN_STATES.filter(s => s !== 'DEFERRED'));
  });
  it('counts days to a next action from today', () => {
    const today = new Date(2026, 8, 9);
    expect(daysUntil('2026-09-09', today)).toBe(0);
    expect(daysUntil('2026-09-12', today)).toBe(3);
    expect(daysUntil('2026-09-01', today)).toBe(-8);
    expect(daysUntil(null, today)).toBeNull();
  });
});
