/**
 * Re-extract existing grant_opportunities with the current Claude
 * extraction prompt. Use after editing lib/extraction.ts (e.g. Phase 4
 * cont. adding requires_lmi) so the stored extracted_fields pick up the
 * new shape on existing grants without waiting for a full re-discovery.
 *
 * Cost: one Claude call per grant. For 24 grants × ~$0.005 = ~$0.12.
 * Bearer-gated against CRON_SECRET like the other admin endpoints.
 */

import { createServerClient } from '@/lib/supabase';
import { extractGrantFields } from '@/lib/extraction';

export interface ReExtractResult {
  scanned:  number;
  updated:  number;
  /** Grants where requires_lmi flipped to true after this re-extraction. */
  new_lmi:  number;
  errors:   string[];
}

export async function reExtractCorpus(opts?: { limit?: number }): Promise<ReExtractResult> {
  const db = createServerClient();
  const errors: string[] = [];
  const limit = opts?.limit ?? 1000;

  const { data: grants, error: fetchErr } = await db
    .from('grant_opportunities')
    .select('id, title, agency_name, agency_code, aln_codes, full_text, extracted_fields')
    .limit(limit);
  if (fetchErr) {
    return { scanned: 0, updated: 0, new_lmi: 0, errors: [`fetch grants: ${fetchErr.message}`] };
  }

  let scanned = 0;
  let updated = 0;
  let new_lmi = 0;

  for (const g of (grants ?? [])) {
    scanned += 1;
    const priorRequiresLmi = (g.extracted_fields as { requires_lmi?: boolean } | null)?.requires_lmi === true;
    try {
      const next = await extractGrantFields(
        g.title ?? '',
        g.agency_name ?? '',
        g.agency_code ?? '',
        (g.aln_codes as string[] | null) ?? [],
        g.full_text ?? '',
      );
      const { error: updErr } = await db
        .from('grant_opportunities')
        .update({
          extracted_fields:      next,
          extraction_confidence: next.confidence_score ?? 0,
        })
        .eq('id', g.id);
      if (updErr) {
        errors.push(`update ${g.id}: ${updErr.message}`);
        continue;
      }
      updated += 1;
      if (!priorRequiresLmi && next.requires_lmi === true) new_lmi += 1;
    } catch (err) {
      errors.push(`extract ${g.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { scanned, updated, new_lmi, errors };
}
