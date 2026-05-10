'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { Users, X, Send, MessageSquare, Activity } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PresenceUser {
  user_id:      string;
  user_email:   string;
  last_seen:    string;
  current_path: string | null;
}

interface ActivityItem {
  id:           string;
  user_email:   string;
  action:       string;
  entity_type:  string | null;
  entity_id:    string | null;
  entity_title: string | null;
  metadata:     Record<string, unknown>;
  created_at:   string;
}

interface Message {
  id:         string;
  user_email: string;
  content:    string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(email: string) {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : email.slice(0, 2).toUpperCase();
}

function avatarColor(email: string) {
  const colors = [
    '#0d9488','#0891b2','#7c3aed','#db2777','#ea580c','#16a34a','#ca8a04',
  ];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

const PATH_LABELS: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/discover':    'Matches',
  '/pipeline':    'Tracker',
  '/calendar':    'Calendar',
  '/reports':     'Reports',
  '/financials':  'Financials',
  '/foundations': 'Foundations',
  '/settings':    'Settings',
  '/org':         'Org Profile',
};

function pathLabel(path: string | null) {
  if (!path) return null;
  for (const [k, v] of Object.entries(PATH_LABELS)) {
    if (path.startsWith(k)) return v;
  }
  return null;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function activityLabel(item: ActivityItem) {
  const name = item.user_email.split('@')[0];
  const title = item.entity_title ? `"${item.entity_title.slice(0, 38)}${item.entity_title.length > 38 ? '…' : ''}"` : 'a grant';
  switch (item.action) {
    case 'grant_view':    return `${name} viewed ${title}`;
    case 'pipeline_move': {
      const to = (item.metadata.to as string) ?? '';
      return `${name} moved ${title} → ${to}`;
    }
    case 'note_added':    return `${name} added a note on ${title}`;
    case 'grant_passed':  return `${name} passed on ${title}`;
    case 'grant_saved':   return `${name} saved ${title}`;
    case 'login':         return `${name} signed in`;
    default:              return `${name} · ${item.action.replace(/_/g, ' ')}`;
  }
}

function activityDot(action: string) {
  switch (action) {
    case 'grant_view':    return '#0d9488';
    case 'pipeline_move': return '#6366f1';
    case 'note_added':    return '#f59e0b';
    case 'grant_passed':  return '#f87171';
    case 'grant_saved':   return '#22c55e';
    default:              return '#64748b';
  }
}

// ── Avatar component ──────────────────────────────────────────────────────────
function Avatar({ email, size = 28 }: { email: string; size?: number }) {
  const bg = avatarColor(email);
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}>
      {initials(email)}
    </div>
  );
}

// ── Team Panel ────────────────────────────────────────────────────────────────
interface TeamPanelProps {
  userEmail: string;
  orgId:     string;
  open:      boolean;
  onClose:   () => void;
}

type PanelTab = 'activity' | 'chat';

