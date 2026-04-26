'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Search, KanbanSquare, Settings, LogOut,
  Bell, BarChart3, CalendarDays, TrendingUp, Building2,
  Sparkles, ChevronDown, Landmark,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette';

const navGroups = [
  {
    label: 'Intelligence',
    items: [
      { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/discover',     label: 'Discover',     icon: Search },
      { href: '/foundations',  label: 'Foundations',  icon: Landmark },
      { href: '/financials',   label: 'Financials',   icon: BarChart3 },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
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
  const pathname    = usePathname();
  const router      = useRouter();
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

  const initials = orgName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: '#f1f5f9' }}>
      {/* ─── Command Palette ─────────────────────────────────── */}
      {paletteOpen && <CommandPalette />}

      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-56 flex flex-col fixed inset-y-0 left-0 z-50 border-r border-[#e2e8f0]"
        style={{ background: '#0f172a' }}>

        {/* Brand */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fundir-logo.png" alt="Fundir" width={30} height={30} className="flex-shrink-0" />
            <div>
              <span className="font-bold text-[16px] text-white tracking-tight leading-none block">Fundir</span>
              <span className="text-[9px] text-[#475569] font-semibold tracking-widest uppercase leading-none">Grant Intelligence</span>
            </div>
          </div>

          {/* Org chip */}
          <button className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all group"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
              {initials}
            </div>
            <span className="text-[12px] font-medium text-[#94a3b8] truncate flex-1 text-left group-hover:text-white transition-colors">
              {orgName}
            </span>
            <ChevronDown className="w-3 h-3 text-[#475569] flex-shrink-0" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
          {navGroups.map(group => (
            <div key={group.label}>
              <p className="px-2 mb-1.5 text-[9px] font-bold text-[#334155] uppercase tracking-widest">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[13px] font-medium transition-all ${
                        active
                          ? 'text-white'
                          : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-white/5'
                      }`}
                      style={active ? { background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' } : {}}
                    >
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-white' : 'text-[#475569]'}`} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* AI badge */}
        <div className="mx-3 mb-3 p-3 rounded-[8px] border border-white/10"
          style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(8,145,178,0.10))' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#0d9488]" />
            <span className="text-[11px] font-bold text-[#0d9488]">Fundir AI</span>
            <span className="ml-auto flex items-center gap-1 text-[9px] text-[#4ade80] font-bold">
              <span className="w-1 h-1 rounded-full bg-[#4ade80] animate-pulse" />
              LIVE
            </span>
          </div>
          <p className="text-[10px] text-[#475569] leading-relaxed">
            990 screening · Semantic matching · Pipeline intelligence
          </p>
        </div>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/10 space-y-0.5">
          {userEmail && (
            <p className="px-2.5 mb-2 text-[10px] text-[#475569] truncate">{userEmail}</p>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[12px] text-[#475569] hover:text-[#94a3b8] hover:bg-white/5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ─── Content area ────────────────────────────────────── */}
      <div className="flex-1 ml-56 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-[#e2e8f0] h-12 flex items-center px-6 gap-4"
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)' }}>
          <div className="flex-1">
            <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
          </div>
          <button className="relative p-1.5 rounded-[6px] hover:bg-[#f8fafc] text-[#64748b] hover:text-[#0f172a] transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#0d9488] rounded-full" />
          </button>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-default select-none flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}
            title={userEmail}
          >
            {userEmail ? userEmail[0].toUpperCase() : 'U'}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1" style={{ background: '#f1f5f9' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
