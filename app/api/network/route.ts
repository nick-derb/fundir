import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { getNetworkState } from '@/lib/network/refresh';
import { canonicalLinkedInUrl } from '@/lib/network/linkedin';

export const maxDuration = 60;

// GET — the whole network state (board/staff, warm leads, pipeline, last run).
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(await getNetworkState(ctx.orgId));
}

const clean = (v: unknown, max: number) => (v == null ? '' : String(v)).trim().slice(0, max);

// POST — add a CYC person (board member or staff) to the roster.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const name = clean(body.name, 160);
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  let linkedin_url: string | null = null;
  if (clean(body.linkedinUrl, 300)) {
    linkedin_url = canonicalLinkedInUrl(clean(body.linkedinUrl, 300));
    if (!linkedin_url) return NextResponse.json({ error: 'That doesn’t look like a LinkedIn profile URL (linkedin.com/in/…)' }, { status: 400 });
  }
  const kind = body.kind === 'staff' ? 'staff' : 'board';

  const db = createServerClient();
  if (linkedin_url) {
    const { data: dupe } = await db.from('network_people')
      .select('id, name').eq('org_id', ctx.orgId).eq('linkedin_url', linkedin_url).maybeSingle();
    if (dupe) return NextResponse.json({ error: `${dupe.name} already has that LinkedIn URL` }, { status: 409 });
  }
  const { data, error } = await db.from('network_people').insert({
    org_id: ctx.orgId, kind, name, linkedin_url,
    current_title: clean(body.title, 160) || null,
    current_org: clean(body.org, 200) || null,
    note: clean(body.note, 500) || null,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// PATCH — update a person: set/change their LinkedIn URL (clears stale
// enrichment so the next refresh re-reads them), or move a lead through the
// pipeline (added / dismissed / new).
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ('linkedinUrl' in body) {
    const url = canonicalLinkedInUrl(clean(body.linkedinUrl, 300));
    if (!url) return NextResponse.json({ error: 'That doesn’t look like a LinkedIn profile URL (linkedin.com/in/…)' }, { status: 400 });
    patch.linkedin_url = url;
    patch.enriched_at = null; // force re-read on next refresh
  }
  if ('status' in body) {
    const status = clean(body.status, 20);
    if (!['new', 'added', 'dismissed'].includes(status)) {
      return NextResponse.json({ error: 'status must be new | added | dismissed' }, { status: 400 });
    }
    patch.status = status;
  }
  if ('note' in body) patch.note = clean(body.note, 500) || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const db = createServerClient();
  const { error } = await db.from('network_people').update(patch)
    .eq('id', id).eq('org_id', ctx.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
