export const dynamic = 'force-dynamic';

import { AppShell } from '@/components/app-shell';
import { getAuthContext } from '@/lib/auth-context';
import { getScoredFoundations } from '@/lib/foundation-intelligence';
import { FoundationsGrid } from '@/components/foundations-grid';
import { redirect } from 'next/navigation';
import { Sparkles, Info, Globe, CheckCircle } from 'lucide-react';

function formatCompact(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function FoundationsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const foundations  = getScoredFoundations();
  const topMatches   = foundations.filter(f => f.fitScore >= 70);
  const localFunders = foundations.filter(f =>
    f.geographicFocus.some(g => g.toLowerCase().includes('chicago') || g.toLowerCase().includes('illinois'))
  );
  const totalPotential = foundations.slice(0, 10).reduce((s, f) => s + f.avgGrantAmount, 0);

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      {/* ── Light hero on canvas ─────────────────────────────── */}
      <div className="bg-canvas-0 border-b border-canvas-3">
        <div className="px-4 sm:px-6 md:px-8 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-sm bg-action-soft text-action flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="text-eyebrow font-semibold text-action uppercase tracking-wider">
              Fundir exclusive · Foundation intelligence
            </span>
          </div>
          <h1 className="text-h1 font-semibold text-ink-0 leading-tight">
            Private foundation funding map
          </h1>
          <p className="text-body text-ink-1 mt-1 max-w-2xl">
            {foundations.length} foundations scored against {ctx.orgName}&apos;s mission and financials —
            surfacing funders that never appear on Grants.gov. Click any funder for its live IRS
            990 filing history.
          </p>

          {/* Inline metric strip — matches the dashboard rhythm */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 mt-4 text-caption text-ink-2">
            <span>
              Foundations
              <strong className="text-h2 font-semibold text-ink-0 tabular-nums ml-1">{foundations.length}</strong>
            </span>
            <span>
              Strong fits
              <strong className="text-h2 font-semibold text-signal-pursue tabular-nums ml-1">{topMatches.length}</strong>
              <span className="text-eyebrow ml-1">· ≥70 score</span>
            </span>
            <span>
              Local funders
              <strong className="text-h2 font-semibold text-ink-0 tabular-nums ml-1">{localFunders.length}</strong>
              <span className="text-eyebrow ml-1">· Chicago/IL</span>
            </span>
            <span>
              Top-10 potential
              <strong className="text-h2 font-semibold text-ink-0 tabular-nums ml-1">{formatCompact(totalPotential)}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto space-y-6">

        {/* ── How this works ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <Info className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[#0f172a] mb-1">
                Why this beats every other grant platform
              </h2>
              <p className="text-[13px] text-[#475569] leading-relaxed mb-3">
                Grants.gov only lists federal grants. The majority of nonprofit funding — especially for community-based organizations like yours —
                comes from <strong>private foundations</strong> that publish zero RFPs and are invisible to conventional grant searches.
                Fundir reads IRS Form 990 filings directly to reverse-engineer which foundations are actively funding
                missions like yours, what they typically award, and how to reach them.
              </p>
              <div className="flex flex-wrap gap-4 text-[12px]">
                {[
                  { label: 'Free data — IRS 990 via ProPublica',         color: '#16a34a' },
                  { label: 'Live multi-year filing history per funder',  color: '#16a34a' },
                  { label: 'Scored against your org\'s 990 profile',      color: '#16a34a' },
                  { label: 'Local funders you\'ve never heard of',        color: '#16a34a' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                    <span className="text-[#475569]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Top Matches ────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-bold text-[#0f172a]">Strongest Foundation Fits</h2>
              <p className="text-[12px] text-[#64748b] mt-0.5">
                Ranked by mission alignment against {ctx.orgName}&apos;s programs and geography — click for live 990 data
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#94a3b8]">
              <Globe className="w-3.5 h-3.5" />
              Data: IRS 990 · ProPublica Nonprofit Explorer
            </div>
          </div>

          <FoundationsGrid foundations={foundations.slice(0, 12)} />
        </div>

        {/* ── Intelligence note ──────────────────────────────── */}
        <div className="rounded-xl border border-[#6366f1]/20 p-5"
          style={{ background: 'linear-gradient(135deg, #faf5ff, #f5f3ff)' }}>
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#6366f1] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-[13px] font-bold text-[#0f172a] mb-1">Coming Next: 990 Grant Schedule Extraction</h3>
              <p className="text-[12px] text-[#6b21a8] leading-relaxed">
                Live filing history is now available on every funder card. Next, Fundir will parse the actual
                grant schedules from 990 Part XV to surface which foundations have funded peer organizations
                like After School Matters, Youth Guidance, and Chicago CRED — then alert you when they&apos;re
                likely to make similar grants to {ctx.orgName}.
              </p>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
