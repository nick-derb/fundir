export const dynamic = 'force-dynamic';

import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { CYC_PROFILE } from '@/lib/cyc-profile';
import { CYC_INCOME_STATEMENT, CYC_LIQUIDITY, CYC_BOARD, CYC_IMPACT } from '@/lib/cyc-live-data';
import { OrgProfileView, type OrgFacet, type OrgKpi } from '@/components/org-profile/org-profile-view';

const M = (n: number) => '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
const exact = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US');
type St = 'confirmed' | 'pending' | 'corrected';
const row = (name: string, scope: string, value: string, period: string, source: string, state: St = 'confirmed') =>
  ({ name, scope, value, period, source, state });

export default async function OrgProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const db = createServerClient();
  const boardRes = await db.from('funder_board_members').select('foundation_name', { count: 'exact', head: false }).eq('org_id', ctx.orgId);
  const boardCount = boardRes.count ?? (boardRes.data?.length ?? 0);
  const foundations = new Set((boardRes.data ?? []).map(b => (b.foundation_name ?? '').toLowerCase().trim()).filter(Boolean)).size;

  const inc = CYC_INCOME_STATEMENT;
  const fed = CYC_PROFILE.federalFunding;

  const facets: OrgFacet[] = [
    {
      key: 'programs', label: 'Programs', title: 'Programs', blurb: 'What CYC runs, from its own profile and narratives.',
      rows: CYC_PROFILE.programs.map(p => row(p.name, p.areas.slice(0, 3).join(', '), p.ages, 'Current', 'CYC profile')),
    },
    {
      key: 'financials', label: 'Financials', title: 'Financials', blurb: 'Read from the audited FY2025 statements.',
      rows: [
        row('Total revenue', 'Organization-wide', M(inc.revenue.totalRevenue), 'FY25', 'Audited financials'),
        row('Government fees & grants', 'Direct program revenue', M(inc.revenue.governmentFeesGrants), 'FY25', 'Audited financials'),
        row('Total public support', 'Contributions + events', M(inc.revenue.totalPublicSupport), 'FY25', 'Audited financials'),
        row('Program service expenses', 'Organization-wide', M(inc.expenses.totalProgramServices), 'FY25', 'Audited financials'),
        row('Management & general', 'Supporting services', M(inc.expenses.managementGeneral), 'FY25', 'Audited financials'),
        row('Net operating result', 'FY25 vs prior surplus', exact(inc.netChange), 'FY25', 'Audited financials', 'pending'),
        row('Net unrestricted liquidity', '~2.4 months of expenses', M(CYC_LIQUIDITY.netUnrestrictedLiquidity), 'FY25', 'Audited · Note 2'),
        row('Board-sourced revenue', '6.8% of total revenue', exact(CYC_BOARD.boardGivingFY2025.totalBoardSourced), 'FY25', 'Board records'),
      ],
    },
    {
      key: 'federal', label: 'Federal funding', title: 'Federal funding', blurb: 'Government awards by program, with exposure flags.',
      rows: fed.programs.map(p => row(p.name, `ALN ${p.aln} · ${p.risk} risk`, exact(p.amount), 'Current', 'Federal awards', p.risk === 'critical' ? 'pending' : 'confirmed')),
    },
    {
      key: 'impact', label: 'Impact', title: 'Impact & outcomes', blurb: 'Youth served and outcome rates from the impact report.',
      rows: [
        row('Youth served', 'Organization-wide', CYC_IMPACT.youthServedTotal.toLocaleString('en-US'), CYC_IMPACT.reportingYear, 'Impact report'),
        row('Early Learning participants', 'Ages 15mo–5', CYC_IMPACT.earlyLearningParticipants.toLocaleString('en-US'), CYC_IMPACT.reportingYear, 'Impact report'),
        row('Out-of-School Time participants', 'Grades K–8', CYC_IMPACT.ostParticipants.toLocaleString('en-US'), CYC_IMPACT.reportingYear, 'Impact report'),
        row('Teen participants', 'Ages 14–18', CYC_IMPACT.teenParticipants.toLocaleString('en-US'), CYC_IMPACT.reportingYear, 'Impact report'),
        row('Met/exceeded literacy goals', 'Early Learning', '82%', CYC_IMPACT.reportingYear, 'Impact report'),
        row('Advanced to next grade level', 'Ages 3–5', '100%', CYC_IMPACT.reportingYear, 'Impact report'),
        row('Plan to attend college', 'Out-of-School Time', '92%', CYC_IMPACT.reportingYear, 'Impact report'),
        row('Charity Navigator rating', 'Overall', `${CYC_IMPACT.charityNavigatorRating}★`, 'Current', 'Charity Navigator'),
      ],
    },
    {
      key: 'board', label: 'Board & network', title: 'Board & network', blurb: 'Governance and the funder-board connections CYC is tracking.',
      rows: [
        row('Board members', 'Governing board', String(CYC_BOARD.totalMembers), 'Current', 'Board roster'),
        row('Board chair', 'Officer', CYC_BOARD.chair, 'Current', 'Board roster'),
        row('Board-sourced revenue', 'Direct + affiliated', exact(CYC_BOARD.boardGivingFY2025.totalBoardSourced), 'FY25', 'Board records'),
        row('Funder board members tracked', 'Prospect network', String(boardCount), 'Current', 'funder_board_members'),
        row('Foundations with a board contact', 'Prospect network', String(foundations), 'Current', 'funder_board_members'),
        row('Auxiliary board', 'Young professionals', '~40', 'Current', 'Board records'),
      ],
    },
  ];

  const kpis: OrgKpi[] = [
    { label: 'Programs', value: String(CYC_PROFILE.programs.length) },
    { label: 'Annual revenue', value: M(inc.revenue.totalRevenue) },
    { label: 'Youth served', value: CYC_IMPACT.youthServedTotal.toLocaleString('en-US') },
    { label: 'Board members', value: String(CYC_BOARD.totalMembers) },
  ];

  const gaps = [
    `FY25 closed at a ${exact(inc.netChange)} operating deficit — revenue fell ~10% as one-time gifts did not repeat.`,
    'Government contracts are ~74.6% of revenue; Head Start alone drives ~61%. Private foundation revenue is the diversification lever.',
    'Net liquidity is ~2.4 months of expenses, below the 3-month benchmark.',
  ];

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <OrgProfileView ein={CYC_PROFILE.ein} facets={facets} kpis={kpis} gaps={gaps} />
    </AppShell>
  );
}
