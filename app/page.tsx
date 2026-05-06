import Link from 'next/link';
import {
  ArrowRight, ArrowDown, CheckCircle, Search, BarChart3,
  Shield, Brain, TrendingUp, FileText, Clock, Target, ChevronRight,
} from 'lucide-react';

/* ── Mock data ─────────────────────────────────── */
const mockGrants = [
  { title: 'Youth Workforce Development Initiative', type: 'Federal',    amount: '$250K', score: 94 },
  { title: 'After-School STEM Programs',             type: 'Foundation', amount: '$75K',  score: 87 },
  { title: 'Community Health Equity Fund',           type: 'Corporate',  amount: '$50K',  score: 71 },
  { title: 'Title I School Support Grant',           type: 'Federal',    amount: '$180K', score: 63 },
  { title: 'Neighborhood Revitalization Grant',      type: 'State',      amount: '$90K',  score: 58 },
];

const typeColor: Record<string, string> = {
  Federal:    '#eff6ff|#2563eb',
  Foundation: '#faf5ff|#7c3aed',
  Corporate:  '#f0fdf4|#16a34a',
  State:      '#fffbeb|#d97706',
};

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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* ══════════════════════════════════════════
          NAV — transparent, Palantir-style
      ══════════════════════════════════════════ */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fundir-logo.png" alt="Fundir" width={36} height={36} />
          <span className="text-[17px] font-semibold text-white tracking-tight">Fundir</span>
        </Link>

        {/* CTA */}
        <Link
          href="/onboarding"
          className="px-5 py-2 border border-white text-white text-[13px] font-semibold hover:bg-white hover:text-[#0a0a0a] transition-all duration-200"
        >
          Get Started
        </Link>
      </header>

      {/* ══════════════════════════════════════════
          HERO — full-bleed dark with product visual
      ══════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        {/* Subtle grid */}
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Teal glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-[#0d9488]/8 rounded-full blur-[160px] pointer-events-none" />

        {/* Product screenshot — full bleed behind hero text */}
        <div className="absolute inset-0 flex items-center justify-end pr-0 pointer-events-none">
          <div className="w-[65%] h-full relative opacity-40">
            {/* Browser frame */}
            <div className="absolute inset-8 rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0f172a]">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1e293b] border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#eab308]/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/60" />
                <span className="ml-3 text-[10px] text-white/30 font-mono">app.fundir.ai/dashboard</span>
              </div>
              <div className="flex h-full">
                {/* Sidebar */}
                <div className="w-40 border-r border-white/10 p-3 flex-shrink-0">
                  <div className="space-y-1 mt-4">
                    {['Dashboard', 'Discover', 'Financials', 'Pipeline', 'Calendar', 'Reports'].map((item, i) => (
                      <div key={item} className={`px-2.5 py-1.5 rounded text-[11px] font-medium ${i === 0 ? 'bg-[#0d9488]/20 text-[#2dd4bf]' : 'text-white/30'}`}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 p-4 overflow-hidden">
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { n: '142', l: 'Tracked',    c: '#2563eb' },
                      { n: '23',  l: 'High Match', c: '#0d9488' },
                      { n: '$2.1M', l: 'Pipeline',  c: '#7c3aed' },
                      { n: '8',   l: 'Due Soon',   c: '#dc2626' },
                    ].map(s => (
                      <div key={s.l} className="bg-white/5 rounded border border-white/10 p-2.5">
                        <div className="text-[16px] font-bold" style={{ color: s.c }}>{s.n}</div>
                        <div className="text-[9px] text-white/30 mt-0.5">{s.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/5 rounded border border-white/10 overflow-hidden">
                    <div className="flex gap-3 px-3 py-2 border-b border-white/10">
                      {['Grant', 'Type', 'Amount', 'Score'].map(h => (
                        <span key={h} className="text-[9px] font-semibold text-white/30 uppercase tracking-wide flex-1">{h}</span>
                      ))}
                    </div>
                    {mockGrants.map((g, i) => {
                      const [, text] = (typeColor[g.type] || '#f1f5f9|#64748b').split('|');
                      const sc = g.score >= 70 ? '#0d9488' : '#d97706';
                      return (
                        <div key={i} className="flex gap-3 px-3 py-2 border-b border-white/5 last:border-0">
                          <span className="flex-1 text-[10px] text-white/60 truncate">{g.title}</span>
                          <span className="flex-1 text-[9px] font-semibold" style={{ color: text }}>{g.type}</span>
                          <span className="flex-1 text-[10px] font-mono text-white/40">{g.amount}</span>
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

        {/* Hero text — left aligned, Palantir style */}
        <div className="relative flex-1 flex flex-col justify-center px-16 pt-24 pb-24 max-w-3xl">
          <h1 className="text-[64px] md:text-[76px] font-bold text-white leading-[1.0] tracking-tight mb-8">
            AI-Powered Grant<br />
            Intelligence for<br />
            <span className="text-[#0d9488]">Every Decision.</span>
          </h1>
          <p className="text-[18px] text-white/50 leading-relaxed max-w-md mb-10">
            Fundir connects your IRS 990, your mission, and the full federal and foundation grant landscape into a single intelligence platform.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/onboarding"
              className="flex items-center gap-2.5 px-7 py-3.5 bg-white text-[#0a0a0a] font-bold text-[14px] hover:bg-white/90 transition-colors"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-2 px-7 py-3.5 border border-white/20 text-white/60 font-medium text-[14px] hover:border-white/40 hover:text-white transition-all"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative pb-10 flex flex-col items-center gap-2">
          <span className="text-[12px] text-white/30 tracking-widest uppercase">Scroll to Explore</span>
          <ArrowDown className="w-4 h-4 text-white/30 animate-bounce" />
        </div>
      </section>

      {/* ══════════════════════════════════════════
          STATEMENT — large centered text, Palantir
      ══════════════════════════════════════════ */}
      <section className="py-32 px-8 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-[13px] font-semibold text-[#94a3b8] uppercase tracking-widest mb-8">Our Software</p>
          <h2 className="text-[48px] md:text-[64px] font-bold text-[#0f172a] leading-[1.1] tracking-tight">
            The grant world now has<br />
            <span className="text-[#0d9488]">an operating system.</span>
          </h2>
          <p className="mt-8 text-[20px] text-[#475569] leading-relaxed max-w-3xl mx-auto">
            Fundir doesn't just find grants — it scores them against your actual financial capacity, flags eligibility risks before you apply, and builds institutional knowledge from every outcome.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          PRODUCT TABS — Palantir category style
      ══════════════════════════════════════════ */}
      <section className="bg-white border-t border-[#e2e8f0]">
        {/* Tab bar */}
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex gap-0 overflow-x-auto border-b border-[#e2e8f0]">
            {products.map((p, i) => (
              <div
                key={p.tab}
                className={`px-6 py-4 text-[13px] font-semibold whitespace-nowrap cursor-default transition-all border-b-2 ${
                  i === 0
                    ? 'border-[#0d9488] text-[#0d9488]'
                    : 'border-transparent text-[#94a3b8] hover:text-[#475569]'
                }`}
              >
                {p.tab}
              </div>
            ))}
            <Link href="/onboarding" className="ml-auto px-6 py-4 text-[13px] font-semibold text-[#94a3b8] hover:text-[#475569] whitespace-nowrap">
              SEE ALL →
            </Link>
          </div>
        </div>

        {/* Featured product panel */}
        <div className="bg-[#1a1f2e]">
          <div className="max-w-6xl mx-auto px-8 py-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[10px] font-bold text-[#0d9488] tracking-widest mb-4 uppercase">{products[0].label}</p>
              <h3 className="text-[36px] font-bold text-white leading-tight mb-6">{products[0].heading}</h3>
              <p className="text-[16px] text-white/50 leading-relaxed mb-8">{products[0].body}</p>
              <Link href="/onboarding" className="inline-flex items-center gap-2 text-[13px] font-semibold text-white border-b border-white/30 pb-0.5 hover:border-white transition-colors">
                Explore Grant Discovery <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Product mini-preview */}
            <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0f172a]">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
                <div className="w-2 h-2 rounded-full bg-[#ef4444]/50" />
                <div className="w-2 h-2 rounded-full bg-[#eab308]/50" />
                <div className="w-2 h-2 rounded-full bg-[#22c55e]/50" />
                <span className="ml-2 text-[10px] text-white/20 font-mono">fundir.ai/discover</span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4 p-2.5 bg-white/5 rounded-lg border border-white/10">
                  <Search className="w-3.5 h-3.5 text-white/30" />
                  <span className="text-[11px] text-white/30">Searching 1,200+ opportunities…</span>
                  <span className="ml-auto text-[10px] text-[#0d9488] font-semibold">142 matches</span>
                </div>
                <div className="space-y-2">
                  {mockGrants.map((g, i) => {
                    const sc = g.score >= 70 ? '#0d9488' : '#d97706';
                    const [, text] = (typeColor[g.type] || '#f1f5f9|#64748b').split('|');
                    return (
                      <div key={i} className="flex items-center gap-3 p-2.5 bg-white/5 rounded-lg border border-white/5 hover:border-white/10">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-white/80 truncate">{g.title}</p>
                          <span className="text-[9px] font-semibold" style={{ color: text }}>{g.type} · {g.amount}</span>
                        </div>
                        <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center" style={{ borderColor: sc }}>
                          <span className="text-[10px] font-bold" style={{ color: sc }}>{g.score}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          THREE CAPABILITY COLUMNS
      ══════════════════════════════════════════ */}
      <section className="py-24 px-8 bg-white border-t border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <p className="text-[#0d9488] text-[12px] font-bold uppercase tracking-widest mb-3">Platform Capabilities</p>
            <h2 className="text-[40px] font-bold text-[#0f172a] leading-tight">
              Built for the full grant lifecycle.
            </h2>
          </div>

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
                      { label: 'Budget Fit',         status: 'match',    color: '#16a34a' },
                      { label: 'Financial Stability', status: 'match',    color: '#16a34a' },
                      { label: 'Revenue Trend',       status: 'likely',   color: '#d97706' },
                      { label: 'Mission Alignment',   status: 'match',    color: '#16a34a' },
                      { label: 'Exec Efficiency',     status: 'match',    color: '#16a34a' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center justify-between">
                        <span className="text-[11px] text-[#475569]">{s.label}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.color + '18' }}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                icon: Target, color: '#7c3aed',
                label: 'Match Scoring',
                heading: 'Know who welcomes your application',
                desc: 'A 7-factor composite score — semantic fit, financial eligibility, NTEE alignment, revenue trend, and more — ranked for every opportunity.',
                preview: (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-14 h-14 rounded-full border-2 border-[#16a34a] flex items-center justify-center flex-shrink-0">
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
              },
              {
                icon: Clock, color: '#2563eb',
                label: 'Pipeline & Deadlines',
                heading: 'Never miss a deadline again',
                desc: 'Kanban pipeline, deadline calendar, task management, and grant notes — everything your development team needs to execute.',
                preview: (
                  <div className="space-y-2">
                    {[
                      { title: 'HHS Youth Services',  days: 4,  c: '#dc2626' },
                      { title: 'Ford Foundation',      days: 12, c: '#d97706' },
                      { title: 'DOE STEM Grant',       days: 28, c: '#2563eb' },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center justify-between bg-[#f8fafc] rounded border border-[#e2e8f0] px-3 py-2">
                        <p className="text-[11px] font-medium text-[#0f172a]">{d.title}</p>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" style={{ color: d.c }} />
                          <span className="text-[10px] font-bold" style={{ color: d.c }}>{d.days}d</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              },
            ].map(col => {
              const Icon = col.icon;
              return (
                <div key={col.label} className="border border-[#e2e8f0] rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <div className="w-8 h-8 rounded-lg mb-4 flex items-center justify-center" style={{ background: col.color + '18' }}>
                      <Icon className="w-4 h-4" style={{ color: col.color }} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: col.color }}>{col.label}</p>
                    {col.preview}
                  </div>
                  <div className="p-6 bg-white">
                    <h3 className="font-bold text-[16px] text-[#0f172a] mb-2">{col.heading}</h3>
                    <p className="text-[13px] text-[#64748b] leading-relaxed mb-4">{col.desc}</p>
                    <Link href="/onboarding" className="flex items-center gap-1 text-[13px] font-semibold text-[#0d9488] hover:underline">
                      Learn more <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          DARK STATEMENT SECTION — like Palantir's
          "Our software powers real-time…"
      ══════════════════════════════════════════ */}
      <section className="py-32 px-8 bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute -top-16 left-0 w-64 h-64 bg-[#0d9488]/8 rounded-full blur-[80px] pointer-events-none" />
            <p className="text-[13px] font-semibold text-[#0d9488] uppercase tracking-widest mb-8">Why Fundir</p>
            <h2 className="text-[52px] md:text-[68px] font-bold text-white leading-[1.05] tracking-tight max-w-4xl">
              Fundir scores financial eligibility against every grant —{' '}
              <span className="text-white/30">before you spend a single hour applying.</span>
            </h2>
          </div>

          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
            {[
              { value: '1,200+',    label: 'Federal grants indexed' },
              { value: '7-factor',  label: 'Financial eligibility engine' },
              { value: '990 sync',  label: 'Automatic EIN matching' },
              { value: '<30s',      label: 'Per-grant AI processing' },
            ].map(s => (
              <div key={s.label} className="bg-[#0a0a0a] px-8 py-10">
                <div className="text-[36px] font-bold text-[#0d9488] font-mono mb-2">{s.value}</div>
                <div className="text-[13px] text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FOCUS AREAS — horizontal scroll chips
      ══════════════════════════════════════════ */}
      <section className="py-20 px-8 bg-white border-t border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[#0d9488] text-[12px] font-bold uppercase tracking-widest mb-2">Coverage</p>
              <h2 className="text-[32px] font-bold text-[#0f172a]">Every mission area. Every funder type.</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-12">
            {[
              'Education', 'Youth Development', 'Health & Wellness', 'Community Development',
              'Arts & Culture', 'Housing & Shelter', 'Environmental', 'Human Services',
              'Faith-Based', 'Workforce', 'Mental Health', 'Food Security',
              'Civil Rights', 'Science & Tech', 'International', 'Philanthropy',
            ].map(area => (
              <Link key={area} href="/onboarding"
                className="px-4 py-1.5 border border-[#e2e8f0] text-[13px] text-[#475569] hover:border-[#0d9488] hover:text-[#0d9488] hover:bg-[#f0fdfa] transition-all">
                {area}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: Shield,     label: 'Federal Grants',    desc: 'Government grants via Grants.gov — auto-discovered daily' },
              { icon: Target,     label: 'Foundation Grants', desc: 'Private & family foundations matched to your mission profile' },
              { icon: TrendingUp, label: 'Corporate Grants',  desc: 'Corporate giving programs aligned to your program areas' },
              { icon: FileText,   label: 'State & Local',     desc: 'State agency grants and municipal funding opportunities' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-4 p-5 border border-[#e2e8f0] hover:border-[#0d9488]/30 hover:shadow-sm transition-all">
                <div className="w-8 h-8 bg-[#f0fdfa] flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#0d9488]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#0f172a] mb-0.5">{label}</p>
                  <p className="text-[13px] text-[#64748b]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA — dark, minimal
      ══════════════════════════════════════════ */}
      <section className="relative py-32 px-8 bg-[#0a0a0a] overflow-hidden border-t border-white/5">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#0d9488]/6 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-2xl mx-auto text-center">
          <p className="text-[12px] font-bold text-[#0d9488] uppercase tracking-widest mb-6">Ready to get started?</p>
          <h2 className="text-[48px] font-bold text-white leading-tight mb-6">
            Find your next grant today.
          </h2>
          <p className="text-[16px] text-white/40 mb-10 leading-relaxed">
            Invite-only access for nonprofits. Request your invite to get started.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#0a0a0a] font-bold text-[14px] hover:bg-white/90 transition-all"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
          <div className="flex items-center justify-center gap-6 mt-8 text-[12px] text-white/25">
            {['No credit card required', 'Live in minutes', 'IRS 990 auto-sync'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-[#0d9488]" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-8 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fundir-logo.png" alt="Fundir" width={24} height={24} className="opacity-50" />
            <span className="text-[13px] font-bold text-white/60">Fundir</span>
            <span className="text-[12px] text-white/25 ml-1">· AI Grant Intelligence</span>
          </div>
          <p className="text-[12px] text-white/20">© 2025 Fundir</p>
        </div>
      </footer>
    </div>
  );
}
