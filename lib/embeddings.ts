import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text.slice(0, 3000),
    dimensions: 1536,
  });

  return response.data[0].embedding;
}

export function buildGrantText(
  title: string,
  agencyName: string,
  synopsis: string,
  extractedFields: Record<string, unknown>
): string {
  const fields = extractedFields as {
    program_areas?: string[];
    target_population?: string[];
  };
  const parts = [
    `Grant: ${title}`,
    `Agency: ${agencyName}`,
    synopsis ? `Description: ${synopsis.slice(0, 2000)}` : '',
    fields?.program_areas?.length ? `Program areas: ${fields.program_areas.join(', ')}` : '',
    fields?.target_population?.length ? `Target population: ${fields.target_population.join(', ')}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}
