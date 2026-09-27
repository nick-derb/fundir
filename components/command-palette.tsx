'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchGrantsAction, GrantSearchHit } from '@/actions/search-grants';
import {
  Search, LayoutDashboard, KanbanSquare, BarChart3,
  CalendarDays, TrendingUp, Settings, Building2, Radar, Share2,
  Users, Database, MessageSquare,
  FileText, ArrowRight, Command, X, Loader2,
} from 'lucide-react';

// ── Static navigation items ───────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',       href: '/dashboard',   icon: LayoutDashboard, group: 'Navigate' },
  { label: 'Prospecting',     href: '/prospecting', icon: Radar,           group: 'Navigate' },
  { label: 'Connections',     href: '/connections', icon: Share2,          group: 'Navigate' },
  { label: 'Calendar',        href: '/calendar',    icon: CalendarDays,    group: 'Navigate' },
  { label: 'Peer Network',    href: '/peers',       icon: Users,           group: 'Navigate' },
  { label: 'Data Hub',        href: '/data',        icon: Database,        group: 'Navigate' },
  { label: 'Reports',         href: '/reports',     icon: TrendingUp,      group: 'Navigate' },
  { label: 'Org Profile',     href: '/org',         icon: Building2,       group: 'Navigate' },
  { label: 'Settings',        href: '/settings',    icon: Settings,        group: 'Navigate' },
  { label: 'Feedback',        href: '/feedback',    icon: MessageSquare,   group: 'Navigate' },
  // Older routes that are still live but no longer in the sidebar.
  { label: 'Discover Grants', href: '/discover',    icon: Search,          group: 'Navigate' },
  { label: 'Financials',      href: '/financials',  icon: BarChart3,       group: 'Navigate' },
  { label: 'Pipeline',        href: '/pipeline',    icon: KanbanSquare,    group: 'Navigate' },
];

// ── Score color ───────────────────────────────────────────────────────────────
function scoreColor(s: number) {
  return s >= 70 ? 'var(--success)' : s >= 40 ? 'var(--warning)' : 'var(--critical)';
}

