import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { listPeople } from '@/lib/network/queries';

export const maxDuration = 30;

// GET — everyone in CYC's graph (board, auxiliary, council, staff, funder trustees and executives) with the facts the directory shows.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json({ people: await listPeople(createServerClient(), ctx.orgId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
