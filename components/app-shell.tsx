'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useSyncExternalStore } from 'react';

/** Dark mode is built but hidden during the beta; flip to true to show the toggle again. */
const SHOW_THEME_TOGGLE = false;

const readSidebarCollapsed = () => { try { return localStorage.getItem('fundir-sidebar') === 'collapsed'; } catch { return false; } };
const subscribeSidebar = (cb: () => void) => { window.addEventListener('fundir-sidebar', cb); window.addEventListener('storage', cb); return () => { window.removeEventListener('fundir-sidebar', cb); window.removeEventListener('storage', cb); }; };
import {
  LayoutDashboard, Radar, Table2, Share2, FileText, Settings, LogOut,
  TrendingUp, Building2, Shield,
  ChevronDown, Check, Sun, Moon,
  Menu, X, Database, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette';
import { TeamPanel, TeamButton } from '@/components/team-panel';
import { AiAdvisor } from '@/components/ai-advisor';
import { switchAdminOrg } from '@/actions/admin-org';
import { bundledLogoFor } from '@/lib/org-logo';
import { UserMenu } from '@/components/user-menu';

// New dashboard IA (Claude Design). Prospecting / Cultivation List /
// Connections / Applications are placeholder routes until designed.
const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/prospecting',  label: 'Prospecting',      icon: Radar           },
  { href: '/cultivation',  label: 'Cultivation List', icon: Table2          },
  { href: '/connections',  label: 'Connections',      icon: Share2          },
  { href: '/data',         label: 'Data Hub',         icon: Database        },
  { href: '/applications', label: 'Applications',     icon: FileText        },
  { href: '/reports',      label: 'Reports',          icon: TrendingUp      },
];

const SETTINGS_ITEMS = [
  { href: '/org',      label: 'Org Profile', icon: Building2 },
  { href: '/settings', label: 'Settings',    icon: Settings  },
];

const SHORTCUT_MAP: Record<string, string> = {
  d: '/dashboard',
  p: '/prospecting',
  c: '/connections',
  r: '/reports',
  s: '/settings',
};

interface AppShellProps {
  children: React.ReactNode;
  orgName?: string;
  orgId?: string;
  userEmail?: string;
  userName?: string;
  userAvatar?: string | null;
  userRole?: string | null;
  isAdmin?: boolean;
  availableOrgs?: Array<{ id: string; name: string; org_code: string }>;
  currentOrgCode?: string;
}

