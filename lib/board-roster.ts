// Board roster → the organization's own people in the relationship graph,
// from a spreadsheet uploaded in the Data Hub.
//
// The roster was first loaded from the public boards page by a one-off script;
// board changes (members rolling off, new members joining) had no way in. This
// reads the new list, compares it with who is on record now, previews the
// change, and on commit:
//   - adds new members (network_people, kind board | auxiliary | council |
//     staff) with a current seat on the organization's node,
//   - updates the role of continuing members,
//   - rolls off members who are no longer on the list: their seat ends on the
//     effective date and their role reads "Former member". Their history,
//     their LinkedIn enrichment and the paths through them are kept, because
//     a former board member can still make an introduction; the brief stops
//     listing them under "Ask your board".
// Only the boards that appear in the file are compared, so a file with just
// the Board of Directors never rolls off the Auxiliary Board.

import * as XLSX from 'xlsx';
import type { createServerClient } from '@/lib/supabase';
import { readWorkbook } from '@/lib/instrumentl-import';
import { personNameKey } from '@/lib/network/normalize';
import { ownOrgNodeId } from '@/lib/known-funders';

type Db = ReturnType<typeof createServerClient>;

export type BoardKind = 'board' | 'auxiliary' | 'council' | 'staff';
export const BOARD_LABEL: Record<BoardKind, string> = { board: 'Board of Directors', auxiliary: 'Auxiliary Board', council: 'Leadership Council', staff: 'Board of Directors (ex officio)' };
const OWN: BoardKind[] = ['board', 'auxiliary', 'council', 'staff'];
/** network_sources is shared across tenants, so the upload's source row is per organization. */
export const rosterSourceRef = (orgId: string) => `board roster upload:${orgId}`;

export interface RosterRow { name: string; kind: BoardKind; role: string; affiliation: string | null; email: string | null; leaving: boolean; /** The file named the board (a Board column, a heading row or the sheet name); otherwise it is a guess. */ kindExplicit: boolean }
export interface RosterParse { rows: RosterRow[]; kinds: BoardKind[]; sheets: string[]; skipped: number }

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cell = (v: unknown) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s || null; };
const find = (h: string[], cands: string[]) => { for (const c of cands) { const i = h.indexOf(c); if (i >= 0) return i; } return -1; };
const NAME = ['name', 'full name', 'board member', 'board member name', 'member', 'member name', 'director', 'director name', 'trustee', 'trustee name'];
const FIRST = ['first name', 'first'], LAST = ['last name', 'last', 'surname'];
const ROLE = ['role', 'board role', 'title', 'position', 'office', 'officer', 'officer title', 'board position', 'board title'];
const BOARD = ['board', 'board type', 'board name', 'group', 'committee', 'body'];
const AFFIL = ['company', 'organization', 'affiliation', 'employer', 'firm', 'company affiliation', 'organization affiliation', 'business', 'professional affiliation'];
const EMAIL = ['email', 'e mail', 'email address'];
const STATUS = ['status', 'change', 'action', 'term status', 'notes', 'note'];
const HEADING = /\b(board of directors|governing board|auxiliary|leadership council|council|advisory board|officers|ex.?officio|board)\b/i;

/** "Auxiliary Board" → auxiliary; unknown or blank → the default for the sheet. */
export function kindFor(text: string | null | undefined, fallback: BoardKind = 'board'): BoardKind {
  const t = String(text ?? '');
  if (/aux/i.test(t)) return 'auxiliary';
  if (/council|leadership/i.test(t)) return 'council';
  if (/ex.?officio|\bstaff\b|\bceo\b/i.test(t)) return 'staff';
  if (/board|director|governing|trustee/i.test(t)) return 'board';
  return fallback;
}
const LEAVING = /roll(ing|ed)?\s*off|former|outgoing|leaving|depart|term (ended|ends|expired)|resign|stepp(ing|ed) down|remove/i;

