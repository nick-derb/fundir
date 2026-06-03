'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, ArrowUp, Loader2 } from 'lucide-react';

interface Msg { role: 'user' | 'assistant'; content: string; }

interface AiAdvisorProps {
  orgCode?: string;
  orgId?: string;
  orgName?: string;
}

const CYC_STARTERS = [
  "What's our most urgent financial risk right now?",
  'Which grant matches should we prioritize this month?',
  'How do we reduce our 75% government funding dependency?',
  'Draft funder talking points about our operating deficit',
];

const GENERIC_STARTERS = [
  'Which grant matches should we prioritize this month?',
  'What should we look for in a strong funder fit?',
  'Draft an opening paragraph for a foundation pitch',
  'How do we build a stronger grant pipeline?',
];

// Lightweight markdown — bold + bullets, no dependency.
function renderContent(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const bulletMatch = line.match(/^\s*[-•]\s+(.*)$/);
    const body = bulletMatch ? bulletMatch[1] : line;
    const parts = body.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith('**') && seg.endsWith('**')
        ? <strong key={j} className="font-semibold">{seg.slice(2, -2)}</strong>
        : <span key={j}>{seg}</span>
    );
    if (bulletMatch) {
      return (
        <div key={i} className="flex gap-2 my-0.5">
          <span className="text-[#0d9488] mt-[1px] flex-shrink-0">•</span>
          <span>{parts}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className="my-0.5">{parts}</p>;
  });
}

export function AiAdvisor({ orgCode, orgId, orgName }: AiAdvisorProps) {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Msg[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const isCyc    = orgCode === 'CYC2025';
  const starters = isCyc ? CYC_STARTERS : GENERIC_STARTERS;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const history = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orgCode, orgId, orgName, messages: history }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Request failed');
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : 'Something went wrong.';
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: `Sorry — ${msg} Please try again.` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full shadow-lg text-white text-[13px] font-semibold transition-transform hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
        >
          <Sparkles className="w-4 h-4" />
          Ask Fundir
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[60] flex flex-col rounded-2xl shadow-2xl overflow-hidden border w-[calc(100vw-32px)] sm:w-[420px] h-[calc(100vh-32px)] sm:h-[620px] sm:max-h-[calc(100vh-48px)]"
          style={{
            background: 'var(--card-bg, #ffffff)',
            borderColor: 'var(--card-border, #e2e8f0)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
          >
            <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-white leading-tight">Fundir Advisor</p>
              <p className="text-[11px] text-white/70 leading-tight truncate">
                Grant strategist · {orgName ?? 'your organization'}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/15 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div
                  className="text-[12.5px] leading-relaxed p-3 rounded-xl"
                  style={{ background: 'var(--badge-bg, #f1f5f9)', color: 'var(--text-secondary, #475569)' }}
                >
                  I'm your grant strategist. I can read {isCyc ? "Chicago Youth Centers'" : 'your'} financials,
                  federal funding risk, and live grant matches — and help you decide what to do next.
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wide px-1" style={{ color: 'var(--text-tertiary, #94a3b8)' }}>
                  Try asking
                </p>
                {starters.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-[12.5px] px-3 py-2.5 rounded-xl border transition-colors hover:border-[#0d9488]"
                    style={{
                      background: 'var(--card-bg, #ffffff)',
                      borderColor: 'var(--card-border, #e2e8f0)',
                      color: 'var(--text-primary, #0f172a)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[88%] text-[12.5px] leading-relaxed rounded-2xl px-3.5 py-2.5"
                  style={
                    m.role === 'user'
                      ? { background: 'linear-gradient(135deg, #0d9488, #0891b2)', color: '#ffffff' }
                      : { background: 'var(--badge-bg, #f1f5f9)', color: 'var(--text-primary, #0f172a)' }
                  }
                >
                  {m.role === 'assistant' && !m.content && streaming ? (
                    <span className="flex items-center gap-1.5 text-[#0d9488]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-[12px]">Thinking…</span>
                    </span>
                  ) : (
                    renderContent(m.content)
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-3 border-t" style={{ borderColor: 'var(--card-border, #e2e8f0)' }}>
            <div
              className="flex items-end gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor: 'var(--card-border, #e2e8f0)', background: 'var(--card-bg, #ffffff)' }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask about funding strategy…"
                className="flex-1 resize-none bg-transparent text-[12.5px] outline-none max-h-24 leading-relaxed"
                style={{ color: 'var(--text-primary, #0f172a)' }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || streaming}
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
              >
                {streaming
                  ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  : <ArrowUp className="w-3.5 h-3.5 text-white" />}
              </button>
            </div>
            <p className="text-[10px] mt-1.5 px-1" style={{ color: 'var(--text-tertiary, #94a3b8)' }}>
              Advice is AI-generated from your Fundir data — verify before acting.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
