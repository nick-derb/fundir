import Link from 'next/link';
import {
  ArrowDown, CheckCircle,
  BarChart3, Shield, TrendingUp, FileText, Clock, Target, ChevronRight,
} from 'lucide-react';
import {
  HeroTypewriter, HeroCTAs, ProductTabs, ScrollReveal, LandingNav,
} from '@/components/landing-interactive';

/* ── Static data ────────────────────────────────────── */
const products = [
  {
    tab: 'Grant Discovery',
    label: 'GRANT DISCOVERY',
    heading: 'Every relevant opportunity. Surfaced automatically.',
    body: 'Fundir monitors federal, foundation, and corporate grant databases 24/7 — scoring each opportunity against your organization\'s financial profile, mission, and historical wins.',
  },
  {
    tab: '990 Screening',
    label: '990 FINANCIAL SCREENING',
    heading: 'Your IRS 990, transformed into a competitive advantage.',
    body: 'Most nonprofits apply blind. Fundir reverse-scores every grant against your actual 990 data — budget fit, revenue diversification, financial stability, NTEE alignment — before you spend a single hour on an application.',
  },
  {
    tab: 'Pipeline',
    label: 'GRANT PIPELINE',
    heading: 'From discovery to award. One system of record.',
    body: 'Stage every opportunity from reviewing to submitted to awarded. Deadline tracking, task management, and grant notes — built for development teams.',
  },
  {
    tab: 'Risk Monitor',
    label: 'FEDERAL RISK RADAR',
    heading: 'Know which federal programs are at risk before the news does.',
    body: 'Fundir maps every federal grant in your 990 to current appropriations status — flagging concentration risk and identifying private alternatives before funding gaps emerge.',
  },
];

const mockGrants = [
  { title: 'Youth Workforce Development Initiative', type: 'Federal',    amount: '$250K', score: 94 },
  { title: 'After-School STEM Programs',             type: 'Foundation', amount: '$75K',  score: 87 },
  { title: 'Community Health Equity Fund',           type: 'Corporate',  amount: '$50K',  score: 71 },
  { title: 'Title I School Support Grant',           type: 'Federal',    amount: '$180K', score: 63 },
  { title: 'Neighborhood Revitalization Grant',      type: 'State',      amount: '$90K',  score: 58 },
];

const typeColor: Record<string, string> = {
  Federal: '#2563eb', Foundation: '#7c3aed', Corporate: '#16a34a', State: '#d97706',
};