/** Read every sheet that has a name column; a sheet name or a heading row ("Auxiliary Board") sets the board for the rows under it. */
export function parseRoster(buffer: Buffer): RosterParse {
  const wb = readWorkbook(buffer);
  const rows: RosterRow[] = []; const sheets: string[] = []; let skipped = 0;
  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
    let hi = -1;
    for (let i = 0; i < Math.min(grid.length, 15); i++) { const h = (grid[i] ?? []).map(norm); if (find(h, NAME) >= 0 || (find(h, FIRST) >= 0 && find(h, LAST) >= 0)) { hi = i; break; } }
    if (hi < 0) continue;
    sheets.push(sheetName);
    const h = (grid[hi] ?? []).map(norm);
    const ix = { name: find(h, NAME), first: find(h, FIRST), last: find(h, LAST), role: find(h, ROLE), board: find(h, BOARD), affil: find(h, AFFIL), email: find(h, EMAIL), status: find(h, STATUS) };
    const sheetKind = HEADING.test(sheetName) ? kindFor(sheetName) : 'board';
    let section: BoardKind = sheetKind;
    let sectionExplicit = HEADING.test(sheetName);
    // A title row above the header can name the board too.
    for (let i = 0; i < hi; i++) { const t = (grid[i] ?? []).map(cell).filter(Boolean).join(' '); if (HEADING.test(t)) { section = kindFor(t, section); sectionExplicit = true; } }
    for (const r of grid.slice(hi + 1)) {
      const filled = r.map(cell).filter(Boolean);
      if (!filled.length) continue;
      // A row holding only a heading switches the section ("Auxiliary Board").
      if (filled.length === 1 && HEADING.test(filled[0]!) && filled[0]!.split(' ').length <= 6) { section = kindFor(filled[0], section); sectionExplicit = true; continue; }
      const name = ix.name >= 0 ? cell(r[ix.name]) : [cell(r[ix.first]), cell(r[ix.last])].filter(Boolean).join(' ') || null;
      if (!name || !/[a-z]/i.test(name) || /\b(board|council|auxiliary|directors|officers|committee)\b/i.test(name)) { skipped++; continue; }
      const boardText = ix.board >= 0 ? cell(r[ix.board]) : null;
      const roleText = ix.role >= 0 ? cell(r[ix.role]) : null;
      const statusText = ix.status >= 0 ? cell(r[ix.status]) : null;
      let kind = boardText ? kindFor(boardText, section) : section;
      let kindExplicit = !!boardText || sectionExplicit;
      if (roleText && /ex.?officio|president and ceo|chief executive/i.test(roleText)) { kind = 'staff'; kindExplicit = true; }
      rows.push({
        name: name.replace(/\s*\((chair|vice chair|secretary|treasurer)\)\s*$/i, ''), kind,
        role: roleText ?? (/\((chair|vice chair|secretary|treasurer)\)/i.exec(name)?.[1] ?? 'Member'),
        affiliation: ix.affil >= 0 ? cell(r[ix.affil]) : null, email: ix.email >= 0 ? cell(r[ix.email]) : null,
        leaving: !!statusText && LEAVING.test(statusText), kindExplicit,
      });
    }
  }
  if (!rows.length) throw new Error('No names found. The roster needs a column headed "Name" (or "First name" and "Last name"); a "Board" and a "Role" column are optional.');
  // One row per person and board (a duplicate later in the file wins).
  const by = new Map<string, RosterRow>();
  for (const r of rows) by.set(`${r.kind}|${personNameKey(r.name)}`, r);
  const out = [...by.values()];
  return { rows: out, kinds: OWN.filter(k => out.some(r => r.kind === k)), sheets, skipped };
}

interface OwnPerson { id: string; name: string; kind: BoardKind; board_role: string | null; current_org: string | null; enriched_at: string | null; note: string | null }

/** Full-name key, then first + last token, so "Richard G. Baer, Jr." matches "Richard Baer". */
const looseKey = (name: string) => { const t = personNameKey(name).split(' ').filter(Boolean); return t.length >= 2 ? `${t[0]} ${t[t.length - 1]}` : t.join(' '); };
const isFormer = (p: { board_role: string | null }) => /^former/i.test(p.board_role ?? '');

export interface RosterPreview {
  sheets: string[]; kinds: BoardKind[]; in_file: number; skipped: number;
  /** Things to check before applying: a board the file barely overlaps, or most of a board rolling off. */
  warnings: string[];
  joining: Array<{ name: string; kind: BoardKind; role: string; rejoining: boolean }>;
  continuing: number;
  role_changes: Array<{ name: string; from: string | null; to: string }>;
  leaving: Array<{ name: string; kind: BoardKind; role: string | null }>;
  loose_matches: Array<{ file: string; record: string }>;
  roster_now: Record<BoardKind, number>;
}

