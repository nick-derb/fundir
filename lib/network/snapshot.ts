// Phase 10 — the durable snapshot. The website database must never be the
// only copy of the graph: every completed refresh (and any manual export)
// produces a dated .xlsx with thirteen sheets and a machine-readable .json
// carrying the same rows. Every sheet names its sources; the README and the
// Data Dictionary travel inside the workbook so it reads on its own.

import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase';
import { OWN_KINDS } from '@/lib/network/edges';
import { STATUS_LABEL_PLAIN } from '@/lib/network/pipeline';

type Db = ReturnType<typeof createServerClient>;
export const SNAPSHOT_VERSION = '1.0';

const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const chunks = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await q(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

// ── The snapshot shape (JSON) ───────────────────────────────────────────────
export interface Snapshot {
  meta: { version: string; generated_at: string; org_id: string; org_name: string; counts: Record<string, number>; note: string };
  people: Array<Record<string, unknown>>;
  organizations: Array<Record<string, unknown>>;
  employments: Array<Record<string, unknown>>;
  boards: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
  funding_events: Array<Record<string, unknown>>;
  peer_organizations: Array<Record<string, unknown>>;
  warm_paths: Array<Record<string, unknown>>;
  leads: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  refresh_log: Array<Record<string, unknown>>;
}

export function snapshotNames(date = new Date()): { xlsx: string; json: string; stamp: string } {
  const stamp = date.toISOString().slice(0, 10);
  return { xlsx: `CYC Network Intelligence ${stamp}.xlsx`, json: `CYC Network Intelligence ${stamp}.json`, stamp };
}

/** Load every table the graph is made of, shaped for a reader, not for the app. */
export async function buildSnapshot(db: Db, orgId: string): Promise<Snapshot> {
  const { data: org } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
  const [sources, people, emps, boards, rels, leads, runs, peers, grants] = await Promise.all([
    pageAll<Record<string, unknown>>((a, b) => db.from('network_sources').select('id, source_type, source_name, source_url, retrieved_at, publication_date, confidence, raw_reference').order('id').range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('network_people').select('id, kind, name, board_role, current_title, current_org, organization_id, location, headline, linkedin_url, enriched_at, verification, status, note, source_id').eq('org_id', orgId).order('id').range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('network_employments').select('id, person_id, org_name, organization_id, title, start_year, end_year, is_current, source_id').order('id').range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('network_boards').select('id, person_id, organization_id, title, is_current, confidence, source_id').order('id').range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('network_relationships').select('id, relationship_type, relationship_strength, confidence, verification, evidence, source_id, source_type, observed_at, source_person_id, target_person_id, source_organization_id, target_organization_id').eq('org_id', orgId).order('id').range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('network_leads').select('id, lead_type, insight_type, pipeline_status, opportunity_score, evidence_confidence, score_breakdown, explanation, via_org, owner, next_action, next_action_date, outcome, dismissal_reason, reason, person_id, via_person_id, target_org_id, created_at, updated_at').eq('org_id', orgId).order('id').range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('network_refresh_runs').select('id, started_at, completed_at, api_calls, rapidapi_credits, claude_micro_cents, profiles_enriched, companies_scanned, leads_found, relationships_found, funding_events_found, categories, status, notes').eq('org_id', orgId).order('started_at', { ascending: false }).range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('network_peer_orgs').select('id, organization_id, similarity, components, source_id, computed_at').eq('org_id', orgId).order('id').range(a, b)),
    pageAll<Record<string, unknown>>((a, b) => db.from('grants_made').select('id, funder_org_id, recipient_org_id, fiscal_year, amount, purpose, program_category, geography, source, source_url, source_id, confidence').order('id').range(a, b)),
  ]);

  // Organizations: only the ones something references (funders, recipients, employers, seats, peers, targets).
  const orgIds = new Set<string>();
  for (const r of [...people, ...emps, ...boards, ...peers]) if (r.organization_id) orgIds.add(r.organization_id as string);
  for (const g of grants) { if (g.funder_org_id) orgIds.add(g.funder_org_id as string); if (g.recipient_org_id) orgIds.add(g.recipient_org_id as string); }
  for (const r of rels) { if (r.source_organization_id) orgIds.add(r.source_organization_id as string); if (r.target_organization_id) orgIds.add(r.target_organization_id as string); }
  for (const l of leads) if (l.target_org_id) orgIds.add(l.target_org_id as string);
  const orgs: Array<Record<string, unknown>> = [];
  for (const c of chunks([...orgIds], 200)) {
    const { data } = await db.from('network_organizations').select('id, name, normalized_name, organization_type, ein, website, city, state, sector, ntee_code, confidence, last_verified_at, source_id').in('id', c);
    orgs.push(...(data ?? []));
  }
  const orgName = new Map(orgs.map(o => [o.id as string, o.name as string]));
  const personName = new Map(people.map(p => [p.id as string, p.name as string]));
  const src = new Map(sources.map(s => [s.id as string, s]));
  const srcLabel = (id: unknown) => { const s = id ? src.get(id as string) : null; return s ? String(s.source_type) : ''; };
  const srcUrl = (id: unknown) => { const s = id ? src.get(id as string) : null; return s ? String(s.source_url ?? '') : ''; };
  const own = (id: unknown) => OWN_KINDS.has(String(people.find(p => p.id === id)?.kind ?? ''));

  const peopleRows = people.map(p => ({
    'Person ID': p.id, 'Name': p.name, 'Kind': p.kind, 'CYC role': p.board_role ?? '', 'Title': p.current_title ?? '', 'Organization': p.current_org ?? '', 'Organization ID': p.organization_id ?? '',
    'Location': p.location ?? '', 'Headline': p.headline ?? '', 'LinkedIn URL': p.linkedin_url ?? '', 'Profile read': fmtDate(p.enriched_at as string), 'Verification': p.verification ?? '', 'Status': p.status ?? '', 'Note': p.note ?? '', 'Source': srcLabel(p.source_id), 'Source URL': srcUrl(p.source_id),
  }));
  const orgRows = orgs.sort((a, b) => String(a.name).localeCompare(String(b.name))).map(o => ({
    'Organization ID': o.id, 'Name': o.name, 'Type': o.organization_type ?? '', 'EIN': o.ein ?? '', 'Website': o.website ?? '', 'City': o.city ?? '', 'State': o.state ?? '', 'Sector': o.sector ?? '', 'NTEE': o.ntee_code ?? '', 'Confidence': o.confidence ?? '', 'Last verified': fmtDate(o.last_verified_at as string), 'Source': srcLabel(o.source_id), 'Source URL': srcUrl(o.source_id),
  }));
  const empRows = emps.filter(e => personName.has(e.person_id as string)).map(e => ({
    'Person': personName.get(e.person_id as string), 'Person ID': e.person_id, 'Organization': e.org_name, 'Organization ID': e.organization_id ?? '', 'Title': e.title ?? '', 'Start year': e.start_year ?? '', 'End year': e.is_current ? 'present' : (e.end_year ?? ''), 'Current': e.is_current ? 'yes' : '', 'Source': srcLabel(e.source_id), 'Source URL': srcUrl(e.source_id),
  })).sort((a, b) => String(a.Person).localeCompare(String(b.Person)));
  const boardRows = boards.filter(b => personName.has(b.person_id as string)).map(b => ({
    'Person': personName.get(b.person_id as string), 'Person ID': b.person_id, 'Organization': orgName.get(b.organization_id as string) ?? '', 'Organization ID': b.organization_id, 'Title': b.title ?? '', 'Current': b.is_current === false ? '' : 'yes', 'Confidence': b.confidence ?? '', 'Source': srcLabel(b.source_id), 'Source URL': srcUrl(b.source_id),
  }));
  const endName = (pid: unknown, oid: unknown) => (pid ? personName.get(pid as string) ?? '' : oid ? orgName.get(oid as string) ?? '' : '');
  const relRows = rels.map(r => ({
    'Relationship ID': r.id, 'From': endName(r.source_person_id, r.source_organization_id), 'From kind': r.source_person_id ? 'person' : 'organization', 'From ID': r.source_person_id ?? r.source_organization_id,
    'To': endName(r.target_person_id, r.target_organization_id), 'To kind': r.target_person_id ? 'person' : 'organization', 'To ID': r.target_person_id ?? r.target_organization_id,
    'Type': r.relationship_type, 'Strength': r.relationship_strength, 'Confidence': r.confidence, 'Verification': r.verification, 'Evidence': String((r.evidence as { summary?: string } | null)?.summary ?? ''), 'Derived by': r.source_type ?? '', 'Observed': fmtDate(r.observed_at as string), 'Source': srcLabel(r.source_id), 'Source URL': srcUrl(r.source_id),
    'Touches CYC': own(r.source_person_id) || own(r.target_person_id) ? 'yes' : '',
  }));
  const fundRows = grants.map(g => ({
    'Event ID': g.id, 'Funder': orgName.get(g.funder_org_id as string) ?? '', 'Funder ID': g.funder_org_id ?? '', 'Recipient': orgName.get(g.recipient_org_id as string) ?? '', 'Recipient ID': g.recipient_org_id ?? '', 'Fiscal year': g.fiscal_year ?? '', 'Amount': g.amount ?? '', 'Purpose': g.purpose ?? '', 'Program category': g.program_category ?? '', 'Geography': g.geography ?? '', 'Confidence': g.confidence ?? '', 'Source': srcLabel(g.source_id) || String(g.source ?? ''), 'Source URL': g.source_url ?? srcUrl(g.source_id),
  }));
  const peerRows = peers.map(p => ({
    'Organization': orgName.get(p.organization_id as string) ?? '', 'Organization ID': p.organization_id, 'Similarity': p.similarity, 'Reasons': Array.isArray((p.components as { reasons?: string[] } | null)?.reasons) ? ((p.components as { reasons: string[] }).reasons).join('; ') : '', 'Computed': fmtDate(p.computed_at as string), 'Source': srcLabel(p.source_id),
  })).sort((a, b) => Number(b.Similarity) - Number(a.Similarity));
  const leadBase = (l: Record<string, unknown>) => {
    const x = l.explanation as { thesis?: string; recommended_action?: { text: string }; validation?: { bullets_kept: number; bullets_total: number }; method?: string } | null;
    const bd = l.score_breakdown as { subtotals?: Record<string, number> } | null;
    return {
      'Lead ID': l.id, 'Type': l.insight_type ?? l.lead_type, 'Target': orgName.get(l.target_org_id as string) ?? personName.get(l.person_id as string) ?? '', 'Target ID': l.target_org_id ?? l.person_id ?? '',
      'Via (CYC person)': personName.get(l.via_person_id as string) ?? '', 'Trustee / contact': l.lead_type === 'organization' ? personName.get(l.person_id as string) ?? '' : '', 'Shared room': l.via_org ?? '',
      'Score': l.opportunity_score ?? '', 'Confidence': l.evidence_confidence ?? '', 'Relationship pts': bd?.subtotals?.relationship ?? '', 'Funding-fit pts': bd?.subtotals?.funding_fit ?? '', 'Access pts': bd?.subtotals?.accessibility ?? '', 'Recency pts': bd?.subtotals?.recency ?? '', 'Penalties': bd?.subtotals?.penalties ?? '',
      'Status': STATUS_LABEL_PLAIN[String(l.pipeline_status)] ?? l.pipeline_status, 'Owner': l.owner ?? '', 'Next action': l.next_action ?? '', 'Due': l.next_action_date ?? '', 'Outcome': l.outcome ?? '', 'Dismissal reason': l.dismissal_reason ?? '',
      'Thesis': x?.thesis?.replace(/\s*\[\s*E\d+(?:\s*,\s*E\d+)*\s*\]/g, '') ?? String(l.reason ?? ''), 'Recommended action': x?.recommended_action?.text ?? '', 'Claims verified': x?.validation ? `${x.validation.bullets_kept} of ${x.validation.bullets_total}` : '', 'Explained by': x?.method ?? '', 'Updated': fmtDate(l.updated_at as string),
    };
  };
  const leadRows = leads.map(leadBase).sort((a, b) => Number(b.Score || 0) - Number(a.Score || 0));
  const warmRows = leads.filter(l => l.via_person_id).map(leadBase).sort((a, b) => Number(b.Score || 0) - Number(a.Score || 0));
  const sourceRows = sources.map(s => ({ 'Source ID': s.id, 'Type': s.source_type, 'Name': s.source_name ?? '', 'URL': s.source_url ?? '', 'Retrieved': fmtDate(s.retrieved_at as string), 'Published': fmtDate(s.publication_date as string), 'Confidence': s.confidence ?? '', 'Reference': s.raw_reference ?? '' }));
  const runRows = runs.map(r => ({ 'Started': r.started_at ? new Date(r.started_at as string).toISOString().replace('T', ' ').slice(0, 16) : '', 'Completed': r.completed_at ? new Date(r.completed_at as string).toISOString().replace('T', ' ').slice(0, 16) : '', 'Categories': Array.isArray(r.categories) ? (r.categories as string[]).join(', ') : '', 'API calls': r.api_calls, 'RapidAPI credits': r.rapidapi_credits, 'Claude ($)': ((Number(r.claude_micro_cents) || 0) / 1_000_000).toFixed(4), 'Profiles read': r.profiles_enriched, 'Employers scanned': r.companies_scanned, 'Warm paths found': r.leads_found, 'Relationships found': r.relationships_found, 'Funding events found': r.funding_events_found, 'Status': r.status, 'Notes': r.notes ?? '' }));

  const counts = { people: peopleRows.length, organizations: orgRows.length, employments: empRows.length, boards: boardRows.length, relationships: relRows.length, funding_events: fundRows.length, peer_organizations: peerRows.length, warm_paths: warmRows.length, leads: leadRows.length, sources: sourceRows.length, refresh_log: runRows.length };
  return {
    meta: { version: SNAPSHOT_VERSION, generated_at: new Date().toISOString(), org_id: orgId, org_name: (org?.name as string) ?? 'Chicago Youth Centers', counts, note: 'Professional and public philanthropic information only. No home addresses, private phone numbers, family details or photos are collected. Personal emails from CYC\'s own workbook are never copied into this file.' },
    people: peopleRows, organizations: orgRows, employments: empRows, boards: boardRows, relationships: relRows, funding_events: fundRows, peer_organizations: peerRows, warm_paths: warmRows, leads: leadRows, sources: sourceRows, refresh_log: runRows,
  };
}

// ── Data dictionary: every sheet, every column ──────────────────────────────
export const SHEETS = ['README', 'People', 'Organizations', 'Employments', 'Boards', 'Relationships', 'Funding Events', 'Peer Organizations', 'Warm Paths', 'Leads', 'Sources', 'Refresh Log', 'Data Dictionary'] as const;
const KEY_OF: Record<string, keyof Snapshot | null> = { People: 'people', Organizations: 'organizations', Employments: 'employments', Boards: 'boards', Relationships: 'relationships', 'Funding Events': 'funding_events', 'Peer Organizations': 'peer_organizations', 'Warm Paths': 'warm_paths', Leads: 'leads', Sources: 'sources', 'Refresh Log': 'refresh_log', README: null, 'Data Dictionary': null };

const COMMON: Record<string, string> = {
  'Source': 'Kind of source behind the row: irs_990_xml (IRS e-file), foundation_site, corporate_site, cyc_workbook (CYC records), linkedin_api (profile CYC pasted), public_bio, cyc_site (CYC board page), seed (uncited hand-curated list), irs_bmf.',
  'Source URL': 'Where the fact can be checked, when the source has a URL (filing member, page, profile).',
  'Confidence': 'Stored confidence 0–1 as assigned when the row was created.',
  'Verification': 'verified = documented with dates; probable = documented but undated; inferred = rests on an uncited fact.',
  'Person ID': 'Stable identifier of the person row (joins People).', 'Organization ID': 'Stable identifier of the organization row (joins Organizations).',
};
export const DATA_DICTIONARY: Array<{ sheet: string; column: string; description: string }> = [
  ...['Name', 'Kind', 'CYC role', 'Title', 'Organization', 'Location', 'Headline', 'LinkedIn URL', 'Profile read', 'Status', 'Note'].map(column => ({ sheet: 'People', column, description: ({ Name: 'Display name as recorded.', Kind: 'board / auxiliary / council / staff are CYC\'s own people; trustee / executive belong to funders; lead = a second-order person found by an employer scan.', 'CYC role': 'Board role from the public CYC board page.', Title: 'Current title, from the profile or roster.', Organization: 'Current employer or the organization the seat is at.', Location: 'City / region as stated on the profile.', Headline: 'Profile headline, when read.', 'LinkedIn URL': 'Canonical /in/ URL, only for people CYC pasted or corroborated.', 'Profile read': 'Date the profile was last read through the API.', Status: 'new / added / dismissed for second-order leads.', Note: 'Free text, e.g. how the URL was corroborated.' } as Record<string, string>)[column] })),
  ...['Name', 'Type', 'EIN', 'Website', 'City', 'State', 'Sector', 'NTEE', 'Last verified'].map(column => ({ sheet: 'Organizations', column, description: ({ Name: 'Organization name as recorded.', Type: 'foundation / corporate_foundation / corporation / bank / nonprofit / university / government.', EIN: 'IRS employer identification number when known (identity key).', Website: 'Public website when known.', City: 'City from filings or BMF.', State: 'State from filings or BMF.', Sector: 'Sector label when known.', NTEE: 'NTEE code from the IRS BMF.', 'Last verified': 'Date the organization row was last confirmed.' } as Record<string, string>)[column] })),
  ...['Person', 'Organization', 'Title', 'Start year', 'End year', 'Current'].map(column => ({ sheet: 'Employments', column, description: ({ Person: 'The person the job belongs to.', Organization: 'Employer as stated by the source.', Title: 'Job title as stated.', 'Start year': 'First year, when the source gives one.', 'End year': 'Last year, or "present".', Current: 'yes when the source says the role is current.' } as Record<string, string>)[column] })),
  ...['Person', 'Organization', 'Title', 'Current'].map(column => ({ sheet: 'Boards', column, description: ({ Person: 'The seat holder.', Organization: 'The board the seat is on.', Title: 'Seat title (Director, Chair, Trustee, Officer…).', Current: 'yes unless the source says the seat ended.' } as Record<string, string>)[column] })),
  ...['From', 'From kind', 'From ID', 'To', 'To kind', 'To ID', 'Type', 'Strength', 'Evidence', 'Derived by', 'Observed', 'Touches CYC', 'Relationship ID'].map(column => ({ sheet: 'Relationships', column, description: ({ From: 'One end of the link.', 'From kind': 'person or organization.', 'From ID': 'Identifier of that end.', To: 'The other end.', 'To kind': 'person or organization.', 'To ID': 'Identifier of that end.', Type: 'former_colleague, current_colleague, shared_employer, shared_board, shared_university, existing_cyc_relationship, corporate_connection, foundation_connection, philanthropic_overlap, geographic_overlap, second_degree.', Strength: 'Rubric strength 0–100.', Evidence: 'One-line summary of the facts the link rests on.', 'Derived by': 'Which deterministic pass produced the edge (derived:v1, corporate:v1…).', Observed: 'Date derived.', 'Touches CYC': 'yes when one end is a CYC person.', 'Relationship ID': 'Stable identifier.' } as Record<string, string>)[column] })),
  ...['Funder', 'Funder ID', 'Recipient', 'Recipient ID', 'Fiscal year', 'Amount', 'Purpose', 'Program category', 'Geography', 'Event ID'].map(column => ({ sheet: 'Funding Events', column, description: ({ Funder: 'Grantmaker named in the filing.', 'Funder ID': 'Organization ID of the funder.', Recipient: 'Grantee as resolved (EIN first, then name match).', 'Recipient ID': 'Organization ID of the recipient when resolved.', 'Fiscal year': 'Filing fiscal year.', Amount: 'Grant amount in USD as filed.', Purpose: 'Purpose text as filed.', 'Program category': 'Category when classified.', Geography: 'Recipient state when known.', 'Event ID': 'Stable identifier.' } as Record<string, string>)[column] })),
  ...['Organization', 'Similarity', 'Reasons', 'Computed'].map(column => ({ sheet: 'Peer Organizations', column, description: ({ Organization: 'An organization comparable to CYC.', Similarity: '0–1 on program (NTEE / vocabulary), geography, population and size.', Reasons: 'Why it counts as a peer.', Computed: 'Date the similarity was computed.' } as Record<string, string>)[column] })),
  ...['Type', 'Target', 'Target ID', 'Via (CYC person)', 'Trustee / contact', 'Shared room', 'Score', 'Relationship pts', 'Funding-fit pts', 'Access pts', 'Recency pts', 'Penalties', 'Status', 'Owner', 'Next action', 'Due', 'Outcome', 'Dismissal reason', 'Thesis', 'Recommended action', 'Claims verified', 'Explained by', 'Updated', 'Lead ID'].map(column => ({ sheet: 'Leads', column, description: ({ Type: 'Warm Introduction, Shared Employer, Shared Board, High-Confidence Path, Corporate Giving Opportunity, Untapped Funder.', Target: 'The funder or company the lead points at.', 'Target ID': 'Organization ID of the target.', 'Via (CYC person)': 'The CYC person who can open the door, when there is one.', 'Trustee / contact': 'The person at the target the path reaches.', 'Shared room': 'The employer or board the two people shared.', Score: 'Opportunity score 0–100, deterministic (how attractive).', 'Relationship pts': 'Rubric points from relationship strength (cap 40).', 'Funding-fit pts': 'Rubric points from funding fit (cap 50).', 'Access pts': 'Accessibility points.', 'Recency pts': 'Recency points (may be negative).', Penalties: 'Named penalties: inferred-only links, uncited seed funding, team feedback.', Status: 'Pipeline stage.', Owner: 'Team member responsible.', 'Next action': 'What happens next.', Due: 'Due date of the next action.', Outcome: 'Outcome text once decided.', 'Dismissal reason': 'Why it was closed as not a fit (feeds future scores).', Thesis: 'The explanation\'s opening, evidence-bound.', 'Recommended action': 'The suggested ask, phrased as a question to put.', 'Claims verified': 'Explanation claims that passed evidence validation.', 'Explained by': 'model (drafted then validated) or deterministic.', Updated: 'Last change.', 'Lead ID': 'Stable identifier.' } as Record<string, string>)[column] })),
  { sheet: 'Warm Paths', column: '(same as Leads)', description: 'The Leads rows that run through a CYC person, for the development team\'s ask list.' },
  ...['Source ID', 'Type', 'Name', 'URL', 'Retrieved', 'Published', 'Reference'].map(column => ({ sheet: 'Sources', column, description: ({ 'Source ID': 'Identifier referenced by rows in other sheets.', Type: 'Source kind (see Source).', Name: 'Human-readable description.', URL: 'Location of the source when it has one.', Retrieved: 'When it was read.', Published: 'Publication date when known.', Reference: 'Raw reference (file name, filing member, page).' } as Record<string, string>)[column] })),
  ...['Started', 'Completed', 'Categories', 'API calls', 'RapidAPI credits', 'Claude ($)', 'Profiles read', 'Employers scanned', 'Warm paths found', 'Relationships found', 'Funding events found', 'Status', 'Notes'].map(column => ({ sheet: 'Refresh Log', column, description: ({ Started: 'UTC start of the refresh step.', Completed: 'UTC completion.', Categories: 'What the step refreshed (people, employers).', 'API calls': 'Provider calls made.', 'RapidAPI credits': 'Credits consumed (profile reads count 2).', 'Claude ($)': 'Model spend attributed to the step.', 'Profiles read': 'CYC profiles enriched.', 'Employers scanned': 'Employer rosters searched.', 'Warm paths found': 'Leads written.', 'Relationships found': 'Edges written by the derivation that followed.', 'Funding events found': 'Funding events added (990 ingest runs).', Status: 'done / error.', Notes: 'Free text.' } as Record<string, string>)[column] })),
  ...Object.entries(COMMON).map(([column, description]) => ({ sheet: '(any)', column, description })),
];

// ── Workbook (pure: testable without a database) ────────────────────────────
export function workbookFromSnapshot(s: Snapshot): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  const add = (name: string, rows: Array<Record<string, unknown>>, widths?: number[]) => {
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no rows)']]);
    if (widths) ws['!cols'] = widths.map(wch => ({ wch }));
    else if (rows.length) ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.min(60, Math.max(10, ...rows.slice(0, 200).map(r => String(r[k] ?? '').length), k.length)) }));
    XLSX.utils.book_append_sheet(book, ws, name);
  };
  const readme: string[][] = [
    ['CYC Network Intelligence — snapshot'],
    ['Generated', s.meta.generated_at],
    ['Organization', s.meta.org_name],
    ['Snapshot version', s.meta.version],
    [''],
    ['What this is', 'A durable, portable copy of the relationship graph Fundir built for Chicago Youth Centers: people, organizations, careers, board seats, derived relationships, cited funding events, the peer set, scored leads and warm paths, every source, and the refresh log. The database is never the only copy.'],
    ['How to read it', 'Start with Leads (scored opportunities) and Warm Paths (the ones that run through a CYC person). Relationships explains each link and its grade. Every row carries a Source and, where the source has one, a Source URL you can open. The Data Dictionary sheet defines every column.'],
    ['Grades', 'verified = cited facts on both ends with dated overlap; probable = cited but undated; inferred = at least one uncited fact. Opportunity leads carry Low / Medium / High evidence confidence on the same basis.'],
    ['Privacy', s.meta.note],
    ['Scores', 'Opportunity score (0–100) says how attractive a lead looks; evidence confidence (Low / Medium / High) says how well-supported the evidence is. They are different things and are computed separately, deterministically.'],
    ['Hedging', 'Where a funder shows no CYC funding in the data, the wording is “No CYC funding relationship identified in available data”. The graph never asserts a personal relationship between people; shared employment or board service is a possible introduction path, nothing more.'],
    [''],
    ['Sheet', 'Rows'],
    ...SHEETS.filter(n => KEY_OF[n]).map(n => [n, String(s.meta.counts[KEY_OF[n] as string] ?? 0)]),
    [''],
    ['Machine-readable copy', 'The .json file with the same date carries these rows verbatim.'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(readme); ws['!cols'] = [{ wch: 22 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(book, ws, 'README');
  add('People', s.people); add('Organizations', s.organizations); add('Employments', s.employments); add('Boards', s.boards);
  add('Relationships', s.relationships); add('Funding Events', s.funding_events); add('Peer Organizations', s.peer_organizations);
  add('Warm Paths', s.warm_paths); add('Leads', s.leads); add('Sources', s.sources); add('Refresh Log', s.refresh_log);
  add('Data Dictionary', DATA_DICTIONARY.map(d => ({ 'Sheet': d.sheet, 'Column': d.column, 'Description': d.description })), [20, 22, 110]);
  return book;
}

export function workbookBuffer(book: XLSX.WorkBook): Buffer { return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer; }
export function snapshotJson(s: Snapshot): Buffer { return Buffer.from(JSON.stringify(s, null, 1), 'utf8'); }
