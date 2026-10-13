// Foundation Cultivation List → cyc_cultivation + funder_board_members, from inside the app.
//
// CYC keeps the list as a "stacked" sheet: a row naming the foundation, a row
// of its details (focus, range, address, phone, email, notes), then one row per
// board member. A second sheet ("Rejected or Reconsider") uses the same layout
// for foundations parked for now. This parser reads both, matches each
// foundation to the IRS Illinois BMF on its exact name (so the EIN, legal name
// and assets come from the IRS, not from typing), previews what would change,
// and on commit writes the tables and re-syncs the trustees into the
// relationship graph (network_sync_funder_boards, a database function shared
// with the one-time migration script).
//
// A third sheet, "Known Connections", is the board's own list: the same stacked
// layout plus a Status column, where the Connection on the foundation's details
// row names who at CYC knows the foundation. Those foundation-level facts are
// written to cyc_cultivation (connection, outreach_status) and the trustee sync
// turns them into CYC → foundation edges. Column headers may read "Board
// Member Name" or "Board Member/Employee Name"; both are accepted.
//
// What the file says about a person (name, title, connection) is the file's to
// change; what CYC has entered in the app since (connection type, who knows
// them, outreach status) is kept.

import { createServerClient } from '@/lib/supabase';
import { readWorkbook } from '@/lib/instrumentl-import';
import { personNameKey } from '@/lib/network/normalize';
import * as XLSX from 'xlsx';

type Db = ReturnType<typeof createServerClient>;

export interface CultivationFoundation {
  foundation_name: string; list: string;
  funding_focus: string | null; funding_range: string | null; address: string | null; phone: string | null; email: string | null;
  /** Foundation-level "Connection" (who at CYC knows the foundation), from the details row. */
  connection: string | null;
  /** Foundation-level "Status" (Outreach, Application Pending…), Known Connections sheet. */
  outreach_status: string | null;
  notes: string | null; board_members_listed: string;
}
export interface CultivationMember { foundation_name: string; member_name: string; title: string | null; email: string | null; connection_to_cyc: string | null }
export interface CultivationParse { foundations: CultivationFoundation[]; members: CultivationMember[]; sheets: string[]; missing_columns: string[] }

export interface CultivationPreview {
  sheets: string[]; missing_columns: string[];
  foundations: { in_file: number; new: number; updated: number; unchanged: number; kept_not_in_file: number; matched_irs: number; unmatched: string[] };
  members: { in_file: number; new: number; updated: number; unchanged: number; removed: number; with_connection: number };
  /** The Known Connections sheet (and any Connection cell elsewhere): what will reach the graph. */
  connections: {
    sheet: string | null;
    foundations_with_connection: number; members_with_connection: number; with_status: number;
    /** Names in Connection cells that resolve to one of CYC's own people (board, staff, auxiliary, council). */
    resolved: string[];
    /** Connection cells that are not a CYC name (kept as text; they still mark the relationship as existing). */
    unresolved: string[];
    statuses: Array<{ foundation: string; status: string }>;
  };
  sample_new: string[]; sample_removed: string[];
}

const str = (v: unknown) => { if (v == null) return null; const s = String(v).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); return s === '' ? null : s; };
const REQUIRED = ['Foundation Name', 'Board Member Name'];
/** Header patterns: "Board Member Name" and "Board Member/Employee Name" both count; "Connection" with or without the "?". */
const COLS: Record<string, RegExp> = {
  name: /^foundation name/, focus: /^funding focus/, range: /^funding range/,
  title: /^board member.*title|^(member |employee )?title$/, member: /^board member.*name|^(member |employee )?name$/,
  address: /^foundation address|^address/, phone: /^phone/, email: /^e-?mail/, connection: /^connection/, status: /^status|^outreach/, notes: /^notes?/,
};
const NAME_HEADER = COLS.name;
const KNOWN_SHEET = /known connection/i;
/** "Invite-only", "By invitation", "Open", "Rolling", "No unsolicited…" — a flag, never a foundation's name. */
const APPLICATION_FLAG = /^(invite|invitation|by invitation|open\b|rolling|no unsolicited|unsolicited|loi\b|letter of inquiry|accepts)/i;
/** A Connection cell that says "none" rather than naming someone. */
export const NO_CONNECTION = new Set(['unknown', 'no', 'none', 'not started', 'n/a', 'tbd', '-', '—']);

