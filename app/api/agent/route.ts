// Provider-neutral agent endpoint — the Route C bridge.
//
// The dashboard chat (/api/chat) streams for a browser. THIS endpoint returns a
// single JSON answer, which is the shape a Microsoft Teams bot or an M365 Copilot
// declarative-agent "action" wants. It accepts either a browser session (so you
// can test it today) OR a trusted service token + org header (how Copilot/Teams
// will authenticate once registered — see agentContextFromService).
//
// Its request/response contract is described by /api/agent/openapi, which is the
// spec you import when registering Fundir as a Copilot plugin.

import { NextRequest, NextResponse } from 'next/server';
import {
  agentContextFromService,
  agentContextFromSession,
  type AgentContext,
} from '@/lib/agent/context';
import { selectTools } from '@/lib/agent/tools';
import { runAgent } from '@/lib/agent/loop';

export const maxDuration = 60;

const NEUTRAL_SYSTEM = (org: string) =>
  `You are the Fundir Advisor, a grant-strategy agent for ${org}. Answer the user's ` +
  `question using your tools to pull live data — grant pipeline, financial snapshot, and ` +
  `the organization's own OneDrive documents. Be specific: cite real grant names, agencies, ` +
  `dollar figures, and scores. If you lack the data to answer, say so plainly. Keep answers ` +
  `focused and decision-oriented.`;

interface AgentRequest {
  query?:       string;
  messages?:    Array<{ role: 'user' | 'assistant'; content: string }>;
  allowWrites?: boolean;   // default false — external callers get the read-only tool subset
}

function normalizeMessages(body: AgentRequest): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (typeof body.query === 'string' && body.query.trim()) {
    return [{ role: 'user', content: body.query.trim() }];
  }
  return (body.messages ?? [])
    .filter((m) => m?.content?.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const orgHeader = req.headers.get('x-org-code');

  // Prefer service auth (Route C), fall back to browser session (dev/testing).
  let ctx: AgentContext | null = await agentContextFromService(bearer, orgHeader);
  if (!ctx) ctx = await agentContextFromSession();
  if (!ctx) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Agent not configured.' }, { status: 503 });
  }

  let body: AgentRequest;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const messages = normalizeMessages(body);
  if (!messages.length) {
    return NextResponse.json({ error: 'Provide a `query` string or a `messages` array.' }, { status: 400 });
  }

  // Write tools are only offered when the caller explicitly opts in AND is the
  // owner's own session — a bare service/Copilot call stays read-only.
  const allowWrites = body.allowWrites === true && ctx.source === 'session';
  const tools = selectTools({ readOnlyOnly: !allowWrites });

  try {
    const { text, toolsUsed } = await runAgent({
      context:  ctx,
      system:   NEUTRAL_SYSTEM(ctx.orgName),
      messages,
      tools,
      maxTokens: 1500,
    });
    return NextResponse.json({ answer: text, toolsUsed, org: ctx.orgCode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent run failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
