export const dynamic = 'force-dynamic';

import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { FinancialsShell } from '@/components/financials-shell';
import { getAllIntegrations } from '@/lib/oauth-tokens';
import { redirect } from 'next/navigation';

async function getOrgFinancialData(orgCode: string) {
  const db = createServerClient();
  const { data } = await db
    .from('organizations')
    .select('ein, financial_data, financial_year')
    .eq('org_code', orgCode)
    .single();
  return data;
}

export default async function FinancialsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const [integrations, orgData] = await Promise.all([
    getAllIntegrations(ctx.orgCode),
    getOrgFinancialData(ctx.orgCode),
  ]);

  const googleConnected    = integrations.some(i => i.provider === 'google');
  const microsoftConnected = integrations.some(i => i.provider === 'microsoft');

  // Parse stored financial_data (populated by 990 sync in Settings)
  const fd = orgData?.financial_data as {
    computed?: Record<string, unknown>;
    org?: Record<string, unknown>;
    history?: unknown[];
  } | null;

  const financialData = fd?.computed
    ? (fd as unknown as Parameters<typeof FinancialsShell>[0]['financialData'])
    : null;

  const shellProps = {
    orgCode:            ctx.orgCode,
    orgId:              ctx.orgId,
    orgName:            ctx.orgName,
    googleConnected,
    microsoftConnected,
    financialData,
    ein:                orgData?.ein ?? null,
  };

  // CYC gets its own shell with proprietary financial data
  if (ctx.orgCode === 'CYC2026') {
    const { CYCFinancialsShell } = await import('@/components/cyc-financials-shell');
    return (
      <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
        <CYCFinancialsShell key={ctx.orgCode} {...shellProps} />
      </AppShell>
    );
  }

  // YMCA Metro Chicago gets its own shell with 990 data from IRS Form
  if (ctx.orgCode === 'YOM2026') {
    const { YMCAFinancialsShell } = await import('@/components/ymca-financials-shell');
    return (
      <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
        <YMCAFinancialsShell key={ctx.orgCode} {...shellProps} />
      </AppShell>
    );
  }

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <FinancialsShell key={ctx.orgCode} {...shellProps} />
    </AppShell>
  );
}
