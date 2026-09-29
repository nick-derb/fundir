'use client';

// CYC network — the board's LinkedIn footprint and the second-order warm paths
// inferred from it. Sibling of connections-view.tsx: same officer-trail design
// language (serif openers, hairline cards, mono tags, roster + detail).
//
// LinkedIn exposes nobody's connection list; what it does expose is careers.
// A board member's prior employers are rooms they were in — the people working
// in those rooms today are who they can still call. Refresh is on-demand and
// bounded (quarterly is plenty); every run's API spend is recorded.

import { useCallback, useState } from 'react';
import {
  Radar, RefreshCw, UserPlus, ExternalLink, Check, X, Loader2, Link2, Briefcase, Download,
} from 'lucide-react';

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
.nw-root{color:var(--text-primary);background:var(--bg-page)}
.nw-root .nw-cols{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start}
.nw-root .nw-list{max-height:620px;overflow-y:auto}
.nw-root .nw-person{display:flex;gap:11px;padding:11px 14px;border-bottom:1px solid var(--border-hairline)}
.nw-root .nw-av{width:28px;height:28px;flex:none;border-radius:50%;background:var(--bg-elevated);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10px;font-weight:500}
.nw-root .fd-row[data-on="true"] .nw-av{background:var(--accent);color:var(--accent-on)}
.nw-root h2{font-family:var(--font-display);font-weight:400;letter-spacing:-.015em}
.nw-root .nw-opening{font-family:var(--font-display);font-weight:400;font-size:clamp(1.2rem,1.9vw,1.45rem);line-height:1.3;letter-spacing:-.012em;margin:0}
.nw-root .nw-section{display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border-hairline)}
@media (max-width:1180px){.nw-root .nw-cols{grid-template-columns:minmax(0,1fr)}.nw-root .nw-list{max-height:none}.nw-root .nw-roster{position:static!important}}
`;

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

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
    <div className="nw-root" style={{ padding: '22px 24px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* header */}
      <div className="fd-page-head">
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Chicago Youth Centers</p>
          <h1>Network</h1>
          <p className="fd-lede">The board&rsquo;s LinkedIn footprint, mapped: each career names the rooms a member was in, and who in those rooms they can still call for CYC.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a href="/api/network/export" download className="fd-btn" style={{ textDecoration: 'none' }} title="Download the full network as a dated Excel workbook">
            <Download style={{ width: 13, height: 13 }} />Export .xlsx
          </a>
          <button className="fd-btn" onClick={() => setAddOpen(true)}><UserPlus style={{ width: 13, height: 13 }} />Add person</button>
          <button className="fd-btn-primary" onClick={runRefreshStep} disabled={refreshing || !state.configured}>
            {refreshing ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <RefreshCw style={{ width: 13, height: 13 }} />}
            {refreshing ? 'Reading…' : refreshDone ? 'Refresh network' : 'Continue refresh'}
          </button>
        </div>
      </div>

      {/* configuration / progress strip */}
      {!state.configured && (
        <div className="fd-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14 }}>
          <Link2 style={{ width: 14, height: 14, color: 'var(--warning)', flex: 'none' }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            RapidAPI isn&rsquo;t connected — add <b className="fd-mono" style={{ fontSize: 11.5 }}>RAPIDAPI_KEY</b> to the environment to enable profile reads. The roster and any mapped data still work.
          </span>
        </div>
      )}
      {(refreshMsg || error) && (
        <div className="fd-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14, borderLeft: `2px solid ${error ? 'var(--warning)' : 'var(--accent)'}` }}>
          {error
            ? <span style={{ fontSize: 12.5, color: 'var(--warning)' }}>{error}</span>
            : <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <Check style={{ width: 13, height: 13, color: 'var(--accent)', display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                {refreshMsg}{!refreshDone && ' — more pending, click Continue refresh.'}
              </span>}
        </div>
      )}

      {/* KPIs */}
      <div className="fd-stats" style={{ marginBottom: 18 }}>
        <div className="fd-stat"><span className="fd-eyebrow">Board mapped</span><b>{state.totals.boardMapped} / {state.totals.boardTotal}</b><small>profiles read</small></div>
        <div className="fd-stat"><span className="fd-eyebrow">Employers discovered</span><b>{state.totals.employers}</b><small>from career histories</small></div>
        <div className="fd-stat" data-accent="true"><span className="fd-eyebrow">Warm paths</span><b>{state.totals.leads}</b><small>second-order people</small></div>
        <div className="fd-stat"><span className="fd-eyebrow">Last refresh</span><b style={{ fontSize: 15, paddingTop: 3 }}>{lastRunLabel}</b><small>on demand · quarterly is plenty</small></div>
      </div>

      <div className="nw-cols">

        {/* roster */}
        <div className="fd-card nw-roster" style={{ overflow: 'hidden', position: 'sticky', top: 64 }}>
          <div className="nw-section">
            <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>CYC board &amp; staff</span>
            <span style={{ flex: 1 }} />
            <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{state.people.length}</span>
          </div>
          <div className="nw-list">
            {state.people.length === 0 && (
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', padding: '14px', margin: 0 }}>No one on the roster yet — add your board members with their LinkedIn URLs.</p>
            )}
            {state.people.map(p => {
              const on = p.id === person?.id;
              return (
                <div key={p.id} className="fd-row nw-person" data-on={on ? 'true' : undefined} role="button" tabIndex={0} onClick={() => setSelected(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.id); } }}>
                  <b className="nw-av">{initialsOf(p.name)}</b>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block', fontSize: 13, fontWeight: 500, letterSpacing: '-.005em', marginBottom: 2 }}>{p.name}</b>
                    <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-tertiary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[p.current_title, p.current_org].filter(Boolean).join(', ') || 'Role unknown'}
                    </span>
                    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {p.kind === 'staff' && <i className="fd-tag" data-tone="slate">Staff</i>}
                      {p.enriched_at
                        ? <i className="fd-tag" data-tone="accent">Mapped</i>
                        : p.linkedin_url
                          ? <i className="fd-tag" data-tone="slate">Queued</i>
                          : <i className="fd-tag" data-tone="warning">Needs URL</i>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* detail */}
        {person && (
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* the network opener */}
            <div key={person.id} className="fd-card" style={{ overflow: 'hidden' }}>
              <div className="nw-section">
                <Radar style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />
                <span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>The network</span>
                <span style={{ flex: 1 }} />
                {person.linkedin_url && (
                  <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    linkedin.com/in/{person.linkedin_url.split('/in/')[1]}<ExternalLink style={{ width: 10, height: 10 }} />
                  </a>
                )}
              </div>
              <div style={{ padding: '16px 16px 18px' }}>
                <p className="nw-opening">{opening}</p>
                {!person.linkedin_url && <UrlEditor personId={person.id} onSaved={reload} />}
                {person.headline && <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '12px 0 0' }}>{person.headline}{person.location ? ` · ${person.location}` : ''}</p>}
              </div>
            </div>

            {/* career history */}
            <div className="fd-card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
                <b className="nw-av" style={{ width: 38, height: 38, fontSize: 12, background: 'var(--accent)', color: 'var(--accent-on)' }}>{initialsOf(person.name)}</b>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontSize: '1.4rem', lineHeight: 1.12, margin: '0 0 3px' }}>{person.name}</h2>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{[person.current_title, person.current_org].filter(Boolean).join(', ') || 'Current role appears after the first refresh'}</p>
                </div>
                {person.enriched_at && (
                  <span className="fd-tag" style={{ flex: 'none', marginTop: 4 }}>
                    Read {new Date(person.enriched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div style={{ padding: '16px 16px 6px' }}>
                <div className="fd-rule" style={{ margin: '0 0 14px' }}>
                  <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Career history</span>
                  <span className="fd-rule-line" />
                  <span className="fd-tag">From LinkedIn</span>
                </div>
                {person.employments.length === 0 ? (
                  <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
                    {person.linkedin_url ? 'Nothing read yet — run a refresh.' : 'Add their LinkedIn URL above, then refresh.'}
                  </p>
                ) : person.employments.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 22, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', flex: 'none', marginTop: 5, ...(e.is_current ? { background: 'var(--accent)' } : { background: 'var(--bg-surface)', boxShadow: '0 0 0 1.5px var(--border-strong)' }) }} />
                      {i < person.employments.length - 1 && <span style={{ flex: 1, width: 1, background: 'var(--border-hairline)', margin: '4px 0' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <b style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.008em' }}>{e.org_name}</b>
                        {e.is_current && <i className="fd-tag" data-tone="accent">Current</i>}
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
            <div className="fd-card" style={{ overflow: 'hidden' }}>
              <div className="nw-section">
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Warm paths through {person.name.split(' ')[0]}</span>
                <span style={{ flex: 1 }} />
                <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{paths.length}</span>
              </div>
              {paths.length === 0 ? (
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', padding: '14px 16px', margin: 0 }}>
                  No paths yet{person.enriched_at ? ' — employer scans surface them on the next refresh steps.' : ' — map their profile first.'}
                </p>
              ) : paths.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 11, padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', alignItems: 'flex-start' }}>
                  <b className="nw-av">{initialsOf(l.person.name)}</b>
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
                      <i className="fd-tag" data-tone="slate">via {l.via_org}</i>
                      {/chicago|illinois|\bil\b/i.test(l.person.location ?? '') && <i className="fd-tag" data-tone="accent">Chicago</i>}
                    </span>
                  </div>
                  <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <b className="fd-mono" style={{ fontSize: 13, fontWeight: 600, color: l.score >= 60 ? 'var(--accent)' : 'var(--text-secondary)' }}>{Math.round(l.score)}</b>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button className="fd-btn" style={{ height: 26, padding: '0 9px', fontSize: 11, color: 'var(--accent)' }} onClick={() => setLeadStatus(l.person.id, 'added')} title="Add to network pipeline"><Check style={{ width: 11, height: 11 }} />Add</button>
                      <button className="fd-btn" style={{ height: 26, padding: '0 7px', color: 'var(--text-tertiary)' }} onClick={() => setLeadStatus(l.person.id, 'dismissed')} title="Dismiss" aria-label="Dismiss"><X style={{ width: 11, height: 11 }} /></button>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* pipeline */}
            {state.pipeline.length > 0 && (
              <div className="fd-card" style={{ overflow: 'hidden' }}>
                <div className="nw-section">
                  <Briefcase style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />
                  <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Network pipeline</span>
                  <span style={{ flex: 1 }} />
                  <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{state.pipeline.length}</span>
                </div>
                {state.pipeline.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
                    <b className="nw-av" style={{ width: 24, height: 24, fontSize: 9, background: 'var(--accent-tint)', color: 'var(--accent)' }}>{initialsOf(l.person.name)}</b>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>{l.person.name}</b>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{[l.person.current_title, l.person.current_org].filter(Boolean).join(' · ')} · via {l.viaPerson?.name ?? l.via_org}</span>
                    </div>
                    {l.person.linkedin_url && <a href={l.person.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-tertiary)', lineHeight: 0 }}><ExternalLink style={{ width: 12, height: 12 }} /></a>}
                    <button onClick={() => setLeadStatus(l.person.id, 'new')} title="Move back to leads" style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', font: 'inherit', fontSize: 11, cursor: 'pointer', padding: 0 }}>Undo</button>
                  </div>
                ))}
              </div>
            )}

            <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Live workspace · profile reads on demand, spend recorded per run</p>
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
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8, maxWidth: 480 }}>
        <input className="fd-input" style={{ flex: 1 }} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.linkedin.com/in/…" />
        <button className="fd-btn-primary" onClick={save} disabled={busy || !url.trim()}>
          {busy ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      {err && <p className="fd-caption" style={{ color: 'var(--warning)', margin: '8px 0 0' }}>{err}</p>}
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
      <span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>{label}</span>
      {node}
    </label>
  );
  const input: React.CSSProperties = { width: '100%' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,25,23,.42)', border: 'none', cursor: 'default' }} />
      <div role="dialog" aria-modal="true" aria-label="Add person" className="fd-card" style={{ position: 'relative', width: 'min(460px,100%)', boxShadow: 'var(--shadow-overlay, 0 24px 60px rgba(16,25,23,.20))', animation: 'fd-fade .18s ease-out' }}>
        <div style={{ padding: '18px 20px 0' }}>
          <h2 style={{ fontSize: '1.45rem', lineHeight: 1.1, margin: '0 0 6px' }}>Add to the roster</h2>
          <p className="fd-caption" style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Their LinkedIn URL is what unlocks the mapping — pasted straight from the browser, it&rsquo;s exact and spends nothing on name lookups.
          </p>
        </div>
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {field('Name', <input className="fd-input" style={input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Phil Doherty" />)}
          {field('LinkedIn URL', <input className="fd-input" style={input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.linkedin.com/in/…" />)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('Title', <input className="fd-input" style={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Board Chair" />)}
            {field('Organization', <input className="fd-input" style={input} value={org} onChange={e => setOrg(e.target.value)} placeholder="Their employer" />)}
          </div>
          {field('Kind', (
            <div style={{ display: 'flex', gap: 4 }}>
              {(['board', 'staff'] as const).map(k => (
                <button key={k} type="button" className="fd-seg" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {k === 'board' ? 'Board member' : 'Staff'}
                </button>
              ))}
            </div>
          ))}
          {err && <p className="fd-caption" style={{ color: 'var(--warning)', margin: 0 }}>{err}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ flex: 1 }} />
            <button className="fd-btn" onClick={onClose}>Cancel</button>
            <button className="fd-btn-primary" onClick={save} disabled={busy || !name.trim()}>
              {busy ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <UserPlus style={{ width: 13, height: 13 }} />}
              Add person
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
