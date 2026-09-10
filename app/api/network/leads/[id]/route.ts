import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { getLeadDetail, PIPELINE_STATES } from '@/lib/network/queries';

export const maxDuration = 30;

// GET — one lead with its full "Why this lead?" panel, sources, actions and related insights.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;
  const db = createServerClient();
  try {
    const lead = await getLeadDetail(db, ctx.orgId, id);
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(lead);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

const clean = (v: unknown, max: number) => (v == null ? '' : String(v)).trim().slice(0, max);

// PATCH — move a lead through the pipeline or set owner / next action. Every
// change is appended to network_actions; the lead row holds the current state.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const db = createServerClient();
  const { data: lead } = await db.from('network_leads').select('id, pipeline_status').eq('org_id', ctx.orgId).eq('id', id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const actions: Array<Record<string, unknown>> = [];
  const notes = clean(body.notes, 1000) || null;
  if ('pipeline_status' in body) {
    const s = clean(body.pipeline_status, 30);
    if (!(PIPELINE_STATES as readonly string[]).includes(s)) return NextResponse.json({ error: `pipeline_status must be one of ${PIPELINE_STATES.join(', ')}` }, { status: 400 });
    if (s !== lead.pipeline_status) { patch.pipeline_status = s; actions.push({ action: s === 'NOT_A_FIT' || s === 'LOST' ? 'dismiss' : 'status_change', status: s, notes }); }
    if (s === 'NOT_A_FIT' && clean(body.dismissal_reason, 200)) patch.dismissal_reason = clean(body.dismissal_reason, 200);
  }
  if ('owner' in body) { patch.owner = clean(body.owner, 120) || null; actions.push({ action: 'assign', assigned_to: patch.owner, notes }); }
  if ('next_action' in body || 'next_action_date' in body) {
    if ('next_action' in body) patch.next_action = clean(body.next_action, 300) || null;
    if ('next_action_date' in body) { const d = clean(body.next_action_date, 10); patch.next_action_date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; }
    actions.push({ action: 'next_action', notes: [patch.next_action, patch.next_action_date].filter(Boolean).join(' · ') || notes });
  }
  if ('outcome' in body) { patch.outcome = clean(body.outcome, 500) || null; actions.push({ action: 'outcome', notes: patch.outcome }); }
  if (notes && !actions.length) actions.push({ action: 'note', notes });
  if (Object.keys(patch).length === 1 && !actions.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { error } = await db.from('network_leads').update(patch).eq('id', id).eq('org_id', ctx.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (actions.length) await db.from('network_actions').insert(actions.map(a => ({ org_id: ctx.orgId, lead_id: id, actor: ctx.email, ...a })));
  return NextResponse.json({ ok: true });
}
