'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Search, KanbanSquare, Settings, LogOut,
  ChevronDown, Bell, Zap, BarChart3, CalendarDays, TrendingUp, Building2,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette';

const navGroups = [
  {
    label: 'Intelligence',
    items: [
      { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
      { href: '/discover',    label: 'Discover',    icon: Search },
      { href: '/financials',  label: 'Financials',  icon: BarChart3 },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/pipeline', label: 'Pipeline',  icon: KanbanSquare },
      { href: '/calendar', label: 'Calendar',  icon: CalendarDays },
    ],
  },
  {
    label: 'Analyze',
    items: [
      { href: '/reports', label: 'Reports', icon: TrendingUp },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/org',      label: 'Org Profile', icon: Building2 },
      { href: '/settings', label: 'Settings',    icon: Settings },
    ],
  },
];

interface AppShellProps {
  children: React.ReactNode;
  orgName?: string;
  userEmail?: string;
}

export function AppShell({ children, orgName = 'Chicago Youth Centers', userEmail }: AppShellProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* ─── Command Palette ─────────────────────────────────────────────── */}
      {paletteOpen && <CommandPalette />}

      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 flex flex-col fixed inset-y-0 left-0 z-50 bg-white border-r border-[#e2e8f0]">
        {/* Brand */}
        <div className="px-4 pt-4 pb-3 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-2.5 mb-3">
            {/* Gradient icon */}
            <div className="w-7 h-7 rounded-[7px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}>
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <span className="font-bold text-[15px] text-[#0f172a] tracking-tight leading-none block">Fundir</span>
              <span className="text-[9px] text-[#94a3b8] font-medium tracking-widest uppercase leading-none">Grant Intelligence</span>
            </div>
          </div>
          {/* Org switcher */}
          <button className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#f8fafc] border border-[#e2e8f0] hover:bg-[#f1f5f9] transition-colors group">
            <span className="text-[12px] font-medium text-[#0f172a] truncate">{orgName}</span>
            <ChevronDown className="w-3 h-3 text-[#94a3b8] flex-shrink-0 group-hover:text-[#475569] transition-colors" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
          {navGroups.map(group => (
            <div key={group.label}>
              <p className="px-2.5 mb-1 text-[9.5px] font-bold text-[#94a3b8] uppercase tracking-widest">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-[13px] font-medium transition-all ${
                        active
                          ? 'bg-[#f0fdfa] text-[#0d9488]'
                          : 'text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                      }`}
                    >
                      {/* Active left-border accent */}
                      {active && (
                        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[#0d9488]" />
                      )}
                      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#0d9488]' : 'text-[#94a3b8]'}`} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-[#e2e8f0] space-y-0.5">
          {userEmail && (
            <p className="px-2.5 mb-2 text-[11px] text-[#94a3b8] truncate">{userEmail}</p>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-[13px] text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a] transition-all"
          >
            <LogOut className="w-4 h-4 text-[#94a3b8]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ─── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 ml-56 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-[#e2e8f0] h-12 flex items-center px-6 gap-4">
          <div className="flex-1">
            <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
          </div>
          <button className="relative p-1.5 rounded-md hover:bg-[#f8fafc] text-[#64748b] hover:text-[#0f172a] transition-colors">
            <Bell className="w-4 h-4" />
            {/* Notification dot */}
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#0d9488] rounded-full" />
          </button>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-default select-none"
            style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}
            title={userEmail}
          >
            {userEmail ? userEmail[0].toUpperCase() : 'U'}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 bg-[#f8fafc]">
          {children}
        </main>
      </div>
    </div>
  );
}
