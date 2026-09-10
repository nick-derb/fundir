'use client';

// Reports, rebuilt around what only Fundir can measure. Six panels, each a
// question a development director actually asks: How far does our network
// reach? Who funds our peers but not us? How good is the evidence? How much
// of our board is mapped? Is the pipeline moving? What did the last refresh
// cost and find? Instrumentl's own numbers appear only where they exist.

import Link from 'next/link';
import type { ReportsIntel } from '@/lib/network/reports';
import { CSS, SERIF, MONO, Eyebrow, Avatar, OrgMark, Chip, ScoreBar, useConsoleFonts, fmtDate, money, SLATE, AMBER, INFO } from '@/components/connections/intel/shared';

export function ReportsIntelView({ data, orgName }: { data: ReportsIntel; orgName: string }) {
  useConsoleFonts();
  const d = data;
  const relTotal = d.evidence.relationships.verified + d.evidence.relationships.probable + d.evidence.relationships.inferred || 1;
  const leadTotal = d.evidence.leads.High + d.evidence.leads.Medium + d.evidence.leads.Low || 1;
  const documentedShare = Math.round(((d.evidence.relationships.verified + d.evidence.relationships.probable) / relTotal) * 100);
  const maxYear = Math.max(1, ...d.white_space.by_year.map(y => y.dollars));
  const stageMax = Math.max(1, ...d.pipeline.stages.map(s => s.count));

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>{orgName} · Reports</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>What only Fundir can see</h1>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '66ch' }}>Six measures of CYC&rsquo;s funding network that no grant tracker carries: how far the board&rsquo;s relationships reach, who funds CYC&rsquo;s peers but not CYC, how well-documented the evidence is, how much of the board is mapped, whether leads are moving, and what each refresh cost.</p>
        </div>
        <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>as of {fmtDate(d.generated_at)}</span>
      </div>

      {/* headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        <Kpi label="Funders reachable" value={d.reach.funders_reachable} sub="through a CYC person" accent />
        <Kpi label="White space" value={d.white_space.funders} sub={`${money(d.white_space.peer_dollars)} to CYC peers`} />
        <Kpi label="High-confidence leads" value={d.reach.high_confidence} sub={`of ${d.reach.leads_open} open`} />
        <Kpi label="Documented links" value={`${documentedShare}%`} sub={`${relTotal.toLocaleString('en-US')} relationships`} />
        <Kpi label="Board mapped" value={`${d.coverage.read} / ${d.coverage.own_total}`} sub={`${d.coverage.own_total - d.coverage.with_url} need a URL`} />
        <Kpi label="In motion" value={d.pipeline.in_motion} sub={d.pipeline.overdue ? `${d.pipeline.overdue} overdue` : 'nothing overdue'} tone={d.pipeline.overdue ? 'var(--critical)' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {/* Reach */}
        <Panel title="Network reach" sub="Who opens which doors. A door is a funder with a documented path through this person." link={{ href: '/connections?tab=paths', label: 'Warm paths' }}>
          {d.reach.doors.length === 0 && <Empty>No warm paths yet. Add board members&rsquo; LinkedIn URLs and run a refresh.</Empty>}
          {d.reach.doors.map(p => (
            <div key={p.person_id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <Avatar name={p.name} size={30} own />
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{p.name} <span className="fd-caption" style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{p.role ? `· CYC ${p.role}` : ''}</span></b>
                <span className="fd-caption" style={{ color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.targets.join(' · ')}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b className="fd-mono" style={{ fontSize: 15, fontWeight: 600, fontFamily: MONO }}>{p.funders}</b>
                <span className="fd-caption" style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 10.5 }}>door{p.funders === 1 ? '' : 's'} · best {p.best}</span>
              </div>
            </div>
          ))}
        </Panel>

        {/* White space */}
        <Panel title="White space" sub="Funders of CYC's peers with no CYC funding identified in available data, by what they give those peers." link={{ href: '/connections?tab=discover', label: 'Discover' }}>
          {d.white_space.by_year.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 64, margin: '4px 0 12px' }} aria-label="Peer funding by year">
              {d.white_space.by_year.map(y => (
                <div key={y.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{money(y.dollars)}</span>
                  <span style={{ width: '100%', height: Math.max(3, (y.dollars / maxYear) * 40), background: AMBER, borderRadius: 2, opacity: .85 }} />
                  <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{y.year}</span>
                </div>
              ))}
            </div>
          )}
          {d.white_space.top.length === 0 && <Empty>No white space identified yet.</Empty>}
          {d.white_space.top.map(f => (
            <Link key={f.id} href={`/connections?tab=discover&lead=${f.lead_id}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-hairline)', textDecoration: 'none', color: 'inherit' }}>
              <OrgMark name={f.name} size={28} accent={f.score >= 70} />
              <span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</b><span className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{f.peers} peer{f.peers === 1 ? '' : 's'} funded</span></span>
              <b className="fd-mono" style={{ fontSize: 12.5, fontFamily: MONO, color: 'var(--text-primary)' }}>{money(f.dollars)}</b>
              <ScoreBar score={f.score} width={40} />
            </Link>
          ))}
        </Panel>

        {/* Evidence quality */}
        <Panel title="Evidence quality" sub="How well the graph is documented. Inferred links and uncited funding are discounted in every score." link={{ href: '/connections?tab=relationships', label: 'Relationships' }}>
          <Stack label="Relationships" parts={[{ k: 'documented', v: d.evidence.relationships.verified, tone: 'var(--accent)' }, { k: 'undated', v: d.evidence.relationships.probable, tone: SLATE }, { k: 'inferred', v: d.evidence.relationships.inferred, tone: AMBER }]} />
          <Stack label="Open leads by confidence" parts={[{ k: 'High', v: d.evidence.leads.High, tone: 'var(--accent)' }, { k: 'Medium', v: d.evidence.leads.Medium, tone: SLATE }, { k: 'Low', v: d.evidence.leads.Low, tone: AMBER }]} />
          <Stack label="Explanations" parts={[{ k: 'model, validated', v: d.evidence.explained.model, tone: INFO }, { k: 'composed from evidence', v: d.evidence.explained.deterministic, tone: SLATE }, { k: 'none yet', v: d.evidence.explained.none, tone: 'var(--border-strong)' }]} />
          {d.evidence.claims_total > 0 && <p className="fd-caption" style={{ margin: '10px 0 0', color: 'var(--text-secondary)' }}><b style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{d.evidence.claims_kept.toLocaleString('en-US')} of {d.evidence.claims_total.toLocaleString('en-US')}</b> explanation claims passed evidence validation ({Math.round((d.evidence.claims_kept / d.evidence.claims_total) * 100)}%); the rest were dropped, never rewritten.</p>}
          <p className="fd-caption" style={{ margin: '6px 0 0', color: 'var(--text-tertiary)', fontSize: 11 }}>Documented = cited facts on both ends with dated overlap · undated = cited, overlap unproven · inferred = at least one uncited fact. {leadTotal - 1} open lead{leadTotal - 1 === 1 ? '' : 's'} carry a confidence grade.</p>
        </Panel>

        {/* Board coverage */}
        <Panel title="Board coverage" sub="The network only sees the board members whose profiles it has read. This is the to-do list for widening it." link={{ href: '/connections?tab=people', label: 'People' }}>
          <Meter label="LinkedIn URL on file" value={d.coverage.with_url} total={d.coverage.own_total} />
          <Meter label="Profile read" value={d.coverage.read} total={d.coverage.own_total} />
          <Meter label="Opens at least one door" value={d.coverage.with_paths} total={d.coverage.own_total} accent />
          {d.coverage.missing.length > 0 && (
            <>
              <Eyebrow style={{ display: 'block', margin: '14px 0 6px' }}>Still need a URL</Eyebrow>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {d.coverage.missing.map(p => <Link key={p.id} href={`/connections?tab=people&person=${p.id}`} style={{ textDecoration: 'none' }}><Chip text={p.role ? `${p.name} · ${p.role}` : p.name} color={AMBER} border="rgba(156,122,42,.36)" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10.5, fontFamily: "'Inter',sans-serif" }} /></Link>)}
                {d.coverage.own_total - d.coverage.with_url > d.coverage.missing.length && <span className="fd-caption" style={{ color: 'var(--text-tertiary)', alignSelf: 'center' }}>and {d.coverage.own_total - d.coverage.with_url - d.coverage.missing.length} more</span>}
              </div>
            </>
          )}
        </Panel>

        {/* Pipeline velocity */}
        <Panel title="Pipeline velocity" sub="Leads by stage with the average days each has sat there. Overdue next actions are the number to watch." link={{ href: '/connections?tab=pipeline', label: 'Pipeline' }}>
          {d.pipeline.stages.filter(s => s.count > 0).map(s => (
            <div key={s.status} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 44px 70px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{s.label}</span>
              <span className="ni-bar" style={{ width: '100%' }}><i style={{ ['--w' as string]: s.count / stageMax, background: s.status === 'WON' ? 'var(--accent)' : ['LOST', 'NOT_A_FIT'].includes(s.status) ? 'var(--border-strong)' : s.status === 'NEW' ? SLATE : AMBER }} /></span>
              <b className="fd-mono" style={{ fontSize: 12, fontFamily: MONO, textAlign: 'right' }}>{s.count}</b>
              <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'right' }}>{s.avg_days !== null ? `${s.avg_days}d avg` : ''}</span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
            <Mini label="Due this week" value={d.pipeline.due_week} /><Mini label="Overdue" value={d.pipeline.overdue} tone={d.pipeline.overdue ? 'var(--critical)' : undefined} /><Mini label="Won" value={d.pipeline.won} tone="var(--accent)" /><Mini label="Closed out" value={d.pipeline.lost + d.pipeline.not_fit} />
          </div>
          {d.pipeline.owners.length > 0 && (
            <>
              <Eyebrow style={{ display: 'block', margin: '14px 0 6px' }}>By owner</Eyebrow>
              {d.pipeline.owners.map(o => <div key={o.owner} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}><span>{o.owner.split('@')[0]}</span><span className="fd-mono" style={{ fontSize: 11.5, fontFamily: MONO }}>{o.count} open{o.overdue ? <span style={{ color: 'var(--critical)' }}> · {o.overdue} overdue</span> : null}</span></div>)}
            </>
          )}
        </Panel>

        {/* Ledger */}
        <Panel title="Refresh and spend" sub="Every run and what it found. Refreshes are on demand; there is no schedule." link={{ href: '/connections?refresh=1', label: 'Refresh' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <Mini label="Runs" value={d.ledger.runs} /><Mini label="API calls" value={d.ledger.api_calls} /><Mini label="Credits" value={d.ledger.credits} />
            <Mini label="Model spend" value={`$${d.ledger.claude_usd.toFixed(2)}`} /><Mini label="Cited funding events" value={d.ledger.events_cited.toLocaleString('en-US')} /><Mini label="Sources" value={d.ledger.sources} />
          </div>
          <p className="fd-caption" style={{ margin: '12px 0 0', color: 'var(--text-secondary)' }}>Last refresh {d.ledger.last_run ? fmtDate(d.ledger.last_run) : 'never'}{d.ledger.last_snapshot ? ` · last snapshot ${fmtDate(d.ledger.last_snapshot)}` : ''}. A dated 13-sheet Excel and JSON snapshot is written at the end of every completed refresh, and can be downloaded any time from Connections.</p>
        </Panel>

        {/* Instrumentl-derived, only when present */}
        {d.grants && (
          <Panel title="Grant applications" sub="From CYC's own submission history. Kept small on purpose: Instrumentl already reports this in depth." link={{ href: '/pipeline', label: 'Pipeline' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <Mini label="Submitted" value={d.grants.submitted} /><Mini label="Awarded" value={d.grants.awarded} tone="var(--accent)" /><Mini label="Win rate" value={`${d.grants.win_rate}%`} /><Mini label="Awarded value" value={money(d.grants.awarded_value)} />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Panel({ title, sub, link, children }: { title: string; sub: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="ni-card ni-rise" style={{ padding: '16px 18px 14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.3rem', lineHeight: 1.15, letterSpacing: '-.012em', margin: '0 0 4px' }}>{title}</h2>
          <p className="fd-caption" style={{ margin: 0, color: 'var(--text-secondary)' }}>{sub}</p>
        </div>
        {link && <Link href={link.href} className="ni-ghost" style={{ height: 26, fontSize: 11, textDecoration: 'none', flex: 'none' }}>{link.label} →</Link>}
      </div>
      {children}
    </section>
  );
}
function Kpi({ label, value, sub, accent, tone }: { label: string; value: number | string; sub?: string; accent?: boolean; tone?: string }) {
  return (
    <div className="ni-kpi" style={accent ? { borderColor: 'rgba(12,107,90,.28)' } : undefined}>
      <span className="fd-eyebrow" style={{ display: 'block', color: accent ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 6, fontSize: 10 }}>{label}</span>
      <b className="fd-kpi" style={{ fontSize: 22, color: tone ?? (accent ? 'var(--accent)' : undefined), fontFamily: MONO }}>{typeof value === 'number' ? value.toLocaleString('en-US') : value}</b>
      {sub && <span className="fd-caption" style={{ display: 'block', color: 'var(--text-tertiary)', marginTop: 2, fontSize: 11 }}>{sub}</span>}
    </div>
  );
}
function Mini({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg-page)' }}><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 9.5, marginBottom: 3 }}>{label}</span><b className="fd-mono" style={{ fontSize: 15, fontWeight: 600, color: tone, fontFamily: MONO }}>{typeof value === 'number' ? value.toLocaleString('en-US') : value}</b></div>;
}
function Stack({ label, parts }: { label: string; parts: Array<{ k: string; v: number; tone: string }> }) {
  const total = parts.reduce((n, p) => n + p.v, 0) || 1;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{label}</span><span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{total.toLocaleString('en-US')}</span></div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--score-track)' }}>{parts.map(p => <span key={p.k} title={`${p.k}: ${p.v}`} style={{ width: `${(p.v / total) * 100}%`, background: p.tone, transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }} />)}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>{parts.map(p => <span key={p.k} className="fd-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 11 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: p.tone }} />{p.k} <b className="fd-mono" style={{ fontWeight: 500, fontFamily: MONO }}>{p.v}</b></span>)}</div>
    </div>
  );
}
function Meter({ label, value, total, accent }: { label: string; value: number; total: number; accent?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 70px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
      <span style={{ fontSize: 12.5 }}>{label}</span>
      <span className="ni-bar" style={{ width: '100%', height: 6 }}><i style={{ ['--w' as string]: total ? value / total : 0, background: accent ? 'var(--accent)' : 'var(--text-secondary)' }} /></span>
      <span className="fd-mono" style={{ fontSize: 11.5, textAlign: 'right', fontFamily: MONO }}>{value} / {total}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0, padding: '8px 0' }}>{children}</p>; }
