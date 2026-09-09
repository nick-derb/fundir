'use client';

// CYC network — the board's LinkedIn footprint and the second-order warm paths
// inferred from it. Sibling of connections-view.tsx: same officer-trail design
// language (serif openers, hairline cards, mono chips, 352px roster + detail).
//
// LinkedIn exposes nobody's connection list; what it does expose is careers.
// A board member's prior employers are rooms they were in — the people working
// in those rooms today are who they can still call. Refresh is on-demand and
// bounded (quarterly is plenty); every run's API spend is recorded.

import { useCallback, useEffect, useState } from 'react';
import {
  Radar, RefreshCw, UserPlus, ExternalLink, Check, X, Loader2, Link2, Briefcase, Download,
} from 'lucide-react';

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const AMBER = '#9C7A2A';
const SLATE = '#5B7383';

export interface NwEmployment { org_name: string; title: string | null; started: string | null; ended: string | null; is_current: boolean }
export interface NwPerson {
  id: string; kind: string; name: string; linkedin_url: string | null;
  headline: string | null; current_title: string | null; current_org: string | null;
  location: string | null; summary: string | null; note: string | null;
  status: string; enriched_at: string | null; employments: NwEmployment[];
}
export interface NwLead {
  id: string; score: number; via_org: string; reason: string;
  person: { id: string; name: string; linkedin_url: string | null; headline: string | null; current_title: string | null; current_org: string | null; location: string | null; status: string };
  viaPerson: { id: string; name: string } | null;
}
export interface NwState {
  configured: boolean;
  people: NwPerson[];
  leads: NwLead[];
  pipeline: NwLead[];
  lastRun: { started_at: string; api_calls: number; profiles_enriched: number; companies_scanned: number; leads_found: number; status: string } | null;
  totals: { boardMapped: number; boardTotal: number; employers: number; leads: number };
}

const CSS = `
.nw-root{--radius-kpi:12px;--radius-console:14px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary);background:var(--bg-page)}
.nw-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.nw-root .fd-kpi{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:-.01em}
.nw-root .fd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.nw-root .fd-caption{font-size:12px;line-height:1.5}
@keyframes nw-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.nw-root [data-nw-person]{transition:background .14s}
@media (max-width:1180px){.nw-root [data-nw-cols]{grid-template-columns:minmax(0,1fr)!important}.nw-root [data-nw-list]{max-height:none!important}}
`;

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

