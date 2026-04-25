export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { CYC_PROFILE } from '@/lib/cyc-profile';
import { formatCurrency } from '@/lib/utils';
import { CheckCircle, XCircle, Settings } from 'lucide-react';
import { SyncFinancialsButton } from '@/components/sync-financials-button';
import { Org990Search } from '@/components/org-990-search';

async function getLastRun() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('pipeline_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function getOrgFinancialStatus() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('name, ein, financial_year, financial_fetched_at')
    .eq('org_code', 'CYC2025')
    .single();
  return data;
}

async function checkConnections() {
  const checks = {
    supabase: false,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    grantsGov: false,
  };
  try {
    const res = await fetch('https://apply07.grants.gov/v1/api/search2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: 1, oppStatuses: 'posted' }),
      signal: AbortSignal.timeout(5000),
    });
    checks.grantsGov = res.ok;
  } catch { /* noop */ }
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('grant_opportunities').select('id').limit(1);
    checks.supabase = !error;
  } catch { /* noop */ }
  return checks;
}

export default async function SettingsPage() {
  const [lastRun, connections, orgFinancial] = await Promise.all([
    getLastRun(),
    checkConnections(),
    getOrgFinancialStatus(),
  ]);

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-4 h-4 text-[#0d9488]" />
          <h1 className="text-[22px] font-bold text-[#0f172a]">Settings</h1>
        </div>
        <p className="text-[13px] text-[#64748b] mb-6">System configuration and connection status</p>

        <div className="space-y-4">
          {/* Connections */}
          <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[13px] font-semibold text-[#0f172a]">API Connections</h2>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {[
                { name: 'Supabase Database',   ok: connections.supabase },
                { name: 'Anthropic Claude API', ok: connections.anthropic },
                { name: 'OpenAI Embeddings',    ok: connections.openai },
                { name: 'Grants.gov API',       ok: connections.grantsGov },
                { name: 'ProPublica 990 API',   ok: true }, // free, always available
              ].map(({ name, ok }) => (
                <div key={name} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] text-[#0f172a]">{name}</span>
                  <div className="flex items-center gap-2">
                    {ok
                      ? <CheckCircle className="w-4 h-4 text-[#16a34a]" />
                      : <XCircle className="w-4 h-4 text-red-400" />}
                    <span className={`text-[12px] font-medium ${ok ? 'text-[#16a34a]' : 'text-[#94a3b8]'}`}>
                      {ok
                        ? name === 'ProPublica 990 API' ? 'Free · No key required'
                        : name === 'Grants.gov API'     ? 'No key required'
                        : 'Connected'
                        : 'Not configured'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 990 Financial Sync */}
          <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div>
                <h2 className="text-[13px] font-semibold text-[#0f172a]">IRS Form 990 Financial Sync</h2>
                <p className="text-[11px] text-[#64748b] mt-0.5">
                  Pulls 990 data from ProPublica Nonprofit Explorer · auto-matched by EIN
                </p>
              </div>
              {orgFinancial?.financial_fetched_at && (
                <span className="text-[11px] text-[#94a3b8]">
                  Last synced: {new Date(orgFinancial.financial_fetched_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="p-5 space-y-5">
              {/* Name search */}
              <Org990Search orgCode="CYC2025" />

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#f1f5f9]" />
                <span className="text-[11px] text-[#94a3b8] font-medium">or sync by EIN on file</span>
                <div className="flex-1 h-px bg-[#f1f5f9]" />
              </div>

              {/* Existing EIN sync */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  {orgFinancial?.ein ? (
                    <>
                      <p className="text-[13px] text-[#0f172a]">
                        <span className="font-medium">{orgFinancial.name}</span>
                        <span className="ml-2 text-[#64748b]">
                          EIN {orgFinancial.ein.replace(/(\d{2})(\d{7})/, '$1-$2')}
                        </span>
                      </p>
                      {orgFinancial.financial_year ? (
                        <p className="text-[12px] text-[#16a34a]">
                          ✓ FY{orgFinancial.financial_year} data loaded
                        </p>
                      ) : (
                        <p className="text-[12px] text-amber-600">
                          EIN on file — click Sync to fetch 990 data
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-[#64748b]">
                      No EIN on file — use the search above to find your organization.
                    </p>
                  )}
                </div>
                <SyncFinancialsButton orgCode="CYC2025" disabled={!orgFinancial?.ein} />
              </div>
            </div>
          </div>

          {/* Last run */}
          {lastRun && (
            <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
                <h2 className="text-[13px] font-semibold text-[#0f172a]">Last Pipeline Run</h2>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Discovered',      value: lastRun.grants_discovered },
                    { label: 'New Grants',       value: lastRun.grants_new },
                    { label: 'High Matches',     value: lastRun.high_matches },
                    { label: 'Medium Matches',   value: lastRun.medium_matches },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-[#f8fafc] rounded-[6px] border border-[#e2e8f0] text-center">
                      <div className="text-[24px] font-bold text-[#0f172a]">{value}</div>
                      <div className="text-[11px] text-[#64748b] mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[#94a3b8] mt-3">
                  Run at: {new Date(lastRun.started_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Org profile */}
          <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <h2 className="text-[13px] font-semibold text-[#0f172a]">Organization Profile</h2>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {[
                { label: 'Organization',    value: CYC_PROFILE.name },
                { label: 'EIN',             value: CYC_PROFILE.ein },
                { label: 'Entity Type',     value: CYC_PROFILE.entityType },
                { label: 'Location',        value: `${CYC_PROFILE.city}, ${CYC_PROFILE.state}` },
                { label: 'Sites',           value: `${CYC_PROFILE.sites} locations` },
                { label: 'Annual Budget',   value: formatCurrency(CYC_PROFILE.annualBudget) },
                { label: 'GATA Registered', value: CYC_PROFILE.gataRegistered ? 'Yes' : 'No' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-[12px] text-[#64748b] w-40">{label}</span>
                  <span className="text-[13px] font-medium text-[#0f172a]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
