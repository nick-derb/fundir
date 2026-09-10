'use client';

// The person record panel: the same side peek as leads, with the tabbed
// label/value layout from the user's references — Overview · Career · Boards
// & paths · Sources. Facts only; every one names where it came from.

import { useEffect, useState } from 'react';
import { X, ExternalLink, Map as MapIcon, Sparkles, Loader2 } from 'lucide-react';
// (loading is derived: no record and no error yet)
import type { PersonDetail } from '@/lib/network/queries';
import { SERIF, MONO, Avatar, Chip, Eyebrow, Skeleton, fmtDate, relLabel, SLATE, AMBER, INFO, hueFor, STATUS_LABEL } from './shared';
import type { PipelineState } from '@/lib/network/queries';

const TABS = ['Overview', 'Career', 'Boards & paths', 'Sources'] as const;
type Tab = typeof TABS[number];
const SOURCE_LABEL: Record<string, string> = { irs_990_xml: 'IRS 990 filing', propublica: 'ProPublica', foundation_site: 'foundation website', corporate_site: 'company website', cyc_workbook: 'CYC records', linkedin_api: 'LinkedIn profile', public_bio: 'public bio', cyc_site: 'CYC board page', seed: 'seed list', irs_bmf: 'IRS BMF', manual: 'manual' };
const src = (t: string | null) => (t ? SOURCE_LABEL[t] ?? t.replace(/_/g, ' ') : 'source not recorded');
const span = (s: number | null, e: number | null, cur: boolean) => (s && (e || cur) ? `${s}–${cur ? 'present' : e}` : s ? `from ${s}` : e ? `until ${e}` : 'undated');

interface PeekProps { personId: string | null; onClose: () => void; onOpenLead: (id: string) => void; onOpenMap: (f: { kind: 'person' | 'org'; id: string }) => void; onSaveUrl?: (id: string, url: string) => Promise<string | null>; readOnly?: boolean }

/** Keyed on the person so every open starts from clean state — no resets inside effects. */
export function PersonPeek(props: PeekProps) {
  if (!props.personId) return null;
  return <PersonPeekInner key={props.personId} {...props} personId={props.personId} />;
}

