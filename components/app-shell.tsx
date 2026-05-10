'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Search, KanbanSquare, Settings, LogOut,
  BarChart3, CalendarDays, TrendingUp, Building2,
  Landmark, Shield, ChevronDown, Check, Sun, Moon,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette';
import { TeamPanel, TeamButton } from '@/components/team-panel';
import { switchAdminOrg } from '@/actions/admin-org';

const NAV_ITEMS = [
  { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/discover',    label: 'Matches',     icon: Search          },
  { href: '/pipeline',    label: 'Tracker',     icon: KanbanSquare    },
  { href: '/calendar',    label: 'Calendar',    icon: CalendarDays    },
  { href: '/reports',     label: 'Reports',     icon: TrendingUp      },
  { href: '/financials',  label: 'Financials',  icon: BarChart3       },
  { href: '/foundations', label: 'Foundations', icon: Landmark        },
];

const SETTINGS_ITEMS = [
  { href: '/org',      label: 'Org Profile', icon: Building2 },
  { href: '/settings', label: 'Settings',    icon: Settings  },
];

const SHORTCUT_MAP: Record<string, string> = {
  d: '/dashboard',
  m: '/discover',
  t: '/pipeline',
  c: '/calendar',
  r: '/reports',
  f: '/financials',
  s: '/settings',
};

interface AppShellProps {
  children: React.ReactNode;
  orgName?: string;
  orgId?: string;
  userEmail?: string;
  isAdmin?: boolean;
  availableOrgs?: Array<{ id: string; name: string; org_code: string }>;
  currentOrgCode?: string;
}

export function AppShell({
  children,
  orgName = 'My Organization',
  orgId,
  userEmail,
  isAdmin = false,
  availableOrgs = [],
  currentOrgCode,
}: AppShellProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [paletteOpen, setPaletteOpen]   = useState(false);
  const [gPressed, setGPressed]         = useState(false);
  const [orgMenuOpen, setOrgMenuOpen]   = useState(false);
  const [switching, setSwitching]       = useState(false);
  const [theme, setTheme]               = useState<'dark' | 'light'>('dark');
  const [teamOpen, setTeamOpen]         = useState(false);
  const orgMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'g' || e.key === 'G') {
        setGPressed(true);
        timer = setTimeout(() => setGPressed(false), 1500);
        return;
      }
      if (gPressed) {
        const dest = SHORTCUT_MAP[e.key.toLowerCase()];
        if (dest) router.push(dest);
        setGPressed(false);
        clearTimeout(timer);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); clearTimeout(timer); };
  }, [gPressed, router]);

  useEffect(() => {
    const saved = (localStorage.getItem('fundir-theme') as 'dark' | 'light') || 'dark';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('fundir-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  // Close org menu when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) {
        setOrgMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function handleOrgSwitch(orgCode: string) {
    if (orgCode === currentOrgCode) { setOrgMenuOpen(false); return; }
    setSwitching(true);
    await switchAdminOrg(orgCode);
    setSwitching(false);
    setOrgMenuOpen(false);
    window.location.reload();
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  }

  const initials = orgName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--page-bg)' }}>
      {paletteOpen && <CommandPalette />}

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside className="w-52 flex flex-col fixed inset-y-0 left-0 z-50 border-r"
        style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>

        {/* Brand + org switcher */}
        <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-[6px] flex items-center justify-center text-white text-[11px] font-extrabold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
              F
            </div>
            <span className="font-bold text-[15px] tracking-tight" style={{ color: 'var(--brand-text)' }}>Fundir</span>
          </div>

          {/* Org switcher — dropdown for admin, static for regular users */}
          <div className="relative" ref={orgMenuRef}>
            <button
              onClick={() => isAdmin && availableOrgs.length > 1 && setOrgMenuOpen(o => !o)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] transition-colors text-left shell-nav-item ${
                isAdmin && availableOrgs.length > 1 ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="w-5 h-5 rounded-[4px] flex items-center justify-center text-[9px] font-bold text-[#0d9488] flex-shrink-0"
                style={{ background: 'rgba(13,148,136,0.1)' }}>
                {initials}
              </div>
              <span className="text-[12px] font-medium truncate flex-1" style={{ color: 'var(--org-text)' }}>{orgName}</span>
              {isAdmin && availableOrgs.length > 1 && (
                <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--faint-text)' }} />
              )}
            </button>

            {/* Admin org dropdown */}
            {orgMenuOpen && availableOrgs.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-[8px] shadow-lg z-50 overflow-hidden border"
                style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--dropdown-border)' }}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--faint-text)' }}>Switch organization</p>
                {availableOrgs.map(org => (
                  <button
                    key={org.id}
                    onClick={() => handleOrgSwitch(org.org_code)}
                    disabled={switching}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors disabled:opacity-50 shell-nav-item"
                  >
                    <div className="w-5 h-5 rounded-[4px] flex items-center justify-center text-[9px] font-bold text-[#0d9488] flex-shrink-0"
                      style={{ background: 'rgba(13,148,136,0.1)' }}>
                      {org.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                    </div>
                    <span className="text-[12px] truncate flex-1" style={{ color: 'var(--org-text)' }}>{org.name}</span>
                    {org.org_code === currentOrgCode && (
                      <Check className="w-3 h-3 text-[#0d9488] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <p className="mt-1 px-2 text-[10px] font-medium" style={{ color: 'var(--faint-text)' }}>Admin view</p>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href} prefetch={false}
                className={`flex items-center gap-2.5 px-3 py-[7px] rounded-[6px] text-[13px] font-medium transition-colors shell-nav-item ${active ? 'shell-nav-active' : ''}`}>
                <Icon className="w-4 h-4 flex-shrink-0 shell-nav-icon" />
                {label}
              </Link>
            );
          })}

          <div className="pt-3 mt-3 border-t space-y-0.5" style={{ borderColor: 'var(--nav-divider)' }}>
            {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} prefetch={false}
                  className={`flex items-center gap-2.5 px-3 py-[7px] rounded-[6px] text-[13px] font-medium transition-colors shell-nav-item ${active ? 'shell-nav-active' : ''}`}>
                  <Icon className="w-4 h-4 flex-shrink-0 shell-nav-icon" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t space-y-0.5" style={{ borderColor: 'var(--sidebar-border)' }}>
          {isAdmin && (
            <Link href="/admin" prefetch={false}
              className="flex items-center gap-2.5 px-3 py-[7px] rounded-[6px] text-[12px] transition-colors shell-nav-item">
              <Shield className="w-4 h-4 flex-shrink-0 shell-nav-icon" />
              Admin Console
            </Link>
          )}
          {userEmail && (
            <p className="px-3 py-1 text-[11px] truncate" style={{ color: 'var(--faint-text)' }}>{userEmail}</p>
          )}
          <button onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-[6px] text-[13px] transition-colors shell-nav-item">
            {theme === 'dark'
              ? <><Sun className="w-4 h-4 flex-shrink-0 shell-nav-icon" /><span>Light mode</span></>
              : <><Moon className="w-4 h-4 flex-shrink-0 shell-nav-icon" /><span>Dark mode</span></>
            }
          </button>
          <button onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-[6px] text-[13px] transition-colors shell-nav-item">
            <LogOut className="w-4 h-4 flex-shrink-0 shell-nav-icon" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Content area ───────────────────────────────────────── */}
      <div className="flex-1 ml-52 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-12 flex items-center px-6 gap-4 border-b"
          style={{ background: 'var(--header-bg)', borderColor: 'var(--sidebar-border)' }}>
          <div className="flex-1">
            <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
          </div>
          {userEmail && orgId && (
            <TeamButton
              onClick={() => setTeamOpen(o => !o)}
              userEmail={userEmail}
            />
          )}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 cursor-default"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
            title={userEmail}
          >
            {userEmail ? userEmail[0].toUpperCase() : 'U'}
          </div>
        </header>

        <main className="flex-1" style={{ background: 'var(--page-bg)' }}>
          {children}
        </main>
      </div>

      {/* Team panel — fixed overlay, available on every page */}
      {userEmail && orgId && (
        <TeamPanel
          userEmail={userEmail}
          orgId={orgId}
          open={teamOpen}
          onClose={() => setTeamOpen(false)}
        />
      )}
    </div>
  );
}