async function plan(db: Db, orgId: string, buffer: Buffer) {
  const parsed = parseRoster(buffer);
  const { data, error } = await db.from('network_people').select('id, name, kind, board_role, current_org, enriched_at, note').eq('org_id', orgId).in('kind', OWN);
  if (error) throw new Error(`roster: ${error.message}`);
  const people = (data ?? []) as OwnPerson[];
  const warnings: string[] = [];
  // A file that never names its board is read as the Board of Directors. If its names are mostly
  // people on another board (an Auxiliary Board list with no Board column), read it as that board instead.
  const guessed = parsed.rows.filter(r => !r.kindExplicit && r.kind !== 'staff');
  if (guessed.length) {
    const tally = new Map<BoardKind, number>();
    for (const r of guessed) { const k = personNameKey(r.name); const hit = people.filter(p => personNameKey(p.name) === k); if (hit.length === 1) tally.set(hit[0].kind, (tally.get(hit[0].kind) ?? 0) + 1); }
    const [top, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    if (top && top !== 'staff' && top !== guessed[0].kind && n >= Math.max(2, Math.ceil(guessed.length * 0.4))) {
      for (const r of guessed) r.kind = top;
      parsed.kinds = OWN.filter(k => parsed.rows.some(r => r.kind === k));
      warnings.push(`The file does not say which board it lists; most names are on the ${BOARD_LABEL[top]}, so it is read as that board. Add a "Board" column if that is wrong.`);
    }
  }
  type Match = { row: RosterRow; person: OwnPerson | null; loose: boolean };
  const matches: Match[] = [];
  const used = new Set<string>();
  for (const row of parsed.rows) {
    const k = personNameKey(row.name), lk = looseKey(row.name);
    // Same board first, then any of the organization's own kinds (someone moving from the Auxiliary Board to the Board).
    const pools = [people.filter(p => p.kind === row.kind), people];
    let hit: OwnPerson | null = null, loose = false;
    for (const pool of pools) {
      const exact = pool.filter(p => !used.has(p.id) && personNameKey(p.name) === k);
      if (exact.length === 1) { hit = exact[0]; break; }
      const near = pool.filter(p => !used.has(p.id) && looseKey(p.name) === lk);
      if (near.length === 1) { hit = near[0]; loose = true; break; }
    }
    if (hit) used.add(hit.id);
    matches.push({ row, person: hit, loose });
  }
  const covered = new Set<BoardKind>(parsed.kinds.filter(k => k !== 'staff'));
  const leaving = people.filter(p => covered.has(p.kind) && !isFormer(p) && !used.has(p.id));
  // Rows the file itself marks as leaving.
  for (const m of matches) if (m.row.leaving && m.person && !isFormer(m.person) && !leaving.includes(m.person)) leaving.push(m.person);
  const staying = matches.filter(m => !m.row.leaving);
  const roster_now = Object.fromEntries(OWN.map(k => [k, people.filter(p => p.kind === k && !isFormer(p)).length])) as Record<BoardKind, number>;
  for (const k of covered) {
    const out = leaving.filter(p => p.kind === k).length;
    if (roster_now[k] >= 4 && out > roster_now[k] / 2) warnings.push(`This rolls off ${out} of the ${roster_now[k]} people on the ${BOARD_LABEL[k]}. If the file is only the changes, not the full roster, add a "Status" column ("Rolling off") instead and include everyone staying.`);
  }
  return { parsed, matches: staying, leaving, roster_now, warnings };
}

export async function previewRoster(db: Db, orgId: string, buffer: Buffer): Promise<RosterPreview> {
  const { parsed, matches, leaving, roster_now, warnings } = await plan(db, orgId, buffer);
  return {
    sheets: parsed.sheets, kinds: parsed.kinds, in_file: parsed.rows.length, skipped: parsed.skipped, warnings,
    joining: matches.filter(m => !m.person || isFormer(m.person)).map(m => ({ name: m.row.name, kind: m.row.kind, role: m.row.role, rejoining: !!m.person })),
    continuing: matches.filter(m => m.person && !isFormer(m.person)).length,
    role_changes: matches.filter(m => m.person && !isFormer(m.person) && (m.person.board_role ?? 'Member') !== m.row.role).map(m => ({ name: m.row.name, from: m.person!.board_role, to: m.row.role })),
    leaving: leaving.map(p => ({ name: p.name, kind: p.kind, role: p.board_role })),
    loose_matches: matches.filter(m => m.loose && m.person).map(m => ({ file: m.row.name, record: m.person!.name })),
    roster_now,
  };
}

export interface RosterCommit { joined: number; updated: number; left: number; effective: string; preview: RosterPreview }

async function rosterSource(db: Db, orgId: string, effective: string): Promise<string | null> {
  const ref = rosterSourceRef(orgId);
  const { data: src } = await db.from('network_sources').select('id').eq('raw_reference', ref).maybeSingle();
  const now = new Date().toISOString();
  if (src?.id) { await db.from('network_sources').update({ retrieved_at: now, publication_date: effective }).eq('id', src.id); return src.id as string; }
  const { data: ins } = await db.from('network_sources').insert({ source_type: 'cyc_workbook', source_name: 'Board roster (Data Hub upload)', raw_reference: ref, retrieved_at: now, publication_date: effective, confidence: 0.95 }).select('id').single();
  return (ins?.id as string | undefined) ?? null;
}

const seatTitle = (kind: BoardKind, role: string) => `${BOARD_LABEL[kind]} — ${role}`;

export async function commitRoster(db: Db, orgId: string, buffer: Buffer, effective: string): Promise<RosterCommit> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective)) throw new Error('Effective date must be YYYY-MM-DD');
  const preview = await previewRoster(db, orgId, buffer);
  const { matches, leaving } = await plan(db, orgId, buffer);
  const node = await ownOrgNodeId(db, orgId);
  if (!node) throw new Error("This organization has no node in the relationship graph yet, so board seats cannot be recorded. Ask an admin to add the organization's EIN.");
  const sourceId = await rosterSource(db, orgId, effective);
  let joined = 0, updated = 0, left = 0;

  const endSeats = async (personId: string, keepTitle: string | null) => {
    const { data: seats } = await db.from('network_boards').select('id, title').eq('person_id', personId).eq('organization_id', node).eq('is_current', true);
    const end = (seats ?? []).filter(s => s.title !== keepTitle).map(s => s.id as string);
    if (end.length) await db.from('network_boards').update({ is_current: false, ended: effective }).in('id', end);
  };
  const ensureSeat = async (personId: string, title: string) => {
    const { data: seat } = await db.from('network_boards').select('id, is_current').eq('person_id', personId).eq('organization_id', node).eq('title', title).maybeSingle();
    if (seat) { if (!seat.is_current) await db.from('network_boards').update({ is_current: true, ended: null, started: effective }).eq('id', seat.id); return; }
    const { error } = await db.from('network_boards').insert({ person_id: personId, organization_id: node, title, is_current: true, started: effective, source_id: sourceId, confidence: 0.95 });
    if (error) throw new Error(`seat: ${error.message}`);
  };

  for (const m of matches) {
    const r = m.row, title = seatTitle(r.kind, r.role);
    if (!m.person) {
      const { data: ins, error } = await db.from('network_people').insert({
        org_id: orgId, name: r.name, kind: r.kind, board_role: r.role, current_org: r.affiliation, status: 'new', verification: 'verified', source_id: sourceId,
        note: `Joined the ${BOARD_LABEL[r.kind]} ${effective} (board roster upload).`,
      }).select('id').single();
      if (error) throw new Error(`${r.name}: ${error.message}`);
      await ensureSeat(ins.id as string, title); joined++;
      continue;
    }
    const p = m.person;
    const patch: Record<string, unknown> = { board_role: r.role, kind: r.kind };
    if (r.affiliation && !p.enriched_at) patch.current_org = r.affiliation; // a LinkedIn-enriched employer is finer than the roster's
    if (isFormer(p)) { patch.note = [p.note, `Rejoined the ${BOARD_LABEL[r.kind]} ${effective}.`].filter(Boolean).join(' '); joined++; }
    else if ((p.board_role ?? 'Member') !== r.role || p.kind !== r.kind || patch.current_org) updated++;
    await db.from('network_people').update(patch).eq('id', p.id);
    await endSeats(p.id, title);
    await ensureSeat(p.id, title);
  }
  for (const p of leaving) {
    await endSeats(p.id, null);
    await db.from('network_people').update({
      board_role: 'Former member',
      note: [p.note, `Rolled off the ${BOARD_LABEL[p.kind]} ${effective}${p.board_role ? `; was ${p.board_role}` : ''}.`].filter(Boolean).join(' '),
    }).eq('id', p.id);
    left++;
  }
  return { joined, updated, left, effective, preview };
}

export interface RosterStatus { counts: Record<BoardKind, number>; former: number; last_upload: string | null; effective: string | null }

export async function rosterStatus(db: Db, orgId: string): Promise<RosterStatus> {
  const [{ data: people }, { data: src }] = await Promise.all([
    db.from('network_people').select('kind, board_role').eq('org_id', orgId).in('kind', OWN),
    db.from('network_sources').select('retrieved_at, publication_date').eq('raw_reference', rosterSourceRef(orgId)).maybeSingle(),
  ]);
  const ps = (people ?? []) as Array<{ kind: BoardKind; board_role: string | null }>;
  return {
    counts: Object.fromEntries(OWN.map(k => [k, ps.filter(p => p.kind === k && !isFormer(p)).length])) as Record<BoardKind, number>,
    former: ps.filter(isFormer).length, last_upload: (src?.retrieved_at as string | null) ?? null, effective: (src?.publication_date as string | null) ?? null,
  };
}