export function TeamPanel({ userEmail, orgId, open, onClose }: TeamPanelProps) {
  const pathname = usePathname();
  const [tab,      setTab]      = useState<PanelTab>('activity');
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft,    setDraft]    = useState('');
  const [sending,  setSending]  = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function beat() {
      fetch('/api/team/heartbeat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPath: pathname }),
      }).catch(() => {});
    }
    beat(); // immediate on mount / path change
    const id = setInterval(beat, 60_000);
    return () => clearInterval(id);
  }, [pathname]);

  // ── Fetch presence + activity (poll) ──────────────────────────────────────
  const fetchPresence = useCallback(() => {
    fetch('/api/team/presence').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setPresence(d);
    }).catch(() => {});
  }, []);

  const fetchActivity = useCallback(() => {
    fetch('/api/team/activity').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setActivity(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchPresence();
    fetchActivity();
    const id = setInterval(() => { fetchPresence(); fetchActivity(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchPresence, fetchActivity]);

  // ── Initial messages fetch ────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/team/messages').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setMessages(d);
    }).catch(() => {});
  }, []);

  // ── Supabase Realtime subscription for messages ───────────────────────────
  // Free tier: up to 500 concurrent connections, no extra cost.
  // Future upgrade: switch to Supabase Realtime presence channels for green-dot
  // presence without polling — requires enabling Realtime on user_presence table.
  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`org-messages-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'org_messages', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        },
      )
      .subscribe();

    // Also subscribe to new activity for real-time feed updates
    const actChannel = supabase
      .channel(`org-activity-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'org_activity', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const item = payload.new as ActivityItem;
          setActivity(prev => {
            if (prev.some(a => a.id === item.id)) return prev;
            return [item, ...prev].slice(0, 40);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(actChannel);
    };
  }, [orgId]);

  // ── Scroll chat to bottom on new messages ─────────────────────────────────
  useEffect(() => {
    if (tab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, tab]);

  // ── Focus input when chat tab opens ───────────────────────────────────────
  useEffect(() => {
    if (tab === 'chat' && open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [tab, open]);

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    try {
      await fetch('/api/team/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      });
      // Realtime subscription will append the message — no need to push locally
    } catch {
      setDraft(content); // restore on failure
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
      style={{
        width: 360,
        height: 520,
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--header-bg)' }}>
        <Users className="w-4 h-4 text-teal-500 flex-shrink-0" />
        <span className="text-[13px] font-bold flex-1" style={{ color: 'var(--brand-text)' }}>
          Team
        </span>
        {/* Online count badge */}
        {presence.length > 0 && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full text-teal-400 border border-teal-400/20 flex-shrink-0"
            style={{ background: 'rgba(13,148,136,0.10)' }}>
            {presence.length} online
          </span>
        )}
        <button onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
          style={{ color: 'var(--faint-text)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Presence strip ─────────────────────────────────────────────────── */}
      {presence.length > 0 && (
        <div className="px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="space-y-1.5">
            {presence.slice(0, 4).map(u => {
              const isSelf = u.user_email === userEmail;
              const where  = pathLabel(u.current_path);
              return (
                <div key={u.user_id} className="flex items-center gap-2">
                  <div className="relative flex-shrink-0">
                    <Avatar email={u.user_email} size={26} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 bg-green-400"
                      style={{ borderColor: 'var(--sidebar-bg)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: 'var(--brand-text)' }}>
                      {u.user_email.split('@')[0]}{isSelf ? ' (you)' : ''}
                    </p>
                    {where && (
                      <p className="text-[10px] truncate" style={{ color: 'var(--faint-text)' }}>
                        viewing {where}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--faint-text)' }}>
                    {timeAgo(u.last_seen)}
                  </span>
                </div>
              );
            })}
            {presence.length > 4 && (
              <p className="text-[10px]" style={{ color: 'var(--faint-text)' }}>
                +{presence.length - 4} more online
              </p>
            )}
          </div>
        </div>
      )}

      {presence.length === 0 && (
        <div className="px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--sidebar-border)' }}>
          <p className="text-[11px]" style={{ color: 'var(--faint-text)' }}>No one else online right now</p>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--sidebar-border)' }}>
        {([
          { id: 'activity', label: 'Activity', icon: Activity },
          { id: 'chat',     label: 'Chat',     icon: MessageSquare },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold border-b-2 transition-all"
            style={{
              color: tab === id ? '#0d9488' : 'var(--faint-text)',
              borderBottomColor: tab === id ? '#0d9488' : 'transparent',
            }}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Activity tab ───────────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-8 text-center">
              <Activity className="w-8 h-8" style={{ color: 'var(--faint-text)' }} />
              <p className="text-[12px]" style={{ color: 'var(--faint-text)' }}>
                No activity yet — start exploring grants!
              </p>
            </div>
          ) : (
            activity.map(item => (
              <div key={item.id} className="flex items-start gap-2.5 py-2 rounded-[8px] px-2 -mx-2 transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: activityDot(item.action) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] leading-snug" style={{ color: 'var(--brand-text)' }}>
                    {activityLabel(item)}
                  </p>
                  {item.action === 'pipeline_move' && Boolean(item.metadata.from) && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--faint-text)' }}>
                      {String(item.metadata.from)} → {String(item.metadata.to)}
                    </p>
                  )}
                </div>
                <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: 'var(--faint-text)' }}>
                  {timeAgo(item.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Chat tab ───────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <MessageSquare className="w-8 h-8" style={{ color: 'var(--faint-text)' }} />
                <p className="text-[12px]" style={{ color: 'var(--faint-text)' }}>
                  No messages yet — say hi to your team!
                </p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const isSelf    = msg.user_email === userEmail;
                const prevEmail = i > 0 ? messages[i - 1].user_email : null;
                const showName  = msg.user_email !== prevEmail;
                return (
                  <div key={msg.id} className={`flex gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
                    {showName && !isSelf && <Avatar email={msg.user_email} size={26} />}
                    {!showName && !isSelf && <div className="w-[26px] flex-shrink-0" />}
                    <div className={`max-w-[75%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                      {showName && !isSelf && (
                        <p className="text-[10px] font-semibold px-1" style={{ color: 'var(--faint-text)' }}>
                          {msg.user_email.split('@')[0]}
                        </p>
                      )}
                      <div className="px-3 py-2 rounded-[12px] text-[12px] leading-snug"
                        style={isSelf
                          ? { background: '#0d9488', color: '#fff', borderBottomRightRadius: 4 }
                          : { background: 'var(--nav-hover-bg)', color: 'var(--brand-text)', borderBottomLeftRadius: 4 }}>
                        {msg.content}
                      </div>
                      <p className="text-[10px] px-1" style={{ color: 'var(--faint-text)' }}>
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="flex items-center gap-2 rounded-[10px] border px-3 py-2"
              style={{ borderColor: 'var(--sidebar-border)', background: 'var(--nav-hover-bg)' }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Message your team…"
                maxLength={2000}
                className="flex-1 bg-transparent text-[12px] outline-none"
                style={{ color: 'var(--brand-text)' }}
              />
              <button
                onClick={sendMessage}
                disabled={!draft.trim() || sending}
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
                style={{ background: draft.trim() ? '#0d9488' : 'transparent' }}>
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Team button for the header bar ────────────────────────────────────────────
// Shows a pulsing green dot if anyone else is online.
// Future upgrade: replace polling with Supabase Realtime presence channels
// (channel.track / channel.on('presence', ...)) for sub-second accuracy.
export function TeamButton({ onClick, userEmail }: {
  onClick:   () => void;
  userEmail: string;
}) {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    function check() {
      fetch('/api/team/presence').then(r => r.json()).then(d => {
        if (Array.isArray(d)) {
          // Count others online (exclude self)
          setOnlineCount(d.filter((u: PresenceUser) => u.user_email !== userEmail).length);
        }
      }).catch(() => {});
    }
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [userEmail]);

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors"
      style={{ color: 'var(--nav-text)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover-bg)'; e.currentTarget.style.color = 'var(--nav-hover-text)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--nav-text)'; }}
      title="Team panel"
    >
      <Users className="w-4 h-4" />
      <span>Team</span>
      {onlineCount > 0 && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      )}
    </button>
  );
}
