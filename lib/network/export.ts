// Network → Excel. The scraper guide's discipline (normalize the raw pull into
// a clean, columnar artifact you keep) tailored to Fundir: every export is a
// dated .xlsx snapshot of the whole network graph — roster, career histories,
// scored warm paths, the pipeline, and the refresh spend log — so CYC always
// owns its data as a file, not just rows in a database. Snapshots can be
// downloaded directly or saved into the shared Data Hub folder in OneDrive
// (where, like any Data Hub document, the advisor also reads them).

import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase';

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : '';

export function networkWorkbookName(): string {
  return `CYC Network Intelligence ${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export async function buildNetworkWorkbook(orgId: string): Promise<Buffer> {
  const db = createServerClient();
  const [peopleRes, empRes, leadsRes, runsRes] = await Promise.all([
    db.from('network_people')
      .select('id, kind, name, linkedin_url, headline, current_title, current_org, location, note, status, enriched_at')
      .eq('org_id', orgId).order('kind').order('name'),
    db.from('network_employments')
      .select('person_id, org_name, title, started, ended, is_current'),
    db.from('network_leads')
      .select('score, via_org, reason, person:network_people!network_leads_person_id_fkey(name, linkedin_url, headline, current_title, current_org, location, status), via:network_people!network_leads_via_person_id_fkey(name)')
      .eq('org_id', orgId).order('score', { ascending: false }),
    db.from('network_refresh_runs')
      .select('started_at, api_calls, profiles_enriched, companies_scanned, leads_found, status, notes')
      .eq('org_id', orgId).order('started_at', { ascending: false }).limit(100),
  ]);

  const people = peopleRes.data ?? [];
  const nameById = new Map(people.map(p => [p.id as string, p.name as string]));
  const ownIds = new Set(people.filter(p => p.kind !== 'lead').map(p => p.id as string));

  // ── Sheet 1: Board & Staff ──
  const roster = people.filter(p => p.kind !== 'lead').map(p => ({
    'Name': p.name, 'Kind': p.kind === 'board' ? 'Board member' : 'Staff',
    'Title': p.current_title ?? '', 'Organization': p.current_org ?? '',
    'Location': p.location ?? '', 'Headline': p.headline ?? '',
    'LinkedIn URL': p.linkedin_url ?? '', 'Profile read': fmtDate(p.enriched_at as string),
    'Note': p.note ?? '',
  }));

  // ── Sheet 2: Career History (CYC people only) ──
  const careers = (empRes.data ?? [])
    .filter(e => ownIds.has(e.person_id as string))
    .map(e => ({
      'Person': nameById.get(e.person_id as string) ?? '',
      'Organization': e.org_name, 'Title': e.title ?? '',
      'Start': e.started ?? '', 'End': e.is_current ? 'Present' : (e.ended ?? ''),
      'Current': e.is_current ? 'Yes' : '',
    }))
    .sort((a, b) => a.Person.localeCompare(b.Person));

  // ── Sheet 3: Warm Paths ──
  type LeadRow = { score: number; via_org: string; reason: string; person: Record<string, unknown> | null; via: { name: string } | null };
  const paths = ((leadsRes.data ?? []) as unknown as LeadRow[]).flatMap(l => {
    if (!l.person) return [];
    return [{
      'Lead': l.person.name ?? '', 'Title': l.person.current_title ?? '',
      'Organization': l.person.current_org ?? '', 'Location': l.person.location ?? '',
      'Score': Math.round(l.score), 'Via (CYC person)': l.via?.name ?? '',
      'Shared employer': l.via_org, 'Why': l.reason,
      'Status': l.person.status === 'added' ? 'In pipeline' : l.person.status === 'dismissed' ? 'Dismissed' : 'New',
      'LinkedIn URL': l.person.linkedin_url ?? '',
    }];
  });

  // ── Sheet 4: Refresh Log (the spend/audit trail) ──
  const log = (runsRes.data ?? []).map(r => ({
    'Date': fmtDate(r.started_at as string), 'API calls': r.api_calls,
    'Profiles read': r.profiles_enriched, 'Employers scanned': r.companies_scanned,
    'Warm paths found': r.leads_found, 'Status': r.status, 'Notes': r.notes ?? '',
  }));

  const book = XLSX.utils.book_new();
  const addSheet = (name: string, rows: Record<string, unknown>[], widths: number[]) => {
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(empty)']]);
    ws['!cols'] = widths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(book, ws, name);
  };
  addSheet('Board & Staff',  roster,  [24, 13, 26, 28, 24, 40, 44, 12, 40]);
  addSheet('Career History', careers, [24, 32, 30, 10, 10, 8]);
  addSheet('Warm Paths',     paths,   [24, 30, 28, 22, 7, 22, 28, 52, 12, 44]);
  addSheet('Refresh Log',    log,     [11, 9, 12, 16, 15, 8, 50]);

  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
