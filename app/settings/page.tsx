export const dynamic = 'force-dynamic';

/**
 * Settings — operations-console redesign.
 *
 * Same data, same interactive components, same routes — presentation
 * rebuilt against the Phase 2 vocabulary used by Dashboard + Financials:
 * dark hero band, hairline cards, mono tabular numerals, semantic
 * left-borders (no chip fills), table-style rows.
 */

import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import {
  CheckCircle, Settings as SettingsIcon, Database, Cpu,
  RefreshCw, Building2, AlertTriangle,
  Info, Zap, Activity, Sparkles,
} from 'lucide-react';
import { SyncFinancialsButton } from '@/components/sync-financials-button';
import { Org990Search } from '@/components/org-990-search';
import { IntegrationConnector } from '@/components/integration-connector';
import { RefreshExtractionButton } from '@/components/refresh-extraction-button';
import { getAllIntegrations } from '@/lib/oauth-tokens';

// ── Data loaders (unchanged) ──────────────────────────────────────────────────

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
    supabase:   false,
    anthropic:  !!process.env.ANTHROPIC_API_KEY,
    openai:     !!process.env.OPENAI_API_KEY,
    grantsGov:  false,
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const [lastRun, connections, orgFinancial, integrations] = await Promise.all([
    getLastRun(),
    checkConnections(),
    getOrgFinancialStatus(ctx.orgCode),
    getAllIntegrations(ctx.orgCode),
  ]);

  const googleConnected     = integrations.some(i => i.provider === 'google');
  const microsoftConnected  = integrations.some(i => i.provider === 'microsoft');
  const googleEmail         = integrations.find(i => i.provider === 'google')?.user_email;
  const microsoftEmail      = integrations.find(i => i.provider === 'microsoft')?.user_email;

  const totalServices    = 5; // Supabase, Anthropic, OpenAI, Grants.gov, ProPublica (always-on)
  const connectedCount   = (connections.supabase ? 1 : 0)
                         + (connections.anthropic ? 1 : 0)
                         + (connections.openai ? 1 : 0)
                         + (connections.grantsGov ? 1 : 0)
                         + 1; // ProPublica is keyless / always-on
  const allConnected     = connectedCount === totalServices;
  const storageConnected = (googleConnected ? 1 : 0) + (microsoftConnected ? 1 : 0);

  const lastSyncLabel = orgFinancial?.financial_fetched_at
    ? new Date(orgFinancial.financial_fetched_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  const services = [
    { name: 'Supabase',          desc: 'PostgreSQL database · match results, grant data, org profile',  ok: connections.supabase,   env: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' },
    { name: 'Anthropic Claude',  desc: 'AI extraction · grant scoring · relevance analysis',            ok: connections.anthropic,  env: 'ANTHROPIC_API_KEY' },
    { name: 'OpenAI Embeddings', desc: 'Semantic matching · cosine similarity scoring',                 ok: connections.openai,     env: 'OPENAI_API_KEY' },
    { name: 'Grants.gov',        desc: 'Federal grant discovery · live opportunity feed · no key',      ok: connections.grantsGov,  env: 'No key required' },
    { name: 'ProPublica 990 API', desc: 'IRS Form 990 financial data · free · no key required',         ok: true,                    env: 'No key required' },
  ];

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      <div className="bg-page min-h-screen">

        {/* ── Hero ─ dark command band, accent-bright eyebrow ──────────── */}
        <div
          className="text-white rounded-b-2xl"
          style={{ background: 'linear-gradient(135deg, #0C1626 0%, #0B1220 100%)' }}
        >
          <div className="px-8 pt-[30px] pb-[26px] max-w-7xl mx-auto">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SettingsIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent-bright)' }} />
                  <span
                    className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--accent-bright)' }}
                  >
                    System Configuration
                  </span>
                </div>
                <h1 className="text-[30px] font-semibold -tracking-[0.02em] mt-3 leading-tight">
                  Settings
                </h1>
                <p className="text-[13px] mt-2" style={{ color: '#9FB0C8' }}>
                  Fundir · <span className="font-mono" style={{ color: '#C6D3E6' }}>{ctx.orgName}</span> ·{' '}
                  <span className="font-mono tabular-nums" style={{ color: '#C6D3E6' }}>v2.0</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
                <span
                  className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2`}
                  style={{ color: '#9FB0C8' }}
                >
                  <span className={`w-[7px] h-[7px] rounded-full ${allConnected ? 'bg-success' : 'bg-warning'}`} />
                  <span className="tabular-nums">{connectedCount} / {totalServices}</span> services online
                </span>
                <span
                  className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2"
                  style={{ color: '#9FB0C8' }}
                >
                  <span className={`w-[7px] h-[7px] rounded-full ${storageConnected > 0 ? 'bg-accent' : 'bg-ink-300'}`} />
                  <span className="tabular-nums">{storageConnected} / 2</span> storage connected
                </span>
                {lastSyncLabel && (
                  <span
                    className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2"
                    style={{ color: '#9FB0C8' }}
                  >
                    <span className="w-[7px] h-[7px] rounded-full bg-info" />
                    Last sync · <span className="tabular-nums">{lastSyncLabel}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 md:px-8 py-7 max-w-5xl mx-auto space-y-5">

          {/* Degraded warning */}
          {!allConnected && (
            <div className="bg-surface border border-hairline border-l-[3px] border-l-warning rounded-[10px] p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-warning">
                  Some services are not configured
                </p>
                <p className="text-[12px] text-muted mt-1 leading-relaxed">
                  AI matching requires Anthropic API key. Embedding requires OpenAI key. Add these in your Vercel environment variables.
                </p>
              </div>
            </div>
          )}

          {/* ── Cloud Storage & Documents ── */}
          <SectionCard
            eyebrow="Cloud Storage & Documents"
            sub="Import financials, manage grant documents · Google Drive and OneDrive"
            icon={Database}
            right={
              <StatusTag
                ok={storageConnected > 0}
                label={`${storageConnected} / 2 connected`}
                tone={storageConnected === 2 ? 'success' : storageConnected === 1 ? 'accent' : 'neutral'}
              />
            }
          >
            <IntegrationConnector
              orgCode={ctx.orgCode}
              status={{
                google:    { connected: googleConnected,    email: googleEmail },
                microsoft: { connected: microsoftConnected, email: microsoftEmail },
              }}
            />
            <div className="px-5 py-3 border-t border-hairline bg-elevated">
              <p className="text-[11.5px] text-tertiary">
                Once connected, import financial spreadsheets for AI analysis on the{' '}
                <a href="/financials" className="text-accent hover:underline">Financials page</a>,
                and manage grant documents from any grant detail page under the Documents tab.
              </p>
            </div>
          </SectionCard>

          {/* ── API Connections ── */}
          <SectionCard
            eyebrow="API Connections"
            sub={`${connectedCount} of ${totalServices} services connected`}
            icon={Activity}
            right={
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="h-1.5 w-32 bg-ink-100 rounded-md overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-md transition-all"
                    style={{ width: `${(connectedCount / totalServices) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[10.5px] tabular-nums text-secondary">
                  {connectedCount}/{totalServices}
                </span>
              </div>
            }
          >
            <ul className="divide-y divide-hairline">
              {services.map(s => (
                <li
                  key={s.name}
                  className="group px-5 py-3.5 flex items-center gap-4 hover:bg-elevated transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-primary">{s.name}</div>
                    <div className="text-[11.5px] text-secondary truncate">{s.desc}</div>
                  </div>
                  <div className="font-mono text-[10px] text-tertiary tabular-nums hidden md:block opacity-0 group-hover:opacity-100 transition-opacity">
                    {s.env}
                  </div>
                  <div
                    className={`flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] tabular-nums whitespace-nowrap ${
                      s.ok ? 'text-success' : 'text-tertiary'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.ok ? 'bg-success' : 'bg-ink-300'}`} />
                    {s.ok ? 'Connected' : 'Not configured'}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* ── IRS Form 990 Financial Sync ── */}
          <SectionCard
            eyebrow="IRS Form 990 Financial Sync"
            sub="ProPublica Nonprofit Explorer · auto-matched by EIN"
            icon={RefreshCw}
            right={
              lastSyncLabel && (
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-tertiary">Last synced</p>
                  <p className="font-mono text-[12px] font-semibold text-primary tabular-nums">{lastSyncLabel}</p>
                </div>
              )
            }
          >
            <div className="p-5 space-y-5">
              <div className="bg-surface border border-hairline border-l-[3px] border-l-info rounded-[8px] p-3 flex items-start gap-3">
                <Info className="w-3.5 h-3.5 text-info flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-muted leading-relaxed">
                  Sync pulls the latest IRS Form 990 data for your organization from ProPublica. This powers the
                  financial eligibility signals used in grant matching. If your 990 is recent, sync now to improve
                  match accuracy.
                </p>
              </div>

              <Org990Search orgCode={ctx.orgCode} />

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-hairline" />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-tertiary">
                  or sync by EIN on file
                </span>
                <div className="flex-1 h-px bg-hairline" />
              </div>

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1 min-w-0">
                  {orgFinancial?.ein ? (
                    <>
                      <p className="text-[13px] text-primary">
                        <span className="font-semibold">{orgFinancial.name}</span>
                        <span className="ml-2 font-mono tabular-nums text-secondary text-[12px]">
                          EIN {orgFinancial.ein.replace(/(\d{2})(\d{7})/, '$1-$2')}
                        </span>
                      </p>
                      {orgFinancial.financial_year ? (
                        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-success inline-flex items-center gap-1.5">
                          <CheckCircle className="w-3 h-3" />
                          FY<span className="tabular-nums">{orgFinancial.financial_year}</span> data loaded
                        </p>
                      ) : (
                        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-warning inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                          EIN on file · click Sync to fetch
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-tertiary">No EIN on file — use the search above.</p>
                  )}
                </div>
                <SyncFinancialsButton orgCode={ctx.orgCode} disabled={!orgFinancial?.ein} />
              </div>
            </div>
          </SectionCard>

          {/* ── Last Discovery Run ── */}
          {lastRun && (
            <SectionCard
              eyebrow="Last Discovery Run"
              sub={
                <>
                  <span className="font-mono tabular-nums">
                    {new Date(lastRun.started_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {lastRun.duration_seconds != null && (
                    <> · <span className="font-mono tabular-nums">{lastRun.duration_seconds}s</span></>
                  )}
                </>
              }
              icon={Zap}
              right={
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-success inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  Completed
                </span>
              }
            >
              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  { label: 'Grants scanned', value: lastRun.grants_discovered, tone: 'neutral'  as const },
                  { label: 'New stored',     value: lastRun.grants_new,        tone: 'accent'   as const },
                  { label: 'High match',     value: lastRun.high_matches,      tone: 'success'  as const },
                  { label: 'Medium match',   value: lastRun.medium_matches,    tone: 'warning'  as const },
                ]).map(k => (
                  <KpiCard key={k.label} {...k} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── Refresh AI Analysis ── */}
          <SectionCard
            eyebrow="Refresh AI Analysis"
            sub="Re-run extraction on grants discovered before the latest financial-requirements upgrade"
            icon={Sparkles}
            right={<RefreshExtractionButton />}
          >
            <div className="px-5 py-4 text-[11.5px] text-muted leading-relaxed">
              Grants in your pipeline get an updated set of financial-requirements signals — reimbursement risk,
              cost-share affordability, Single Audit triggers, and capacity thresholds — that feed the Reverse-990
              Verdict on each grant detail page. Processed in batches of{' '}
              <span className="font-mono tabular-nums text-primary font-semibold">12</span>{' '}
              to stay within serverless time limits; re-click to continue.
            </div>
          </SectionCard>

          {/* ── Organization Profile ── */}
          <SectionCard
            eyebrow="Organization Profile"
            sub="Grant matching configuration · read-only"
            icon={Building2}
          >
            <ul className="divide-y divide-hairline">
              {[
                { label: 'Organization',    value: orgFinancial?.name ?? ctx.orgName,                          mono: false },
                { label: 'Organization ID', value: ctx.orgCode.replace(/\d{4}$/, ''),                          mono: true  },
                ...(orgFinancial?.ein
                  ? [{ label: 'EIN', value: orgFinancial.ein.replace(/(\d{2})(\d{7})/, '$1-$2'), mono: true  }]
                  : []),
                { label: 'Entity type', value: '501(c)(3)', mono: false },
              ].map(({ label, value, mono }) => (
                <li
                  key={label}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-elevated transition-colors"
                >
                  <span className="text-[12px] text-secondary w-44 flex-shrink-0">{label}</span>
                  <span className={`text-[13px] font-semibold text-primary min-w-0 truncate ${mono ? 'font-mono tabular-nums' : ''}`}>
                    {value}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-hairline bg-elevated">
              <p className="text-[11.5px] text-tertiary">
                Extended profile fields (mission, programs, budget) are used by the AI matching engine and
                are configured per-organization. Contact your Fundir administrator to update matching parameters.
              </p>
            </div>
          </SectionCard>

          {/* ── AI Matching Configuration ── */}
          <SectionCard
            eyebrow="AI Matching Configuration"
            sub="Score weights and exclusion rules"
            icon={Cpu}
          >
            <ul className="divide-y divide-hairline">
              {[
                { label: 'Minimum store score', value: '32 / 100',     desc: 'Grants below this are discarded' },
                { label: 'Semantic weight',     value: '40%',          desc: 'Embedding similarity' },
                { label: 'Eligibility weight',  value: '22%',          desc: 'Org-type and geographic fit' },
                { label: 'Financial weight',    value: '20%',          desc: '990 health signals' },
                { label: 'Strategic weight',    value: '12%',          desc: 'Mission keyword alignment' },
                { label: 'Historical weight',   value: '6%',           desc: 'Award track record' },
                { label: 'Hard exclusions',     value: 'Active',       desc: 'International, defense, foreign-aid' },
                { label: 'Discovery searches',  value: '11 targeted',  desc: 'Youth, STEM, afterschool, violence prevention…' },
              ].map(({ label, value, desc }) => (
                <li
                  key={label}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-elevated transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-primary">{label}</p>
                    <p className="text-[11px] text-tertiary mt-0.5">{desc}</p>
                  </div>
                  <span className="font-mono text-[13px] font-semibold text-accent tabular-nums whitespace-nowrap">
                    {value}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>

        </div>
      </div>
    </AppShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Local presentation primitives (server-renderable)
// ════════════════════════════════════════════════════════════════════════════

interface SectionCardProps {
  eyebrow:  string;
  sub?:     React.ReactNode;
  icon:     React.ComponentType<{ className?: string }>;
  right?:   React.ReactNode;
  children: React.ReactNode;
}

function SectionCard({ eyebrow, sub, icon: Icon, right, children }: SectionCardProps) {
  return (
    <section className="bg-surface border border-hairline rounded-[10px] overflow-hidden">
      <header className="px-5 py-4 border-b border-hairline bg-elevated flex items-center gap-3 flex-wrap">
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-accent-tint">
          <Icon className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary">
            {eyebrow}
          </p>
          {sub && (
            <p className="text-[11.5px] text-tertiary mt-0.5">
              {sub}
            </p>
          )}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </header>
      {children}
    </section>
  );
}

interface StatusTagProps {
  ok:    boolean;
  label: string;
  tone:  'success' | 'accent' | 'warning' | 'neutral';
}
function StatusTag({ ok, label, tone }: StatusTagProps) {
  void ok;
  const cls =
    tone === 'success' ? 'text-success' :
    tone === 'accent'  ? 'text-accent'  :
    tone === 'warning' ? 'text-warning' :
                         'text-tertiary';
  const dot =
    tone === 'success' ? 'bg-success' :
    tone === 'accent'  ? 'bg-accent'  :
    tone === 'warning' ? 'bg-warning' :
                         'bg-ink-300';
  return (
    <span
      className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] tabular-nums inline-flex items-center gap-1.5 ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

interface KpiCardProps {
  label: string;
  value: number | string;
  tone:  'neutral' | 'accent' | 'success' | 'warning' | 'critical';
}
function KpiCard({ label, value, tone }: KpiCardProps) {
  const border =
    tone === 'accent'   ? 'border-l-accent'   :
    tone === 'success'  ? 'border-l-success'  :
    tone === 'warning'  ? 'border-l-warning'  :
    tone === 'critical' ? 'border-l-critical' :
                          'border-l-ink-300';
  return (
    <div className={`bg-surface border border-hairline border-l-[3px] ${border} rounded-sm px-4 py-3`}>
      <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary">
        {label}
      </p>
      <p className="font-mono text-kpi tabular-nums text-primary mt-1.5 leading-none">
        {value ?? 0}
      </p>
    </div>
  );
}
