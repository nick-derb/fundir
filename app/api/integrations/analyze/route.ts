import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type DocType =
  | 'financial'
  | 'strategic_plan'
  | 'grant_application'
  | 'program_report'
  | 'board_minutes'
  | 'general';

/** UI can also send 'auto' — the server classifies before analyzing. */
export type DocTypeOrAuto = DocType | 'auto';

const DOC_TYPES: DocType[] = [
  'financial', 'strategic_plan', 'grant_application',
  'program_report', 'board_minutes', 'general',
];

const MODEL = 'claude-sonnet-4-6';

/** Content block for a PDF passed as base64 — Claude reads it natively. */
function pdfBlock(pdfBase64: string) {
  return {
    type: 'document' as const,
    source: {
      type: 'base64' as const,
      media_type: 'application/pdf' as const,
      data: pdfBase64,
    },
  };
}

/**
 * Fast classification pass so users never have to pick a document type.
 * Cheap (few output tokens); falls back to 'general' on any ambiguity.
 */
async function classifyDocType(
  fileName: string,
  content?: string,
  pdfBase64?: string,
): Promise<DocType> {
  const prompt = `Classify this nonprofit organizational document into exactly one category.

File name: ${fileName}

Categories:
- financial (annual reports, 990s, audited statements, budgets)
- strategic_plan (multi-year plans, org roadmaps, priority documents)
- grant_application (proposals, LOIs, grant narratives)
- program_report (impact reports, funder reports, outcome summaries)
- board_minutes (meeting minutes, board resolutions, committee notes)
- general (anything else)

Respond with ONLY the category name, nothing else.${content ? `\n\nDOCUMENT (excerpt):\n${content.slice(0, 8_000)}` : ''}`;

  const msg = await client.messages.create({
    model:      MODEL,
    max_tokens: 16,
    messages: [{
      role: 'user',
      content: pdfBase64
        ? [pdfBlock(pdfBase64), { type: 'text' as const, text: prompt }]
        : prompt,
    }],
  });

  const raw = (msg.content[0]?.type === 'text' ? msg.content[0].text : '')
    .trim().toLowerCase().replace(/[^a-z_]/g, '');
  return (DOC_TYPES as string[]).includes(raw) ? (raw as DocType) : 'general';
}

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
  // Auth FIRST — org identity comes from the session, NOT the body. Without
  // this gate, anonymous callers could write document_analyses rows under any
  // org's code, which the strategy endpoint would later feed into Claude
  // (prompt-injection chain).
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const {
    content,
    pdfBase64,
    fileName    = 'Document',
    docType     = 'financial',
    provider    = 'upload',
  } = await req.json() as {
    content?:   string;
    pdfBase64?: string;   // base64 PDF — analyzed natively, no text extraction
    fileName?:  string;
    docType?:   DocTypeOrAuto;
    provider?:  string;
  };
  const orgCode = ctx.orgCode;
  const orgId   = ctx.orgId;

  if (!pdfBase64 && (!content || content.length < 50)) {
    return NextResponse.json({ error: 'Document content too short to analyze' }, { status: 400 });
  }
  if (pdfBase64 && pdfBase64.length > 6_000_000) {
    // ~4.5MB binary — keeps the JSON body inside serverless request limits
    return NextResponse.json({ error: 'PDF too large to analyze (max ~4MB). Try exporting the relevant pages, or upload as .docx/.xlsx.' }, { status: 413 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 });
  }

  try {
    // Resolve 'auto' via a fast classification pass; invalid values → 'general'
    let resolvedType: DocType;
    if (docType === 'auto') {
      resolvedType = await classifyDocType(fileName, content, pdfBase64).catch(() => 'general' as DocType);
    } else {
      resolvedType = (DOC_TYPES as string[]).includes(docType) ? (docType as DocType) : 'general';
    }

    const promptText = buildPrompt(
      pdfBase64 ? '[The document is attached above as a PDF — analyze its full contents.]' : content!,
      fileName,
      resolvedType,
    );

    const message = await client.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     SYSTEM,
      messages: [{
        role: 'user',
        content: pdfBase64
          ? [pdfBlock(pdfBase64), { type: 'text' as const, text: promptText }]
          : promptText,
      }],
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
            doc_type:    resolvedType,
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

    return NextResponse.json({ analysis, savedId, detectedType: resolvedType, usage: message.usage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
