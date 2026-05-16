import { NextRequest, NextResponse } from 'next/server';
import { fetchFoundationFinancials } from '@/lib/foundation-990';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { name?: string; state?: string; ein?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { name, state, ein } = body;
  if (!name) {
    return NextResponse.json({ error: 'Foundation name is required.' }, { status: 400 });
  }

  const data = await fetchFoundationFinancials(name, state, ein);
  if (!data) {
    return NextResponse.json(
      { error: 'No IRS filing data could be located for this foundation.' },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
