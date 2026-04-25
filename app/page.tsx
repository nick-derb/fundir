import Link from 'next/link';
import {
  Zap, ArrowRight, CheckCircle, Search, BarChart3,
  GitBranch, Shield, Brain, TrendingUp, FileText,
  Clock, Target, ChevronRight, Star,
} from 'lucide-react';

/* ── Design tokens ─────────────────────────────────── */
// Hero: near-black with teal glow (Palantir)
// Body: pure white + light-gray sections (Instrumentl)
// Accent: teal #0d9488 + indigo #4f46e5 for AI elements

const focusAreas = [
  'Education', 'Youth Development', 'Health & Wellness',
  'Community Development', 'Arts & Culture', 'Housing & Shelter',
  'Environmental', 'Human Services', 'Faith-Based', 'Workforce',
  'Mental Health', 'Food Security',
];

const grantTypes = [
  { label: 'Federal Grants',     desc: 'Government grants via Grants.gov — auto-discovered daily',     icon: Shield },
  { label: 'Foundation Grants',  desc: 'Private & family foundations matched to your mission profile', icon: Target },
  { label: 'Corporate Grants',   desc: 'Corporate giving programs aligned to your program areas',      icon: TrendingUp },
  { label: 'State & Local',      desc: 'State agency grants and municipal funding opportunities',       icon: FileText },
];

/* ── Mock grant rows for hero visual ─────────────────── */
const mockGrants = [
  { title: 'Youth Workforce Development Initiative', type: 'Federal',    amount: '$250K', score: 94, status: 'High Match' },
  { title: 'After-School STEM Programs',             type: 'Foundation', amount: '$75K',  score: 87, status: 'High Match' },
  { title: 'Community Health Equity Fund',           type: 'Corporate',  amount: '$50K',  score: 71, status: 'High Match' },
  { title: 'Title I School Support Grant',           type: 'Federal',    amount: '$180K', score: 63, status: 'Medium'     },
  { title: 'Neighborhood Revitalization Grant',      type: 'State',      amount: '$90K',  score: 58, status: 'Medium'     },
];

