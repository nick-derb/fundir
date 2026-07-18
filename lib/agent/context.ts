// Agent execution context — the org-scoped handle every tool receives.
//
// This is the seam that lets the SAME agent core serve two front doors:
//   • Route A (now):   the dashboard chat — context built from the browser session.
//   • Route C (later): a Teams bot / M365 Copilot connector — context built from a
//                      service token + the org it's acting for.
// Tools never see a request, a session, or a provider SDK directly — only this
// context. Adding a new caller means adding a new resolver here, nothing else.

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { getValidToken, type Provider } from '@/lib/oauth-tokens';

export interface AgentContext {
  orgId:     string;
  orgCode:   string;
  orgName:   string;
  userEmail: string;
  isAdmin:   boolean;
  /** Service-role Supabase client (RLS bypassed — org scoping is enforced by tools via orgId). */
  db:        ReturnType<typeof createServerClient>;
  /** Valid (auto-refreshed) OAuth token for a cloud provider, or null if not connected. */
  getToken(provider: Provider): Promise<string | null>;
  /** How this context was authenticated — useful for gating write actions. */
  source:    'session' | 'service';
}

interface AgentIdentity {
  orgId:     string;
  orgCode:   string;
  orgName:   string;
  userEmail: string;
  isAdmin:   boolean;
  source:    'session' | 'service';
}

function buildAgentContext(id: AgentIdentity): AgentContext {
  return {
    ...id,
    db:       createServerClient(),
    getToken: (provider) => getValidToken(id.orgCode, provider),
  };
}

/** Route A: resolve context from the logged-in browser session. */
export async function agentContextFromSession(): Promise<AgentContext | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  return buildAgentContext({
    orgId:     ctx.orgId,
    orgCode:   ctx.orgCode,
    orgName:   ctx.orgName,
    userEmail: ctx.email,
    isAdmin:   ctx.isAdmin,
    source:    'session',
  });
}

/**
 * Route C bridge: resolve context from a trusted service caller (Teams bot,
 * M365 Copilot connector) that authenticates with a shared bearer token and
 * declares which org it is acting for via the `x-org-code` header.
 *
 * Inert unless FUNDIR_AGENT_SERVICE_TOKEN is set — so this endpoint is safe to
 * ship dark and turn on only when the Copilot/Teams integration is registered.
 */
export async function agentContextFromService(
  bearer:  string | null,
  orgCode: string | null,
): Promise<AgentContext | null> {
  const expected = process.env.FUNDIR_AGENT_SERVICE_TOKEN;
  if (!expected || !bearer || !orgCode) return null;
  // Constant-time-ish compare (lengths differ → not equal; avoids early-exit leak).
  if (bearer.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= bearer.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  const db = createServerClient();
  const { data: org } = await db
    .from('organizations')
    .select('id, name, org_code')
    .eq('org_code', orgCode)
    .maybeSingle();
  if (!org) return null;

  return buildAgentContext({
    orgId:     org.id,
    orgCode:   org.org_code,
    orgName:   org.name,
    userEmail: `service@${org.org_code}`,
    isAdmin:   false,
    source:    'service',
  });
}
