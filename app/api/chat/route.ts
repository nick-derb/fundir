import { NextRequest } from 'next/server';
import { agentContextFromSession, type AgentContext } from '@/lib/agent/context';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import { runAgentStream } from '@/lib/agent/loop';
import { getOrgFinancialProfile } from '@/lib/org-financials';

export const maxDuration = 60;

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

// A grounded summary of the pipeline is injected into the system prompt so simple
// questions answer instantly without a tool round-trip; the tools cover the rest
// (searching OneDrive, reading a specific doc, saving a draft, deeper pipeline pulls).
async function buildMatchContext(db: AgentContext['db'], orgId: string): Promise<string> {
  const { data } = await db
    .from('match_results')
    .select('composite_score, pipeline_stage, grant:grant_opportunities(title, agency_name, close_date)')
    .eq('org_id', orgId)
    .order('composite_score', { ascending: false })
    .limit(12);

  if (!data?.length) return 'No grants discovered yet. Suggest the user run discovery from the Matches page.';
  return data.map((m) => {
    const g = m.grant as { title?: string; agency_name?: string; close_date?: string } | null;
    return `  - ${g?.title ?? 'Untitled grant'} (${g?.agency_name ?? 'agency unknown'}) — score ${Math.round(m.composite_score)}/100, stage: ${m.pipeline_stage}${g?.close_date ? `, closes ${g.close_date}` : ''}`;
  }).join('\n');
}

function systemPrompt(orgName: string, financialCtx: string, matchCtx: string): string {
  return `You are the Fundir Advisor — an AI grant strategist embedded in the Fundir platform, advising ${orgName}.

Your job is to help nonprofit development staff make real funding decisions: which grants to prioritize, how to reduce funding-concentration risk, how to position the organization to funders, and how to interpret their own financials.

GROUND RULES:
- Be specific and concrete. Cite real numbers, real grant names, and real ALN codes. Never give generic nonprofit advice that could apply to any org.
- Be concise. This is a chat panel, not a report — 2 to 4 short paragraphs, or a tight bulleted list. Lead with the answer.
- Be honest about risk. If the organization is financially stretched, say so plainly.
- When asked what to prioritize, rank explicitly and give the reasoning.
- Never invent grant opportunities, dollar amounts, or funders. Only reference real data.

TOOLS — use them when the question needs live or specific data:
- search_grant_pipeline / get_financial_snapshot: pull fuller or fresher data than the summary below.
- search_documents + read_document: find and read the org's own OneDrive files (990s, budgets, board minutes, strategic plans) to ground your advice in their actual documents.
- save_draft_to_onedrive: when the user asks to save or export something you drafted, write it to their OneDrive.
Only call a tool when it adds something the summary below doesn't already give you.
${financialCtx ? `\nFINANCIAL INTELLIGENCE:\n${financialCtx}\n` : `\nThis organization has no full financial profile loaded yet — use get_financial_snapshot or work from the pipeline below.\n`}
CURRENT GRANT PIPELINE (top live matches, highest score first):
${matchCtx}`;
}

export async function POST(req: NextRequest) {
  const ctx = await agentContextFromSession();
  if (!ctx) return new Response('Not authenticated.', { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('The advisor is not configured (missing API key).', { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try { body = await req.json(); }
  catch { return new Response('Invalid request body.', { status: 400 }); }

  const messages = (body.messages ?? [])
    .slice(-12)
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  if (!messages.length) return new Response('No messages provided.', { status: 400 });

  const fin = await getOrgFinancialProfile(ctx.orgCode);
  const financialCtx = fin?.buildIntelligenceContext?.() ?? '';
  const matchCtx = await buildMatchContext(ctx.db, ctx.orgId);
  const system = systemPrompt(ctx.orgName, financialCtx, matchCtx);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgentStream({
          context: ctx,
          system,
          messages,
          tools: AGENT_TOOLS,
          maxTokens: 1500,
        })) {
          if (event.type === 'text') controller.enqueue(encoder.encode(event.text));
          // tool_start / done are progress signals — the panel shows its own
          // "Thinking…" state, so we don't inject status text into the bubble.
        }
      } catch {
        controller.enqueue(encoder.encode('\n\n[The advisor was interrupted. Please try again.]'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
