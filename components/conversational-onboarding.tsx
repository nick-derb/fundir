'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, ArrowUp, Loader2, CheckCircle, MapPin,
  Building2, DollarSign, Users, Target, Briefcase, Tag,
  ArrowRight,
} from 'lucide-react';

interface ChatMessage { role: 'user' | 'assistant'; content: string; options?: string[]; }

interface OnboardingProfile {
  orgName?:         string;
  city?:            string;
  state?:           string;
  mission?:         string;
  programs?:        string[];
  targetPopulations?: string[];
  annualBudget?:    number | null;
  fundingUse?:      string[];
  funderTypes?:     string[];
  grantSizeMin?:    number | null;
  grantSizeMax?:    number | null;
}

interface TurnResponse {
  assistant_message:  string;
  extracted:          Partial<OnboardingProfile>;
  suggested_options:  string[];
  done:               boolean;
  summary?:           string;
}

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function mergeProfile(prev: OnboardingProfile, next: Partial<OnboardingProfile>): OnboardingProfile {
  const merged: OnboardingProfile = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (v == null || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v) && Array.isArray((merged as Record<string, unknown>)[k])) {
      const existing = (merged as Record<string, unknown>)[k] as unknown[];
      (merged as Record<string, unknown>)[k] = Array.from(new Set([...existing, ...v]));
    } else {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  return merged;
}

// ── Profile sidebar ─────────────────────────────────────────────────────────

