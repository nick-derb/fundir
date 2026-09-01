import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ProspectingView, type Sheet, type InstrumentlSummary } from '@/components/prospecting/prospecting-view';

export const dynamic = 'force-dynamic';

const ROW_LIMIT = 60;

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return v == null || v === '' ? '' : String(v);
  return n.toLocaleString('en-US');
}
const s = (v: unknown) => (v == null ? '' : String(v));

export default async function ProspectingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const db = createServerClient();
  const org = ctx.orgId;

  const [cult, board, queue, metro, peers, prospects, bmf, subs] = await Promise.all([
    db.from('cyc_cultivation').select('foundation_name, bmf_ein, in_il_bmf, funder_type, total_assets, funding_focus, notes', { count: 'exact' }).eq('org_id', org).limit(ROW_LIMIT),
    db.from('funder_board_members').select('foundation_name, member_name, title, connection_to_cyc, connection_type, who_knows_them, outreach_status', { count: 'exact' }).eq('org_id', org).limit(ROW_LIMIT),
    db.from('cyc_research_queue').select('priority, ein, organization_name, funder_type, city, total_assets, owner, next_action, status', { count: 'exact' }).eq('org_id', org).order('priority').limit(ROW_LIMIT),
    db.from('cyc_funder_prospects').select('ein, name, funder_type, city, zip, total_assets, ntee_code, files_990pf', { count: 'exact' }).eq('org_id', org).eq('list_source', 'chicago_metro_funders').order('total_assets', { ascending: false }).limit(ROW_LIMIT),
    db.from('cyc_peer_orgs').select('ein, name, peer_category, ntee_code, city, total_assets, revenue, same_ntee_as_cyc', { count: 'exact' }).eq('org_id', org).order('total_assets', { ascending: false }).limit(ROW_LIMIT),
    db.from('cyc_funder_prospects').select('ein, name, funder_type, city, zip, total_assets, ntee_code, files_990pf', { count: 'exact' }).eq('org_id', org).eq('list_source', 'funder_prospects').order('total_assets', { ascending: false }).limit(ROW_LIMIT),
    db.from('irs_bmf_il').select('ein, name, ico, street, city, state, zip, subsection', { count: 'exact' }).order('asset_amt', { ascending: false, nullsFirst: false }).limit(ROW_LIMIT),
    db.from('cyc_grant_submissions').select('project, status, outcome').eq('org_id', org),
  ]);

  const count = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');

  const sheets: Sheet[] = [
    {
      key: 'cultivation', label: 'Cultivation List', total: count(cult.count), locked: false,
      note: 'Your working list. Joined to the IRS source on EIN.',
      cols: ['Foundation Name', 'BMF EIN', 'In IL BMF?', 'Funder Type', 'Total Assets ($)', 'Funding Focus', 'Notes'],
      lock: [1, 2],
      rows: (cult.data ?? []).map(r => [s(r.foundation_name), s(r.bmf_ein), s(r.in_il_bmf), s(r.funder_type), money(r.total_assets), s(r.funding_focus), s(r.notes)]),
    },
    {
      key: 'board', label: 'Board Members', total: count(board.count), locked: false,
      note: 'Trustees pulled from filings. Connection fields are yours to fill.',
      cols: ['Foundation Name', 'Board Member Name', 'Title', 'Connection to CYC?', 'Connection Type', 'Who at CYC Knows Them', 'Outreach Status'],
      lock: [0, 1, 2],
      rows: (board.data ?? []).map(r => [s(r.foundation_name), s(r.member_name), s(r.title), s(r.connection_to_cyc), s(r.connection_type), s(r.who_knows_them), s(r.outreach_status)]),
    },
    {
      key: 'queue', label: 'Research Queue', total: count(queue.count), locked: false,
      note: 'Prioritized backlog. Owner and next action are yours.',
      cols: ['Priority', 'EIN', 'Organization Name', 'Funder Type', 'City', 'Total Assets ($)', 'Owner', 'Next Action', 'Status'],
      lock: [0, 1, 2, 3, 4, 5],
      rows: (queue.data ?? []).map(r => [s(r.priority), s(r.ein), s(r.organization_name), s(r.funder_type), s(r.city), money(r.total_assets), s(r.owner), s(r.next_action), s(r.status)]),
    },
    {
      key: 'metro', label: 'Chicago Metro Funders', total: count(metro.count), locked: true,
      note: 'Cleaned from the IRS Business Master File.',
      cols: ['EIN', 'Organization Name', 'Funder Type', 'City', 'ZIP', 'Total Assets ($)', 'NTEE Code', 'Files 990-PF'],
      lock: 'all',
      rows: (metro.data ?? []).map(r => [s(r.ein), s(r.name), s(r.funder_type), s(r.city), s(r.zip), money(r.total_assets), s(r.ntee_code), s(r.files_990pf)]),
    },
    {
      key: 'peers', label: 'Peer Youth Orgs', total: count(peers.count), locked: true,
      note: 'Organizations sharing CYC NTEE codes. Used for grantee overlap.',
      cols: ['EIN', 'Organization Name', 'Peer Category', 'NTEE Code', 'City', 'Total Assets ($)', 'Revenue ($)', 'Same NTEE as CYC'],
      lock: 'all',
      rows: (peers.data ?? []).map(r => [s(r.ein), s(r.name), s(r.peer_category), s(r.ntee_code), s(r.city), money(r.total_assets), money(r.revenue), s(r.same_ntee_as_cyc)]),
    },
    {
      key: 'prospects', label: 'Funder Prospects', total: count(prospects.count), locked: true,
      note: 'The full prospect universe before CYC filters are applied.',
      cols: ['EIN', 'Organization Name', 'Funder Type', 'City', 'ZIP', 'Total Assets ($)', 'NTEE Code', 'Files 990-PF'],
      lock: 'all',
      rows: (prospects.data ?? []).map(r => [s(r.ein), s(r.name), s(r.funder_type), s(r.city), s(r.zip), money(r.total_assets), s(r.ntee_code), s(r.files_990pf)]),
    },
    {
      key: 'bmf', label: 'eo_il', total: count(bmf.count), locked: true,
      note: 'The raw IL exempt-organization file, cleaned. Every other sheet derives from it.',
      cols: ['EIN', 'NAME', 'ICO', 'STREET', 'CITY', 'STATE', 'ZIP', 'SUBSECTION'],
      lock: 'all',
      rows: (bmf.data ?? []).map(r => [s(r.ein), s(r.name), s(r.ico), s(r.street), s(r.city), s(r.state), s(r.zip), s(r.subsection)]),
    },
  ];

  // ── Instrumentl history (real) ──────────────────────────────────────────
  const subRows = (subs.data ?? []) as Array<{ project: string | null; status: string | null; outcome: string | null }>;
  const isOpen = (st: string | null) => /submitted|in progress/i.test(st ?? '');
  let awarded = 0, declined = 0, open = 0;
  const byProject = new Map<string, { sent: number; won: number }>();
  for (const r of subRows) {
    const win = r.outcome === 'awarded';
    const lose = r.outcome === 'rejected';
    if (win) awarded++; else if (lose) declined++; else if (isOpen(r.status)) open++;
    if (win || lose || isOpen(r.status)) {
      const key = (r.project || 'Unassigned').trim();
      const b = byProject.get(key) ?? { sent: 0, won: 0 };
      b.sent++; if (win) b.won++;
      byProject.set(key, b);
    }
  }
  const decided = awarded + declined;
  const instrumentl: InstrumentlSummary = {
    awarded, declined, open,
    winRate: decided ? Math.round((awarded / decided) * 100) : 0,
    projects: [...byProject.entries()]
      .map(([project, v]) => ({ project, sent: v.sent, won: v.won, rate: v.sent ? Math.round((v.won / v.sent) * 100) : 0 }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 6),
  };

  const bmfTotal = sheets.find(x => x.key === 'bmf')?.total ?? '0';

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ProspectingView sheets={sheets} instrumentl={instrumentl} bmfTotal={bmfTotal} rowLimit={ROW_LIMIT} />
    </AppShell>
  );
}