/** Parse the stacked cultivation workbook (every sheet that carries the expected header). */
export function parseCultivation(buffer: Buffer): CultivationParse {
  const wb = readWorkbook(buffer);
  const foundations: CultivationFoundation[] = [];
  const members: CultivationMember[] = [];
  const sheets: string[] = [];
  let missing_columns: string[] = REQUIRED;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
    const hi = grid.findIndex(r => r.some(c => NAME_HEADER.test((str(c) ?? '').toLowerCase())));
    if (hi < 0) continue;
    const header = grid[hi].map(c => (str(c) ?? '').toLowerCase());
    const col = (re: RegExp) => header.findIndex(h => re.test(h));
    const ix = { name: col(COLS.name), focus: col(COLS.focus), range: col(COLS.range), title: col(COLS.title), member: col(COLS.member), address: col(COLS.address), phone: col(COLS.phone), email: col(COLS.email), connection: col(COLS.connection), status: col(COLS.status), notes: col(COLS.notes) };
    const sheetMissing = [ix.name < 0 ? REQUIRED[0] : null, ix.member < 0 ? REQUIRED[1] : null].filter((c): c is string => !!c);
    if (sheetMissing.length) { missing_columns = sheetMissing; continue; }
    missing_columns = [];
    sheets.push(sheetName);
    const isReconsider = /reject|reconsider|parked|declined/i.test(sheetName);
    const cell = (row: unknown[], i: number) => (i >= 0 ? str(row[i]) : null);
    let cur: CultivationFoundation | null = null;
    for (const row of grid.slice(hi + 1)) {
      const name = cell(row, ix.name);
      const member = cell(row, ix.member);
      // The details row sometimes carries an application flag ("Invite-only") in the
      // name column; that is a fact about the foundation above it, not a new foundation.
      if (name && cur && !member && APPLICATION_FLAG.test(name)) {
        fill(cur, row, ix, cell, isReconsider, sheetName);
        const bare = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
        if (!cur.notes || !bare(cur.notes).includes(bare(name))) cur.notes = cur.notes ? `${name}. ${cur.notes}` : name;
        continue;
      }
      if (name) {
        cur = { foundation_name: name, list: sheetName, funding_focus: null, funding_range: null, address: null, phone: null, email: null, connection: null, outreach_status: null, notes: null, board_members_listed: '0' };
        foundations.push(cur);
        // A flat layout puts the details on the same row as the name.
        if (!member) { fill(cur, row, ix, cell, isReconsider, sheetName); continue; }
      }
      if (!cur) continue;
      if (member) {
        members.push({ foundation_name: cur.foundation_name, member_name: member, title: cell(row, ix.title), email: cell(row, ix.email), connection_to_cyc: cell(row, ix.connection) });
        cur.board_members_listed = String(Number(cur.board_members_listed) + 1);
        continue;
      }
      fill(cur, row, ix, cell, isReconsider, sheetName);
    }
  }
  // A parked foundation with no note still says which list it came from.
  for (const f of foundations) if (!f.notes && /reject|reconsider|parked|declined/i.test(f.list)) f.notes = `${f.list.trim()}.`;
  // One row per foundation: a foundation on two sheets (the main list and Known
  // Connections) keeps every detail either sheet gives, the later sheet winning
  // where both speak; the member count is the union. One row per (foundation, member): last wins.
  const fByName = new Map<string, CultivationFoundation>();
  for (const f of foundations) {
    const k = f.foundation_name.toLowerCase();
    const prev = fByName.get(k);
    if (!prev) { fByName.set(k, f); continue; }
    fByName.set(k, {
      foundation_name: f.foundation_name, list: f.list,
      funding_focus: f.funding_focus ?? prev.funding_focus, funding_range: f.funding_range ?? prev.funding_range,
      address: f.address ?? prev.address, phone: f.phone ?? prev.phone, email: f.email ?? prev.email,
      connection: f.connection ?? prev.connection, outreach_status: f.outreach_status ?? prev.outreach_status,
      notes: f.notes ?? prev.notes, board_members_listed: '0',
    });
  }
  const mByKey = new Map<string, CultivationMember>();
  for (const m of members) mByKey.set(`${m.foundation_name.toLowerCase()}|||${m.member_name.toLowerCase()}`, m);
  for (const f of fByName.values()) f.board_members_listed = '0';
  for (const m of mByKey.values()) { const f = fByName.get(m.foundation_name.toLowerCase()); if (f) f.board_members_listed = String(Number(f.board_members_listed) + 1); }
  return { foundations: [...fByName.values()], members: [...mByKey.values()], sheets, missing_columns };
}