/* ── Page ───────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="landing-dark min-h-screen bg-[#0a0a0a] text-white">

      {/* ══ NAV — animated backdrop blur on scroll ═══════════════════════════ */}
      <LandingNav />

      {/* ══ HERO ═════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        {/* Grid */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Animated teal glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] rounded-full blur-[160px] pointer-events-none animate-float-glow"
          style={{ background: 'radial-gradient(ellipse, rgba(13,148,136,0.12), transparent 70%)' }}
        />
        {/* Secondary glow */}
        <div className="absolute bottom-1/3 right-0 w-[500px] h-[400px] rounded-full blur-[120px] pointer-events-none opacity-40"
          style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.1), transparent 70%)' }}
        />

        {/* Product screenshot — ghost browser on the right */}
        <div className="absolute inset-0 flex items-center justify-end pr-0 pointer-events-none">
          <div className="w-[62%] h-full relative">
            <div className="absolute inset-8 rounded-xl overflow-hidden border border-white/8 shadow-2xl bg-[#0f172a] opacity-35 scan-line">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1e293b] border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#eab308]/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/60" />
                <span className="ml-3 text-[10px] text-white/25 font-mono">app.fundir.ai/dashboard</span>
              </div>
              <div className="flex h-full">
                <div className="w-40 border-r border-white/10 p-3 flex-shrink-0">
                  <div className="space-y-1 mt-4">
                    {['Dashboard', 'Discover', 'Financials', 'Pipeline', 'Calendar', 'Reports'].map((item, i) => (
                      <div key={item} className={`px-2.5 py-1.5 rounded text-[11px] font-medium ${i === 0 ? 'bg-[#0d9488]/20 text-[#2dd4bf]' : 'text-white/25'}`}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { n: '142', l: 'Tracked',    c: '#2563eb' },
                      { n: '23',  l: 'High Match', c: '#0d9488' },
                      { n: '$2.1M', l: 'Pipeline', c: '#7c3aed' },
                      { n: '8',   l: 'Due Soon',   c: '#dc2626' },
                    ].map(s => (
                      <div key={s.l} className="bg-white/5 rounded border border-white/10 p-2.5">
                        <div className="text-[16px] font-bold" style={{ color: s.c }}>{s.n}</div>
                        <div className="text-[9px] text-white/25 mt-0.5">{s.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/5 rounded border border-white/10 overflow-hidden">
                    <div className="flex gap-3 px-3 py-2 border-b border-white/10">
                      {['Grant', 'Type', 'Amount', 'Score'].map(h => (
                        <span key={h} className="text-[9px] font-semibold text-white/25 uppercase tracking-wide flex-1">{h}</span>
                      ))}
                    </div>
                    {mockGrants.map((g, i) => {
                      const sc = g.score >= 70 ? '#0d9488' : '#d97706';
                      return (
                        <div key={i} className="flex gap-3 px-3 py-2 border-b border-white/5 last:border-0">
                          <span className="flex-1 text-[10px] text-white/50 truncate">{g.title}</span>
                          <span className="flex-1 text-[9px] font-semibold" style={{ color: typeColor[g.type] }}>{g.type}</span>
                          <span className="flex-1 text-[10px] font-mono text-white/35">{g.amount}</span>
                          <span className="flex-1 text-[10px] font-bold" style={{ color: sc }}>{g.score}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative flex-1 flex flex-col justify-center px-16 pt-24 pb-24 max-w-3xl">
          <div className="animate-fade-in-up delay-100">
            <span className="inline-flex items-center gap-2 px-3 py-1 border border-[#0d9488]/40 text-[#0d9488] text-[11px] font-semibold uppercase tracking-widest mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0d9488] animate-pulse" />
              AI Grant Intelligence Platform
            </span>
          </div>

          <h1 className="text-[64px] md:text-[76px] font-bold text-white leading-[1.0] tracking-tight mb-8 animate-fade-in-up delay-200">
            AI-Powered Grant<br />
            Intelligence for<br />
            <HeroTypewriter />
          </h1>

          <p className="text-[18px] text-white/45 leading-relaxed max-w-md mb-10 animate-fade-in-up delay-300">
            Fundir connects your IRS 990, your mission, and the full federal and foundation grant landscape into a single intelligence platform.
          </p>

          <div className="animate-fade-in-up delay-400">
            <HeroCTAs />
          </div>

        </div>

        {/* Scroll indicator */}
        <div className="relative pb-10 flex flex-col items-center gap-2 animate-fade-in delay-700">
          <span className="text-[11px] text-white/25 tracking-widest uppercase font-medium">Scroll to Explore</span>
          <ArrowDown className="w-4 h-4 text-white/25 animate-bounce" />
        </div>
      </section>

      {/* ══ STATEMENT ════════════════════════════════════════════════════════ */}
      <section className="py-32 px-8 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <ScrollReveal>
            <p className="text-[13px] font-semibold text-[#94a3b8] uppercase tracking-widest mb-8">Our Software</p>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <h2 className="text-[48px] md:text-[64px] font-bold text-[#0f172a] leading-[1.1] tracking-tight">
              The grant world now has<br />
              <span className="text-shimmer">an operating system.</span>
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <p className="mt-8 text-[20px] text-[#475569] leading-relaxed max-w-3xl mx-auto">
              Fundir doesn&apos;t just find grants — it scores them against your actual financial capacity, flags eligibility risks before you apply, and builds institutional knowledge from every outcome.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ══ PRODUCT TABS — interactive ═══════════════════════════════════════ */}
      <ProductTabs products={products} />

      {/* ══ CAPABILITIES ═════════════════════════════════════════════════════ */}
      <section className="py-24 px-8 bg-white border-t border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <div className="mb-16">
              <p className="text-[#0d9488] text-[12px] font-bold uppercase tracking-widest mb-3">Platform Capabilities</p>
              <h2 className="text-[40px] font-bold text-[#0f172a] leading-tight">
                Built for the full grant lifecycle.
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: BarChart3, color: '#0d9488',
                label: 'Financial Intelligence',
                heading: 'Instant 990 financial profiling',
                desc: 'Auto-matched by EIN. Fundir pulls your IRS 990, computes 7 financial eligibility signals per grant, and flags concentration risk before you apply.',
                preview: (
                  <div className="space-y-2">
                    {[
                      { label: 'Budget Fit',          status: 'match',  color: '#16a34a', pct: 92 },
                      { label: 'Financial Stability',  status: 'match',  color: '#16a34a', pct: 88 },
                      { label: 'Revenue Trend',        status: 'likely', color: '#d97706', pct: 71 },
                      { label: 'Mission Alignment',    status: 'match',  color: '#16a34a', pct: 95 },
                      { label: 'Exec Efficiency',      status: 'match',  color: '#16a34a', pct: 83 },
                    ].map(s => (
                      <div key={s.label} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#475569] flex-1">{s.label}</span>
                        <div className="w-12 h-1 bg-[#f1f5f9] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                        </div>
                        <span className="text-[10px] font-semibold w-10 text-right" style={{ color: s.color }}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                ),
                href: '/onboarding',
              },
              {
                icon: Target, color: '#7c3aed',
                label: 'Match Scoring',
                heading: 'Know who welcomes your application',
                desc: 'A 7-factor composite score — semantic fit, financial eligibility, NTEE alignment, revenue trend, and more — ranked for every opportunity.',
                preview: (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-14 h-14 rounded-full border-2 border-[#16a34a] flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-110">
                        <span className="text-[18px] font-bold text-[#16a34a]">91</span>
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-[#16a34a]">Strong Match</p>
                        <p className="text-[11px] text-[#94a3b8]">7-factor composite</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { label: 'Semantic',    val: 96, c: '#0d9488' },
                        { label: 'Financial',   val: 88, c: '#7c3aed' },
                        { label: 'Eligibility', val: 90, c: '#2563eb' },
                      ].map(f => (
                        <div key={f.label}>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[10px] text-[#64748b]">{f.label}</span>
                            <span className="text-[10px] font-bold" style={{ color: f.c }}>{f.val}</span>
                          </div>
                          <div className="h-1 bg-[#f1f5f9] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${f.val}%`, background: f.c }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
                href: '/onboarding',
              },
              {
                icon: Clock, color: '#2563eb',
                label: 'Pipeline & Deadlines',
                heading: 'Never miss a deadline again',
                desc: 'Kanban pipeline, deadline calendar, task management, and grant notes — everything your development team needs to execute from discovery to award.',
                preview: (
                  <div className="space-y-2">
                    {[
                      { title: 'HHS Youth Services', days: 4,  c: '#dc2626' },
                      { title: 'Ford Foundation',    days: 12, c: '#d97706' },
                      { title: 'DOE STEM Grant',     days: 28, c: '#2563eb' },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center justify-between bg-[#f8fafc] rounded border border-[#e2e8f0] px-3 py-2 hover:border-[#0d9488]/30 hover:bg-[#f0fdfa] transition-all duration-150 cursor-default">
                        <p className="text-[11px] font-medium text-[#0f172a]">{d.title}</p>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" style={{ color: d.c }} />
                          <span className="text-[10px] font-bold" style={{ color: d.c }}>{d.days}d</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ),
                href: '/onboarding',
              },
            ].map((col, idx) => {
              const Icon = col.icon;
              return (
                <ScrollReveal key={col.label} delay={idx * 120}>
                  <div className="border border-[#e2e8f0] rounded-xl overflow-hidden card-hover h-full flex flex-col">
                    <div className="p-6 border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <div className="w-8 h-8 rounded-lg mb-4 flex items-center justify-center transition-transform duration-200 hover:scale-110" style={{ background: col.color + '18' }}>
                        <Icon className="w-4 h-4" style={{ color: col.color }} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: col.color }}>{col.label}</p>
                      {col.preview}
                    </div>
                    <div className="p-6 bg-white flex-1 flex flex-col">
                      <h3 className="font-bold text-[16px] text-[#0f172a] mb-2">{col.heading}</h3>
                      <p className="text-[13px] text-[#64748b] leading-relaxed mb-4 flex-1">{col.desc}</p>
                      <Link href={col.href} className="group flex items-center gap-1 text-[13px] font-semibold text-[#0d9488] hover:gap-2 transition-all duration-150">
                        Learn more <ChevronRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ DARK STATEMENT + STATS ════════════════════════════════════════════ */}
      <section className="py-32 px-8 bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute -top-16 left-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none animate-float-glow"
              style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.15), transparent)' }} />
            <ScrollReveal>
              <p className="text-[13px] font-semibold text-[#0d9488] uppercase tracking-widest mb-8">Why Fundir</p>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-[52px] md:text-[68px] font-bold text-white leading-[1.05] tracking-tight max-w-4xl">
                Fundir scores financial eligibility against every grant —{' '}
                <span className="text-white/25">before you spend a single hour applying.</span>
              </h2>
            </ScrollReveal>
          </div>

          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
            {[
              { value: 1200, suffix: '+',    label: 'Federal grants indexed',        display: '1,200+' },
              { value: 7,    suffix: '-factor', label: 'Financial eligibility engine', display: '7-factor' },
              { value: 990,  suffix: ' sync', label: 'Automatic EIN matching',       display: '990 sync' },
              { value: 30,   suffix: 's',    label: 'Per-grant AI processing',       display: '<30s' },
            ].map((s, i) => (
              <ScrollReveal key={s.label} delay={i * 80}>
                <div className="group bg-[#0a0a0a] px-8 py-10 hover:bg-[#0d9488]/8 transition-colors duration-300 cursor-default">
                  <div className="text-[36px] font-bold text-[#0d9488] font-mono mb-2 group-hover:text-[#2dd4bf] transition-colors duration-200">
                    {s.display}
                  </div>
                  <div className="text-[13px] text-white/35 group-hover:text-white/50 transition-colors duration-200">{s.label}</div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ COVERAGE ═════════════════════════════════════════════════════════ */}
      <section className="py-20 px-8 bg-white border-t border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="text-[#0d9488] text-[12px] font-bold uppercase tracking-widest mb-2">Coverage</p>
                <h2 className="text-[32px] font-bold text-[#0f172a]">Every mission area. Every funder type.</h2>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="flex flex-wrap gap-2 mb-12">
              {[
                'Education', 'Youth Development', 'Health & Wellness', 'Community Development',
                'Arts & Culture', 'Housing & Shelter', 'Environmental', 'Human Services',
                'Faith-Based', 'Workforce', 'Mental Health', 'Food Security',
                'Civil Rights', 'Science & Tech', 'International', 'Philanthropy',
              ].map(area => (
                <Link key={area} href="/onboarding"
                  className="px-4 py-1.5 border border-[#e2e8f0] text-[13px] text-[#475569] hover:border-[#0d9488] hover:text-[#0d9488] hover:bg-[#f0fdfa] hover:-translate-y-px hover:shadow-sm transition-all duration-150">
                  {area}
                </Link>
              ))}
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: Shield,     label: 'Federal Grants',    desc: 'Government grants via Grants.gov — auto-discovered daily', href: '/onboarding' },
              { icon: Target,     label: 'Foundation Grants', desc: 'Private & family foundations matched to your mission profile', href: '/onboarding' },
              { icon: TrendingUp, label: 'Corporate Grants',  desc: 'Corporate giving programs aligned to your program areas', href: '/onboarding' },
              { icon: FileText,   label: 'State & Local',     desc: 'State agency grants and municipal funding opportunities', href: '/onboarding' },
            ].map(({ icon: Icon, label, desc, href }, i) => (
              <ScrollReveal key={label} delay={i * 80}>
                <Link href={href} className="group flex items-start gap-4 p-5 border border-[#e2e8f0] hover:border-[#0d9488]/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 block">
                  <div className="w-8 h-8 bg-[#f0fdfa] flex items-center justify-center flex-shrink-0 transition-colors duration-200 group-hover:bg-[#0d9488]">
                    <Icon className="w-4 h-4 text-[#0d9488] transition-colors duration-200 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#0f172a] mb-0.5 group-hover:text-[#0d9488] transition-colors duration-150">{label}</p>
                    <p className="text-[13px] text-[#64748b]">{desc}</p>
                  </div>
                  <ChevronRight className="ml-auto w-4 h-4 text-[#e2e8f0] group-hover:text-[#0d9488] transition-all duration-150 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5" />
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ════════════════════════════════════════════════════════ */}
      <section className="relative py-32 px-8 bg-[#0a0a0a] overflow-hidden border-t border-white/5">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[120px] pointer-events-none animate-float-glow"
          style={{ background: 'radial-gradient(ellipse, rgba(13,148,136,0.1), transparent 70%)' }} />
        <div className="relative max-w-2xl mx-auto text-center">
          <ScrollReveal>
            <p className="text-[12px] font-bold text-[#0d9488] uppercase tracking-widest mb-6">Ready to get started?</p>
            <h2 className="text-[48px] font-bold text-white leading-tight mb-6">
              Find your next grant today.
            </h2>
            <p className="text-[16px] text-white/40 mb-10 leading-relaxed">
              Invite-only access for nonprofits. Request your invite to get started.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <Link
              href="/onboarding"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-[#0a0a0a] font-bold text-[14px] btn-glow hover:bg-white relative overflow-hidden"
            >
              <span className="absolute inset-0 bg-[#f0fdfa] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <span className="relative">Get started free</span>
              <span className="relative">
                <span className="block transition-all duration-200 group-hover:translate-x-1">→</span>
              </span>
            </Link>
            <div className="flex items-center justify-center gap-6 mt-8 text-[12px] text-white/25">
              {['No credit card required', 'Live in minutes', 'IRS 990 auto-sync'].map(t => (
                <span key={t} className="flex items-center gap-1.5 hover:text-white/40 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0d9488]" /> {t}
                </span>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/8 py-10 px-8 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fundir-logo.png" alt="Fundir" width={24} height={24} className="opacity-40 hover:opacity-70 transition-opacity" />
            <span className="text-[13px] font-bold text-white/50">Fundir</span>
            <span className="text-[12px] text-white/20 ml-1">· AI Grant Intelligence</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[12px] text-white/25 hover:text-white/50 transition-colors">Sign in</Link>
            <Link href="/onboarding" className="text-[12px] text-white/25 hover:text-white/50 transition-colors">Get started</Link>
            <p className="text-[12px] text-white/15">© 2026 Fundir</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
