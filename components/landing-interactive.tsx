'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';

// ── Typewriter ────────────────────────────────────────────────────────────────

const PHRASES = ['Every Decision.', 'Every Deadline.', 'Every Opportunity.', 'Every Application.'];

export function HeroTypewriter() {
  const [displayed, setDisplayed] = useState('');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const target = PHRASES[phraseIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting) {
      if (displayed.length < target.length) {
        timeout = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 65);
      } else {
        timeout = setTimeout(() => setIsDeleting(true), 2200);
      }
    } else {
      if (displayed.length > 0) {
        timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 38);
      } else {
        setIsDeleting(false);
        setPhraseIdx(i => (i + 1) % PHRASES.length);
      }
    }
    return () => clearTimeout(timeout);
  }, [displayed, isDeleting, phraseIdx]);

  return (
    <span className="text-[#0d9488] whitespace-nowrap">
      {displayed}
      <span
        className="inline-block w-[3px] h-[0.85em] bg-[#0d9488] ml-1 align-middle rounded-sm animate-blink"
        aria-hidden
      />
    </span>
  );
}

// ── Animated hero CTA buttons ─────────────────────────────────────────────────

export function HeroCTAs() {
  return (
    <div className="flex items-center gap-4">
      <Link
        href="/onboarding/chat"
        className="group relative flex items-center gap-2.5 px-7 py-3.5 bg-white text-[#0a0a0a] font-bold text-[14px] overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(255,255,255,0.2)]"
      >
        <span className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <span className="relative">Get Started</span>
        <ArrowRight className="relative w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
      <Link
        href="/login"
        className="flex items-center gap-2 px-7 py-3.5 border border-white/20 text-white/60 font-medium text-[14px] transition-all duration-200 hover:border-white/50 hover:text-white hover:bg-white/5 hover:-translate-y-0.5"
      >
        Sign in
      </Link>
    </div>
  );
}

// ── Animated stat counter ─────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1400) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(ease * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { ref, count };
}

export function StatCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const { ref, count } = useCountUp(value);
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Product tabs (interactive) ────────────────────────────────────────────────

interface Product {
  tab: string;
  label: string;
  heading: string;
  body: string;
}

const mockGrants = [
  { title: 'Youth Workforce Development Initiative', type: 'Federal',    amount: '$250K', score: 94 },
  { title: 'After-School STEM Programs',             type: 'Foundation', amount: '$75K',  score: 87 },
  { title: 'Community Health Equity Fund',           type: 'Corporate',  amount: '$50K',  score: 71 },
  { title: 'Title I School Support Grant',           type: 'Federal',    amount: '$180K', score: 63 },
  { title: 'Neighborhood Revitalization Grant',      type: 'State',      amount: '$90K',  score: 58 },
];

const typeColor: Record<string, string> = {
  Federal:    '#2563eb',
  Foundation: '#7c3aed',
  Corporate:  '#16a34a',
  State:      '#d97706',
};