// ── Command Palette component ─────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [grants, setGrants]     = useState<GrantSearchHit[]>([]);
  const [cursor, setCursor]     = useState(0);
  const [isPending, startTrans] = useTransition();
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router    = useRouter();

  // ── Open / close ────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setGrants([]);
    setCursor(0);
  }, []);

  // Cmd+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setCursor(0);
    }
  }, [open]);

  // ── Search ───────────────────────────────────────────────────────────────────
  const runSearch = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setGrants([]); return; }
    debounce.current = setTimeout(() => {
      startTrans(async () => {
        const results = await searchGrantsAction(q);
        setGrants(results);
        setCursor(0);
      });
    }, 250);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    runSearch(v);
  }

  // ── Build unified item list for keyboard nav ─────────────────────────────────
  const filtered = query.trim()
    ? NAV_ITEMS.filter(n => n.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ITEMS;

  const allItems: Array<{ type: 'nav'; href: string; label: string } | { type: 'grant'; id: string; title: string }> = [
    ...filtered.map(n => ({ type: 'nav' as const, href: n.href, label: n.label })),
    ...grants.map(g => ({ type: 'grant' as const, id: g.id, title: g.title })),
  ];

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = allItems[cursor];
      if (!item) return;
      if (item.type === 'nav') router.push(item.href);
      else router.push(`/grant/${item.id}`);
      close();
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  let navItemIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(11,18,32,.38)' }} />

      {/* Panel */}
      <div
        className="relative w-full max-w-[560px] mx-4 bg-surface rounded-md border border-hairline overflow-hidden"
        style={{ boxShadow: 'var(--shadow-overlay)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
          {isPending
            ? <Loader2 className="w-4 h-4 text-tertiary flex-shrink-0 animate-spin" />
            : <Search className="w-4 h-4 text-tertiary flex-shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Search grants, pages, actions…"
            className="flex-1 text-[14px] text-primary placeholder:text-tertiary bg-transparent outline-none"
          />
          <div className="flex items-center gap-1.5">
            {query && (
              <button onClick={() => { setQuery(''); setGrants([]); inputRef.current?.focus(); }}>
                <X className="w-3.5 h-3.5 text-tertiary hover:text-secondary" />
              </button>
            )}
            <kbd className="px-1.5 py-0.5 bg-elevated border border-hairline rounded-xs text-[10px] text-tertiary font-mono">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto overscroll-contain pb-2">
          {/* Navigation section */}
          {filtered.length > 0 && (
            <div>
              <p className="fd-eyebrow px-4 pt-3 pb-1.5 text-tertiary">
                {query ? 'Pages' : 'Navigate'}
              </p>
              {filtered.map((item) => {
                const Icon = item.icon;
                const idx  = navItemIdx++;
                const active = cursor === idx;
                return (
                  <button
                    key={item.href}
                    data-idx={idx}
                    onClick={() => { router.push(item.href); close(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? 'bg-accent-tint' : 'hover:bg-elevated'}`}
                  >
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-surface' : 'bg-elevated'}`}>
                      <Icon className={`w-3.5 h-3.5 ${active ? 'text-accent' : 'text-secondary'}`} />
                    </div>
                    <span className={`text-[13px] font-medium flex-1 ${active ? 'text-accent' : 'text-primary'}`}>
                      {item.label}
                    </span>
                    {active && <ArrowRight className="w-3.5 h-3.5 text-accent" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Grant results section */}
          {grants.length > 0 && (
            <div>
              <p className="fd-eyebrow px-4 pt-3 pb-1.5 text-tertiary">
                Grant Matches
              </p>
              {grants.map((grant) => {
                const idx    = navItemIdx++;
                const active = cursor === idx;
                const daysLeft = grant.close_date
                  ? Math.ceil((new Date(grant.close_date).getTime() - Date.now()) / 86400000)
                  : null;

                return (
                  <button
                    key={grant.id}
                    data-idx={idx}
                    onClick={() => { router.push(`/grant/${grant.id}`); close(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? 'bg-accent-tint' : 'hover:bg-elevated'}`}
                  >
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-surface' : 'bg-elevated'}`}>
                      <FileText className={`w-3.5 h-3.5 ${active ? 'text-accent' : 'text-secondary'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium truncate ${active ? 'text-accent' : 'text-primary'}`}>
                        {grant.title}
                      </p>
                      <p className="text-[11px] text-secondary truncate">{grant.agency}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-[11px] font-semibold font-mono tabular-nums px-1.5 py-0.5 rounded-xs"
                        style={{ color: scoreColor(grant.score), background: 'var(--bg-elevated)' }}
                      >
                        {grant.score.toFixed(0)}
                      </span>
                      {daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && (
                        <span className="text-[10px] font-mono font-medium" style={{ color: 'var(--warning)' }}>{daysLeft}d</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {query.trim().length >= 2 && !isPending && filtered.length === 0 && grants.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-tertiary">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {/* Default empty (no query) */}
          {!query && (
            <div className="px-4 pb-3 pt-2 border-t border-hairline mt-1">
              <p className="text-[11px] text-tertiary">
                Type to search grants · navigate pages · run actions
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-hairline bg-page">
          <div className="flex items-center gap-3 text-[10px] text-tertiary">
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-surface border border-hairline rounded-xs font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-surface border border-hairline rounded-xs font-mono">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-surface border border-hairline rounded-xs font-mono">esc</kbd> close</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-tertiary">
            <Command className="w-3 h-3" />
            <span>K to open</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trigger button shown in topbar ────────────────────────────────────────────

export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search grants, pages and actions (⌘K)"
      className="flex items-center gap-2 h-8 px-2.5 rounded-sm text-[12.5px] text-tertiary hover:text-primary bg-page hover:bg-elevated border border-hairline hover:border-border-strong transition-colors w-full max-w-[360px]"
    >
      <Search className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 text-left truncate">Search grants, pages…</span>
      <span className="hidden sm:flex items-center gap-0.5 font-mono text-[10px] text-tertiary">
        <kbd className="px-1 py-0.5 rounded-xs border border-hairline bg-surface">⌘</kbd>
        <kbd className="px-1 py-0.5 rounded-xs border border-hairline bg-surface">K</kbd>
      </span>
    </button>
  );
}
