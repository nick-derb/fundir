import Anthropic from '@anthropic-ai/sdk';
import { ExtractedFields } from '@/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM_PROMPT = `You are a grant analysis expert. Extract structured data from grant opportunity text.
Only extract information explicitly stated. If a field cannot be determined, use null or empty array.
Respond ONLY with valid JSON — no markdown, no preamble.`;

export async function extractGrantFields(
  title: string,
  agencyName: string,
  agencyCode: string,
  alnCodes: string[],
  fullText: string
): Promise<ExtractedFields> {
  const userMessage = `Analyze this grant opportunity and extract structured fields.

GRANT TITLE: ${title}
AGENCY: ${agencyName} (${agencyCode})
ALN CODES: ${alnCodes.join(', ')}

FULL TEXT:
${fullText.slice(0, 2500)}

Return JSON:
{
  "eligible_entity_types": ["nonprofit_501c3", ...],
  "geographic_scope": "national" | "state" | "city" | "international" | null,
  "geographic_states": ["<two-letter state code>", ...],
  "target_population": ["<population>", "<demographic>", ...],
  "program_areas": ["<area>", "<area>", ...],
  "award_floor": number | null,
  "award_ceiling": number | null,
  "cost_sharing_required": boolean | null,
  "cost_sharing_percentage": number | null,
  "grant_duration_months": number | null,
  "compliance_frameworks": ["2 CFR 200", "GATA", ...],
  "key_requirements": ["Must serve Title I schools", ...],
  "requires_lmi": boolean | null,
  "lmi_evidence": "<one-sentence quote or paraphrase from the text>" | null,
  "financial_requirements": {
    "cost_share_required": boolean | null,
    "cost_share_pct": number | null,
    "cost_share_type": "cash" | "in-kind" | "both" | null,
    "payment_structure": "reimbursement" | "advance" | "mixed" | null,
    "indirect_cost_cap_pct": number | null,
    "single_audit_required": boolean | null,
    "audit_required": boolean | null,
    "min_org_budget": number | null,
    "min_operating_history_years": number | null,
    "reporting_burden": "low" | "moderate" | "high" | null
  },
  "confidence_score": 0.0 to 1.0
}

requires_lmi guidance — this drives the Community Reinvestment Act eligibility booster (+0.15 on eligibility when the org operates in an LMI census tract AND the grant prioritizes LMI populations), so precision matters more than recall:
- Set TRUE when the grant text EXPLICITLY prioritizes low-income / low-to-moderate income / underserved / disadvantaged / economically distressed populations or communities. Examples that should fire:
  - "Must serve low-income families"
  - "Targets disadvantaged communities"
  - "Eligible applicants must serve high-poverty neighborhoods"
  - "Persistent Poverty Counties"
  - "Promise Zone / Opportunity Zone designated area"
  - "Title I schools"
  - "Programs in census tracts with median family income below 80% AMI"
- Set FALSE when the text is silent on LMI priority, OR when the grant explicitly targets a different cohort (researchers, faculty, tribal-only, military, etc).
- Set NULL only when the text is genuinely ambiguous.
- lmi_evidence: when requires_lmi is true, capture the strongest one-sentence quote or paraphrase that justified it. When false or null, leave lmi_evidence null. The UI uses this to render a citation under the LMI bullet.

financial_requirements guidance — this drives reverse-990 financial screening, so be precise:
- payment_structure: how the funder pays out. "reimbursement" = applicant spends first, is repaid later; "advance" = funds paid up front. Most FEDERAL grants operate on reimbursement — if the grant is federal and the text does not say otherwise, use "reimbursement". Otherwise only set this if stated.
- single_audit_required: true if a Single Audit / 2 CFR 200 Subpart F audit is referenced, OR if it is a federal award (federal awards over $750K of federal spend trigger it).
- min_org_budget: any stated minimum annual operating budget or revenue an applicant must have.
- indirect_cost_cap_pct: any cap on indirect/administrative cost recovery (e.g. "indirect costs limited to 10%").
- Use null for anything not stated or not inferable. Do not guess dollar amounts.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedFields;
  } catch (error) {
    console.error('Extraction failed:', error);
    return { confidence_score: 0 };
  }
}