const PANEL_PREVIEWS = [
  // Grant Discovery
  (
    <div className="p-4 scan-line" key="discovery">
      <div className="flex items-center gap-3 mb-4 p-2.5 bg-white/5 rounded border border-white/10">
        <Search className="w-3.5 h-3.5 text-white/30" />
        <span className="text-[11px] text-white/30">Searching 1,200+ opportunities…</span>
        <span className="ml-auto text-[10px] text-[#0d9488] font-semibold">142 matches</span>
      </div>
      <div className="space-y-2">
        {mockGrants.map((g, i) => {
          const sc = g.score >= 70 ? '#0d9488' : '#d97706';
          const tc = typeColor[g.type] || '#64748b';
          return (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-white/5 rounded border border-white/5 hover:border-[#0d9488]/40 hover:bg-white/8 transition-all duration-150 cursor-default group">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-white/80 truncate group-hover:text-white transition-colors">{g.title}</p>
                <span className="text-[9px] font-semibold" style={{ color: tc }}>{g.type} · {g.amount}</span>
              </div>
              <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all group-hover:scale-110" style={{ borderColor: sc }}>
                <span className="text-[10px] font-bold" style={{ color: sc }}>{g.score}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ),
  // 990 Screening
  (
    <div className="p-4" key="screening">
      <div className="mb-3 p-2.5 bg-white/5 rounded border border-white/10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/40">EIN 23-7401797 · Chicago Youth Centers</span>
          <span className="text-[9px] text-[#0d9488] font-bold">990 Synced ✓</span>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-[#0d9488] rounded-full" style={{ width: '78%' }} />
        </div>
      </div>
      <div className="space-y-1.5">
        {[
          { label: 'Budget Fit',          score: 92, status: 'match',    color: '#16a34a' },
          { label: 'Financial Stability', score: 88, status: 'match',    color: '#16a34a' },
          { label: 'Revenue Trend',       score: 71, status: 'likely',   color: '#d97706' },
          { label: 'Mission Alignment',   score: 95, status: 'match',    color: '#16a34a' },
          { label: 'NTEE Fit',            score: 83, status: 'match',    color: '#16a34a' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 p-2 rounded bg-white/4 hover:bg-white/8 transition-colors cursor-default">
            <span className="text-[10px] text-white/60 flex-1">{s.label}</span>
            <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${s.score}%`, background: s.color }} />
            </div>
            <span className="text-[9px] font-bold w-12 text-right" style={{ color: s.color }}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  ),
  // Pipeline
  (
    <div className="p-4" key="pipeline">
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { stage: 'Reviewing', count: 8, color: '#2563eb' },
          { stage: 'Drafting',  count: 3, color: '#d97706' },
          { stage: 'Submitted', count: 5, color: '#16a34a' },
        ].map(s => (
          <div key={s.stage} className="bg-white/5 rounded border border-white/10 p-2 text-center hover:border-white/20 transition-colors cursor-default">
            <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.count}</div>
            <div className="text-[9px] text-white/30">{s.stage}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { title: 'HHS Youth Services',  days: 4,  stage: 'Drafting',  stageColor: '#d97706', daysColor: '#dc2626' },
          { title: 'Ford Foundation',     days: 12, stage: 'Reviewing', stageColor: '#2563eb', daysColor: '#d97706' },
          { title: 'DOE STEM Initiative', days: 28, stage: 'Reviewing', stageColor: '#2563eb', daysColor: '#64748b' },
        ].map((g, i) => (
          <div key={i} className="flex items-center gap-2 p-2.5 bg-white/5 rounded border border-white/5 hover:border-white/15 hover:bg-white/8 transition-all cursor-default">
            <span className="text-[10px] text-white/70 flex-1 truncate">{g.title}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: g.stageColor, background: g.stageColor + '20' }}>{g.stage}</span>
            <span className="text-[10px] font-bold" style={{ color: g.daysColor }}>{g.days}d</span>
          </div>
        ))}
      </div>
    </div>
  ),
  // Risk Monitor
  (
    <div className="p-4" key="risk">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] text-white/40 uppercase tracking-wider">Federal Exposure</span>
        <span className="text-[9px] text-red-400 font-bold bg-red-400/10 px-2 py-0.5 rounded">2 At Risk</span>
      </div>
      <div className="space-y-2">
        {[
          { program: 'Title I (ED)',       amount: '$480K', risk: 'critical',  color: '#dc2626', pct: 28 },
          { program: '21st CCLC',          amount: '$220K', risk: 'elevated',  color: '#d97706', pct: 13 },
          { program: 'OJJDP Youth Svcs',   amount: '$110K', risk: 'moderate',  color: '#0d9488', pct: 7  },
          { program: 'CDBG Block Grant',   amount: '$95K',  risk: 'low',       color: '#16a34a', pct: 6  },
        ].map((r, i) => (
          <div key={i} className="p-2.5 bg-white/4 rounded border border-white/8 hover:bg-white/8 transition-colors cursor-default">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-white/70">{r.program}</span>
              <span className="text-[10px] font-bold" style={{ color: r.color }}>{r.amount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${r.pct * 2}%`, background: r.color }} />
              </div>
              <span className="text-[9px] font-semibold" style={{ color: r.color }}>{r.risk}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
];

export function ProductTabs({ products }: { products: Product[] }) {
  const [active, setActive] = useState(0);

  return (
    <section className="bg-white border-t border-[#e2e8f0]">
      {/* Tab bar */}
      <div className="max-w-6xl mx-auto px-8">
        <div className="flex gap-0 overflow-x-auto border-b border-[#e2e8f0]">
          {products.map((p, i) => (
            <button
              key={p.tab}
              onClick={() => setActive(i)}
              className={`px-6 py-4 text-[13px] font-semibold whitespace-nowrap transition-all duration-200 border-b-2 ${
                active === i
                  ? 'border-[#0d9488] text-[#0d9488]'
                  : 'border-transparent text-[#94a3b8] hover:text-[#475569] hover:border-[#e2e8f0]'
              }`}
            >
              {p.tab}
            </button>
          ))}
          <Link href="/onboarding/chat" className="ml-auto px-6 py-4 text-[13px] font-semibold text-[#94a3b8] hover:text-[#0d9488] whitespace-nowrap transition-colors">
            SEE ALL →
          </Link>
        </div>
      </div>

      {/* Panel */}
      <div className="bg-[#1a1f2e]">
        <div className="max-w-6xl mx-auto px-8 py-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div key={active} className="animate-slide-in-left">
            <p className="text-[10px] font-bold text-[#0d9488] tracking-widest mb-4 uppercase">{products[active].label}</p>
            <h3 className="text-[36px] font-bold text-white leading-tight mb-6">{products[active].heading}</h3>
            <p className="text-[16px] text-white/50 leading-relaxed mb-8">{products[active].body}</p>
            <Link
              href="/onboarding/chat"
              className="group inline-flex items-center gap-2 text-[13px] font-semibold text-white border-b border-white/30 pb-0.5 hover:border-white transition-colors"
            >
              Explore {products[active].tab}
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Preview */}
          <div key={`preview-${active}`} className="rounded-xl overflow-hidden border border-white/10 bg-[#0f172a] animate-fade-in">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
              <div className="w-2 h-2 rounded-full bg-[#ef4444]/50 hover:bg-[#ef4444]/80 transition-colors" />
              <div className="w-2 h-2 rounded-full bg-[#eab308]/50 hover:bg-[#eab308]/80 transition-colors" />
              <div className="w-2 h-2 rounded-full bg-[#22c55e]/50 hover:bg-[#22c55e]/80 transition-colors" />
              <span className="ml-2 text-[10px] text-white/20 font-mono">fundir.ai/{products[active].tab.toLowerCase().replace(' ', '-')}</span>
            </div>
            {PANEL_PREVIEWS[active]}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Scroll-reveal wrapper ─────────────────────────────────────────────────────

export function ScrollReveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── Animated nav (backdrop blur on scroll) ────────────────────────────────────

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-16 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(10,10,10,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
      }}
    >
      <Link href="/" className="flex items-center gap-3 group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fundir-logo.png" alt="Fundir" width={36} height={36} className="transition-transform duration-200 group-hover:scale-105" />
        <span className="text-[17px] font-semibold text-white tracking-tight">Fundir</span>
      </Link>

      <Link
        href="/onboarding/chat"
        className="relative px-5 py-2 border border-white text-white text-[13px] font-semibold overflow-hidden group transition-all duration-200 hover:-translate-y-px"
      >
        <span className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out" />
        <span className="relative group-hover:text-[#0a0a0a] transition-colors duration-150">Get Started</span>
      </Link>
    </header>
  );
}
