import { NextRequest, NextResponse } from 'next/server';
import { searchOrgs } from '@/lib/propublica';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';

  if (!q || q.trim().length < 2) {
    return NextResponse.json([]);
  }

  try {
    const results = await searchOrgs(q);
    return NextResponse.json(results);
  } catch (err) {
    console.error('[orgs/search] ProPublica error:', err);
    return NextResponse.json([], { status: 200 }); // degrade gracefully
  }
}