function ProfileRow({ icon: Icon, label, value, chips }: {
  icon: React.ElementType; label: string;
  value?: string | null; chips?: string[];
}) {
  const empty = !value && (!chips || chips.length === 0);
  return (
    <div className="px-4 py-3 border-b border-[#f1f5f9] last:border-0 transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-[#94a3b8]" />
        <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">{label}</span>
      </div>
      {empty && <span className="text-[12px] text-[#cbd5e1]">—</span>}
      {value && <p className="text-[13px] text-[#0f172a] font-medium">{value}</p>}
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {chips.map(c => (
            <span key={c}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0fdfa] text-[#0d9488] border border-[#ccfbf1]">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function ConversationalOnboarding() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile,  setProfile]  = useState<OnboardingProfile>({});
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(true);
  const [done,     setDone]     = useState(false);
  const [summary,  setSummary]  = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const bootedRef = useRef(false);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Initial AI turn — greeting + first question
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    callTurn([], {});
  }, []);

  async function callTurn(history: ChatMessage[], currentProfile: OnboardingProfile) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          profile:  currentProfile,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Turn failed');
      const t = json as TurnResponse;

      const assistantMsg: ChatMessage = {
        role:    'assistant',
        content: t.assistant_message,
        options: t.suggested_options?.length ? t.suggested_options : undefined,
      };

      setMessages(m => [...m, assistantMsg]);
      setProfile(p => mergeProfile(p, t.extracted));
      if (t.done) {
        setDone(true);
        if (t.summary) setSummary(t.summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || done) return;
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    await callTurn(history, profile);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function continueToSignup() {
    try {
      sessionStorage.setItem('fundir-onboarding-profile', JSON.stringify({ profile, summary }));
    } catch { /* noop — sessionStorage might be unavailable */ }
    router.push('/onboarding');
  }

  const location = [profile.city, profile.state].filter(Boolean).join(', ') || null;
  const budget   = profile.annualBudget ? money(profile.annualBudget) : null;
  const grantRange = profile.grantSizeMin || profile.grantSizeMax
    ? `${money(profile.grantSizeMin)} – ${money(profile.grantSizeMax)}`
    : null;

  return (
    <div className="min-h-screen" data-theme="light" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 60%)' }}>
      {/* Top bar */}
      <header className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[6px] flex items-center justify-center text-white text-[11px] font-extrabold"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>F</div>
          <span className="font-bold text-[15px] tracking-tight text-[#0f172a]">Fundir</span>
        </div>
        <span className="text-[11px] text-[#64748b]">Onboarding · approx. 2 minutes</span>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Chat (3/5) ── */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>

            {/* Chat header */}
            <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#0f172a]">Fundir Onboarding Assistant</p>
                <p className="text-[11px] text-[#64748b]">Tell me about your nonprofit — I&apos;ll build your profile as we go.</p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
              {messages.map((m, i) => (
                <div key={i}>
                  <div className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] text-[13px] leading-relaxed rounded-2xl px-4 py-2.5 ${
                      m.role === 'user' ? 'text-white' : 'bg-[#f1f5f9] text-[#0f172a]'
                    }`}
                    style={m.role === 'user'
                      ? { background: 'linear-gradient(135deg, #0d9488, #0891b2)' }
                      : undefined}>
                      {m.content}
                    </div>
                  </div>

                  {/* Suggested option chips */}
                  {m.role === 'assistant' && m.options && i === messages.length - 1 && !loading && !done && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                      {m.options.map(opt => (
                        <button key={opt}
                          onClick={() => send(opt)}
                          className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#0d9488] bg-white border border-[#0d9488]/30 hover:bg-[#f0fdfa] transition-colors">
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-[#f1f5f9] text-[#0f172a] rounded-2xl px-4 py-3 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0d9488]" />
                    <span className="text-[12px] text-[#64748b]">Thinking…</span>
                  </div>
                </div>
              )}

              {error && !loading && (
                <div className="flex justify-center">
                  <div className="text-[12px] text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2">
                    {error}
                  </div>
                </div>
              )}
            </div>

            {/* Input or done CTA */}
            {done ? (
              <div className="px-5 py-4 border-t border-[#e2e8f0] bg-[#f8fafc]">
                <p className="text-[12px] text-[#16a34a] font-semibold flex items-center gap-1.5 mb-2">
                  <CheckCircle className="w-3.5 h-3.5" /> Profile captured
                </p>
                <button onClick={continueToSignup}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[8px] text-[13px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                  Create your account
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="px-4 py-3 border-t border-[#e2e8f0] bg-white">
                <div className="flex items-end gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    disabled={loading}
                    placeholder={loading ? 'Waiting for response…' : 'Just describe it the same way you\'d tell a colleague…'}
                    className="flex-1 resize-none bg-transparent text-[13px] outline-none max-h-24 leading-relaxed text-[#0f172a] placeholder:text-[#94a3b8] disabled:opacity-40"
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={!input.trim() || loading}
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-30"
                    style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                    {loading
                      ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                      : <ArrowUp className="w-3.5 h-3.5 text-white" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Profile sidebar (2/5) ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm sticky top-6">
            <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-[#0d9488]" />
              <div>
                <h2 className="text-[12px] font-bold text-[#0f172a]">Your profile, as we build it</h2>
                <p className="text-[10px] text-[#94a3b8]">Filled in live from your answers</p>
              </div>
            </div>
            <div>
              <ProfileRow icon={Building2} label="Organization" value={profile.orgName} />
              <ProfileRow icon={MapPin}    label="Location"     value={location} />
              <ProfileRow icon={Sparkles}  label="Mission"      value={profile.mission} />
              <ProfileRow icon={Briefcase} label="Programs"     chips={profile.programs} />
              <ProfileRow icon={Users}     label="Target population" chips={profile.targetPopulations} />
              <ProfileRow icon={DollarSign} label="Annual budget" value={budget} />
              <ProfileRow icon={Tag}       label="Funding use"    chips={profile.fundingUse} />
              <ProfileRow icon={Tag}       label="Funder types"   chips={profile.funderTypes} />
              <ProfileRow icon={DollarSign} label="Grant size targeted" value={grantRange} />
            </div>

            {summary && (
              <div className="px-4 py-3 border-t border-[#e2e8f0] bg-gradient-to-b from-[#f0fdfa] to-white">
                <p className="text-[10px] font-bold text-[#0d9488] uppercase tracking-widest mb-1">Summary</p>
                <p className="text-[12px] text-[#0f172a] leading-relaxed">{summary}</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