function Chip({ text, color, border }: { text: string; color: string; border: string }) {
  return <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.07em', textTransform: 'uppercase', color, border: `1px solid ${border}`, borderRadius: 2, padding: '2px 5px', whiteSpace: 'nowrap' }}>{text}</i>;
}
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${accent ? 'rgba(12,107,90,.28)' : 'var(--border-hairline)'}`, borderRadius: 'var(--radius-kpi)', padding: '14px 15px' }}>
      <p className="fd-eyebrow" style={{ color: accent ? 'var(--accent)' : 'var(--text-tertiary)', margin: '0 0 8px' }}>{label}</p>
      <b className="fd-kpi" style={{ fontSize: 22, color: accent ? 'var(--accent)' : undefined }}>{value}</b>
      {sub && <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)' };
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 15px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnAccent: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', borderRadius: 'var(--radius-kpi)', border: 'none', background: 'var(--accent)', color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' };
const inputCss: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', font: 'inherit', fontSize: 12.5, color: 'var(--text-primary)' };

export function NetworkView({ initial }: { initial: NwState }) {
  const [state, setState] = useState<NwState>(initial);
  const [selected, setSelected] = useState(initial.people[0]?.id ?? '');
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [refreshDone, setRefreshDone] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/network').then(r => r.json());
      if (!res.error) setState(res as NwState);
    } catch { /* keep current state */ }
  }, []);

  const person = state.people.find(p => p.id === selected) ?? state.people[0];

  // Warm paths surfaced for the selected member: theirs by attribution, or via
  // any employer on their career history.
  const orgSet = new Set((person?.employments ?? []).map(e => e.org_name.toLowerCase()));
  const paths = state.leads.filter(l =>
    l.viaPerson?.id === person?.id || orgSet.has(l.via_org.toLowerCase()));

  async function runRefreshStep() {
    setRefreshing(true); setError('');
    try {
      const res = await fetch('/api/network/refresh', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Refresh failed');
      const bits: string[] = [];
      if (body.enriched?.length) bits.push(`read ${body.enriched.length} profile${body.enriched.length === 1 ? '' : 's'}`);
      if (body.scanned?.length) bits.push(`scanned ${body.scanned.map((s: { company: string }) => s.company).join(', ')}`);
      if (body.leadsFound) bits.push(`${body.leadsFound} new warm path${body.leadsFound === 1 ? '' : 's'}`);
      let msg = `${bits.length ? bits.join(' · ') : 'Nothing pending'} · ${body.apiCalls} API call${body.apiCalls === 1 ? '' : 's'}`;
      // A completed refresh writes a dated .xlsx snapshot into the Data Hub —
      // CYC always keeps the network as a file, not just database rows.
      if (body.done && (body.enriched?.length || body.leadsFound)) {
        try {
          const snap = await fetch('/api/network/export', { method: 'POST' }).then(r => r.json());
          if (snap?.ok) msg += ` · snapshot saved to the Data Hub (${snap.document.name})`;
        } catch { /* download button still works */ }
      }
      setRefreshMsg(msg);
      setRefreshDone(!!body.done);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  async function setLeadStatus(personId: string, status: 'added' | 'dismissed' | 'new') {
    await fetch('/api/network', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: personId, status }) });
    await reload();
  }

  const lastRunLabel = state.lastRun
    ? `${new Date(state.lastRun.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${state.lastRun.api_calls} calls`
    : 'Never';

  const opening = !person
    ? ''
    : !person.linkedin_url
      ? `${person.name} is on the roster without a LinkedIn URL yet. Paste their profile link below and the next refresh maps the organizations they can still open doors at.`
      : !person.enriched_at
        ? `${person.name}'s profile is queued. Run a refresh and Fundir reads their career history, then finds the fundraising and leadership people still working at each of their former organizations.`
        : `${person.name}'s career runs through ${person.employments.length || 'their'} organization${person.employments.length === 1 ? '' : 's'} — ${paths.length ? `${paths.length} ${paths.length === 1 ? 'person' : 'people'} at those orgs look reachable through them.` : 'employer scans will surface who they can still call there.'}`;

  return (
    <div className="nw-root" style={{ padding: '24px 26px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>Chicago Youth Centers</p>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Network</h1>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>
            The board&rsquo;s LinkedIn footprint, mapped. Each member&rsquo;s career history names the rooms they were in — and the fundraising and leadership people in those rooms today are who they can still call for CYC.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/api/network/export" download style={{ ...btnGhost, textDecoration: 'none' }} title="Download the full network as a dated Excel workbook">
            <Download style={{ width: 13, height: 13 }} />Export .xlsx
          </a>
          <button onClick={() => setAddOpen(true)} style={btnGhost}><UserPlus style={{ width: 13, height: 13 }} />Add person</button>
          <button onClick={runRefreshStep} disabled={refreshing || !state.configured} style={{ ...btnAccent, opacity: refreshing || !state.configured ? 0.6 : 1 }}>
            {refreshing ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <RefreshCw style={{ width: 13, height: 13 }} />}
            {refreshing ? 'Reading…' : refreshDone ? 'Refresh network' : 'Continue refresh'}
          </button>
        </div>
      </div>

      {/* configuration / progress strip */}
      {!state.configured && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 16 }}>
          <Link2 style={{ width: 14, height: 14, color: AMBER, flex: 'none' }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            RapidAPI isn&rsquo;t connected — add <b className="fd-mono" style={{ fontSize: 11.5 }}>RAPIDAPI_KEY</b> to the environment to enable profile reads. The roster and any mapped data still work.
          </span>
        </div>
      )}
      {(refreshMsg || error) && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 16, borderColor: error ? 'rgba(156,122,42,.4)' : 'rgba(12,107,90,.3)' }}>
          {error
            ? <span style={{ fontSize: 12.5, color: AMBER }}>{error}</span>
            : <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <Check style={{ width: 13, height: 13, color: 'var(--accent)', display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                {refreshMsg}{!refreshDone && ' — more pending, click Continue refresh.'}
              </span>}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Board mapped" value={`${state.totals.boardMapped} / ${state.totals.boardTotal}`} sub="profiles read" />
        <KpiCard label="Employers discovered" value={String(state.totals.employers)} sub="from career histories" />
        <KpiCard label="Warm paths" value={String(state.totals.leads)} accent sub="second-order people" />
        <KpiCard label="Last refresh" value={lastRunLabel} sub="on demand · quarterly is plenty" />
      </div>

      <div data-nw-cols style={{ display: 'grid', gridTemplateColumns: '352px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

        {/* roster */}
        <div style={{ ...card, overflow: 'hidden', position: 'sticky', top: 68 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
            <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>CYC board &amp; staff</span>
            <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{state.people.length}</span>
          </div>
          <div data-nw-list style={{ maxHeight: 620, overflowY: 'auto' }}>
            {state.people.length === 0 && (
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', padding: '16px' }}>No one on the roster yet — add your board members with their LinkedIn URLs.</p>
            )}
            {state.people.map(p => {
              const on = p.id === person?.id;
              return (
                <div key={p.id} data-nw-person onClick={() => setSelected(p.id)} style={{ borderBottom: '1px solid var(--border-hairline)', cursor: 'pointer', background: on ? 'var(--bg-page)' : undefined }}>
                  <div style={{ display: 'flex', gap: 11, padding: '13px 16px', ...(on ? { boxShadow: 'inset 2px 0 0 var(--accent)' } : {}) }}>
                    <b style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: on ? 'var(--accent)' : 'var(--bg-elevated)', color: on ? '#fff' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 500 }}>{initialsOf(p.name)}</b>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 13, fontWeight: 500, letterSpacing: '-.005em', marginBottom: 2 }}>{p.name}</b>
                      <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[p.current_title, p.current_org].filter(Boolean).join(', ') || 'Role unknown'}
                      </span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {p.kind === 'staff' && <Chip text="Staff" color={SLATE} border="rgba(91,115,131,.3)" />}
                        {p.enriched_at
                          ? <Chip text="Mapped" color="var(--accent)" border="rgba(12,107,90,.3)" />
                          : p.linkedin_url
                            ? <Chip text="Queued" color={SLATE} border="rgba(91,115,131,.3)" />
                            : <Chip text="Needs URL" color={AMBER} border="rgba(156,122,42,.32)" />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* detail */}
        {person && (
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* the network opener */}
            <div key={person.id} style={{ ...card, border: '1px solid rgba(12,107,90,.3)', overflow: 'hidden', animation: 'nw-rise .3s cubic-bezier(.2,.8,.3,1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: 'rgba(12,107,90,.05)', borderBottom: '1px solid rgba(12,107,90,.18)' }}>
                <Radar style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />
                <span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>The network</span>
                <span style={{ flex: 1 }} />
                {person.linkedin_url && (
                  <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    linkedin.com/in/{person.linkedin_url.split('/in/')[1]}<ExternalLink style={{ width: 10, height: 10 }} />
                  </a>
                )}
              </div>
              <div style={{ padding: '18px 20px 20px' }}>
                <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.25rem,2.1vw,1.6rem)', lineHeight: 1.28, letterSpacing: '-.012em', margin: 0 }}>{opening}</p>
                {!person.linkedin_url && <UrlEditor personId={person.id} onSaved={reload} />}
                {person.headline && <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '14px 0 0' }}>{person.headline}{person.location ? ` · ${person.location}` : ''}</p>}
              </div>
            </div>

            {/* career history */}
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 20px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
                <b style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 500 }}>{initialsOf(person.name)}</b>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.55rem', lineHeight: 1.12, letterSpacing: '-.015em', margin: '0 0 4px' }}>{person.name}</h2>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{[person.current_title, person.current_org].filter(Boolean).join(', ') || 'Current role appears after the first refresh'}</p>
                </div>
                {person.enriched_at && (
                  <span className="fd-mono" style={{ flex: 'none', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', paddingTop: 6 }}>
                    Read {new Date(person.enriched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div style={{ padding: '20px 20px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Career history</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
                  <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>From LinkedIn</span>
                </div>
                {person.employments.length === 0 ? (
                  <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 14px' }}>
                    {person.linkedin_url ? 'Nothing read yet — run a refresh.' : 'Add their LinkedIn URL above, then refresh.'}
                  </p>
                ) : person.employments.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14 }}>
                    <div style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', flex: 'none', marginTop: 4, ...(e.is_current ? { background: 'var(--accent)' } : { background: 'var(--bg-surface)', boxShadow: '0 0 0 2px var(--border-hairline)' }) }} />
                      {i < person.employments.length - 1 && <span style={{ flex: 1, width: 1, background: 'var(--border-hairline)', margin: '4px 0' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
                        <b style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.008em' }}>{e.org_name}</b>
                        {e.is_current && <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(12,107,90,.3)', borderRadius: 2, padding: '2px 6px' }}>Current</i>}
                        <span style={{ flex: 1 }} />
                        {(e.started || e.ended) && <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{[e.started, e.is_current ? 'now' : e.ended].filter(Boolean).join(' – ')}</span>}
                      </div>
                      {e.title && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.title}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* warm paths */}
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Warm paths through {person.name.split(' ')[0]}</span>
                <span style={{ flex: 1 }} />
                <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{paths.length}</span>
              </div>
              {paths.length === 0 ? (
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', padding: '16px 20px' }}>
                  No paths yet{person.enriched_at ? ' — employer scans surface them on the next refresh steps.' : ' — map their profile first.'}
                </p>
              ) : paths.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--border-hairline)', alignItems: 'flex-start' }}>
                  <b style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 500 }}>{initialsOf(l.person.name)}</b>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <b style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-.005em' }}>{l.person.name}</b>
                      {l.person.linkedin_url && (
                        <a href={l.person.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-tertiary)', lineHeight: 0 }} title="Open LinkedIn profile"><ExternalLink style={{ width: 11, height: 11 }} /></a>
                      )}
                    </div>
                    <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                      {[l.person.current_title, l.person.current_org].filter(Boolean).join(' · ') || l.person.headline || '—'}
                    </span>
                    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip text={`via ${l.via_org}`} color={SLATE} border="rgba(91,115,131,.3)" />
                      {/chicago|illinois|\bil\b/i.test(l.person.location ?? '') && <Chip text="Chicago" color="var(--accent)" border="rgba(12,107,90,.3)" />}
                    </span>
                  </div>
                  <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <b className="fd-mono" style={{ fontSize: 13, fontWeight: 600, color: l.score >= 60 ? 'var(--accent)' : 'var(--text-secondary)' }}>{Math.round(l.score)}</b>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setLeadStatus(l.person.id, 'added')} title="Add to network pipeline" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(12,107,90,.3)', background: 'var(--bg-surface)', color: 'var(--accent)', font: 'inherit', fontSize: 10.5, fontWeight: 500, cursor: 'pointer' }}><Check style={{ width: 11, height: 11 }} />Add</button>
                      <button onClick={() => setLeadStatus(l.person.id, 'dismissed')} title="Dismiss" style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-tertiary)', font: 'inherit', cursor: 'pointer' }}><X style={{ width: 11, height: 11 }} /></button>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* pipeline */}
            {state.pipeline.length > 0 && (
              <div style={{ ...card, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
                  <Briefcase style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />
                  <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Network pipeline</span>
                  <span style={{ flex: 1 }} />
                  <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{state.pipeline.length}</span>
                </div>
                {state.pipeline.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
                    <b style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: 'rgba(12,107,90,.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 500 }}>{initialsOf(l.person.name)}</b>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>{l.person.name}</b>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{[l.person.current_title, l.person.current_org].filter(Boolean).join(' · ')} · via {l.viaPerson?.name ?? l.via_org}</span>
                    </div>
                    {l.person.linkedin_url && <a href={l.person.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-tertiary)', lineHeight: 0 }}><ExternalLink style={{ width: 12, height: 12 }} /></a>}
                    <button onClick={() => setLeadStatus(l.person.id, 'new')} title="Move back to leads" style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', font: 'inherit', fontSize: 10.5, cursor: 'pointer', padding: 0 }}>Undo</button>
                  </div>
                ))}
              </div>
            )}

            <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Live workspace · profile reads on demand, spend recorded per run</p>
          </div>
        )}
      </div>

      {addOpen && <AddPersonModal onClose={() => setAddOpen(false)} onSaved={async () => { setAddOpen(false); await reload(); }} />}
    </div>
  );
}

// Inline "paste their LinkedIn URL" affordance for roster members missing one.
function UrlEditor({ personId, onSaved }: { personId: string; onSaved: () => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/network', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: personId, linkedinUrl: url }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not save');
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, maxWidth: 480 }}>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.linkedin.com/in/…" style={inputCss} />
        <button onClick={save} disabled={busy || !url.trim()} style={{ ...btnAccent, height: 36, padding: '0 14px', opacity: busy || !url.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      {err && <p className="fd-caption" style={{ color: AMBER, margin: '8px 0 0' }}>{err}</p>}
    </div>
  );
}

function AddPersonModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [org, setOrg] = useState('');
  const [kind, setKind] = useState<'board' | 'staff'>('board');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/network', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, linkedinUrl: url, title, org, kind }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not add');
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add'); }
    finally { setBusy(false); }
  }

  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'block' }}>
      <span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</span>
      {node}
    </label>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,25,23,.42)', backdropFilter: 'blur(3px)', border: 'none', cursor: 'default' }} />
      <div role="dialog" aria-modal="true" aria-label="Add person" style={{ position: 'relative', width: 'min(460px,100%)', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', boxShadow: '0 24px 60px rgba(16,25,23,.20)', animation: 'nw-rise .26s cubic-bezier(.2,.8,.3,1)' }}>
        <div style={{ padding: '20px 22px 0' }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.6rem', lineHeight: 1.1, letterSpacing: '-.015em', margin: '0 0 6px' }}>Add to the roster</h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            Their LinkedIn URL is what unlocks the mapping — pasted straight from the browser, it&rsquo;s exact and spends nothing on name lookups.
          </p>
        </div>
        <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {field('Name', <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Phil Doherty" style={inputCss} />)}
          {field('LinkedIn URL', <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.linkedin.com/in/…" style={inputCss} />)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('Title', <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Board Chair" style={inputCss} />)}
            {field('Organization', <input value={org} onChange={e => setOrg(e.target.value)} placeholder="Their employer" style={inputCss} />)}
          </div>
          {field('Kind', (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['board', 'staff'] as const).map(k => (
                <button key={k} onClick={() => setKind(k)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                  <span className="fd-mono" style={{ display: 'block', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 3, ...(kind === k ? { background: 'var(--accent)', color: '#fff' } : { border: '1px solid var(--border-hairline)', color: 'var(--text-tertiary)', background: 'var(--bg-surface)' }) }}>
                    {k === 'board' ? 'Board member' : 'Staff'}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {err && <p className="fd-caption" style={{ color: AMBER, margin: 0 }}>{err}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={{ flex: 1 }} />
            <button onClick={onClose} style={{ ...btnGhost, height: 38 }}>Cancel</button>
            <button onClick={save} disabled={busy || !name.trim()} style={{ ...btnAccent, height: 38, opacity: busy || !name.trim() ? 0.6 : 1 }}>
              {busy ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <UserPlus style={{ width: 13, height: 13 }} />}
              Add person
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