export function AppShell({
  children,
  orgName = 'My Organization',
  orgId,
  userEmail,
  userName,
  userAvatar,
  userRole,
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
  // Desktop sidebar collapses to a 56px icon rail; the choice is remembered per
  // browser and read through an external-store subscription (SSR renders it open).
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
  const orgMenuRef = useRef<HTMLDivElement>(null);

  // Close the mobile drawer whenever the user navigates to a new page.
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  function toggleCollapsed() {
    const next = !readSidebarCollapsed();
    try { localStorage.setItem('fundir-sidebar', next ? 'collapsed' : 'open'); } catch { /* ignore */ }
    window.dispatchEvent(new Event('fundir-sidebar'));
  }
  // "[" toggles the sidebar from anywhere except text fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggleCollapsed(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    // Beta: light only. A saved dark preference is not applied while the toggle is hidden,
    // so nobody is stranded in a theme they cannot switch out of.
    const saved = SHOW_THEME_TOGGLE ? ((localStorage.getItem('fundir-theme') as 'dark' | 'light') || 'light') : 'light';
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
        data-collapsed={collapsed || undefined}
        className={`flex flex-col fixed inset-y-0 left-0 z-50 border-r border-hairline bg-surface transform transition-[transform,width] duration-200 ease-out md:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-56 md:w-14' : 'w-56'}`}
      >

        {/* Brand + org */}
        <div className={`${collapsed ? 'px-2 md:px-0' : 'px-4'} pt-4 pb-3 border-b border-hairline`}>
          <div className={`flex items-center gap-2 mb-3 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fundir-mark.png"
              alt="Fundir"
              className="w-7 h-7 object-contain flex-shrink-0"
            />
            <span className={`text-h3 font-semibold tracking-tight text-primary ${collapsed ? 'md:hidden' : ''}`}>Fundir</span>
            <button
              type="button"
              onClick={toggleCollapsed}
              title={collapsed ? 'Expand sidebar  ( [ )' : 'Collapse sidebar  ( [ )'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className={`hidden md:flex ml-auto w-7 h-7 rounded-sm items-center justify-center text-tertiary hover:text-primary hover:bg-elevated transition-colors ${collapsed ? 'md:hidden' : ''}`}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Expand sidebar  ( [ )"
              aria-label="Expand sidebar"
              className="hidden md:flex mx-auto mb-2 w-9 h-8 rounded-sm items-center justify-center text-tertiary hover:text-primary hover:bg-elevated transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {/* Org switcher — two-line treatment, full org name with tooltip,
              dropdown only for admins with multiple orgs. */}
          <div className="relative" ref={orgMenuRef}>
            <button
              onClick={() => isAdmin && availableOrgs.length > 1 && setOrgMenuOpen(o => !o)}
              title={orgName}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm transition-colors text-left ${collapsed ? 'md:justify-center md:px-0' : ''} ${
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
              <span className={`text-[12px] font-medium text-secondary leading-tight flex-1 line-clamp-2 break-words ${collapsed ? 'md:hidden' : ''}`}>
                {orgName}
              </span>
              {isAdmin && availableOrgs.length > 1 && (
                <ChevronDown className={`w-3 h-3 flex-shrink-0 text-tertiary transition-transform ${orgMenuOpen ? 'rotate-180' : ''} ${collapsed ? 'md:hidden' : ''}`} />
              )}
            </button>

            {/* Admin org dropdown */}
            {orgMenuOpen && availableOrgs.length > 1 && (
              <div className={`absolute top-full left-0 mt-1 rounded-sm overflow-hidden border border-hairline bg-surface z-50 ${collapsed ? 'md:left-full md:ml-2 md:w-60' : 'right-0'}`}
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

          {isAdmin && !collapsed && (
            <p className="mt-1 px-2 text-eyebrow uppercase text-tertiary">Admin view</p>
          )}
        </div>

        {/* Main nav — labels hide in the rail; the title attribute keeps them a hover away. */}
        <nav className={`flex-1 py-3 overflow-y-auto ${collapsed ? 'px-3 md:px-2' : 'px-3'}`}>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href} prefetch={false} title={collapsed ? label : undefined}
                className={`shell-nav-item flex items-center gap-2.5 py-[7px] text-[13px] mb-0.5 ${collapsed ? 'pl-3 pr-2 md:justify-center md:px-0' : 'pl-3 pr-2'} ${active ? 'shell-nav-active' : ''}`}>
                <Icon className="shell-nav-icon w-4 h-4 flex-shrink-0" />
                <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
              </Link>
            );
          })}

          {/* Hairline divider before utility nav */}
          <div className="pt-3 mt-3 border-t border-hairline">
            {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} prefetch={false} title={collapsed ? label : undefined}
                  className={`shell-nav-item flex items-center gap-2.5 py-[7px] text-[13px] mb-0.5 ${collapsed ? 'pl-3 pr-2 md:justify-center md:px-0' : 'pl-3 pr-2'} ${active ? 'shell-nav-active' : ''}`}>
                  <Icon className="shell-nav-icon w-4 h-4 flex-shrink-0" />
                  <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className={`py-3 border-t border-hairline ${collapsed ? 'px-3 md:px-2' : 'px-3'}`}>
          {isAdmin && (
            <Link href="/admin" prefetch={false} title={collapsed ? 'Admin Console' : undefined}
              className={`shell-nav-item flex items-center gap-2.5 py-[7px] text-caption mb-0.5 ${collapsed ? 'pl-3 pr-2 md:justify-center md:px-0' : 'pl-3 pr-2'}`}>
              <Shield className="shell-nav-icon w-4 h-4 flex-shrink-0" />
              <span className={collapsed ? 'md:hidden' : ''}>Admin Console</span>
            </Link>
          )}
          {userEmail && !collapsed && (
            <p className="px-3 py-1 text-eyebrow text-tertiary truncate uppercase">{userEmail}</p>
          )}
          {/* Theme toggle removed from the UI during the beta (light only). The theme
              tokens, toggleTheme() and the data-theme plumbing stay in place; set
              SHOW_THEME_TOGGLE to bring the button back. */}
          {SHOW_THEME_TOGGLE && (
            <button onClick={toggleTheme} title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
              className={`shell-nav-item w-full flex items-center gap-2.5 py-[7px] text-[13px] mb-0.5 ${collapsed ? 'pl-3 pr-2 md:justify-center md:px-0' : 'pl-3 pr-2'}`}>
              {theme === 'dark'
                ? <><Sun className="shell-nav-icon w-4 h-4 flex-shrink-0" /><span className={collapsed ? 'md:hidden' : ''}>Light mode</span></>
                : <><Moon className="shell-nav-icon w-4 h-4 flex-shrink-0" /><span className={collapsed ? 'md:hidden' : ''}>Dark mode</span></>
              }
            </button>
          )}
          <button onClick={handleSignOut} title={collapsed ? 'Sign out' : undefined}
            className={`shell-nav-item w-full flex items-center gap-2.5 py-[7px] text-[13px] ${collapsed ? 'pl-3 pr-2 md:justify-center md:px-0' : 'pl-3 pr-2'}`}>
            <LogOut className="shell-nav-icon w-4 h-4 flex-shrink-0" />
            <span className={collapsed ? 'md:hidden' : ''}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Content area — offset by the sidebar width on desktop; full width on mobile ── */}
      <div className={`flex-1 flex flex-col min-h-screen w-full transition-[margin] duration-200 ease-out ${collapsed ? 'md:ml-14' : 'md:ml-56'}`}>
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
          <UserMenu
            userEmail={userEmail}
            userName={userName}
            userAvatar={userAvatar}
            userRole={userRole}
            orgName={orgName}
            onSignOut={handleSignOut}
          />
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
