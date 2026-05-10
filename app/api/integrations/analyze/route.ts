import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type DocType =
  | 'financial'
  | 'strategic_plan'
  | 'grant_application'
  | 'program_report'
  | 'board_minutes'
  | 'general';

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM = `You are a senior nonprofit strategic advisor and financial analyst. You extract structured intelligence from organizational documents to support grant strategy and funding optimization.

CRITICAL: Return ONLY valid JSON. No prose before or after. No markdown code blocks. Just the JSON object.`;

// ── Shared sections/grant_alignment/action_items JSON schema fragment ──────────
const COMMON_SCHEMA = `  "sections": [
    {
      "title": "section name (e.g. Strategic Priorities, Key Decisions, Outcomes)",
      "items": [
        {"label": "specific item label", "value": "specific value or finding", "importance": "high | medium | low"}
      ]
    }
  ],
  "grant_alignment": [
    {"area": "grant funding area or topic", "rationale": "why this org/program aligns", "potential": "high | medium | low"}
  ],
  "action_items": [
    {"priority": "high | medium | low", "action": "specific actionable step", "timeline": "e.g. 30 days, Q2 2026, ongoing"}
  ]`;

// ── Doc-type-specific prompts ──────────────────────────────────────────────────
function buildPrompt(content: string, fileName: string, docType: DocType): string {
  const truncated = content.slice(0, 100_000);

  if (docType === 'financial') {
    return `Analyze the following financial document and return a structured financial intelligence report.

File: ${fileName}

RETURN THIS EXACT JSON STRUCTURE (fill all fields with real numbers from the document, use null if not found):
{
  "doc_type": "financial",
  "org_name": "string or null",
  "fiscal_year": "number or null",
  "file_name": "${fileName}",
  "data_quality": "complete | partial | minimal",
  "summary": "2-3 sentence executive summary of financial health",
  "income_statement": {
    "total_revenue": 0,
    "prior_year_revenue": null,
    "revenue_categories": [{"name": "category name", "amount": 0, "pct": 0}],
    "total_expenses": 0,
    "expense_categories": [{"name": "category name", "amount": 0, "pct": 0}],
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
    "flags": [{"severity": "critical | warning | info", "label": "short label", "detail": "explanation"}]
  },
  "projections": {
    "base_metric": "total_revenue",
    "base_value": 0,
    "assumptions": "brief description of projection methodology",
    "conservative": {"year1": 0, "year2": 0, "year3": 0, "growth_rate_pct": 0},
    "moderate":     {"year1": 0, "year2": 0, "year3": 0, "growth_rate_pct": 0},
    "optimistic":   {"year1": 0, "year2": 0, "year3": 0, "growth_rate_pct": 0}
  },
  "recommendations": [
    {"priority": "high | medium | low", "category": "revenue | expenses | grants | risk", "text": "specific actionable recommendation"}
  ]
}

FINANCIAL DOCUMENT CONTENT:
${truncated}`;
  }

  const focusGuide = {
    strategic_plan: `Focus on: strategic priorities and goals, programs and populations served, multi-year targets, funding needs and gaps, KPIs and metrics. Create 3–5 sections such as: Strategic Priorities, Programs & Services, Funding Needs, Key Metrics.`,
    grant_application: `Focus on: the funder name, amount requested, deadline, project description, goals and outcomes, budget breakdown, and evaluation plan. Create 3–5 sections such as: Grant Overview, Program Goals & Outcomes, Budget Summary, Evaluation Plan.`,
    program_report: `Focus on: programs offered, populations served, outcomes achieved vs. targets, cost per participant, success stories, and improvement areas. Create 3–5 sections such as: Program Outcomes, Population Served, Cost Effectiveness, Challenges & Opportunities.`,
    board_minutes: `Focus on: key decisions made, financial approvals, strategic priorities discussed, risks identified, and action items assigned. Create 3–5 sections such as: Key Decisions, Financial Actions, Strategic Priorities, Risk & Compliance.`,
    general: `Identify what type of document this is and extract the most grant-relevant intelligence. Create 3–5 sections that best represent the document's content.`,
  }[docType];

  return `Analyze the following organizational document and return structured grant intelligence.

File: ${fileName}
Document type: ${docType.replace(/_/g, ' ')}

Instructions: ${focusGuide}
Create 2–5 sections. Make all items specific, factual, and directly derived from the document.
Include 2–4 grant alignment areas and 2–5 prioritized action items.

RETURN THIS EXACT JSON STRUCTURE:
{
  "doc_type": "${docType}",
  "org_name": "string or null",
  "file_name": "${fileName}",
  "data_quality": "complete | partial | minimal",
  "summary": "2-3 sentence executive summary of the most important insights for grant strategy",
${COMMON_SCHEMA}
}

DOCUMENT:
${truncated}`;
}

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const {
    content,
    fileName    = 'Document',
    docType     = 'financial',
    orgCode,
    orgId,
    provider    = 'upload',
  } = await req.json() as {
    content:   string;
    fileName?: string;
    docType?:  DocType;
    orgCode?:  string;
    orgId?:    string;
    provider?: string;
  };

  if (!content || content.length < 50) {
    return NextResponse.json({ error: 'Document content too short to analyze' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 });
  }

  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: buildPrompt(content, fileName, docType as DocType) }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonText = rawText
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'AI returned malformed JSON', raw: rawText.slice(0, 500) },
        { status: 502 },
      );
    }

    const summary =
      typeof analysis.summary === 'string' ? analysis.summary.slice(0, 500) : '';

    // Persist if org info provided
    let savedId: string | null = null;
    if (orgCode) {
      try {
        const db = createServerClient();
        const { data } = await db
          .from('document_analyses')
          .insert({
            org_id:      orgId ?? null,
            org_code:    orgCode,
            file_name:   fileName,
            provider,
            doc_type:    docType,
            summary,
            analysis,
            analyzed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        savedId = data?.id ?? null;
      } catch {
        // non-fatal — analysis still returned
      }
    }

    return NextResponse.json({ analysis, savedId, usage: message.usage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