function PersonPeekInner({ personId, onClose, onOpenLead, onOpenMap, onSaveUrl, readOnly }: PeekProps & { personId: string }) {
  const [p, setP] = useState<PersonDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('Overview');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const loading = !p && !error;
  useEffect(() => {
    let alive = true;
    fetch(`/api/network/people/${personId}`).then(r => r.json()).then(b => { if (!alive) return; if (b.error) setError(b.error); else setP(b as PersonDetail); }).catch(() => { if (alive) setError('Could not load this person'); });
    return () => { alive = false; };
  }, [personId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kindLabel = p ? (p.own ? (p.kind === 'board' ? `CYC board${p.board_role ? ` · ${p.board_role}` : ''}` : p.kind === 'staff' ? 'CYC staff' : p.kind === 'auxiliary' ? 'CYC auxiliary board' : 'CYC council') : p.kind === 'trustee' ? 'Funder trustee' : 'Funder executive') : '';
  const fact = (label: string, value: React.ReactNode) => (value ? [<span key={`${label}-l`} className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 11.5 }}>{label}</span>, <span key={`${label}-v`} style={{ fontSize: 12.5, color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>] : null);

  return (
    <aside className="ni-peek" role="dialog" aria-modal="false" aria-label={p ? `${p.name} record` : 'Person record'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 10px 18px', borderBottom: '1px solid var(--border-hairline)', flex: 'none' }}>
        <span className="fd-mono" style={{ fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Person</span>
        <span style={{ flex: 1 }} />
        {p && <button type="button" className="ni-ghost" style={{ height: 28, fontSize: 11.5 }} onClick={() => onOpenMap({ kind: 'person', id: p.id })}><MapIcon style={{ width: 12, height: 12 }} />Map</button>}
        {p?.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="ni-ghost" style={{ height: 28, fontSize: 11.5, color: INFO, textDecoration: 'none' }}><ExternalLink style={{ width: 12, height: 12 }} />LinkedIn</a>}
        <button type="button" className="ni-ghost" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center', marginLeft: 4 }} aria-label="Close" onClick={onClose}><X style={{ width: 14, height: 14 }} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && <p className="fd-caption" style={{ color: 'var(--critical)', padding: 22 }}>{error}</p>}
        {(loading || !p) && !error && <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}><Skeleton h={56} w={56} style={{ borderRadius: 28 }} /><Skeleton h={26} w="60%" /><Skeleton h={12} w="40%" /><Skeleton h={12} /><Skeleton h={12} w="80%" /></div>}
        {p && !loading && (
          <div className="ni-rise" key={p.id}>
            {/* identity */}
            <div style={{ padding: '20px 22px 0', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <Avatar name={p.name} size={64} own={p.own} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <Chip text={kindLabel} color={p.own ? 'var(--accent)' : SLATE} border={p.own ? 'rgba(12,107,90,.32)' : 'rgba(91,115,131,.34)'} />
                  {p.verification && !p.own && <Chip text={p.verification} color={p.verification === 'verified' ? 'var(--accent)' : p.verification === 'inferred' ? AMBER : SLATE} border="var(--border-hairline)" />}
                  {p.paths > 0 && <Chip text={`${p.paths} warm path${p.paths === 1 ? '' : 's'}`} color={AMBER} border="rgba(156,122,42,.36)" />}
                </div>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.5rem,2.4vw,1.85rem)', lineHeight: 1.1, letterSpacing: '-.015em', margin: '0 0 4px' }}>{p.name}</h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{[p.title, p.org].filter(Boolean).join(', ') || p.headline || (p.own ? 'Current role appears after the first profile read' : '')}{p.location ? ` · ${p.location}` : ''}</p>
              </div>
            </div>
            {/* tabs */}
            <div role="tablist" style={{ display: 'flex', gap: 2, padding: '16px 22px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              {TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} type="button" className="ni-tab" onClick={() => setTab(t)} style={{ padding: '8px 12px', fontSize: 12.5, borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{t}{t === 'Career' && p.employments.length ? <i style={{ fontStyle: 'normal', fontFamily: MONO, fontSize: 9, marginLeft: 6, color: 'var(--text-tertiary)' }}>{p.employments.length}</i> : null}{t === 'Boards & paths' && (p.seats.length + p.leads.length) ? <i style={{ fontStyle: 'normal', fontFamily: MONO, fontSize: 9, marginLeft: 6, color: 'var(--text-tertiary)' }}>{p.seats.length + p.leads.length}</i> : null}</button>)}
            </div>
            <div style={{ padding: '18px 22px 40px' }}>
              {tab === 'Overview' && (
                <>
                  <Eyebrow color="var(--text-secondary)" style={{ display: 'block', marginBottom: 10 }}>Profile</Eyebrow>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 14px', alignItems: 'baseline' }}>
                    {fact('Kind', kindLabel)}
                    {fact('Role', p.board_role)}
                    {fact('Title', p.title)}
                    {fact('Organization', p.org ? (p.org_id ? <button type="button" onClick={() => onOpenMap({ kind: 'org', id: p.org_id! })} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, color: 'var(--accent)', cursor: 'pointer', textAlign: 'left' }}>{p.org}</button> : p.org) : null)}
                    {fact('Location', p.location)}
                    {fact('Headline', p.headline)}
                    {fact('LinkedIn', p.linkedin_url ? <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: INFO }}>{p.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}</a> : null)}
                    {fact('Profile read', p.enriched_at ? fmtDate(p.enriched_at) : p.own ? 'Not yet' : null)}
                    {fact('Verification', p.verification)}
                    {fact('Source', src(p.source_type))}
                  </div>
                  {p.summary && <><Eyebrow color="var(--text-secondary)" style={{ display: 'block', margin: '18px 0 8px' }}>About</Eyebrow><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>{p.summary}</p></>}
                  {p.own && !p.linkedin_url && onSaveUrl && !readOnly && (
                    <div style={{ marginTop: 18, border: `1px solid rgba(156,122,42,.36)`, background: 'rgba(156,122,42,.08)', borderRadius: 10, padding: '12px 14px' }}>
                      <Eyebrow color={AMBER} style={{ display: 'block', marginBottom: 6 }}>Needs a LinkedIn URL</Eyebrow>
                      <p className="fd-caption" style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}>Paste the profile link from the browser — exact and free to identify. The next refresh reads their career and looks for the rooms they share with funder trustees.</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="ni-input" style={{ paddingLeft: 10, height: 30 }} placeholder="https://www.linkedin.com/in/…" value={url} onChange={e => setUrl(e.target.value)} aria-label="LinkedIn URL" />
                        <button type="button" className="ni-primary" style={{ height: 30 }} disabled={busy || !url.trim()} onClick={async () => { setBusy(true); const err = await onSaveUrl(p.id, url.trim()); setBusy(false); if (err) setError(err); else { const fresh = await fetch(`/api/network/people/${p.id}`).then(r => r.json()); if (!fresh.error) setP(fresh); } }}>{busy ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : 'Save'}</button>
                      </div>
                    </div>
                  )}
                  {p.links.length > 0 && (
                    <>
                      <Eyebrow color="var(--text-secondary)" style={{ display: 'block', margin: '18px 0 8px' }}>Strongest links</Eyebrow>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {p.links.slice(0, 8).map(l => (
                          <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                            <span style={{ width: 16, borderTop: `1.5px ${l.verification === 'verified' ? 'solid' : l.verification === 'probable' ? 'dashed' : 'dotted'} var(--text-secondary)`, flex: 'none' }} />
                            <button type="button" onClick={() => onOpenMap({ kind: l.other.kind, id: l.other.id })} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>{l.other.name}</button>
                            <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', letterSpacing: '.04em' }}>{relLabel(l.type)} · {l.verification}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
              {tab === 'Career' && (
                <>
                  {p.employments.length === 0 && <p className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{p.own ? (p.linkedin_url ? 'Nothing read yet — run a refresh.' : 'Add a LinkedIn URL, then refresh.') : 'No career history on file for this person.'}</p>}
                  {p.employments.map((e, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14 }}>
                      <div style={{ width: 22, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ width: 11, height: 11, borderRadius: 6, marginTop: 5, flex: 'none', ...(e.is_current ? { background: 'var(--accent)' } : { background: 'var(--bg-surface)', boxShadow: '0 0 0 2px var(--border-hairline)' }) }} />
                        {i < p.employments.length - 1 && <span style={{ flex: 1, width: 1, background: 'var(--border-hairline)', margin: '4px 0' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          {e.org_id ? <button type="button" onClick={() => onOpenMap({ kind: 'org', id: e.org_id! })} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 13.5, fontWeight: 600, letterSpacing: '-.008em', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>{e.org_name}</button> : <b style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.008em' }}>{e.org_name}</b>}
                          {e.is_current && <Chip text="Current" color="var(--accent)" border="rgba(12,107,90,.3)" />}
                          <span style={{ flex: 1 }} />
                          <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{span(e.start_year, e.end_year, e.is_current)}</span>
                        </div>
                        {e.title && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.title}</p>}
                        <span className="fd-mono" style={{ display: 'inline-block', marginTop: 4, fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>per {src(e.source_type)}{e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', marginLeft: 6 }}>open</a> : null}</span>
                      </div>
                    </div>
                  ))}
                  {p.educations.length > 0 && (
                    <>
                      <Eyebrow color="var(--text-secondary)" style={{ display: 'block', margin: '10px 0 8px' }}>Education</Eyebrow>
                      {p.educations.map((s, i) => <p key={i} style={{ margin: '0 0 6px', fontSize: 12.5 }}><b style={{ fontWeight: 500 }}>{s.school}</b>{s.degree || s.field ? <span style={{ color: 'var(--text-secondary)' }}> · {[s.degree, s.field].filter(Boolean).join(', ')}</span> : null}{s.start_year || s.end_year ? <span className="fd-mono" style={{ color: 'var(--text-tertiary)', fontSize: 10.5, marginLeft: 8 }}>{[s.start_year, s.end_year].filter(Boolean).join('–')}</span> : null}</p>)}
                    </>
                  )}
                </>
              )}
              {tab === 'Boards & paths' && (
                <>
                  <Eyebrow color="var(--text-secondary)" style={{ display: 'block', marginBottom: 8 }}>Board seats</Eyebrow>
                  {p.seats.length === 0 && <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 14px' }}>No board seats on file.</p>}
                  {p.seats.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                      <button type="button" onClick={() => onOpenMap({ kind: 'org', id: s.org_id })} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', minWidth: 0, flex: 1 }}>{s.org}</button>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.title ?? 'Board'}</span>
                      <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{src(s.source_type)}</span>
                    </div>
                  ))}
                  <Eyebrow color="var(--text-secondary)" style={{ display: 'block', margin: '18px 0 8px' }}>{p.own ? 'Paths through this person' : 'Paths to this person'}</Eyebrow>
                  {p.leads.length === 0 && <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>None yet.</p>}
                  {p.leads.map(l => { const h = hueFor(l.insight_type); return (
                    <button key={l.id} type="button" onClick={() => onOpenLead(l.id)} className="ni-row" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 8px', border: 'none', background: 'none', font: 'inherit', textAlign: 'left', color: 'inherit', borderLeft: `2px solid ${h.color}`, borderRadius: 6 }}>
                      <b className="fd-mono" style={{ fontSize: 12.5, fontWeight: 600, color: l.score >= 70 ? 'var(--accent)' : 'var(--text-secondary)', width: 26 }}>{l.score}</b>
                      <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.target}</b><span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', letterSpacing: '.04em' }}>{h.short} · {l.confidence ?? '—'} · {STATUS_LABEL[l.pipeline_status as PipelineState] ?? l.pipeline_status}</span></span>
                      <Sparkles style={{ width: 12, height: 12, color: h.color, flex: 'none' }} />
                    </button>
                  ); })}
                </>
              )}
              {tab === 'Sources' && (
                <>
                  <p className="fd-caption" style={{ color: 'var(--text-secondary)', margin: '0 0 12px' }}>Where the facts on this record come from. Nothing here was written by a model.</p>
                  {p.sources.length === 0 && <p className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>No sources recorded.</p>}
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.sources.map((s, i) => (
                      <li key={i} className="ni-source" style={{ border: '1px solid var(--border-hairline)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>{src(s.source_type)}</b>{s.name && <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{s.name}</span>}</span>
                        {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="fd-mono" style={{ fontSize: 9.5, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>open<ExternalLink style={{ width: 9, height: 9 }} /></a>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
