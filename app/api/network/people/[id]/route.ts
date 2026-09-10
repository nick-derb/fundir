import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { getPersonDetail } from '@/lib/network/queries';

export const maxDuration = 30;

// GET — one person: career, education, board seats, the paths that run through or to them, and the sources behind each fact.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;
  try {
    const person = await getPersonDetail(createServerClient(), ctx.orgId, id);
    if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(person);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
