import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import {
  CYC_INTELLIGENCE_FLAGS, CYC_FEDERAL_PROGRAMS, CYC_INCOME_STATEMENT,
  CYC_LIQUIDITY, CYC_PROGRAM_ANALYSIS, CYC_REVENUE_TREND, CYC_IMPACT,
} from '@/lib/cyc-live-data';

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

function money(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

// ── CYC financial intelligence — the advisor reasons over this ───────────────
function buildCycContext(): string {
  const inc = CYC_INCOME_STATEMENT;

  const flags = CYC_INTELLIGENCE_FLAGS
    .map(f => `  - [${f.severity.toUpperCase()}] ${f.headline} (${f.metric}). ${f.detail} RECOMMENDED ACTION: ${f.action}`)
    .join('\n');

  const federal = CYC_FEDERAL_PROGRAMS
    .map(p => `  - ${p.name}, ALN ${p.aln}: ~${money(p.estimatedAmount)} (${p.pctOfRevenue}% of total revenue) — RISK ${p.risk.toUpperCase()}. ${p.riskReason} Program impact: ${p.programImpact}.`)
    .join('\n');

  const trend = CYC_REVENUE_TREND
    .map(t => `  - ${t.year}: revenue ${money(t.revenue)}, expenses ${money(t.expenses)}, ${money(t.surplus)} ${t.surplus >= 0 ? 'surplus' : 'deficit'} (${t.note})`)
    .join('\n');

  const pa = CYC_PROGRAM_ANALYSIS;
  const programs = [
    `  - Early Childhood Education: ${pa.earlyChildhood.pctOfProgramExpenses}% of program spend (${money(pa.earlyChildhood.expenseFY2025)}). ${pa.earlyChildhood.efficiencyNote}`,
    `  - School-Age / Out-of-School Time: ${pa.schoolAge.pctOfProgramExpenses}% (${money(pa.schoolAge.expenseFY2025)}), funding gap ${money(pa.schoolAge.fundingGap)}. ${pa.schoolAge.note}`,
    `  - Teen Leadership Development: ${pa.teenLeadership.pctOfProgramExpenses}% (${money(pa.teenLeadership.expenseFY2025)}), funding gap ${money(pa.teenLeadership.fundingGap)}. ${pa.teenLeadership.note}`,
  ].join('\n');

  return `CHICAGO YOUTH CENTERS — FINANCIAL INTELLIGENCE (audited FY2025, year ended June 30, 2025)

TOP-LINE: Total revenue ${money(inc.revenue.totalRevenue)}, total expenses ${money(inc.expenses.totalExpenses)}, net ${money(inc.netChange)} (operating deficit, reversing a ${money(inc.netChangePrior)} surplus the prior year). 68 years in operation, Charity Navigator 4/4 stars, 86% program-expense ratio.

LIQUIDITY: ${money(CYC_LIQUIDITY.netUnrestrictedLiquidity)} net unrestricted liquidity — roughly ${CYC_LIQUIDITY.monthsOfLiquidity} months of operating expenses (healthy benchmark is 3-6 months). The organization drew ${money(455_000)} on its ${money(1_500_000)} line of credit in FY2025, the first draw ever.

3-YEAR REVENUE TREND:
${trend}

INTELLIGENCE FLAGS (auto-derived from the audited statements):
${flags}

FEDERAL FUNDING PORTFOLIO — government revenue is 74.6% of total, and these federal programs are exposed under the FY2026/FY2027 appropriations cycle:
${federal}

PROGRAM CONCENTRATION:
${programs}

MISSION IMPACT: ${CYC_IMPACT.youthServedTotal.toLocaleString()} youth served across 7 Chicago centers — early learning (ages 15 months-5), out-of-school time (6-18), and teen leadership. Serves Chicago's South and West sides.`;
}

async function buildMatchContext(orgId: string | undefined): Promise<string> {
  if (!orgId) return 'No organization context for live grant matches.';
  const db = createServerClient();
  const { data } = await db
    .from('match_results')
    .select('composite_score, pipeline_stage, recommendation, grant:grant_opportunities(title, agency_name, close_date)')
    .eq('org_id', orgId)
    .order('composite_score', { ascending: false })
    .limit(15);

  if (!data?.length) {
    return 'No grants discovered yet. Suggest the user run discovery from the Matches page.';
  }
  return data.map(m => {
    const g = m.grant as { title?: string; agency_name?: string; close_date?: string } | null;
    return `  - ${g?.title ?? 'Untitled grant'} (${g?.agency_name ?? 'agency unknown'}) — match score ${Math.round(m.composite_score)}/100, pipeline stage: ${m.pipeline_stage}${g?.close_date ? `, closes ${g.close_date}` : ''}`;
  }).join('\n');
}

function systemPrompt(orgName: string, isCyc: boolean, financialCtx: string, matchCtx: string): string {
  return `You are the Fundir Advisor — an AI grant strategist embedded in the Fundir platform, advising ${orgName}.

Your job is to help nonprofit development staff make real funding decisions: which grants to prioritize, how to reduce funding-concentration risk, how to position the organization to funders, and how to interpret their own financials.

GROUND RULES:
- Be specific and concrete. Cite real numbers, real grant names, and real ALN codes from the context below. Never give generic nonprofit advice that could apply to any org.
- Be concise. This is a chat panel, not a report — 2 to 4 short paragraphs, or a tight bulleted list. Lead with the answer.
- Be honest about risk. If the organization is financially stretched, say so plainly and explain what it means for how funders will see them.
- When asked what to prioritize, rank explicitly and give the reasoning for the ranking.
- You can draft funder-facing language — talking points, pitch paragraphs, email openers — when asked.
- If a question needs data you don't have, say so, and point to where in Fundir to find it (Matches, Financials, Foundations, Calendar, Reports).
- Never invent grant opportunities, dollar amounts, or funders. Only reference what is in the context.
${isCyc ? `
${financialCtx}
` : `
This organization does not yet have a full financial intelligence profile loaded. Work from the grant pipeline below and general grant strategy.
`}
CURRENT GRANT PIPELINE (live matches from Fundir's discovery engine, highest match score first):
${matchCtx}`;
}

export async function POST(req: NextRequest) {
  // Auth FIRST — derive org identity from the session, never trust the body.
  const ctx = await getAuthContext();
  if (!ctx) {
    return new Response('Not authenticated.', { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('The advisor is not configured (missing API key).', { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid request body.', { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!messages.length) {
    return new Response('No messages provided.', { status: 400 });
  }

  // Org identity comes from auth, NOT the request body.
  const orgCode = ctx.orgCode;
  const orgId   = ctx.orgId;
  const orgName = ctx.orgName;
  const isCyc   = orgCode === 'CYC2025';
  const [financialCtx, matchCtx] = await Promise.all([
    Promise.resolve(isCyc ? buildCycContext() : ''),
    buildMatchContext(orgId),
  ]);

  // Cap history to the last 12 turns to control token cost
  const trimmed = messages
    .slice(-12)
    .filter(m => m.content?.trim())
    .map(m => ({ role: m.role, content: m.content }));

  const stream = client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     systemPrompt(orgName, isCyc, financialCtx, matchCtx),
    messages:   trimmed,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        controller.enqueue(encoder.encode('\n\n[The advisor was interrupted. Please try again.]'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
