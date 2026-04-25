'use client';
import { ScoreBreakdown } from '@/types';

interface ScoreBreakdownProps {
  score: ScoreBreakdown;
}

const FACTORS = [
  { key: 'semantic',      label: 'Program Match',        weight: '35%', color: '#0d9488', desc: 'Semantic similarity between grant focus and org mission' },
  { key: 'financial_990', label: '990 Financial Fit',    weight: '25%', color: '#2563eb', desc: 'Budget size, reserves, diversification, and org scale from IRS 990' },
  { key: 'eligibility',   label: 'Eligibility',          weight: '20%', color: '#7c3aed', desc: 'Entity type, geography, population, and compliance requirements' },
  { key: 'historical',    label: 'Historical Win Rate',  weight: '15%', color: '#d97706', desc: 'Past award rate from this agency or ALN program' },
  { key: 'strategic',     label: 'Strategic Fit',        weight: '5%',  color: '#64748b', desc: 'Program area overlap and award size calibration' },
];

export function ScoreBreakdownChart({ score }: ScoreBreakdownProps) {
  const isHigh   = score.composite >= 70;
  const isMedium = score.composite >= 40;

  const scoreColor  = isHigh ? '#16a34a' : isMedium ? '#d97706' : '#dc2626';
  const scoreBg     = isHigh ? '#f0fdf4' : isMedium ? '#fffbeb' : '#fef2f2';
  const scoreBorder = isHigh ? '#bbf7d0' : isMedium ? '#fde68a' : '#fecaca';
  const scoreLabel  = isHigh ? 'Strong Match' : isMedium ? 'Moderate Match' : 'Low Match';

  return (
    <div>
      {/* Composite score */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-lg border" style={{ background: scoreBg, borderColor: scoreBorder }}>
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-[22px] font-bold flex-shrink-0 border-2"
          style={{ color: scoreColor, borderColor: scoreBorder, background: '#ffffff' }}
        >
          {score.composite.toFixed(0)}
        </div>
        <div>
          <p className="text-[15px] font-bold" style={{ color: scoreColor }}>{scoreLabel}</p>
          <p className="text-[12px] text-[#64748b] mt-0.5">Composite match score / 100</p>
        </div>
      </div>

      {/* Factor bars */}
      <div className="space-y-4">
        {FACTORS.map((factor) => {
          const raw = (score as unknown as Record<string, number>)[factor.key];
          const value = Math.round(raw ?? 0);
          const barColor = value >= 70 ? factor.color : value >= 40 ? factor.color + 'bb' : '#e2e8f0';
          return (
            <div key={factor.key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[#0f172a]">{factor.label}</span>
                  <span className="text-[11px] text-[#94a3b8] font-mono">{factor.weight}</span>
                </div>
                <span
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: value >= 70 ? factor.color : value >= 40 ? '#d97706' : '#dc2626' }}
                >
                  {value}
                </span>
              </div>
              <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${value}%`, background: value >= 40 ? factor.color : '#fca5a5' }}
                />
              </div>
              <p className="text-[10px] text-[#94a3b8] mt-1">{factor.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
