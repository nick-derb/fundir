import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { listOrganizations } from '@/lib/network/queries';

export const maxDuration = 30;

// GET — the organizations in CYC's graph that matter: lead targets, peer funders, corporations with CYC people.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json({ organizations: await listOrganizations(createServerClient(), ctx.orgId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
