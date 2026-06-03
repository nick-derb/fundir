import { NextResponse } from 'next/server';
import { getAllIntegrations } from '@/lib/oauth-tokens';
import { getAuthContext } from '@/lib/auth-context';

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const integrations = await getAllIntegrations(ctx.orgCode);
    return NextResponse.json({
      google:    integrations.some(i => i.provider === 'google'),
      microsoft: integrations.some(i => i.provider === 'microsoft'),
    });
  } catch {
    // Table may not exist yet — return disconnected rather than 500
    return NextResponse.json({ google: false, microsoft: false });
  }
}
