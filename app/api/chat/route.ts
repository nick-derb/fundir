import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { getOrgFinancialProfile } from '@/lib/org-financials';

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

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

function systemPrompt(orgName: string, hasFinancialIntel: boolean, financialCtx: string, matchCtx: string): string {
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
${hasFinancialIntel ? `
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

  // Org identity comes from auth, NOT the request body. The rich financial-
  // intelligence prose only applies to orgs whose fixture in
  // lib/org-financials.ts exposes a buildIntelligenceContext factory. The
  // gate is the existence of that factory — no hardcoded org-code check.
  const orgCode = ctx.orgCode;
  const orgId   = ctx.orgId;
  const orgName = ctx.orgName;
  const orgFin  = await getOrgFinancialProfile(orgCode);
  const financialCtx       = orgFin?.buildIntelligenceContext?.() ?? '';
  const hasFinancialIntel  = financialCtx.length > 0;
  const matchCtx           = await buildMatchContext(orgId);

  // Cap history to the last 12 turns to control token cost
  const trimmed = messages
    .slice(-12)
    .filter(m => m.content?.trim())
    .map(m => ({ role: m.role, content: m.content }));

  const stream = client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     systemPrompt(orgName, hasFinancialIntel, financialCtx, matchCtx),
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
