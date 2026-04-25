import { TrendingUp, Target, Clock, Layers } from 'lucide-react';

interface PipelineSummaryProps {
  totalTracked: number;
  highMatches: number;
  mediumMatches: number;
  upcomingDeadlines: number;
}

export function PipelineSummary({ totalTracked, highMatches, mediumMatches, upcomingDeadlines }: PipelineSummaryProps) {
  const cards = [
    { label: 'Total Tracked', value: totalTracked, icon: Layers, color: '#2563eb', bg: '#eff6ff' },
    { label: 'High Match ≥70', value: highMatches, icon: Target, color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Medium Match', value: mediumMatches, icon: TrendingUp, color: '#d97706', bg: '#fffbeb' },
    { label: 'Deadlines <30d', value: upcomingDeadlines, icon: Clock, color: '#dc2626', bg: '#fef2f2' },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="bg-white rounded-lg border border-[#e2e8f0] p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[#64748b]">{label}</span>
            <div className="w-7 h-7 rounded-[6px] flex items-center justify-center" style={{ background: bg }}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
          </div>
          <div className="text-[28px] font-bold leading-none" style={{ color }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
