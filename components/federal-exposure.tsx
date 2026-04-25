'use client';
import { CYC_PROFILE } from '@/lib/cyc-profile';
import { formatCurrency, getRiskColor } from '@/lib/utils';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { useState } from 'react';

export function FederalExposure() {
  const { federalFunding } = CYC_PROFILE;
  const [hoveredProgram, setHoveredProgram] = useState<string | null>(null);
  const totalBudget = CYC_PROFILE.annualBudget;
  const federalPct = Math.round((federalFunding.total / totalBudget) * 100);
  const criticalAmount = federalFunding.programs
    .filter(p => p.risk === 'critical' || p.risk === 'elevated')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-red-50 border-b border-red-200">
        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-[13px] text-red-800">Federal Funding Risk Alert</span>
          <span className="text-[13px] text-red-600 ml-2">—</span>
          <span className="text-[13px] text-red-600 ml-2">
            {federalPct}% of CYC&apos;s budget depends on federal appropriations currently under threat
          </span>
        </div>
      </div>

      <div className="p-5">
        {/* Top stats */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="text-center p-3 bg-[#f8fafc] rounded-[6px] border border-[#e2e8f0]">
            <div className="text-[22px] font-bold text-[#0f172a]">{formatCurrency(federalFunding.total)}</div>
            <div className="text-[11px] text-[#64748b] mt-0.5">Total Federal Funding</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-[6px] border border-red-200">
            <div className="text-[22px] font-bold text-red-600">{formatCurrency(criticalAmount)}</div>
            <div className="text-[11px] text-[#64748b] mt-0.5">At-Risk (Critical + Elevated)</div>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-[6px] border border-amber-200">
            <div className="text-[22px] font-bold text-amber-600">{federalPct}%</div>
            <div className="text-[11px] text-[#64748b] mt-0.5">Federal Concentration</div>
          </div>
        </div>

        {/* Program breakdown */}
        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-widest mb-3">
          Program-by-Program Risk
        </p>
        <div className="space-y-3">
          {federalFunding.programs.map((program) => {
            const pct = Math.round((program.amount / federalFunding.total) * 100);
            const isHovered = hoveredProgram === program.aln;
            return (
              <div
                key={program.aln}
                className="relative cursor-pointer"
                onMouseEnter={() => setHoveredProgram(program.aln)}
                onMouseLeave={() => setHoveredProgram(null)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#0f172a]">{program.name}</span>
                    <span className="text-[11px] text-[#94a3b8]">ALN {program.aln}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0f172a]">{formatCurrency(program.amount)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${getRiskColor(program.risk)}`}>
                      {program.risk}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      program.risk === 'critical' ? 'bg-red-500' :
                      program.risk === 'elevated' ? 'bg-orange-400' :
                      program.risk === 'moderate' ? 'bg-amber-400' : 'bg-green-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {isHovered && (
                  <div className="absolute z-10 left-0 right-0 mt-1 p-3 bg-[#0f172a] text-white text-[12px] rounded-[6px] shadow-drop">
                    <span className="font-semibold">Why {program.risk}: </span>{program.riskReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-[#f8fafc] rounded-[6px] border border-[#e2e8f0] flex items-start gap-2">
          <TrendingDown className="w-4 h-4 text-[#0d9488] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-[#475569]">
            <span className="font-semibold text-[#0f172a]">Fundir strategy: </span>
            Identify private foundation and state grants to replace at-risk federal revenue.
            Target: $2M in alternative funding within 18 months.
          </p>
        </div>
      </div>
    </div>
  );
}
