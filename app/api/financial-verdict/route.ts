import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { screen990Against, RequirementCheck, EligibilitySignal } from '@/lib/990-screener';
import { getOrgFinancialProfile } from '@/lib/org-financials';
import { ComputedFinancials } from '@/lib/propublica';
import { ExtractedFields } from '@/types';

export const maxDuration = 45;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function money(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

const SYSTEM = `You are Fundir's financial eligibility analyst. Given an organization's IRS 990 financial profile and a specific grant — plus deterministic requirement checks already computed — you write a tight, grant-specific financial verdict for the org's grant writers.

Rules:
- Be specific to THIS grant and THIS organization. Cite real dollar figures.
- Lead with the bottom line: pursue or not, and the financial catch.
- topRisk = the single biggest financial risk or blocker. Set it to null only if there genuinely is none.
- mitigations = 2 to 4 concrete moves. At least one should be language the org can put directly in the application's financial-capacity narrative to preempt the funder's concern.
- Be honest. If a blocker means "do not pursue without X", say exactly that.
- Return ONLY valid JSON, no markdown, no code fences.`;

function buildPrompt(
  orgName: string, computed: ComputedFinancials,
  grant: { title: string; agency_name: string; aln_codes: string[] },
  fields: ExtractedFields,
  signals: EligibilitySignal[],
  checks: RequirementCheck[],
  financialScore: number,
): string {
  const award = fields.award_ceiling || fields.award_floor || 0;
  const reqs  = fields.financial_requirements ?? {};

  const signalLines = signals.length
    ? signals.map(s => `  - ${s.factor}: ${s.status.toUpperCase()} — ${s.headline}`).join('\n')
    : '  (none computed)';
  const checkLines = checks.length
    ? checks.map(c => `  - ${c.requirement}: ${c.status.toUpperCase()} — ${c.finding}. ${c.detail}`).join('\n')
    : '  (no specific financial requirements detected in the grant text)';

  return `ORGANIZATION: ${orgName}
- Total revenue: ${money(computed.totalRevenue)}
- Government revenue concentration: ${computed.governmentGrantsPct}%
- Operating reserves: ${computed.monthsOfReserves} months
- Net assets: ${money(computed.netAssets)}
- Program efficiency: ${computed.programEfficiencyPct}%

GRANT: ${grant.title}
- Funder: ${grant.agency_name}${grant.aln_codes?.length ? ` (ALN ${grant.aln_codes.join(', ')})` : ''}
- Award size: ${award ? money(award) : 'not specified'}
- Stated financial requirements: ${JSON.stringify(reqs)}

DETERMINISTIC 990 SIGNALS (org financial health, 0-100 composite = ${financialScore}):
${signalLines}

REQUIREMENT CHECKS (org's 990 tested against this grant's specific financial bar):
${checkLines}

Write the verdict as JSON:
{
  "bottomLine": "1-2 sentences — pursue or not, and the financial catch",
  "topRisk": { "title": "short risk name", "detail": "1-2 sentence explanation with numbers" } or null,
  "mitigations": ["concrete move or application-narrative language", "..."]
}`;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI verdict is not configured.' }, { status: 503 });
  }

  let body: { grantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!body.grantId) return NextResponse.json({ error: 'grantId is required.' }, { status: 400 });

  const db = createServerClient();
  const { data: match } = await db
    .from('match_results')
    .select('*, grant:grant_opportunities(*)')
    .eq('grant_id', body.grantId)
    .eq('org_id', ctx.orgId)
    .single();

  if (!match || !match.grant) {
    return NextResponse.json({ error: 'Grant not found.' }, { status: 404 });
  }

  const grant   = match.grant;
  const fields  = (grant.extracted_fields ?? {}) as ExtractedFields;
  const profile = await getOrgFinancialProfile(ctx.orgCode);

  if (!profile) {
    return NextResponse.json({
      requirementChecks: [],
      verdict: null,
      message: 'No 990 financial profile is loaded for this organization. Sync financials in Settings to enable the verdict.',
    });
  }

  const screen = screen990Against(
    profile.computed, profile.org, fields,
    grant.agency_code ?? '', grant.aln_codes ?? [],
    { history: profile.history },
  );

  let verdict: unknown = null;
  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 900,
      temperature: 0.2,
      system:     SYSTEM,
      messages: [{
        role: 'user',
        content: buildPrompt(
          ctx.orgName, profile.computed,
          { title: grant.title, agency_name: grant.agency_name, aln_codes: grant.aln_codes ?? [] },
          fields, screen.signals, screen.requirementChecks, screen.score,
        ),
      }],
    });
    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const json = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    verdict = JSON.parse(json);
  } catch {
    verdict = null;
  }

  return NextResponse.json({
    requirementChecks: screen.requirementChecks,
    financialScore:    screen.score,
    verdict,
  });
}