const typeColor: Record<string, string> = {
  Federal:    '#eff6ff|#2563eb',
  Foundation: '#faf5ff|#7c3aed',
  Corporate:  '#f0fdf4|#16a34a',
  State:      '#fffbeb|#d97706',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#0f172a]">

      {/* ══════════════════════════════════════════
          NAV
      ══════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#0d9488] rounded-[6px] flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-[16px] text-[#0f172a] tracking-tight">Fundir</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-[13px] text-[#475569] font-medium">
            <Link href="#discover" className="hover:text-[#0f172a] transition-colors">Discover</Link>
            <Link href="#manage"   className="hover:text-[#0f172a] transition-colors">Manage</Link>
            <Link href="#analyze"  className="hover:text-[#0f172a] transition-colors">Analyze</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login"  className="px-4 py-1.5 text-[13px] font-medium text-[#475569] hover:text-[#0f172a] transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="px-4 py-1.5 text-[13px] font-semibold bg-[#0d9488] text-white rounded-[6px] hover:bg-[#0f766e] transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          HERO  — Palantir dark with teal glow
      ══════════════════════════════════════════ */}
      <section className="relative bg-[#060d19] overflow-hidden py-24 px-6">
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(13,148,136,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.06) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#0d9488]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-20 right-10 w-64 h-64 bg-[#4f46e5]/8 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto">
          <div className="max-w-2xl mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-[#0d9488]/10 border border-[#0d9488]/30 text-[#2dd4bf] text-[12px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0d9488] animate-pulse" />
              AI-powered grant intelligence
            </div>
            <h1 className="text-[52px] md:text-[62px] font-bold text-white leading-[1.05] tracking-tight mb-5">
              Find the grants<br />
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #0d9488, #2dd4bf)' }}>
                your mission deserves.
              </span>
            </h1>
            <p className="text-[17px] text-white/50 leading-relaxed mb-8">
              Fundir monitors thousands of federal and foundation opportunities, scores every grant against your org profile with AI, and surfaces what your team should act on — automatically.
            </p>
            <div className="flex items-center gap-3">
              <Link href="/signup"
                className="flex items-center gap-2 px-6 py-3 bg-[#0d9488] text-white font-semibold rounded-[8px] text-[14px] hover:bg-[#0f766e] transition-all hover:shadow-lg hover:shadow-[#0d9488]/25">
                Get started free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login"
                className="px-6 py-3 border border-white/10 text-white/60 font-medium rounded-[8px] text-[14px] hover:border-white/25 hover:text-white transition-all">
                Sign in →
              </Link>
            </div>
            <div className="flex items-center gap-5 mt-7 text-[12px] text-white/25">
              {['No credit card', 'Org-code access', 'Live in minutes'].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0d9488]" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* ── Mock dashboard preview ── */}
          <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl bg-white">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
              <div className="w-3 h-3 rounded-full bg-[#fca5a5]" />
              <div className="w-3 h-3 rounded-full bg-[#fcd34d]" />
              <div className="w-3 h-3 rounded-full bg-[#86efac]" />
              <span className="ml-3 text-[11px] text-[#94a3b8] font-mono">app.fundir.ai/dashboard</span>
              <div className="ml-auto flex items-center gap-2">
                <div className="w-16 h-2 bg-[#f1f5f9] rounded" />
                <div className="w-8 h-2 bg-[#0d9488]/20 rounded" />
              </div>
            </div>
            {/* App layout */}
            <div className="flex h-72">
              {/* Sidebar */}
              <div className="w-44 border-r border-[#e2e8f0] p-3 bg-white flex-shrink-0">
                <div className="flex items-center gap-2 mb-4 px-1">
                  <div className="w-5 h-5 bg-[#0d9488] rounded flex items-center justify-center">
                    <Zap className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[12px] font-bold text-[#0f172a]">Fundir</span>
                </div>
                <div className="mb-2 px-2">
                  <div className="w-full h-7 bg-[#f8fafc] rounded border border-[#e2e8f0] mb-3" />
                </div>
                {['Dashboard', 'Discover', 'Financials', 'Pipeline', 'Settings'].map((item, i) => (
                  <div key={item} className={`flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 text-[11px] font-medium ${i === 0 ? 'bg-[#f0fdfa] text-[#0d9488]' : 'text-[#94a3b8]'}`}>
                    <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${i === 0 ? 'bg-[#0d9488]' : 'bg-[#e2e8f0]'}`} />
                    {item}
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div className="flex-1 p-4 overflow-hidden bg-[#f8fafc]">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {[
                    { label: 'Total Tracked', n: '142', c: '#2563eb' },
                    { label: 'High Match',    n: '23',  c: '#16a34a' },
                    { label: 'Medium Match',  n: '67',  c: '#d97706' },
                    { label: 'Due Soon',      n: '8',   c: '#dc2626' },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded border border-[#e2e8f0] p-2.5">
                      <div className="text-[16px] font-bold" style={{ color: s.c }}>{s.n}</div>
                      <div className="text-[9px] text-[#94a3b8] mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* Grant table */}
                <div className="bg-white rounded border border-[#e2e8f0] overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
                    {['Grant', 'Type', 'Amount', 'Match', 'Stage'].map(h => (
                      <span key={h} className="text-[9px] font-semibold text-[#94a3b8] uppercase tracking-wide flex-1">{h}</span>
                    ))}
                  </div>
                  {mockGrants.map((g, i) => {
                    const [bg, text] = (typeColor[g.type] || '#f1f5f9|#64748b').split('|');
                    const scoreColor = g.score >= 70 ? '#16a34a' : '#d97706';
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-[#f8fafc] last:border-0 hover:bg-[#f8fafc]">
                        <span className="flex-1 text-[10px] font-medium text-[#0f172a] truncate">{g.title}</span>
                        <span className="flex-1">
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: bg, color: text }}>{g.type}</span>
                        </span>
                        <span className="flex-1 text-[10px] font-mono text-[#475569]">{g.amount}</span>
                        <span className="flex-1">
                          <span className="text-[10px] font-bold" style={{ color: scoreColor }}>{g.score}</span>
                        </span>
                        <span className="flex-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#f1f5f9] text-[#64748b]">{g.status}</span>
                        </span>
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
          STATS BAR
      ══════════════════════════════════════════ */}
      <section className="border-b border-[#e2e8f0] bg-white">
        <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '1,000+',  label: 'Federal grants indexed' },
            { value: '<30s',    label: 'Per grant AI-processed' },
            { value: '4-factor',label: 'Composite match algorithm' },
            { value: '990 sync',label: 'Automatic financial analysis' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-[28px] font-bold text-[#0d9488] font-mono">{s.value}</div>
              <div className="text-[13px] text-[#64748b] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          DISCOVER  (Instrumentl 3-panel style)
      ══════════════════════════════════════════ */}
      <section id="discover" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-[#0d9488] text-[12px] font-bold uppercase tracking-widest mb-2">Smarter Grant Prospecting</p>
            <h2 className="text-[36px] font-bold text-[#0f172a] leading-tight mb-3">
              Find Best-Fit Opportunities, Faster
            </h2>
            <p className="text-[16px] text-[#475569] max-w-2xl">
              Eliminate the guesswork. Instantly discover your best-fit grant opportunities with AI-powered matching across federal and foundation databases.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Panel 1: Match list */}
            <div className="rounded-xl border border-[#e2e8f0] overflow-hidden hover:border-[#0d9488]/30 hover:shadow-panel transition-all">
              <div className="bg-[#f0fdfa] p-5 border-b border-[#e2e8f0]">
                <p className="text-[13px] font-semibold text-[#0d9488] mb-1">
                  You have <span className="bg-[#0d9488] text-white rounded-full px-2 py-0.5 text-[11px]">87</span> new matches!
                </p>
                <div className="space-y-2 mt-3">
                  {[
                    { title: 'Youth Workforce Grant', type: 'Federal',    amt: '$250K', score: 94 },
                    { title: 'STEM Afterschool Fund', type: 'Foundation', amt: '$75K',  score: 87 },
                    { title: 'Community Health Eq.',  type: 'Corporate',  amt: '$50K',  score: 71 },
                  ].map((g, i) => {
                    const [bg, text] = (typeColor[g.type] || '#f1f5f9|#475569').split('|');
                    return (
                      <div key={i} className="flex items-center justify-between bg-white rounded border border-[#e2e8f0] px-3 py-2">
                        <div>
                          <p className="text-[11px] font-semibold text-[#0f172a]">{g.title}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: bg, color: text }}>{g.type}</span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-[11px] font-bold text-[#0f172a]">{g.amt}</p>
                          <p className="text-[10px] font-bold text-[#16a34a]">{g.score}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-[15px] text-[#0f172a] mb-1.5">Find your best-fit grants in minutes</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed mb-4">Build a targeted prospect list and discover new opportunities automatically — scored and ranked by AI.</p>
                <Link href="/signup" className="flex items-center gap-1 text-[13px] font-semibold text-[#0d9488] hover:underline">
                  Browse all grants <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Panel 2: 990 financial analysis */}
            <div className="rounded-xl border border-[#e2e8f0] overflow-hidden hover:border-[#0d9488]/30 hover:shadow-panel transition-all">
              <div className="bg-[#faf5ff] p-5 border-b border-[#e2e8f0]">
                <p className="text-[11px] font-bold text-[#7c3aed] uppercase tracking-wide mb-3">990 Financial Analysis</p>
                <div className="bg-white rounded-lg border border-[#e2e8f0] p-3 space-y-2">
                  {[
                    { label: 'Total Revenue',    value: '$8.4M',  bar: 84, color: '#0d9488' },
                    { label: 'Govt Grants',       value: '$4.1M',  bar: 49, color: '#dc2626' },
                    { label: 'Private Grants',    value: '$2.2M',  bar: 26, color: '#2563eb' },
                    { label: 'Program Revenue',   value: '$1.8M',  bar: 21, color: '#7c3aed' },
                  ].map(r => (
                    <div key={r.label}>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[10px] text-[#64748b]">{r.label}</span>
                        <span className="text-[10px] font-bold font-mono text-[#0f172a]">{r.value}</span>
                      </div>
                      <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.bar}%`, background: r.color }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-1 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[10px] text-red-600 font-semibold">49% government dependency — elevated risk</span>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-[15px] text-[#0f172a] mb-1.5">Instant 990 financial profiling</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed mb-4">Auto-matched by EIN. Fundir pulls your IRS 990, analyzes revenue concentration risk, and informs your grant strategy.</p>
                <Link href="/signup" className="flex items-center gap-1 text-[13px] font-semibold text-[#0d9488] hover:underline">
                  Explore financial insights <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Panel 3: AI scoring */}
            <div className="rounded-xl border border-[#e2e8f0] overflow-hidden hover:border-[#0d9488]/30 hover:shadow-panel transition-all">
              <div className="bg-[#eff6ff] p-5 border-b border-[#e2e8f0]">
                <p className="text-[11px] font-bold text-[#2563eb] uppercase tracking-wide mb-3">Match Score Breakdown</p>
                <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 rounded-full border-4 border-[#16a34a] flex items-center justify-center flex-shrink-0">
                      <span className="text-[18px] font-bold text-[#16a34a]">91</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-[#16a34a]">Strong Match</p>
                      <p className="text-[11px] text-[#64748b]">4-factor composite / 100</p>
                    </div>
                  </div>
                  {[
                    { label: 'Semantic Match',  val: 96, w: '40%', c: '#0d9488' },
                    { label: 'Eligibility',     val: 90, w: '25%', c: '#2563eb' },
                    { label: 'Historical',      val: 85, w: '20%', c: '#7c3aed' },
                    { label: 'Strategic Fit',   val: 88, w: '15%', c: '#d97706' },
                  ].map(f => (
                    <div key={f.label} className="mb-1.5">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[10px] text-[#64748b]">{f.label} <span className="text-[#94a3b8]">({f.w})</span></span>
                        <span className="text-[10px] font-bold" style={{ color: f.c }}>{f.val}</span>
                      </div>
                      <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${f.val}%`, background: f.c }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-[15px] text-[#0f172a] mb-1.5">Know who welcomes your application</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed mb-4">Our 4-factor AI ranks every grant — semantic fit, eligibility, historical win rates, and strategic alignment.</p>
                <Link href="/signup" className="flex items-center gap-1 text-[13px] font-semibold text-[#0d9488] hover:underline">
                  See how scoring works <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          MANAGE  (Grant management section)
      ══════════════════════════════════════════ */}
      <section id="manage" className="py-20 px-6 bg-[#f8fafc] border-y border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-[#0d9488] text-[12px] font-bold uppercase tracking-widest mb-2">Grant Management</p>
            <h2 className="text-[36px] font-bold text-[#0f172a] leading-tight mb-3">
              Streamline Your Pipeline.<br />Meet Every Deadline.
            </h2>
            <p className="text-[16px] text-[#475569] max-w-2xl">
              Track every grant from discovery through award. Drag-and-drop pipeline, stage tracking, and deadline monitoring — all in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                bg: '#f0fdfa', accent: '#0d9488',
                label: 'Pipeline Tracker', heading: 'See everything at a glance',
                desc: 'Track your entire grants portfolio with real-time stage updates and score indicators.',
                preview: (
                  <div className="space-y-2">
                    {[
                      { title: 'Youth Workforce Initiative', stage: 'Reviewing',  score: 94, c: '#2563eb' },
                      { title: 'STEM Afterschool Grant',     stage: 'Drafting',   score: 87, c: '#d97706' },
                      { title: 'Community Health Fund',      stage: 'Submitted',  score: 71, c: '#16a34a' },
                    ].map((g, i) => (
                      <div key={i} className="flex items-center justify-between bg-white rounded border border-[#e2e8f0] px-3 py-2">
                        <p className="text-[11px] font-medium text-[#0f172a] truncate flex-1">{g.title}</p>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: g.c + '15', color: g.c }}>{g.stage}</span>
                          <span className="text-[10px] font-bold text-[#16a34a]">{g.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                bg: '#fef9ee', accent: '#d97706',
                label: 'Deadline Tracker', heading: 'Never miss a deadline',
                desc: 'Upcoming deadlines surfaced automatically. Color-coded urgency so your team always knows what\'s next.',
                preview: (
                  <div className="space-y-2">
                    {[
                      { title: 'HHS Youth Services', days: 4,  urgent: true  },
                      { title: 'Ford Foundation',     days: 12, urgent: true  },
                      { title: 'DOE STEM Grant',      days: 28, urgent: false },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center justify-between bg-white rounded border border-[#e2e8f0] px-3 py-2">
                        <p className="text-[11px] font-medium text-[#0f172a]">{d.title}</p>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" style={{ color: d.urgent ? '#dc2626' : '#d97706' }} />
                          <span className="text-[10px] font-bold" style={{ color: d.urgent ? '#dc2626' : '#d97706' }}>{d.days}d</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                bg: '#f0fdf4', accent: '#16a34a',
                label: 'Award Tracking', heading: 'Celebrate your wins',
                desc: 'Track awarded grants, funding amounts, and reporting requirements all in one place.',
                preview: (
                  <div className="bg-white rounded border border-[#e2e8f0] p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[10px] text-[#64748b]">AWARDED</p>
                        <p className="text-[20px] font-bold text-[#16a34a] font-mono">$945K</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[#64748b]">NEXT REPORT</p>
                        <p className="text-[13px] font-bold text-[#0f172a]">Oct 1</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1.5">Payments</p>
                    {[
                      { yr: '2024', paid: '$467k', total: '$485k', pct: 96 },
                      { yr: '2023', paid: '$150k', total: '$450k', pct: 33 },
                    ].map(p => (
                      <div key={p.yr} className="mb-1.5">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[10px] text-[#64748b]">{p.yr}</span>
                          <span className="text-[10px] font-mono text-[#0f172a]">{p.paid} / {p.total}</span>
                        </div>
                        <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                          <div className="h-full bg-[#16a34a] rounded-full" style={{ width: `${p.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              },
            ].map(panel => (
              <div key={panel.label} className="rounded-xl border border-[#e2e8f0] overflow-hidden hover:border-[#0d9488]/30 hover:shadow-panel transition-all">
                <div className="p-5 border-b border-[#e2e8f0]" style={{ background: panel.bg }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: panel.accent }}>{panel.label}</p>
                  {panel.preview}
                </div>
                <div className="p-5 bg-white">
                  <h3 className="font-bold text-[15px] text-[#0f172a] mb-1.5">{panel.heading}</h3>
                  <p className="text-[13px] text-[#64748b] leading-relaxed">{panel.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          ANALYZE  — AI + 990 section
      ══════════════════════════════════════════ */}
      <section id="analyze" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-[#4f46e5] text-[12px] font-bold uppercase tracking-widest mb-2">AI-Powered Intelligence</p>
            <h2 className="text-[36px] font-bold text-[#0f172a] leading-tight mb-3">
              The grant world now has<br />an operating system.
            </h2>
            <p className="text-[16px] text-[#475569] max-w-xl">
              Fundir connects your IRS 990, your mission, and the full federal grant landscape into a single intelligence layer.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Apply Advisor */}
            <div className="rounded-xl border border-[#e2e8f0] overflow-hidden">
              <div className="bg-[#faf9ff] p-6 border-b border-[#e2e8f0]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 bg-[#4f46e5] rounded-lg flex items-center justify-center">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[13px] font-semibold text-[#4f46e5]">Apply Advisor</span>
                </div>
                <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
                  <div className="bg-[#f0fdf4] rounded-lg p-3 text-[12px] text-[#0f172a] leading-relaxed">
                    Based on your 990 data, CYC has a <strong>49% federal funding concentration</strong>. I found 3 foundation grants specifically suited to replace at-risk government revenue.
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3 text-[12px] text-[#0f172a] leading-relaxed border border-[#e2e8f0]">
                    <strong>Funder-aligned revision:</strong> Emphasize your 18 program sites and 3,200 youth served — the HHS grant prioritizes scale and geographic reach.
                  </div>
                  <div className="flex items-center gap-2 border border-[#e2e8f0] rounded-lg px-3 py-2">
                    <input readOnly placeholder="Ask Advisor anything…" className="flex-1 text-[12px] text-[#94a3b8] bg-transparent outline-none" />
                    <div className="w-6 h-6 bg-[#4f46e5] rounded-full flex items-center justify-center flex-shrink-0">
                      <ArrowRight className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 bg-white">
                <h3 className="font-bold text-[15px] text-[#0f172a] mb-1.5">AI grant writing advisor</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed">Real-time Claude AI recommendations trained on your 990 data, funder profiles, and grant requirements — coming Phase 2.</p>
              </div>
            </div>

            {/* Peer prospecting */}
            <div className="rounded-xl border border-[#e2e8f0] overflow-hidden">
              <div className="bg-[#f0fdf4] p-6 border-b border-[#e2e8f0]">
                <p className="text-[10px] font-bold text-[#16a34a] uppercase tracking-widest mb-3">Federal Risk Radar</p>
                <div className="bg-white rounded-lg border border-[#e2e8f0] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
                    <span className="text-[10px] font-semibold text-[#94a3b8] uppercase">Program</span>
                    <span className="text-[10px] font-semibold text-[#94a3b8] uppercase">Risk</span>
                    <span className="text-[10px] font-semibold text-[#94a3b8] uppercase">Amount</span>
                  </div>
                  {[
                    { prog: 'CDBG Block Grant',       risk: 'critical', amt: '$1.2M', c: '#dc2626' },
                    { prog: 'Title IV-B Child Svc',   risk: 'elevated', amt: '$890K', c: '#c2410c' },
                    { prog: 'AmeriCorps VISTA',        risk: 'moderate', amt: '$340K', c: '#d97706' },
                    { prog: 'HHS Head Start',          risk: 'low',      amt: '$220K', c: '#16a34a' },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-[#f8fafc] last:border-0">
                      <span className="text-[11px] text-[#0f172a] flex-1 truncate">{r.prog}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mx-2 uppercase" style={{ color: r.c, background: r.c + '15' }}>{r.risk}</span>
                      <span className="text-[11px] font-mono font-bold text-[#0f172a]">{r.amt}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5 bg-white">
                <h3 className="font-bold text-[15px] text-[#0f172a] mb-1.5">Federal funding risk monitor</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed">Fundir maps every federal program in your 990 to current appropriations risk — so you know exactly what to replace and when.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          BROWSE BY FOCUS AREA
      ══════════════════════════════════════════ */}
      <section className="py-16 px-6 bg-[#f8fafc] border-y border-[#e2e8f0]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-[24px] font-bold text-[#0f172a] mb-2 text-center">Browse grants by focus area or location</h2>
          <p className="text-[14px] text-[#64748b] text-center mb-8">Fundir organizes opportunities by mission area to surface what matters to your team.</p>
          <div className="flex flex-wrap gap-2 justify-center mb-10">
            {focusAreas.map(area => (
              <Link key={area} href="/signup"
                className="px-4 py-1.5 border border-[#e2e8f0] rounded-full text-[13px] text-[#475569] hover:border-[#0d9488] hover:text-[#0d9488] hover:bg-[#f0fdfa] transition-all">
                {area}
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grantTypes.map(({ label, desc, icon: Icon }) => (
              <div key={label} className="flex items-start gap-4 p-4 bg-white rounded-lg border border-[#e2e8f0] hover:border-[#0d9488]/30 hover:shadow-card transition-all">
                <div className="w-8 h-8 bg-[#f0fdfa] rounded-[6px] flex items-center justify-center flex-shrink-0">
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
          SOCIAL PROOF
      ══════════════════════════════════════════ */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-1 mb-3">
            {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-[#fbbf24] text-[#fbbf24]" />)}
          </div>
          <h2 className="text-[26px] font-bold text-[#0f172a] text-center mb-10">Trusted by grant professionals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { quote: 'Fundir surfaced three HHS opportunities we never would have found manually. The 990 risk analysis immediately changed how we think about our funding strategy.', name: 'Director of Development', org: 'Chicago Youth Centers' },
              { quote: 'The federal exposure tracker is unlike anything else available. We saw exactly which programs were at risk and pivoted before the budget season even started.', name: 'Executive Director', org: 'Midwest Nonprofit Coalition' },
            ].map((t, i) => (
              <div key={i} className="bg-[#f8fafc] rounded-xl border border-[#e2e8f0] p-6">
                <p className="text-[14px] text-[#0f172a] leading-relaxed mb-4 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0d9488] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#0f172a]">{t.name}</p>
                    <p className="text-[12px] text-[#64748b]">{t.org}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA  — Palantir dark
      ══════════════════════════════════════════ */}
      <section className="relative bg-[#060d19] py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(13,148,136,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#0d9488]/8 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative max-w-xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-[#0d9488]/10 border border-[#0d9488]/30 text-[#2dd4bf] text-[12px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0d9488]" />
            Ready to get started?
          </div>
          <h2 className="text-[32px] font-bold text-white mb-3 leading-tight">Find your next grant today.</h2>
          <p className="text-[15px] text-white/50 mb-8">
            Sign up with your organization code.{' '}
            CYC members use <code className="font-mono bg-white/10 px-2 py-0.5 rounded text-[#2dd4bf]">CYC2025</code>.
          </p>
          <Link href="/signup"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#0d9488] text-white font-bold rounded-[8px] text-[14px] hover:bg-[#0f766e] transition-all hover:shadow-lg hover:shadow-[#0d9488]/25">
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e2e8f0] py-6 px-6 bg-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#0d9488] rounded flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-[13px] font-bold text-[#0f172a]">Fundir</span>
            <span className="text-[12px] text-[#94a3b8] ml-2">· AI Grant Intelligence</span>
          </div>
          <p className="text-[12px] text-[#94a3b8]">© 2025 Fundir · CYAI · Phase 1</p>
        </div>
      </footer>
    </div>
  );
}
