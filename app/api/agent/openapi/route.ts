// OpenAPI 3.0 description of the Fundir agent action.
//
// This is the file you import when registering Fundir as a Microsoft 365 Copilot
// plugin / declarative-agent action or wiring a Teams bot: it tells Copilot there
// is one operation — "ask the Fundir Advisor a question" — how to authenticate
// (service bearer token + org header), and what the request/response look like.
// The capability list is generated from the live tool registry so it never drifts.

import { NextResponse } from 'next/server';
import { selectTools } from '@/lib/agent/tools';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fundir.ai';

  // Advertise only read-only capabilities to external assistants.
  const capabilities = selectTools({ readOnlyOnly: true }).map((t) => ({
    name:        t.name,
    description: t.description,
    requires:    t.requires,
  }));

  const spec = {
    openapi: '3.0.1',
    info: {
      title:       'Fundir Advisor',
      version:     '1.0.0',
      description:
        'Grant-strategy agent for a Fundir organization. Ask a natural-language question and ' +
        'the agent answers using live Fundir data (grant pipeline, financial snapshot) and the ' +
        "organization's own Microsoft OneDrive documents. Underlying capabilities: " +
        capabilities.map((c) => c.name).join(', ') + '.',
    },
    servers: [{ url: appUrl }],
    paths: {
      '/api/agent': {
        post: {
          operationId: 'askFundirAdvisor',
          summary:     'Ask the Fundir grant-strategy advisor a question',
          description:
            'Answers grant-strategy questions for the organization named in the x-org-code header, ' +
            'grounded in that organization\'s live Fundir data and OneDrive documents.',
          security: [{ ServiceToken: [] }],
          parameters: [
            {
              name:        'x-org-code',
              in:          'header',
              required:    true,
              description: 'The Fundir organization code to act for (e.g. CYC2026).',
              schema:      { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    query: {
                      type:        'string',
                      description: 'The natural-language question to ask the advisor.',
                    },
                  },
                  required: ['query'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'The advisor\'s answer.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer:    { type: 'string', description: 'The advisor\'s answer, in markdown.' },
                      toolsUsed: { type: 'array', items: { type: 'string' }, description: 'Which capabilities the advisor used.' },
                      org:       { type: 'string', description: 'The organization code the answer is scoped to.' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Missing or invalid service token / org.' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ServiceToken: {
          type:        'http',
          scheme:      'bearer',
          description: 'Set the FUNDIR_AGENT_SERVICE_TOKEN value as a Bearer token. Pair with the x-org-code header.',
        },
      },
    },
    'x-fundir-capabilities': capabilities,
  };

  return NextResponse.json(spec, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
