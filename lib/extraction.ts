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
  "geographic_states": ["IL", ...],
  "target_population": ["youth", "ages 6-18", ...],
  "program_areas": ["afterschool", "STEM", ...],
  "award_floor": number | null,
  "award_ceiling": number | null,
  "cost_sharing_required": boolean | null,
  "cost_sharing_percentage": number | null,
  "grant_duration_months": number | null,
  "compliance_frameworks": ["2 CFR 200", "GATA", ...],
  "key_requirements": ["Must serve Title I schools", ...],
  "confidence_score": 0.0 to 1.0
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
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
