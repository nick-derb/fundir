'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Search, KanbanSquare, Settings, LogOut,
  Bell, BarChart3, CalendarDays, TrendingUp, Building2,
  Sparkles, ChevronDown, Landmark, Shield,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette';

const navGroups = [
  {
    label: 'Intelligence',
    items: [
      { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard, shortcut: 'G D' },
      { href: '/discover',     label: 'Discover',     icon: Search,          shortcut: 'G O' },
      { href: '/foundations',  label: 'Foundations',  icon: Landmark,        shortcut: 'G F' },
      { href: '/financials',   label: 'Financials',   icon: BarChart3,       shortcut: 'G $' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare, shortcut: 'G P' },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays, shortcut: 'G C' },
    ],
  },
  {
    label: 'Analyze',
    items: [
      { href: '/reports', label: 'Reports', icon: TrendingUp, shortcut: 'G R' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/org',      label: 'Org Profile', icon: Building2, shortcut: 'G I' },
      { href: '/settings', label: 'Settings',    icon: Settings,  shortcut: 'G S' },
    ],
  },
];

interface AppShellProps {
  children: React.ReactNode;
  orgName?: string;
  userEmail?: string;
}

// Shortcut map: second key → href
const SHORTCUT_MAP: Record<string, string> = {
  d: '/dashboard',
  o: '/discover',
  f: '/foundations',
  '$': '/financials',
  p: '/pipeline',
  c: '/calendar',
  r: '/reports',
  i: '/org',
  s: '/settings',
};

// ── Cloud Storage sidebar widget ────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57C23.36 18.34 22.56 15.5 22.56 12.25z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1"  width="10" height="10" fill="#7FBA00"/>
      <rect x="1"  y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  );
}

function CloudStorageWidget({ orgCode }: { orgCode: string }) {
  const [status, setStatus] = useState<{ google: boolean; microsoft: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/integrations/status?org=${orgCode}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStatus(d))
      .catch(() => {});
  }, [orgCode]);

  const services = [
    { key: 'google',    label: 'Google Drive', Icon: GoogleIcon,    href: `/api/auth/google?org=${orgCode}&return=/financials`    },
    { key: 'microsoft', label: 'Microsoft 365', Icon: MicrosoftIcon, href: `/api/auth/microsoft?org=${orgCode}&return=/financials` },
  ] as const;

  return (
    <div className="mx-3 mb-2 px-2.5 py-2.5 rounded-[8px] border border-white/[0.07]"
      style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[#475569] uppercase tracking-widest">Cloud Storage</span>
        <Link href="/settings" className="text-[9px] text-[#0d9488] hover:text-[#14b8a6] transition-colors">manage</Link>
      </div>
      <div className="space-y-1.5">
        {services.map(({ key, label, Icon, href }) => {
          const connected = status?.[key];
          return (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Icon />
                <span className="text-[10px] text-[#64748b]">{label}</span>
              </div>
              {status === null ? (
                <span className="w-1.5 h-1.5 rounded-full bg-[#1e293b]" />
              ) : connected ? (
                <span className="text-[10px] font-bold text-[#4ade80]">● Live</span>
              ) : (
                <a href={href}
                  className="text-[9px] font-bold text-[#0d9488] hover:text-[#14b8a6] transition-colors">
                  Connect
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ children, orgName = 'Chicago Youth Centers', userEmail }: AppShellProps) {
  const pathname    = usePathname();
  const router      = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [gPressed, setGPressed]       = useState(false);

  // Keyboard shortcut handler: G → key
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onKeyDown(e: KeyboardEvent) {
      // Skip if focus is in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (e.key === 'g' || e.key === 'G') {
        setGPressed(true);
        timer = setTimeout(() => setGPressed(false), 1500);
        return;
      }
      if (gPressed) {
        const dest = SHORTCUT_MAP[e.key.toLowerCase()] ?? SHORTCUT_MAP[e.key];
        if (dest) {
          router.push(dest);
        }
        setGPressed(false);
        clearTimeout(timer);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); clearTimeout(timer); };
  }, [gPressed, router]);

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
                {group.items.map(({ href, label, icon: Icon, shortcut }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`group relative flex items-center gap-2.5 pl-3 pr-2.5 py-[7px] rounded-[7px] text-[13px] font-medium transition-all ${
                        active
                          ? 'text-white bg-white/8'
                          : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-white/5'
                      }`}
                    >
                      {/* Left accent bar */}
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all"
                        style={{
                          height:     active ? '60%' : '0%',
                          background: '#0d9488',
                          opacity:    active ? 1 : 0,
                        }}
                      />
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                        active ? 'text-[#0d9488]' : 'text-[#475569] group-hover:text-[#64748b]'
                      }`} />
                      <span className="flex-1">{label}</span>
                      {/* Keyboard shortcut — visible on hover */}
                      <span className="opacity-0 group-hover:opacity-40 transition-opacity text-[9px] font-mono font-bold text-[#94a3b8] tracking-wider flex-shrink-0">
                        {shortcut}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* "G" mode indicator */}
        {gPressed && (
          <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-[6px] border border-[#0d9488]/40 flex items-center gap-2"
            style={{ background: 'rgba(13,148,136,0.12)' }}>
            <span className="text-[10px] font-mono font-bold text-[#0d9488] tracking-wider">G</span>
            <span className="text-[10px] text-[#0d9488]/70">→ press key to navigate</span>
          </div>
        )}

        {/* Cloud Storage widget */}
        <CloudStorageWidget orgCode="CYC2025" />

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
          <Link
            href="/admin"
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[12px] text-[#334155] hover:text-[#475569] hover:bg-white/5 transition-all"
          >
            <Shield className="w-3.5 h-3.5 text-[#ef4444]/50" />
            Admin Console
          </Link>
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
        {/* Top bar — Palantir-style: gradient from dark hero → transparent, floats over content */}
        <header className="sticky top-0 z-40 h-14 flex items-center px-6 gap-4 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.4) 60%, transparent 100%)' }}>
          <div className="flex-1 pointer-events-auto">
            <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
          </div>
          <button className="pointer-events-auto relative p-1.5 rounded-[6px] hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#0d9488] rounded-full" />
          </button>
          <div
            className="pointer-events-auto w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-default select-none flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}
            title={userEmail}
          >
            {userEmail ? userEmail[0].toUpperCase() : 'U'}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-screen" style={{ background: '#f1f5f9' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
