// Direct connections → warm-introduction leads.
//
// When one of the organization's own people says "I know this foundation"
// (the board connections survey, or a Connection cell on the Known
// Connections sheet), the graph holds a person → foundation edge. The warm-path
// finder (crossref) only follows person ↔ trustee links, so these direct
// connections, the strongest kind there is, never became leads. This turns each
// one into a lead: organization → that person → the foundation.
//
// Idempotent: one lead per (person, foundation). An existing lead keeps its
// pipeline stage, owner and notes; only its wording and score refresh. A lead
// still in New whose connection is gone (taken off the sheet, or the survey
// answer corrected) is removed; one the team has already worked is kept.

import type { createServerClient } from '@/lib/supabase';
import { ownOrgNodeId } from '@/lib/known-funders';

type Db = ReturnType<typeof createServerClient>;

export const DIRECT_GENERATOR = 'direct:v1';
export const DIRECT_VIA = 'Direct connection';
const SOURCES = ['board_survey', 'cyc_workbook'];
/** Only the organization's own people make a direct path; the same edge type also links a funder's trustee to the organization. */
const OWN_KINDS = new Set(['board', 'auxiliary', 'council', 'staff']);

export interface DirectReport { connections: number; leads: number; created: number; removed: number }

const SOURCE_LABEL: Record<string, string> = { board_survey: 'the board connections survey', cyc_workbook: 'the Known Connections sheet' };

/** Score: a known person who says they know the funder is a strong path; a stated willingness to introduce makes it stronger. */
export function directScore(e: { relationship_strength: number | null; evidence: Record<string, unknown> | null }, former: boolean): number {
  const willing = e.evidence?.willing === true;
  const strength = Math.max(0, Math.min(100, Number(e.relationship_strength) || 50));
  const s = 58 + Math.round(strength / 10) + (willing ? 12 : 0) - (former ? 12 : 0);
  return Math.max(30, Math.min(95, s));
}

export async function syncDirectConnectionLeads(db: Db, orgId: string): Promise<DirectReport> {
  const { data: edges, error } = await db.from('network_relationships')
    .select('id, source_person_id, target_organization_id, relationship_strength, confidence, evidence, source_type')
    .eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').in('source_type', SOURCES)
    .not('source_person_id', 'is', null).not('target_organization_id', 'is', null);
  if (error) throw new Error(`direct edges: ${error.message}`);
  const ownNode = await ownOrgNodeId(db, orgId);
  const list = ((edges ?? []) as Array<{ id: string; source_person_id: string; target_organization_id: string; relationship_strength: number | null; confidence: number | null; evidence: Record<string, unknown> | null; source_type: string }>)
    .filter(e => e.target_organization_id !== ownNode);
  // Strongest edge per (person, foundation).
  const best = new Map<string, (typeof list)[number]>();
  for (const e of list) { const k = `${e.source_person_id}|${e.target_organization_id}`; const cur = best.get(k); if (!cur || directScore(e, false) > directScore(cur, false)) best.set(k, e); }

  const personIds = [...new Set([...best.values()].map(e => e.source_person_id))];
  const orgIds = [...new Set([...best.values()].map(e => e.target_organization_id))];
  const people = new Map<string, { name: string; board_role: string | null; kind: string }>();
  const orgs = new Map<string, string>();
  for (let i = 0; i < personIds.length; i += 200) { const { data } = await db.from('network_people').select('id, name, board_role, kind').in('id', personIds.slice(i, i + 200)); for (const p of data ?? []) people.set(p.id as string, { name: p.name as string, board_role: p.board_role as string | null, kind: p.kind as string }); }
  for (let i = 0; i < orgIds.length; i += 200) { const { data } = await db.from('network_organizations').select('id, name').in('id', orgIds.slice(i, i + 200)); for (const o of data ?? []) orgs.set(o.id as string, o.name as string); }

  const { data: existingRows } = await db.from('network_leads').select('id, via_person_id, target_org_id, pipeline_status').eq('org_id', orgId).eq('via_org', DIRECT_VIA);
  const existing = new Map((existingRows ?? []).map(l => [`${l.via_person_id}|${l.target_org_id}`, l]));
  let leads = 0, created = 0;
  const now = new Date().toISOString();
  for (const [k, e] of best) {
    const p = people.get(e.source_person_id), org = orgs.get(e.target_organization_id);
    if (!p || !org || !OWN_KINDS.has(p.kind)) continue;
    const former = /^former/i.test(p.board_role ?? '');
    const ev = e.evidence ?? {};
    const rel = typeof ev.relationship === 'string' && ev.relationship.trim() ? ev.relationship.trim() : null;
    const contact = typeof ev.contact === 'string' && ev.contact.trim() ? ev.contact.trim() : null;
    const role = former ? 'a former board member' : p.board_role && p.board_role !== 'Member' ? p.board_role.toLowerCase() : p.kind === 'auxiliary' ? 'an Auxiliary Board member' : p.kind === 'staff' ? 'staff' : 'a board member';
    const wording = `${p.name} (${role}) knows ${org} directly${contact ? `, through ${contact}` : ''}${rel ? ` (${rel})` : ''}${ev.willing === true ? ' and is willing to make an introduction' : ''}, per ${SOURCE_LABEL[e.source_type] ?? 'your records'}.`;
    const score = directScore(e, former);
    const row = {
      org_id: orgId, lead_type: 'organization', person_id: null, via_person_id: e.source_person_id, target_org_id: e.target_organization_id,
      via_org: DIRECT_VIA, reason: wording, score, opportunity_score: score, evidence_confidence: 'High', insight_type: 'Warm Introduction',
      score_breakdown: { generator: DIRECT_GENERATOR, edge_id: e.id, relationship_type: 'existing_cyc_relationship', source_type: e.source_type, willing: ev.willing === true },
      updated_at: now,
    };
    const cur = existing.get(k);
    if (cur) { await db.from('network_leads').update(row).eq('id', cur.id); existing.delete(k); }
    else { const { error: ie } = await db.from('network_leads').insert(row); if (ie) continue; created++; }
    leads++;
  }
  // Connections that are gone: drop the untouched leads, keep the worked ones.
  const stale = [...existing.values()].filter(l => l.pipeline_status === 'NEW').map(l => l.id as string);
  if (stale.length) await db.from('network_leads').delete().in('id', stale);
  return { connections: best.size, leads, created, removed: stale.length };
}
