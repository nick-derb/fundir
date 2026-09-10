import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { listLeads, listInsights } from '@/lib/network/queries';

export const maxDuration = 30;

// GET — every lead for the org, shaped for the Discover ledger, plus the insights strip.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const db = createServerClient();
  try {
    const [leads, insights] = await Promise.all([listLeads(db, ctx.orgId), listInsights(db, ctx.orgId)]);
    return NextResponse.json({ leads, insights });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
