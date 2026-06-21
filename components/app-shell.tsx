'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Search, KanbanSquare, Settings, LogOut,
  BarChart3, CalendarDays, TrendingUp, Building2,
  Landmark, Shield, ChevronDown, Check, Sun, Moon,
  Menu, X,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette';
import { TeamPanel, TeamButton } from '@/components/team-panel';
import { AiAdvisor } from '@/components/ai-advisor';
import { switchAdminOrg } from '@/actions/admin-org';
import { bundledLogoFor } from '@/lib/org-logo';

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
  const [theme, setTheme]               = useState<'dark' | 'light'>('light');
  const [teamOpen, setTeamOpen]         = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement>(null);

  // Close the mobile drawer whenever the user navigates to a new page.
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

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
    const saved = (localStorage.getItem('fundir-theme') as 'dark' | 'light') || 'light';
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
  const orgLogoUrl = bundledLogoFor(currentOrgCode);

  return (
    <div className="flex min-h-screen bg-page">
      {paletteOpen && <CommandPalette />}

      {/* ── Mobile backdrop (sub-md only, when drawer is open) ── */}
      {mobileNavOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      {/* ── Sidebar — desktop: always visible; mobile: slide-in drawer ── */}
      <aside
        className={`w-56 flex flex-col fixed inset-y-0 left-0 z-50 border-r border-hairline bg-surface transform transition-transform duration-200 ease-out md:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >

        {/* Brand + org */}
        <div className="px-4 pt-4 pb-3 border-b border-hairline">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-accent text-accent-on text-[12px] font-semibold flex-shrink-0">
              F
            </div>
            <span className="text-h3 font-semibold tracking-tight text-primary">Fundir</span>
          </div>

          {/* Org switcher — two-line treatment, full org name with tooltip,
              dropdown only for admins with multiple orgs. */}
          <div className="relative" ref={orgMenuRef}>
            <button
              onClick={() => isAdmin && availableOrgs.length > 1 && setOrgMenuOpen(o => !o)}
              title={orgName}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm transition-colors text-left ${
                isAdmin && availableOrgs.length > 1 ? 'cursor-pointer hover:bg-elevated' : 'cursor-default'
              }`}
            >
              {orgLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={orgLogoUrl}
                  alt={orgName}
                  className="w-6 h-6 rounded-sm bg-surface object-contain flex-shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-sm flex items-center justify-center bg-elevated text-secondary text-[10px] font-semibold flex-shrink-0">
                  {initials}
                </div>
              )}
              <span className="text-[12px] font-medium text-secondary leading-tight flex-1 line-clamp-2 break-words">
                {orgName}
              </span>
              {isAdmin && availableOrgs.length > 1 && (
                <ChevronDown className={`w-3 h-3 flex-shrink-0 text-tertiary transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            {/* Admin org dropdown */}
            {orgMenuOpen && availableOrgs.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-sm overflow-hidden border border-hairline bg-surface z-50"
                style={{ boxShadow: 'var(--shadow-overlay)' }}>
                <p className="px-3 pt-2 pb-1 text-eyebrow text-tertiary uppercase">Switch organization</p>
                {availableOrgs.map(org => (
                  <button
                    key={org.id}
                    onClick={() => handleOrgSwitch(org.org_code)}
                    disabled={switching}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-elevated disabled:opacity-50"
                  >
                    {(() => {
                      const itemLogo = bundledLogoFor(org.org_code);
                      return itemLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={itemLogo}
                          alt={org.name}
                          className="w-5 h-5 rounded-sm bg-surface object-contain flex-shrink-0"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-sm flex items-center justify-center bg-elevated text-secondary text-[9px] font-semibold flex-shrink-0">
                          {org.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                        </div>
                      );
                    })()}
                    <span className="text-caption text-primary truncate flex-1">{org.name}</span>
                    {org.org_code === currentOrgCode && (
                      <Check className="w-3 h-3 text-accent flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <p className="mt-1 px-2 text-eyebrow uppercase text-tertiary">Admin view</p>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href} prefetch={false}
                className={`shell-nav-item flex items-center gap-2.5 pl-3 pr-2 py-[7px] text-[13px] mb-0.5 ${active ? 'shell-nav-active' : ''}`}>
                <Icon className="shell-nav-icon w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}

          {/* Hairline divider before utility nav */}
          <div className="pt-3 mt-3 border-t border-hairline">
            {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} prefetch={false}
                  className={`shell-nav-item flex items-center gap-2.5 pl-3 pr-2 py-[7px] text-[13px] mb-0.5 ${active ? 'shell-nav-active' : ''}`}>
                  <Icon className="shell-nav-icon w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-hairline">
          {isAdmin && (
            <Link href="/admin" prefetch={false}
              className="shell-nav-item flex items-center gap-2.5 pl-3 pr-2 py-[7px] text-caption mb-0.5">
              <Shield className="shell-nav-icon w-4 h-4 flex-shrink-0" />
              Admin Console
            </Link>
          )}
          {userEmail && (
            <p className="px-3 py-1 text-eyebrow text-tertiary truncate uppercase">{userEmail}</p>
          )}
          <button onClick={toggleTheme}
            className="shell-nav-item w-full flex items-center gap-2.5 pl-3 pr-2 py-[7px] text-[13px] mb-0.5">
            {theme === 'dark'
              ? <><Sun className="shell-nav-icon w-4 h-4 flex-shrink-0" /><span>Light mode</span></>
              : <><Moon className="shell-nav-icon w-4 h-4 flex-shrink-0" /><span>Dark mode</span></>
            }
          </button>
          <button onClick={handleSignOut}
            className="shell-nav-item w-full flex items-center gap-2.5 pl-3 pr-2 py-[7px] text-[13px]">
            <LogOut className="shell-nav-icon w-4 h-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Content area — ml-56 on desktop; full width on mobile ── */}
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen w-full">
        {/* Top bar — quiet, hairline-bottom, grid-aligned. */}
        <header className="sticky top-0 z-40 h-12 flex items-center px-4 md:px-6 gap-3 md:gap-4 bg-surface border-b border-hairline">
          {/* Mobile hamburger — opens the sidebar drawer */}
          <button
            onClick={() => setMobileNavOpen(o => !o)}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            className="md:hidden w-8 h-8 -ml-1 rounded-sm flex items-center justify-center text-primary hover:bg-elevated transition-colors"
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
          </div>
          {userEmail && orgId && (
            <TeamButton
              onClick={() => setTeamOpen(o => !o)}
              userEmail={userEmail}
            />
          )}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-accent-on bg-accent text-[11px] font-semibold flex-shrink-0 cursor-default"
            title={userEmail}
          >
            {userEmail ? userEmail[0].toUpperCase() : 'U'}
          </div>
        </header>

        <main className="flex-1 bg-page">
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

      {/* AI grant strategist — fixed overlay, available on every page */}
      <AiAdvisor orgCode={currentOrgCode} orgId={orgId} orgName={orgName} />
    </div>
  );
}
