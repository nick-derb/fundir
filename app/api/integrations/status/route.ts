import { NextRequest, NextResponse } from 'next/server';
import { getAllIntegrations } from '@/lib/oauth-tokens';

export async function GET(req: NextRequest) {
  const orgCode = req.nextUrl.searchParams.get('org') ?? 'CYC2025';
  try {
    const integrations = await getAllIntegrations(orgCode);
    return NextResponse.json({
      google:    integrations.some(i => i.provider === 'google'),
      microsoft: integrations.some(i => i.provider === 'microsoft'),
    });
  } catch {
    // Table may not exist yet — return disconnected rather than 500
    return NextResponse.json({ google: false, microsoft: false });
  }
}
