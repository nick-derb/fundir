import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior nonprofit financial analyst and grant intelligence expert. You analyze financial documents and produce structured intelligence reports.

When given financial data, you:
1. Extract all financial figures, identifying revenue streams, expenses, and balance sheet items
2. Calculate key nonprofit financial health ratios
3. Build realistic 3-year revenue projections under three scenarios
4. Assess grant readiness and flag risks or strengths
5. Provide specific, actionable recommendations

CRITICAL: Return ONLY valid JSON. No prose before or after. No markdown code blocks. Just the JSON object.`;

const USER_PROMPT = (content: string, fileName: string) => `Analyze the following financial document and return a structured financial intelligence report.

File: ${fileName}

RETURN THIS EXACT JSON STRUCTURE (fill all fields with real numbers from the document, use null if not found):
{
  "org_name": "string or null",
  "fiscal_year": "number or null",
  "file_name": "${fileName}",
  "data_quality": "complete | partial | minimal",
  "summary": "2-3 sentence executive summary of financial health",
  "income_statement": {
    "total_revenue": 0,
    "prior_year_revenue": null,
    "revenue_categories": [
      {"name": "category name", "amount": 0, "pct": 0}
    ],
    "total_expenses": 0,
    "expense_categories": [
      {"name": "category name", "amount": 0, "pct": 0}
    ],
    "net_income": 0,
    "change_vs_prior_pct": null
  },
  "balance_sheet": {
    "total_assets": 0,
    "total_liabilities": 0,
    "net_assets": 0,
    "unrestricted_net_assets": null,
    "temporarily_restricted": null,
    "permanently_restricted": null
  },
  "liquidity": {
    "cash_and_equivalents": null,
    "months_of_reserves": null,
    "current_ratio": null,
    "line_of_credit_used": null
  },
  "key_ratios": {
    "govt_dependency_pct": null,
    "program_expense_ratio": null,
    "admin_ratio": null,
    "fundraising_ratio": null,
    "revenue_growth_rate_pct": null,
    "debt_to_assets_ratio": null
  },
  "grant_readiness": {
    "score": 0,
    "dimension_scores": {
      "reserves": 0,
      "financial_risk": 0,
      "revenue_diversity": 0,
      "financial_management": 0,
      "stability": 0
    },
    "flags": [
      {"severity": "critical | warning | info", "label": "short label", "detail": "explanation"}
    ]
  },
  "projections": {
    "base_metric": "total_revenue",
    "base_value": 0,
    "assumptions": "brief description of projection methodology",
    "conservative": {"year1": 0, "year2": 0, "year3": 0, "growth_rate_pct": 0},
    "moderate": {"year1": 0, "year2": 0, "year3": 0, "growth_rate_pct": 0},
    "optimistic": {"year1": 0, "year2": 0, "year3": 0, "growth_rate_pct": 0}
  },
  "recommendations": [
    {"priority": "high | medium | low", "category": "revenue | expenses | grants | risk", "text": "specific actionable recommendation"}
  ]
}

FINANCIAL DOCUMENT CONTENT:
${content}`;

export async function POST(req: NextRequest) {
  const { content, fileName = 'Financial Document' } = await req.json() as {
    content: string;
    fileName?: string;
  };

  if (!content || content.length < 50) {
    return NextResponse.json(
      { error: 'Document content too short to analyze' },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured' },
      { status: 503 },
    );
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: USER_PROMPT(content.slice(0, 100_000), fileName),
        },
      ],
    });

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Strip any accidental markdown code fences
    const jsonText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let analysis: unknown;
    try {
      analysis = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { error: 'AI returned malformed JSON', raw: rawText.slice(0, 500) },
        { status: 502 },
      );
    }

    return NextResponse.json({ analysis, usage: message.usage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
