/**
 * Admin: generate (or regenerate) a grant draft for one org / grant.
 *
 * POST body:
 *   { org_code: "CYC2026", grant_id: "<uuid>" }
 *
 * Pipeline:
 *   1. Assemble the source bundle from the org's profile_data,
 *      financial fixture, document_analyses, and CRA tract snapshot.
 *   2. Load the grant row.
 *   3. Call the Claude generator with strict citation rules.
 *   4. UPSERT into drafts on (organization_id, opportunity_id).
 *
 * Bearer-gated against CRON_SECRET. Cost: one Claude call (~$0.09 with
 * ~4000 output tokens at Sonnet 4.6 pricing); no embeddings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { assembleSources } from '@/lib/drafts/sources';
import { generateDraft } from '@/lib/drafts/generator';
import type { ExtractedFields } from '@/types';

export const maxDuration = 60;
export const dynamic     = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Generator not configured' }, { status: 503 });
  }

  let body: { org_code?: string; grant_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  if (!body.org_code || !body.grant_id) {
    return NextResponse.json(
      { ok: false, error: 'org_code and grant_id required' },
      { status: 400 },
    );
  }

  const db = createServerClient();

  // ── Source bundle (profile + financial + tract + documents) ──────────────
  const bundle = await assembleSources(body.org_code);
  if (!bundle) {
    return NextResponse.json(
      { ok: false, error: `org not found: ${body.org_code}` },
      { status: 404 },
    );
  }
  if (bundle.sources.length < 3) {
    return NextResponse.json(
      { ok: false, error: 'too few sources to ground a draft — populate organizations.profile_data and/or financial_data first', sources_found: bundle.sources.length },
      { status: 400 },
    );
  }

  // ── Grant row ────────────────────────────────────────────────────────────
  const { data: grant, error: grantErr } = await db
    .from('grant_opportunities')
    .select('id, title, agency_name, agency_code, full_text, extracted_fields, close_date')
    .eq('id', body.grant_id)
    .maybeSingle();
  if (grantErr || !grant) {
    return NextResponse.json(
      { ok: false, error: `grant not found: ${body.grant_id}` },
      { status: 404 },
    );
  }
  const fields = (grant.extracted_fields ?? {}) as ExtractedFields;

  // ── Generate ─────────────────────────────────────────────────────────────
  let draft;
  try {
    draft = await generateDraft({
      bundle,
      grant: {
        title:           grant.title as string,
        funder_name:     grant.agency_name as string,
        agency_code:     grant.agency_code as string | null,
        description:     (grant.full_text as string | null) ?? '',
        amount_floor:    fields.award_floor   ?? null,
        amount_ceiling:  fields.award_ceiling ?? null,
        deadline:        grant.close_date     ?? null,
        eligibility_hints: fields as unknown as Record<string, unknown>,
        requires_lmi:    fields.requires_lmi ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // ── Persist (UPSERT on the org × opportunity unique key) ─────────────────
  const { data: row, error: upsertErr } = await db
    .from('drafts')
    .upsert(
      {
        organization_id:   bundle.org_id,
        opportunity_id:    grant.id,
        content:           draft.content,
        source_citations:  bundle.sources,
        status:            'drafting',
        tokens_used:       draft.tokens_used,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: 'organization_id,opportunity_id' },
    )
    .select('id')
    .single();
  if (upsertErr) {
    return NextResponse.json(
      { ok: false, error: `persist failed: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok:                true,
    draft_id:          row.id,
    sources_count:     bundle.sources.length,
    cited_source_ids:  draft.cited_source_ids,
    todo_markers:      draft.todo_markers,
    tokens_used:       draft.tokens_used,
  });
}

export const GET = POST;