function fill(cur: CultivationFoundation, row: unknown[], ix: Record<string, number>, cell: (row: unknown[], i: number) => string | null, isReconsider: boolean, sheetName: string) {
  const focus = cell(row, ix.focus);
  if (focus && !/^\d+$/.test(focus) && !cur.funding_focus) cur.funding_focus = focus;
  cur.funding_range ??= cell(row, ix.range);
  cur.address ??= cell(row, ix.address);
  cur.phone ??= cell(row, ix.phone);
  cur.email ??= cell(row, ix.email);
  cur.connection ??= cell(row, ix.connection);
  cur.outreach_status ??= cell(row, ix.status);
  const notes = cell(row, ix.notes);
  if (notes && !cur.notes) cur.notes = isReconsider ? `${sheetName.trim()}: ${notes}` : notes;
}

// ── IRS Illinois BMF match (exact name) ──────────────────────────────────────

/** Name key shared with the IRS master file: upper, & → AND, no punctuation, no leading/trailing THE/INC/TR/CH. */
export function bmfNameKey(name: string): string {
  return name.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^THE /, '').replace(/ (THE|INC|TR|CH)$/, '').trim();
}
const stateOf = (address: string | null) => address?.match(/,\s*([A-Z]{2})\s+\d{5}/)?.[1] ?? address?.match(/\b([A-Z]{2})\s+\d{5}/)?.[1] ?? null;
const funderTypeOf = (code: string | null) => {
  const c = (code ?? '').replace(/^0+/, '');
  if (['2', '3', '4'].includes(c)) return 'Family/Independent Foundation';
  if (['15', '16', '17'].includes(c)) return 'Grantmaking Public Charity';
  return '-';
};

interface BmfHit { ein: string; name: string; foundation: string | null; asset_amt: number | null }

async function matchBmf(db: Db, name: string): Promise<BmfHit | null> {
  const key = bmfNameKey(name);
  const words = key.split(' ').filter(w => w.length > 2 && !['THE', 'AND', 'FOUNDATION', 'FAMILY', 'INC', 'FUND', 'TRUST'].includes(w));
  const probe = words[0] ?? key.split(' ')[0];
  if (!probe) return null;
  const { data } = await db.from('irs_bmf_il').select('ein, name, foundation, asset_amt').ilike('name', `%${probe}%`).limit(200);
  const hits = (data ?? []).filter(r => bmfNameKey(String(r.name ?? '')) === key)
    .sort((a, b) => (Number(b.asset_amt) || 0) - (Number(a.asset_amt) || 0));
  return hits[0] ? { ein: String(hits[0].ein), name: String(hits[0].name), foundation: hits[0].foundation ? String(hits[0].foundation) : null, asset_amt: hits[0].asset_amt == null ? null : Number(hits[0].asset_amt) } : null;
}

// ── Preview / commit ─────────────────────────────────────────────────────────

type CultRow = Record<string, unknown>;
const F_COMPARE = ['bmf_ein', 'in_il_bmf', 'funder_type', 'address', 'funding_focus', 'funding_range', 'email', 'phone', 'board_members_listed', 'notes', 'connection', 'outreach_status', 'list'] as const;
const M_COMPARE = ['title', 'email', 'connection_to_cyc'] as const;

