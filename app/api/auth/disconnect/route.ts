import { NextRequest, NextResponse } from 'next/server';
import { removeIntegration, Provider } from '@/lib/oauth-tokens';
import { getAuthContext } from '@/lib/auth-context';

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { provider } = await req.json() as { provider: Provider };
  if (!provider || (provider !== 'google' && provider !== 'microsoft')) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // Org code from auth — never trust the body. Without this gate, anyone
  // could disconnect any org's stored OAuth tokens.
  await removeIntegration(ctx.orgCode, provider);
  return NextResponse.json({ ok: true });
}
