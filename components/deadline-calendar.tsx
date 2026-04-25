'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalendarGrant {
  grant_id: string;
  match_id: string;
  title: string;
  close_date: string; // ISO date string
  composite_score: number;
  pipeline_stage: string;
  agency_name: string;
}

interface DeadlineCalendarProps {
  grants: CalendarGrant[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function scoreColor(score: number): string {
  return score >= 75 ? '#16a34a' : score >= 60 ? '#0d9488' : score >= 40 ? '#d97706' : '#dc2626';
}

function scoreBg(score: number): string {
  return score >= 75 ? '#f0fdf4' : score >= 60 ? '#f0fdfa' : score >= 40 ? '#fffbeb' : '#fef2f2';
}

const STAGE_DOT: Record<string, string> = {
  discovered: '#94a3b8', reviewing: '#2563eb', preparing: '#7c3aed',
  drafting: '#c2410c', submitted: '#0d9488', awarded: '#16a34a', rejected: '#dc2626',
};

export function DeadlineCalendar({ grants }: DeadlineCalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [hoveredGrant, setHoveredGrant] = useState<string | null>(null);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDow    = new Date(year, month, 1).getDay();      // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells  = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); }
  function goToday()   { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); }

  // Index grants by YYYY-MM-DD
  const byDate: Record<string, CalendarGrant[]> = {};
  for (const g of grants) {
    const key = g.close_date.slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(g);
  }

  // Sidebar: grants this month
  const thisMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const thisMonth = grants
    .filter(g => g.close_date.startsWith(thisMonthKey))
    .sort((a, b) => a.close_date.localeCompare(b.close_date));

  // Upcoming overall (next 30d)
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const urgentGrants = grants
    .filter(g => {
      const d = new Date(g.close_date);
      return d >= today && d <= in30 && !['rejected','awarded'].includes(g.pipeline_stage);
    })
    .sort((a,b) => a.close_date.localeCompare(b.close_date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* ── Main calendar ── */}
      <div className="lg:col-span-3 bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#e2e8f0] transition-colors">
              <ChevronLeft className="w-4 h-4 text-[#475569]" />
            </button>
            <h2 className="text-[16px] font-bold text-[#0f172a] min-w-[160px] text-center">
              {MONTHS[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#e2e8f0] transition-colors">
              <ChevronRight className="w-4 h-4 text-[#475569]" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-[12px] font-semibold text-[#0d9488] border border-[#0d9488]/30 rounded-lg hover:bg-[#f0fdfa] transition-colors"
          >
            Today
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[#f1f5f9]">
          {DAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: totalCells }).map((_, i) => {
            const dayNum = i - firstDow + 1;
            const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const dateObj = new Date(year, month, dayNum);
            const isToday = isCurrentMonth &&
              dateObj.getDate() === today.getDate() &&
              dateObj.getMonth() === today.getMonth() &&
              dateObj.getFullYear() === today.getFullYear();

            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayGrants = isCurrentMonth ? (byDate[dateKey] || []) : [];
            const isPast = isCurrentMonth && dateObj < today;

            return (
              <div
                key={i}
                className={`min-h-[100px] border-b border-r border-[#f1f5f9] p-1.5 last:border-r-0 ${
                  !isCurrentMonth ? 'bg-[#fafafa]' : isPast ? 'bg-white' : 'bg-white'
                }`}
              >
                {isCurrentMonth && (
                  <>
                    <div className={`w-6 h-6 flex items-center justify-center text-[12px] font-semibold rounded-full mb-1 ${
                      isToday
                        ? 'bg-[#0d9488] text-white'
                        : isPast ? 'text-[#94a3b8]' : 'text-[#0f172a]'
                    }`}>
                      {dayNum}
                    </div>
                    <div className="space-y-0.5">
                      {dayGrants.slice(0, 2).map(g => (
                        <Link
                          key={g.match_id}
                          href={`/grant/${g.grant_id}`}
                          onMouseEnter={() => setHoveredGrant(g.match_id)}
                          onMouseLeave={() => setHoveredGrant(null)}
                          className="block px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight truncate transition-all hover:opacity-80"
                          style={{
                            background: scoreBg(g.composite_score),
                            color: scoreColor(g.composite_score),
                            outline: hoveredGrant === g.match_id ? `2px solid ${scoreColor(g.composite_score)}` : 'none',
                          }}
                          title={g.title}
                        >
                          {g.title.length > 22 ? g.title.slice(0, 22) + '…' : g.title}
                        </Link>
                      ))}
                      {dayGrants.length > 2 && (
                        <div className="text-[10px] text-[#94a3b8] pl-1">
                          +{dayGrants.length - 2} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center gap-5">
          <span className="text-[11px] text-[#94a3b8] font-medium">Match Score:</span>
          {[
            { label: '75+ Excellent', color: '#16a34a', bg: '#f0fdf4' },
            { label: '60–74 Strong',  color: '#0d9488', bg: '#f0fdfa' },
            { label: '40–59 Moderate',color: '#d97706', bg: '#fffbeb' },
            { label: '<40 Low',        color: '#dc2626', bg: '#fef2f2' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: l.bg, border: `1px solid ${l.color}` }} />
              <span className="text-[10px] text-[#64748b]">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="space-y-4">
        {/* Urgent deadlines */}
        {urgentGrants.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#fef2f2]">
              <p className="text-[12px] font-semibold text-[#dc2626]">Due in 30 days ({urgentGrants.length})</p>
            </div>
            <div className="divide-y divide-[#f8fafc]">
              {urgentGrants.map(g => {
                const days = Math.ceil((new Date(g.close_date).getTime() - today.getTime()) / 86400000);
                return (
                  <Link key={g.match_id} href={`/grant/${g.grant_id}`} className="block px-4 py-2.5 hover:bg-[#f8fafc] transition-colors">
                    <p className="text-[12px] font-semibold text-[#0f172a] line-clamp-1">{g.title}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[10px] text-[#64748b]">{g.agency_name}</p>
                      <span className={`text-[11px] font-bold ${days <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                        {days === 0 ? 'Today' : `${days}d`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* This month's grants */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
            <p className="text-[12px] font-semibold text-[#0f172a]">{MONTHS[month]} Deadlines</p>
            <p className="text-[10px] text-[#94a3b8]">{thisMonth.length} grant{thisMonth.length !== 1 ? 's' : ''}</p>
          </div>
          {thisMonth.length === 0 ? (
            <p className="px-4 py-5 text-[12px] text-[#94a3b8]">No deadlines this month.</p>
          ) : (
            <div className="divide-y divide-[#f8fafc] max-h-96 overflow-y-auto">
              {thisMonth.map(g => {
                const day = new Date(g.close_date).getUTCDate();
                return (
                  <Link key={g.match_id} href={`/grant/${g.grant_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8fafc] transition-colors">
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[12px] font-bold" style={{ background: scoreBg(g.composite_score), color: scoreColor(g.composite_score) }}>
                      {day}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#0f172a] line-clamp-1">{g.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_DOT[g.pipeline_stage] || '#94a3b8' }} />
                        <p className="text-[10px] text-[#94a3b8] capitalize">{g.pipeline_stage}</p>
                        <span className="text-[10px] font-bold" style={{ color: scoreColor(g.composite_score) }}>{g.composite_score.toFixed(0)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
