import { NextRequest, NextResponse } from 'next/server';
import { removeIntegration, Provider } from '@/lib/oauth-tokens';

export async function POST(req: NextRequest) {
  const { orgCode, provider } = await req.json() as {
    orgCode: string;
    provider: Provider;
  };

  if (!orgCode || !provider) {
    return NextResponse.json({ error: 'Missing orgCode or provider' }, { status: 400 });
  }

  await removeIntegration(orgCode, provider);
  return NextResponse.json({ ok: true });
}
