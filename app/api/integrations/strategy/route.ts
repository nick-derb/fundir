import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a senior nonprofit funding strategist with expertise in grant writing, revenue diversification, and organizational development. You synthesize document intelligence into actionable funding strategies.

CRITICAL: Return ONLY valid JSON. No prose, no markdown code blocks. Just the JSON object.`;

function buildStrategyPrompt(orgName: string, analyses: unknown[]): string {
  const summaries = (analyses as Array<{ doc_type: string; file_name: string; summary: string; analysis: unknown }>)
    .map((a, i) => `[Document ${i + 1}] Type: ${a.doc_type} · File: ${a.file_name}\nSummary: ${a.summary}\nKey data: ${JSON.stringify(a.analysis).slice(0, 2000)}`)
    .join('\n\n---\n\n');

  return `Generate a comprehensive funding strategy brief for ${orgName} based on the following ${analyses.length} analyzed document(s).

${summaries}

Return this exact JSON:
{
  "org_name": "${orgName}",
  "analysis_count": ${analyses.length},
  "generated_at": "${new Date().toISOString()}",
  "executive_summary": "3-5 sentence overview of the organization's funding situation and top priorities",
  "organizational_strengths": ["strength 1", "strength 2", "strength 3"],
  "critical_gaps": [
    {"gap": "specific gap", "impact": "why this matters for funding", "urgency": "high | medium | low"}
  ],
  "funding_strategy": "3-5 paragraph narrative covering current funding landscape, diversification strategy, and path forward",
  "top_funding_priorities": [
    {
      "rank": 1,
      "focus_area": "specific program or need",
      "rationale": "why this should be prioritized",
      "target_amount": "estimated amount or null",
      "timeline": "when to pursue",
      "readiness": "high | medium | low"
    }
  ],
  "grant_opportunities": [
    {
      "type": "government | foundation | corporate | individual",
      "focus_area": "e.g. Early Childhood, Workforce Development",
      "rationale": "why this org qualifies",
      "estimated_range": "e.g. $25K–$150K or null",
      "readiness": "high | medium | low"
    }
  ],
  "revenue_diversification": "paragraph describing how to reduce single-source dependency and broaden funding mix",
  "risk_mitigation": ["specific risk and how to address it"],
  "quarterly_action_plan": [
    {"quarter": "Q1", "actions": ["specific action"]},
    {"quarter": "Q2", "actions": ["specific action"]},
    {"quarter": "Q3", "actions": ["specific action"]},
    {"quarter": "Q4", "actions": ["specific action"]}
  ]
}`;
}

export async function POST(req: NextRequest) {
  const { orgCode, orgName = 'Your Organization' } =
    await req.json() as { orgCode: string; orgName?: string };

  if (!orgCode) {
    return NextResponse.json({ error: 'orgCode required' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 });
  }

  const db = createServerClient();
  const { data: analyses } = await db
    .from('document_analyses')
    .select('doc_type, file_name, summary, analysis')
    .eq('org_code', orgCode)
    .order('analyzed_at', { ascending: false })
    .limit(10);

  if (!analyses || analyses.length === 0) {
    return NextResponse.json(
      { error: 'No documents analyzed yet. Upload at least one document first.' },
      { status: 400 },
    );
  }

  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: buildStrategyPrompt(orgName, analyses) }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonText = rawText
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let brief: unknown;
    try {
      brief = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { error: 'AI returned malformed JSON', raw: rawText.slice(0, 500) },
        { status: 502 },
      );
    }

    return NextResponse.json({ brief, documentCount: analyses.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Strategy generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