async function build(db: Db, orgId: string, buffer: Buffer) {
  const parsed = parseCultivation(buffer);
  if (!parsed.foundations.length) throw new Error(`This does not look like the cultivation list (expected columns: ${REQUIRED.join(', ')}; a "Foundation Name" row followed by its board members)`);
  const rows: CultRow[] = [];
  const unmatched: string[] = [];
  for (const f of parsed.foundations) {
    const hit = await matchBmf(db, f.foundation_name);
    if (!hit) unmatched.push(f.foundation_name);
    const st = stateOf(f.address);
    rows.push({
      org_id: orgId, foundation_name: f.foundation_name,
      bmf_ein: hit?.ein ?? null, bmf_legal_name: hit?.name ?? null,
      in_il_bmf: hit ? 'Yes' : st && st !== 'IL' ? 'No - out of state' : 'No - not found in IL BMF',
      funder_type: hit ? funderTypeOf(hit.foundation) : '-', total_assets: hit?.asset_amt ?? null,
      address: f.address, funding_focus: f.funding_focus, funding_range: f.funding_range, email: f.email, phone: f.phone,
      board_members_listed: f.board_members_listed, notes: f.notes,
      connection: f.connection, outreach_status: f.outreach_status, list: f.list,
      lookup_url: hit ? `https://projects.propublica.org/nonprofits/organizations/${hit.ein}` : `Search: https://projects.propublica.org/nonprofits/search?q=${encodeURIComponent(f.foundation_name)}`,
    });
  }
  const { data: curF } = await db.from('cyc_cultivation').select('foundation_name, bmf_ein, in_il_bmf, funder_type, address, funding_focus, funding_range, email, phone, board_members_listed, notes, connection, outreach_status, list').eq('org_id', orgId).limit(2000);
  const { data: curM } = await db.from('funder_board_members').select('id, foundation_name, member_name, title, email, connection_to_cyc').eq('org_id', orgId).limit(5000);
  const fMap = new Map((curF ?? []).map(r => [String(r.foundation_name).toLowerCase(), r as CultRow]));
  const mMap = new Map((curM ?? []).map(r => [`${String(r.foundation_name).toLowerCase()}|||${String(r.member_name).toLowerCase()}`, r as CultRow]));
  const fileFoundations = new Set(rows.map(r => String(r.foundation_name).toLowerCase()));
  const fileMembers = new Set(parsed.members.map(m => `${m.foundation_name.toLowerCase()}|||${m.member_name.toLowerCase()}`));

  let fNew = 0, fUpd = 0, fSame = 0;
  const sample_new: string[] = [];
  for (const r of rows) {
    const e = fMap.get(String(r.foundation_name).toLowerCase());
    if (!e) { fNew++; if (sample_new.length < 8) sample_new.push(String(r.foundation_name)); continue; }
    if (F_COMPARE.some(k => String(e[k] ?? '') !== String(r[k] ?? ''))) fUpd++; else fSame++;
  }
  // Members: the file owns name/title/email/connection; a connection CYC entered earlier is kept when the file has none.
  const memberRows = parsed.members.map(m => {
    const e = mMap.get(`${m.foundation_name.toLowerCase()}|||${m.member_name.toLowerCase()}`);
    return { org_id: orgId, foundation_name: m.foundation_name, member_name: m.member_name, title: m.title, email: m.email ?? (e?.email as string | null) ?? null, connection_to_cyc: m.connection_to_cyc ?? (e?.connection_to_cyc as string | null) ?? null, source: 'Foundation Cultivation List' };
  });
  let mNew = 0, mUpd = 0, mSame = 0;
  for (const m of memberRows) {
    const e = mMap.get(`${m.foundation_name.toLowerCase()}|||${m.member_name.toLowerCase()}`);
    if (!e) { mNew++; continue; }
    if (M_COMPARE.some(k => String(e[k] ?? '') !== String(m[k] ?? ''))) mUpd++; else mSame++;
  }
  const removed = (curM ?? []).filter(r => fileFoundations.has(String(r.foundation_name).toLowerCase()) && !fileMembers.has(`${String(r.foundation_name).toLowerCase()}|||${String(r.member_name).toLowerCase()}`));

  // Known connections: which Connection cells name one of CYC's own people (the graph links those).
  const isConn = (v: string | null | undefined) => !!v && !NO_CONNECTION.has(v.trim().toLowerCase());
  const { data: own } = await db.from('network_people').select('name').eq('org_id', orgId).in('kind', ['board', 'staff', 'auxiliary', 'council']).limit(2000);
  const ownKeys = new Map<string, string>();
  for (const o of own ?? []) ownKeys.set(personNameKey(String(o.name)), String(o.name));
  const resolved = new Set<string>(), unresolved = new Set<string>();
  const mention = (v: string | null) => { if (!isConn(v)) return; const hit = ownKeys.get(personNameKey(v)); if (hit) resolved.add(hit); else unresolved.add(v as string); };
  for (const f of parsed.foundations) mention(f.connection);
  for (const m of memberRows) mention(m.connection_to_cyc);
  const connections: CultivationPreview['connections'] = {
    sheet: parsed.sheets.find(n => KNOWN_SHEET.test(n)) ?? null,
    foundations_with_connection: parsed.foundations.filter(f => isConn(f.connection)).length,
    members_with_connection: memberRows.filter(m => isConn(m.connection_to_cyc)).length,
    with_status: parsed.foundations.filter(f => f.outreach_status).length,
    resolved: [...resolved].sort(), unresolved: [...unresolved].sort(),
    statuses: parsed.foundations.filter(f => f.outreach_status).map(f => ({ foundation: f.foundation_name, status: f.outreach_status as string })),
  };
  const preview: CultivationPreview = {
    sheets: parsed.sheets, missing_columns: parsed.missing_columns,
    foundations: { in_file: rows.length, new: fNew, updated: fUpd, unchanged: fSame, kept_not_in_file: (curF ?? []).filter(r => !fileFoundations.has(String(r.foundation_name).toLowerCase())).length, matched_irs: rows.length - unmatched.length, unmatched },
    members: { in_file: memberRows.length, new: mNew, updated: mUpd, unchanged: mSame, removed: removed.length, with_connection: memberRows.filter(m => isConn(m.connection_to_cyc)).length },
    connections,
    sample_new, sample_removed: removed.slice(0, 8).map(r => `${r.member_name} · ${r.foundation_name}`),
  };
  return { rows, memberRows, removedIds: removed.map(r => r.id as string), preview };
}

