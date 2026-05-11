export const dynamic = 'force-dynamic';

import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import {
  CheckCircle, XCircle, Settings, Database, Cpu,
  Globe, Shield, RefreshCw, Building2, AlertTriangle,
  Info, Zap, Activity,
} from 'lucide-react';
import { SyncFinancialsButton } from '@/components/sync-financials-button';
import { Org990Search } from '@/components/org-990-search';
import { IntegrationConnector } from '@/components/integration-connector';
import { getAllIntegrations } from '@/lib/oauth-tokens';

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

async function getOrgFinancialStatus(orgCode: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('name, ein, financial_year, financial_fetched_at')
    .eq('org_code', orgCode)
    .single();
  return data;
}

async function checkConnections() {
  const checks = {
    supabase:  false,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai:    !!process.env.OPENAI_API_KEY,
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
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const [lastRun, connections, orgFinancial, integrations] = await Promise.all([
    getLastRun(),
    checkConnections(),
    getOrgFinancialStatus(ctx.orgCode),
    getAllIntegrations(ctx.orgCode),
  ]);

  const googleConnected    = integrations.some(i => i.provider === 'google');
  const microsoftConnected = integrations.some(i => i.provider === 'microsoft');
  const googleEmail        = integrations.find(i => i.provider === 'google')?.user_email;
  const microsoftEmail     = integrations.find(i => i.provider === 'microsoft')?.user_email;

  const allConnected   = connections.supabase && connections.anthropic && connections.openai && connections.grantsGov;
  const connectedCount = Object.values(connections).filter(Boolean).length;

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >

      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b" style={{
        background: 'var(--fin-hero-bg)',
        borderColor: 'var(--fin-border)',
      }}>
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 left-1/4 w-96 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

        <div className="relative px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Settings className="w-3.5 h-3.5 text-[#0d9488]" />
                <span className="text-[10px] font-bold text-[#0d9488] uppercase tracking-widest">System Configuration</span>
              </div>
              <h1 className="text-[26px] font-bold leading-tight" style={{ color: 'var(--fin-heading)' }}>Settings</h1>
              <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                Fundir · {ctx.orgName} · v2.0
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border ${
                allConnected
                  ? 'text-[#16a34a] bg-[#16a34a]/10 border-[#16a34a]/20'
                  : 'text-[#d97706] bg-[#d97706]/10 border-[#d97706]/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${allConnected ? 'bg-[#16a34a] animate-pulse' : 'bg-[#d97706]'}`} />
                {connectedCount}/4 services online
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-8 py-6 max-w-4xl mx-auto space-y-5">

        {/* System status banner if degraded */}
        {!allConnected && (
          <div className="flex items-start gap-3 p-4 rounded-[10px] bg-[#fffbeb] border border-[#fde68a]">
            <AlertTriangle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-[#92400e]">Some services are not configured</p>
              <p className="text-[12px] text-[#78350f] mt-0.5">
                AI matching requires Anthropic API key. Embedding requires OpenAI key. Add these in your Vercel environment variables.
              </p>
            </div>
          </div>
        )}

        {/* ── Cloud Integrations ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
            <div className="w-7 h-7 bg-[#f0fdfa] rounded-[6px] flex items-center justify-center">
              <Database className="w-3.5 h-3.5 text-[#0d9488]" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[#0f172a]">Cloud Storage & Documents</h2>
              <p className="text-[11px] text-[#64748b]">
                Import financials, manage grant documents · Google Drive and OneDrive
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={
                googleConnected || microsoftConnected
                  ? { background: '#f0fdf4', color: '#16a34a' }
                  : { background: '#f8fafc', color: '#94a3b8' }
              }>
              <span className={`w-1.5 h-1.5 rounded-full ${googleConnected || microsoftConnected ? 'bg-[#16a34a] animate-pulse' : 'bg-[#cbd5e1]'}`} />
              {[googleConnected, microsoftConnected].filter(Boolean).length}/2 connected
            </div>
          </div>
          <IntegrationConnector
            orgCode={ctx.orgCode}
            status={{
              google:    { connected: googleConnected,    email: googleEmail },
              microsoft: { connected: microsoftConnected, email: microsoftEmail },
            }}
          />
          <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc]">
            <p className="text-[11px] text-[#94a3b8]">
              Once connected, import financial spreadsheets for AI analysis on the{' '}
              <a href="/financials" className="text-[#0d9488] hover:underline">Financials page</a>,
              and manage grant documents from any grant detail page under the Documents tab.
            </p>
          </div>
        </div>

        {/* ── API Connections ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#f0fdfa] rounded-[6px] flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-[#0d9488]" />
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-[#0f172a]">API Connections</h2>
                <p className="text-[11px] text-[#64748b]">{connectedCount} of 4 services connected</p>
              </div>
            </div>
            <div className="h-1.5 w-32 bg-[#f1f5f9] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#0d9488]" style={{ width: `${(connectedCount / 4) * 100}%` }} />
            </div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {[
              {
                name:  'Supabase',
                desc:  'PostgreSQL database · match results, grant data, org profile',
                ok:    connections.supabase,
                icon:  Database,
                color: '#3ecf8e',
                env:   'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
              },
              {
                name:  'Anthropic Claude',
                desc:  'AI extraction · grant scoring · relevance analysis',
                ok:    connections.anthropic,
                icon:  Cpu,
                color: '#f97316',
                env:   'ANTHROPIC_API_KEY',
              },
              {
                name:  'OpenAI Embeddings',
                desc:  'Semantic matching · cosine similarity scoring',
                ok:    connections.openai,
                icon:  Zap,
                color: '#10a37f',
                env:   'OPENAI_API_KEY',
              },
              {
                name:  'Grants.gov',
                desc:  'Federal grant discovery · live opportunity feed · no key required',
                ok:    connections.grantsGov,
                icon:  Globe,
                color: '#2563eb',
                env:   'No key required',
              },
              {
                name:  'ProPublica 990 API',
                desc:  'IRS Form 990 financial data · free · no key required',
                ok:    true,
                icon:  Shield,
                color: '#7c3aed',
                env:   'No key required',
              },
            ].map(({ name, desc, ok, icon: Icon, color, env }) => (
              <div key={name} className="flex items-center justify-between px-5 py-4 hover:bg-[#f8fafc] transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[6px] flex items-center justify-center flex-shrink-0"
                    style={{ background: color + '15' }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#0f172a]">{name}</p>
                    <p className="text-[11px] text-[#64748b]">{desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[#94a3b8] font-mono hidden group-hover:block">{env}</span>
                  {ok
                    ? <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#16a34a]">
                        <CheckCircle className="w-4 h-4" />
                        Connected
                      </div>
                    : <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#94a3b8]">
                        <XCircle className="w-4 h-4" />
                        Not configured
                      </div>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 990 Financial Sync ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#f0fdfa] rounded-[6px] flex items-center justify-center">
                <RefreshCw className="w-3.5 h-3.5 text-[#0d9488]" />
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-[#0f172a]">IRS Form 990 Financial Sync</h2>
                <p className="text-[11px] text-[#64748b]">ProPublica Nonprofit Explorer · auto-matched by EIN</p>
              </div>
            </div>
            {orgFinancial?.financial_fetched_at && (
              <div className="text-right">
                <p className="text-[10px] text-[#94a3b8]">Last synced</p>
                <p className="text-[12px] font-semibold text-[#0f172a]">
                  {new Date(orgFinancial.financial_fetched_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="p-5 space-y-5">
            <div className="flex items-start gap-3 p-3 rounded-[8px] bg-[#f0f9ff] border border-[#bae6fd]">
              <Info className="w-3.5 h-3.5 text-[#0284c7] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#0369a1] leading-relaxed">
                Sync pulls the latest IRS Form 990 data for your organization from ProPublica. This powers the
                financial eligibility signals used in grant matching. If your 990 is recent, sync now to improve
                match accuracy.
              </p>
            </div>

            <Org990Search orgCode={ctx.orgCode} />

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#f1f5f9]" />
              <span className="text-[11px] text-[#94a3b8] font-medium">or sync by EIN on file</span>
              <div className="flex-1 h-px bg-[#f1f5f9]" />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                {orgFinancial?.ein ? (
                  <>
                    <p className="text-[13px] text-[#0f172a]">
                      <span className="font-semibold">{orgFinancial.name}</span>
                      <span className="ml-2 font-mono text-[#64748b] text-[12px]">
                        EIN {orgFinancial.ein.replace(/(\d{2})(\d{7})/, '$1-$2')}
                      </span>
                    </p>
                    {orgFinancial.financial_year ? (
                      <p className="text-[12px] text-[#16a34a] flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        FY{orgFinancial.financial_year} data loaded
                      </p>
                    ) : (
                      <p className="text-[12px] text-amber-600">EIN on file — click Sync to fetch 990 data</p>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-[#64748b]">No EIN on file — use the search above.</p>
                )}
              </div>
              <SyncFinancialsButton orgCode={ctx.orgCode} disabled={!orgFinancial?.ein} />
            </div>
          </div>
        </div>

        {/* ── Last Pipeline Run ── */}
        {lastRun && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#f0fdfa] rounded-[6px] flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-[#0d9488]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-[#0f172a]">Last Discovery Run</h2>
                  <p className="text-[11px] text-[#64748b]">
                    {new Date(lastRun.started_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {lastRun.duration_seconds != null && ` · ${lastRun.duration_seconds}s`}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] rounded-full">
                Completed
              </span>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Grants Scanned', value: lastRun.grants_discovered, color: '#64748b' },
                { label: 'New Stored',     value: lastRun.grants_new,        color: '#0d9488' },
                { label: 'High Match',     value: lastRun.high_matches,      color: '#16a34a' },
                { label: 'Medium Match',   value: lastRun.medium_matches,    color: '#d97706' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-4 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9] text-center">
                  <div className="text-[28px] font-bold tabular-nums" style={{ color }}>{value}</div>
                  <div className="text-[11px] text-[#64748b] mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Organization Profile ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
            <div className="w-7 h-7 bg-[#f0fdfa] rounded-[6px] flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-[#0d9488]" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[#0f172a]">Organization Profile</h2>
              <p className="text-[11px] text-[#64748b]">Grant matching configuration · read-only</p>
            </div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {[
              { label: 'Organization', value: orgFinancial?.name ?? ctx.orgName },
              { label: 'Org Code',     value: ctx.orgCode, mono: true },
              ...(orgFinancial?.ein ? [{ label: 'EIN', value: orgFinancial.ein.replace(/(\d{2})(\d{7})/, '$1-$2'), mono: true }] : []),
              { label: 'Entity Type',  value: '501(c)(3)' },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3 hover:bg-[#f8fafc] transition-colors">
                <span className="text-[12px] text-[#64748b] w-44 flex-shrink-0">{label}</span>
                <span className={`text-[13px] font-semibold text-[#0f172a] ${mono ? 'font-mono' : ''}`}>{value}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc]">
            <p className="text-[11px] text-[#94a3b8]">
              Extended profile fields (mission, programs, budget) are used by the AI matching engine and
              are configured per-organization. Contact your Fundir administrator to update matching parameters.
            </p>
          </div>
        </div>

        {/* ── Matching Configuration ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
            <div className="w-7 h-7 bg-[#eff6ff] rounded-[6px] flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-[#2563eb]" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[#0f172a]">AI Matching Configuration</h2>
              <p className="text-[11px] text-[#64748b]">Score weights and exclusion rules</p>
            </div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {[
              { label: 'Minimum Store Score',  value: '32 / 100',     desc: 'Grants below this are discarded' },
              { label: 'Semantic Weight',      value: '40%',           desc: 'Embedding similarity' },
              { label: 'Eligibility Weight',   value: '22%',           desc: 'Org-type and geographic fit' },
              { label: 'Financial Weight',     value: '20%',           desc: '990 health signals' },
              { label: 'Strategic Weight',     value: '12%',           desc: 'Mission keyword alignment' },
              { label: 'Historical Weight',    value: '6%',            desc: 'Award track record' },
              { label: 'Hard Exclusions',      value: 'Active',        desc: 'International, defense, foreign-aid' },
              { label: 'Discovery Searches',   value: '11 targeted',   desc: 'Youth, STEM, afterschool, violence prevention…' },
            ].map(({ label, value, desc }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3 hover:bg-[#f8fafc] transition-colors">
                <div>
                  <p className="text-[12px] font-semibold text-[#0f172a]">{label}</p>
                  <p className="text-[11px] text-[#94a3b8]">{desc}</p>
                </div>
                <span className="text-[13px] font-bold text-[#0d9488] font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
