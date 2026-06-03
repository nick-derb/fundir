import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export interface OnboardingProfile {
  orgName?:         string;
  city?:            string;
  state?:           string;
  mission?:         string;
  programs?:        string[];
  targetPopulations?: string[];
  annualBudget?:    number | null;
  fundingUse?:      ('operating' | 'project' | 'capital' | 'training' | 'general')[];
  funderTypes?:     ('federal' | 'state_local' | 'foundation' | 'corporate')[];
  grantSizeMin?:    number | null;
  grantSizeMax?:    number | null;
}

interface TurnResponse {
  assistant_message:   string;
  extracted:           Partial<OnboardingProfile>;
  suggested_options?:  string[];
  done:                boolean;
  summary?:            string;
}

const SYSTEM = `You are Fundir's onboarding assistant. Your job is to help a nonprofit grant writer set up their organization profile through a quick, friendly conversation — capturing structured data as you go.

WORKFLOW:
- Ask ONE question at a time. Keep messages SHORT — 1 to 2 sentences.
- Extract structured fields from each user reply. Be liberal: if the user mentions city + state, capture both. If they describe programs, infer program areas. If they say "we serve at-risk youth", capture targetPopulations.
- Use suggested_options when a short list of taps would be faster than typing — funding-use selection, funder-type selection, grant-size range. Otherwise leave the array empty.
- After capturing the essentials, set done=true and produce a 2-sentence summary.

QUESTIONS TO COVER (in roughly this order, skipping anything already captured from the conversation):
1. Organization name
2. Location (city + state)
3. Mission and programs — what they do, who they serve
4. Annual operating budget
5. What kinds of funding they want (operating, project/program, capital, training, general)
6. What funder types to surface (federal, state/local, foundations, corporate)
7. Typical grant size range they target

PROFILE FIELDS:
orgName, city, state, mission, programs (array), targetPopulations (array), annualBudget (number), fundingUse (array of: operating, project, capital, training, general), funderTypes (array of: federal, state_local, foundation, corporate), grantSizeMin (number), grantSizeMax (number).

OUTPUT: Return ONLY valid JSON, no markdown, no prose preamble.

Schema:
{
  "assistant_message": "your conversational response — friendly, brief, one question",
  "extracted": { only fields you can extract from the latest user response },
  "suggested_options": ["tap option 1", "tap option 2"] OR [],
  "done": false,
  "summary": "(only present when done=true) 2-sentence org summary"
}

Style: warm, brief, never lecture, never ask multi-part questions. One emoji per message MAX, only on the first greeting and the final completion.`;

function buildUserPrompt(messages: ChatMessage[], profile: Partial<OnboardingProfile>): string {
  const filledKeys = Object.entries(profile)
    .filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))
    .map(([k]) => k);

  const history = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

  return `CURRENT PROFILE (already captured): ${filledKeys.length ? filledKeys.join(', ') : 'nothing yet'}
PROFILE STATE: ${JSON.stringify(profile)}

CONVERSATION HISTORY:
${history}

Reply with the next turn as JSON per the schema. If this is the first turn (no user messages yet), greet warmly and ask question 1 (organization name).`;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });
  }

  let body: { messages?: ChatMessage[]; profile?: Partial<OnboardingProfile> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const messages = body.messages ?? [];
  const profile  = body.profile  ?? {};

  // Cap history at 16 turns to keep token spend bounded
  const trimmed = messages.slice(-16).filter(m => m.content?.trim());

  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 700,
      temperature: 0.3,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: buildUserPrompt(trimmed, profile) }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const json = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json) as TurnResponse;

    // Defensive: ensure shape
    return NextResponse.json({
      assistant_message:  String(parsed.assistant_message || '').trim(),
      extracted:          parsed.extracted ?? {},
      suggested_options:  Array.isArray(parsed.suggested_options) ? parsed.suggested_options : [],
      done:               Boolean(parsed.done),
      summary:            parsed.summary,
    } satisfies TurnResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI turn failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