export async function previewCultivation(db: Db, orgId: string, buffer: Buffer): Promise<CultivationPreview> {
  return (await build(db, orgId, buffer)).preview;
}

export interface CultivationCommit { foundations: number; members: number; removed: number; graph: { organizations: number; people: number; seats: number; edges: number; links: number; removed?: number } | null; preview: CultivationPreview }

export interface CultivationLastImport { at: string | null; foundations: number; members: number; with_connection: number; known_connections: number; sheets: string[] }

/** What is live now: when the list was last replaced and how much of it carries a connection. */
export async function cultivationLastImport(db: Db, orgId: string): Promise<CultivationLastImport> {
  const [{ data: f }, { data: m }] = await Promise.all([
    db.from('cyc_cultivation').select('imported_at, connection, list').eq('org_id', orgId).limit(2000),
    db.from('funder_board_members').select('imported_at, connection_to_cyc').eq('org_id', orgId).limit(5000),
  ]);
  const isConn = (v: unknown) => typeof v === 'string' && v.trim() !== '' && !NO_CONNECTION.has(v.trim().toLowerCase());
  const stamps = [...(f ?? []).map(r => String(r.imported_at)), ...(m ?? []).map(r => String(r.imported_at))].filter(Boolean).sort();
  return {
    at: stamps.at(-1) ?? null,
    foundations: (f ?? []).length, members: (m ?? []).length,
    with_connection: (m ?? []).filter(r => isConn(r.connection_to_cyc)).length + (f ?? []).filter(r => isConn(r.connection)).length,
    known_connections: (f ?? []).filter(r => isConn(r.connection)).length,
    sheets: [...new Set((f ?? []).map(r => r.list as string | null).filter((v): v is string => !!v))],
  };
}

/** Write the list, drop board members the file no longer lists for its foundations, then re-sync trustees into the graph. */
export async function commitCultivation(db: Db, orgId: string, buffer: Buffer): Promise<CultivationCommit> {
  const { rows, memberRows, removedIds, preview } = await build(db, orgId, buffer);
  const now = new Date().toISOString();
  const { error: fe } = await db.from('cyc_cultivation').upsert(rows.map(r => ({ ...r, imported_at: now })), { onConflict: 'org_id,foundation_name' });
  if (fe) throw new Error(fe.message);
  for (let i = 0; i < removedIds.length; i += 200) {
    const { error } = await db.from('funder_board_members').delete().in('id', removedIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < memberRows.length; i += 400) {
    const { error } = await db.from('funder_board_members').upsert(memberRows.slice(i, i + 400).map(r => ({ ...r, imported_at: now })), { onConflict: 'org_id,foundation_name,member_name' });
    if (error) throw new Error(error.message);
  }
  const { data: graph, error: ge } = await db.rpc('network_sync_funder_boards', { p_org_id: orgId });
  return { foundations: rows.length, members: memberRows.length, removed: removedIds.length, graph: ge ? null : (graph as CultivationCommit['graph']), preview };
}
