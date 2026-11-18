import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { listKnownFunders, recordKnownFunder, removeKnownFunder, type KnownRelationship } from '@/lib/known-funders';

export const maxDuration = 30;

// The funders this organization already has a relationship with, recorded by
// the team. GET lists them; POST records one (from a lead: "Past funder" /
// "Current funder"); DELETE takes one off. See lib/known-funders for what a
// record changes in the leads and the graph.

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json({ funders: await listKnownFunders(createServerClient(), ctx.orgId) }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const relationship = String(body.relationship ?? '') as KnownRelationship;
  if (relationship !== 'current' && relationship !== 'past') return NextResponse.json({ error: 'relationship must be current or past' }, { status: 400 });
  const db = createServerClient();
  let name = String(body.name ?? '').trim();
  let networkOrgId = typeof body.network_org_id === 'string' ? body.network_org_id : null;
  // From a lead: take the funder from the lead itself, so the client cannot point at another tenant's lead.
  if (typeof body.lead_id === 'string') {
    const { data: lead } = await db.from('network_leads').select('target_org_id, target:network_organizations!network_leads_target_org_id_fkey(id, name)').eq('org_id', ctx.orgId).eq('id', body.lead_id).maybeSingle();
    const t = lead?.target as unknown as { id: string; name: string } | null;
    if (!t) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    name = t.name; networkOrgId = t.id;
  }
  if (!name) return NextResponse.json({ error: 'A funder name is required' }, { status: 400 });
  const yearRaw = Number(body.last_gift_year);
  const last_gift_year = Number.isInteger(yearRaw) && yearRaw >= 1900 && yearRaw <= 2100 ? yearRaw : null;
  try {
    const res = await recordKnownFunder(db, ctx.orgId, {
      name, network_org_id: networkOrgId, relationship, last_gift_year,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null, source: 'manual',
    }, ctx.email);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 }); }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const ok = await removeKnownFunder(createServerClient(), ctx.orgId, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
