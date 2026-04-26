import { NextResponse } from 'next/server';
import { rescoreAndPruneExistingMatches } from '@/actions/discovery';

// POST /api/admin/prune-matches
// One-time cleanup: removes hard-excluded grants (international/defense) from DB
// Requires bearer token matching ADMIN_SECRET env var
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.ADMIN_SECRET || 'fundir-admin-2025';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await rescoreAndPruneExistingMatches();
  return NextResponse.json(result);
}
