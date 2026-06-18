/**
 * Admin: B2 pilot — ingest a small batch of (ein, fy) pairs end-to-end
 * to measure real Tier-3 firing rate + cost before committing to the
 * full B4 backfill.
 *
 * POST body:
 *   { batches: [ { ein, fiscal_year }, ... ],
 *     cost_cap_micro_cents?: number }
 *
 * Defaults to the 5-filing CYC pilot if no body is supplied:
 *   - Joyce Foundation FY2024
 *   - MacArthur Foundation FY2024
 *   - Crown Family Philanthropies FY2024
 *   - Polk Bros. Foundation FY2024
 *   - Steans Family Foundation FY2024
 *
 * Bearer-gated. Default cost cap is $1.00 (1,000,000 µ¢) — well above
 * the BUDGET.md $0.50 pilot estimate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestBatch, type IngestBatchInput } from '@/lib/ingest/ingest-990-runner';

export const maxDuration = 300;
export const dynamic     = 'force-dynamic';

const DEFAULT_PILOT: IngestBatchInput[] = [
  { ein: '362642697', fiscal_year: 2024 },  // Joyce Foundation
  { ein: '366011707', fiscal_year: 2024 },  // McCormick Foundation
  { ein: '362167000', fiscal_year: 2024 },  // Chicago Community Trust
  { ein: '362167001', fiscal_year: 2024 },  // Crown Family Philanthropies
  { ein: '362412639', fiscal_year: 2024 },  // Polk Bros. Foundation
];

const DEFAULT_COST_CAP_MICRO_CENTS = 100_000;  // $1.00 hard cap

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { batches?: IngestBatchInput[]; cost_cap_micro_cents?: number } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const batches = body.batches ?? DEFAULT_PILOT;
  const cap     = body.cost_cap_micro_cents ?? DEFAULT_COST_CAP_MICRO_CENTS;

  try {
    const result = await ingestBatch(batches, { cost_cap_micro_cents: cap });
    return NextResponse.json({
      ok: true,
      cost_cap_micro_cents: cap,
      cost_cap_dollars:     `$${(cap / 100_000).toFixed(2)}`,
      spent_dollars:        `$${(result.total_cost_micro_cents / 100_000).toFixed(4)}`,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
