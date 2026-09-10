'use client';

// The side peek. The list stays underneath and interactive (Attio's record
// peek, Linear's issue panel): open from any row, ↑/↓ walk the list, Esc
// closes, the URL carries the lead so a link opens straight here.
//
// Inside: score and its parts, the path rail, "Why Fundir recommends this"
// with every claim citing evidence — click a citation and the source lights
// up below — then the action, the pipeline control, the activity, sources.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronUp, ChevronDown, ExternalLink, Map as MapIcon, Sparkles, ShieldCheck, Check } from 'lucide-react';
import type { LeadDetail, PipelineState } from '@/lib/network/queries';
import type { Explanation } from '@/lib/network/explain';
import { PathRail } from './path-rail';
import { GraphCanvas } from './graph-canvas';
import type { GraphPayload } from '@/lib/network/queries';
import { SERIF, MONO, ScoreRing, ConfChip, TypeChip, StatusChip, Eyebrow, SectionRule, Skeleton, STATUS_LABEL, fmtDate, hueFor, typeLabel, initialsOf, AMBER } from './shared';
import { ReasonDialog, type TeamMember } from './pipeline-view';
import { BOARD_COLUMNS, OPEN_STATES, daysUntil, dismissalLabel } from '@/lib/network/pipeline';

interface Props {
  leadId: string | null;
  onClose: () => void;
  onStep?: (dir: -1 | 1) => void;
  onOpenMap?: (focus: { kind: 'person' | 'org'; id: string }) => void;
  onChanged?: () => void;
  readOnly?: boolean;
  position?: { index: number; total: number } | null;
}

const SOURCE_LABEL: Record<string, string> = { irs_990_xml: 'IRS 990 filing', propublica: 'ProPublica', foundation_site: 'foundation site', corporate_site: 'company site', cyc_workbook: 'CYC records', linkedin_api: 'LinkedIn', public_bio: 'public bio', cyc_site: 'CYC board page', seed: 'seed list (uncited)', irs_bmf: 'IRS BMF', instrumentl: 'Instrumentl', manual: 'manual' };

export function LeadDrawer({ leadId, onClose, onStep, onOpenMap, onChanged, readOnly, position }: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hi, setHi] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [askReason, setAskReason] = useState<PipelineState | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch('/api/network/team').then(r => r.json()).then(b => setTeam(b.team ?? [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!leadId) { setLead(null); setGraph(null); return; }
    let alive = true;
    setLoading(true); setError(''); setHi(null); setGraph(null);
    fetch(`/api/network/leads/${leadId}`).then(r => r.json()).then(b => { if (!alive) return; if (b.error) setError(b.error); else setLead(b as LeadDetail); }).catch(() => { if (alive) setError('Could not load this lead'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [leadId]);

  useEffect(() => {
    if (!lead?.target?.id) return;
    let alive = true;
    fetch(`/api/network/graph?kind=org&id=${lead.target.id}`).then(r => r.json()).then(b => { if (alive && !b.error) setGraph(b as GraphPayload); }).catch(() => {});
    return () => { alive = false; };
  }, [lead?.target?.id]);

  useEffect(() => {
    if (!leadId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); onStep?.(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); onStep?.(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leadId, onClose, onStep]);

  const cite = useCallback((id: string) => {
    setHi(id);
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-source="${id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHi(h => (h === id ? null : h)), 1800);
  }, []);

  async function patch(body: Record<string, unknown>) {
    if (!lead || readOnly) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/network/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { if (b?.needsReason) setAskReason('NOT_A_FIT'); else setError(b?.error ?? 'Could not save'); return; }
      const fresh = await fetch(`/api/network/leads/${lead.id}`).then(r => r.json()); if (!fresh.error) setLead(fresh); onChanged?.(); setNote('');
    } finally { setSaving(false); }
  }

  if (!leadId) return null;
  const x = lead?.explanation ?? null;
  const hue = hueFor(lead?.insight_type);

  return (
    <aside className="ni-peek" role="dialog" aria-modal="false" aria-label={lead ? `${lead.target?.name ?? 'Lead'} details` : 'Lead details'}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 10px 18px', borderBottom: '1px solid var(--border-hairline)', flex: 'none' }}>
        <span className="fd-mono" style={{ fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Lead{position ? ` ${position.index + 1} of ${position.total}` : ''}</span>
        <span style={{ flex: 1 }} />
        <span data-ni-hide-sm style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginRight: 6 }}><span className="ni-kbd">↑</span><span className="ni-kbd">↓</span><span className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 10.5 }}>move</span><span className="ni-kbd" style={{ marginLeft: 6 }}>esc</span></span>
        <button type="button" className="ni-ghost" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }} aria-label="Previous lead" onClick={() => onStep?.(-1)}><ChevronUp style={{ width: 14, height: 14 }} /></button>
        <button type="button" className="ni-ghost" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }} aria-label="Next lead" onClick={() => onStep?.(1)}><ChevronDown style={{ width: 14, height: 14 }} /></button>
        <button type="button" className="ni-ghost" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center', marginLeft: 4 }} aria-label="Close" onClick={onClose}><X style={{ width: 14, height: 14 }} /></button>
      </div>

      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 40px' }}>
        {error && <p className="fd-caption" style={{ color: 'var(--critical)' }}>{error}</p>}
        {(loading || !lead) && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton h={12} w={120} /><Skeleton h={30} w="70%" /><Skeleton h={72} w={260} /><Skeleton h={14} /><Skeleton h={14} w="90%" /><Skeleton h={14} w="60%" />
          </div>
        )}
        {lead && !loading && (
          <div className="ni-rise" key={lead.id}>
            {/* identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <TypeChip type={lead.insight_type} />
              {lead.target?.type && <span className="fd-mono" style={{ fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{typeLabel(lead.target.type)}</span>}
              {lead.target?.city && <span className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>· {[lead.target.city, lead.target.state].filter(Boolean).join(', ')}</span>}
            </div>
            <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.5rem,2.4vw,1.9rem)', lineHeight: 1.1, letterSpacing: '-.015em', margin: '0 0 14px', textWrap: 'balance' as never }}>{lead.target?.name ?? lead.trustee?.name ?? 'Lead'}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
              <ScoreRing score={lead.score} subtotals={lead.subtotals} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 'auto', alignItems: 'flex-end' }}>
                <ConfChip confidence={lead.confidence} />
                <StatusChip status={lead.pipeline_status} />
              </div>
            </div>

            {/* rail */}
            <div className="ni-card" style={{ padding: '12px 14px', marginBottom: 6, background: 'var(--bg-page)' }}>
              <Eyebrow style={{ display: 'block', marginBottom: 10 }}>{lead.insight_type === 'Untapped Funder' ? 'White space' : 'Introduction path'}</Eyebrow>
              <PathRail path={lead.path} confidence={lead.confidence} onNode={n => n.id && onOpenMap?.({ kind: n.kind, id: n.id })} />
            </div>

            {/* why */}
            <SectionRule label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles style={{ width: 12, height: 12, color: hue.color }} />Why Fundir recommends this</span>} right={x ? <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', letterSpacing: '.05em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 5 }}><ShieldCheck style={{ width: 11, height: 11, color: 'var(--accent)' }} />{x.validation.bullets_kept} of {x.validation.bullets_total} claims verified</span> : null} />
            {x ? (
              <>
                <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.05rem,1.6vw,1.22rem)', lineHeight: 1.4, letterSpacing: '-.01em', margin: '0 0 16px', color: 'var(--text-primary)' }}><Cited text={x.thesis} onCite={cite} hi={hi} /></p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {x.sections.map((s, si) => (
                    <div key={s.heading} className="ni-rise" style={{ animationDelay: `${si * 40}ms` }}>
                      <Eyebrow color={s.heading === 'Risks and unknowns' ? 'var(--warning)' : 'var(--text-secondary)'} style={{ display: 'block', marginBottom: 6 }}>{s.heading}</Eyebrow>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {s.bullets.map((b, i) => (
                          <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)' }}>
                            <span aria-hidden style={{ flex: 'none', width: 5, height: 5, borderRadius: 3, background: s.heading === 'Risks and unknowns' ? 'var(--warning)' : hue.color, transform: 'translateY(-3px)' }} />
                            <span style={{ minWidth: 0 }}>{b.text}{b.evidence.map(id => <button key={id} type="button" className="ni-cite" data-on={hi === id} onClick={() => cite(id)} aria-label={`Show evidence ${id}`}>{id}</button>)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {/* action */}
                <div style={{ marginTop: 18, border: `1px solid ${hue.border}`, background: hue.tint, borderRadius: 12, padding: '12px 14px' }}>
                  <Eyebrow color={hue.color} style={{ display: 'block', marginBottom: 6 }}>Recommended action</Eyebrow>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>{x.recommended_action.text}{x.recommended_action.evidence.map(id => <button key={id} type="button" className="ni-cite" data-on={hi === id} onClick={() => cite(id)}>{id}</button>)}</p>
                </div>
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '10px 0 0', fontSize: 11.5 }}>
                  Confidence {x.confidence}: {x.confidence_note} {x.method === 'model' ? `Drafted by ${x.model}, every claim checked against the evidence; unsupported claims were dropped.` : 'Composed directly from the evidence, no model involved.'}
                </p>
              </>
            ) : (
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{lead.thesis || 'No explanation generated yet.'}</p>
            )}

            {/* workflow */}
            <SectionRule label="Workflow" right={<StatusChip status={lead.pipeline_status} />} />
            <Workflow lead={lead} team={team} readOnly={readOnly} saving={saving} note={note} setNote={setNote} onPatch={patch} onAskReason={to => setAskReason(to)} />
            {askReason && <ReasonDialog lead={lead} onCancel={() => setAskReason(null)} onPick={r => { const to = askReason; setAskReason(null); patch({ pipeline_status: to, dismissal_reason: r }); }} />}

            {/* map */}
            {graph && graph.nodes.length > 1 && (
              <>
                <SectionRule label="Around this organization" right={lead.target && <button type="button" className="ni-ghost" style={{ height: 24, fontSize: 11, padding: '0 8px' }} onClick={() => onOpenMap?.({ kind: 'org', id: lead.target!.id })}><MapIcon style={{ width: 11, height: 11 }} />Open in map</button>} />
                <div className="ni-card" style={{ overflow: 'hidden', borderRadius: 12 }}>
                  <GraphCanvas data={graph} height={220} compact onActivate={n => n.rowId && onOpenMap?.({ kind: n.kind, id: n.rowId })} />
                </div>
              </>
            )}

            {/* related insights */}
            {lead.insights.length > 0 && (
              <>
                <SectionRule label="Patterns this sits in" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lead.insights.map(i => { const h = hueFor(i.insight_type); return (
                    <div key={i.id} style={{ borderLeft: `2px solid ${h.color}`, padding: '2px 0 2px 10px' }}>
                      <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>{i.title}</b>
                      {i.summary && <span className="fd-caption" style={{ display: 'block', color: 'var(--text-secondary)', marginTop: 2 }}>{i.summary}</span>}
                    </div>
                  ); })}
                </div>
              </>
            )}

            {/* sources */}
            {x && (
              <>
                <SectionRule label="Sources" right={<span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{x.sources.length} items · {new Set(x.sources.map(s => s.source_type).filter(Boolean)).size} source types</span>} />
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {x.sources.map(s => (
                    <li key={s.id} data-source={s.id} className="ni-source" data-hi={hi === s.id} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 8, alignItems: 'start' }}>
                      <span className="fd-mono" style={{ fontSize: 10, color: hi === s.id ? 'var(--accent)' : 'var(--text-tertiary)', paddingTop: 2 }}>{s.id}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>{s.text}</span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                          <span className="fd-mono" style={{ fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', color: s.verification === 'inferred' ? 'var(--warning)' : 'var(--text-tertiary)' }}>{s.verification ?? s.kind}{s.source_type ? ` · ${SOURCE_LABEL[s.source_type] ?? s.source_type}` : ''}</span>
                          {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="fd-mono" style={{ fontSize: 9.5, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>open<ExternalLink style={{ width: 9, height: 9 }} /></a>}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/** Stage stepper, owner, next action with a date, outcome, notes, and the full history. */
function Workflow({ lead, team, readOnly, saving, note, setNote, onPatch, onAskReason }: { lead: LeadDetail; team: TeamMember[]; readOnly?: boolean; saving: boolean; note: string; setNote: (s: string) => void; onPatch: (b: Record<string, unknown>) => Promise<void>; onAskReason: (to: PipelineState) => void }) {
  const [na, setNa] = useState(lead.next_action ?? '');
  const [naDate, setNaDate] = useState(lead.next_action_date ?? '');
  const [outcome, setOutcome] = useState(lead.outcome ?? '');
  // Re-seed the inputs when the lead (or its saved values) change — derived state, set during render.
  const key = `${lead.id}|${lead.next_action ?? ''}|${lead.next_action_date ?? ''}|${lead.outcome ?? ''}`;
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) { setSeenKey(key); setNa(lead.next_action ?? ''); setNaDate(lead.next_action_date ?? ''); setOutcome(lead.outcome ?? ''); }
  const stageIdx = BOARD_COLUMNS.findIndex(c => c.id === lead.pipeline_status);
  const closed = !OPEN_STATES.includes(lead.pipeline_status);
  const days = daysUntil(lead.next_action_date);
  const dueTone = days === null ? 'var(--text-tertiary)' : days < 0 ? 'var(--critical)' : days <= 7 ? AMBER : 'var(--text-secondary)';
  const go = (to: PipelineState) => { if (to === 'NOT_A_FIT') onAskReason(to); else onPatch({ pipeline_status: to, ...(to === 'WON' || to === 'LOST' ? { outcome } : {}) }); };
  const ownerName = lead.owner ? team.find(t => t.email === lead.owner)?.name ?? lead.owner.split('@')[0] : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 2 }} role="group" aria-label="Stage">
        {BOARD_COLUMNS.map((c, i) => {
          const done = i < stageIdx, on = i === stageIdx;
          return (
            <button key={c.id} type="button" disabled={readOnly || saving} onClick={() => go(c.id)} title={c.hint} style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: '2px 2px', font: 'inherit', cursor: readOnly ? 'default' : 'pointer', color: on ? 'var(--text-primary)' : done ? 'var(--accent)' : 'var(--text-tertiary)', minWidth: 62 }}>
              <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <span style={{ flex: 1, height: 1.5, background: i === 0 ? 'transparent' : done || on ? 'var(--accent)' : 'var(--border-hairline)' }} />
                <span style={{ width: on ? 12 : 8, height: on ? 12 : 8, borderRadius: 6, background: done ? 'var(--accent)' : on ? 'var(--bg-surface)' : 'var(--border-strong)', boxShadow: on ? '0 0 0 2px var(--accent)' : undefined, transition: 'all .2s' }} />
                <span style={{ flex: 1, height: 1.5, background: i === BOARD_COLUMNS.length - 1 ? 'transparent' : done ? 'var(--accent)' : 'var(--border-hairline)' }} />
              </span>
              <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: 'center', fontWeight: on ? 500 : 400, whiteSpace: 'nowrap' }}>{c.label}</span>
            </button>
          );
        })}
      </div>
      {closed && <p className="fd-caption" style={{ margin: 0, color: 'var(--text-secondary)' }}>Closed as <b style={{ fontWeight: 500 }}>{STATUS_LABEL[lead.pipeline_status]}</b>{lead.dismissal_reason ? ` — ${dismissalLabel(lead.dismissal_reason).toLowerCase()}` : ''}{lead.outcome ? ` · ${lead.outcome}` : ''}. <button type="button" onClick={() => go('RESEARCHING')} disabled={readOnly || saving} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>Reopen</button></p>}
      {/* owner + close actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 10, flex: 'none' }}>Owner</span>
          <select className="ni-select" style={{ flex: 1, minWidth: 0 }} value={lead.owner ?? ''} disabled={readOnly || saving} onChange={e => onPatch({ owner: e.target.value })} aria-label="Owner">
            <option value="">Unassigned</option>
            {team.map(t => <option key={t.id} value={t.email ?? t.id}>{t.name}</option>)}
            {lead.owner && !team.some(t => t.email === lead.owner) && <option value={lead.owner}>{lead.owner}</option>}
          </select>
          {ownerName && <span aria-hidden style={{ width: 22, height: 22, borderRadius: 11, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontFamily: MONO, fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{initialsOf(ownerName)}</span>}
        </label>
        {!closed && (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button type="button" className="ni-ghost" style={{ height: 28, fontSize: 11.5 }} disabled={readOnly || saving} onClick={() => go('DEFERRED')}>Defer</button>
            <button type="button" className="ni-ghost" style={{ height: 28, fontSize: 11.5 }} disabled={readOnly || saving} onClick={() => onAskReason('NOT_A_FIT')}>Not a fit</button>
            {lead.pipeline_status === 'AWAITING_DECISION' && <><button type="button" className="ni-primary" style={{ height: 28, fontSize: 11.5 }} disabled={readOnly || saving} onClick={() => go('WON')}>Won</button><button type="button" className="ni-ghost" style={{ height: 28, fontSize: 11.5 }} disabled={readOnly || saving} onClick={() => go('LOST')}>Lost</button></>}
          </span>
        )}
      </div>
      {/* next action */}
      {!closed && (
        <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg-page)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>Next action</span>
            {lead.next_action && days !== null && <span className="fd-mono" style={{ fontSize: 10, color: dueTone, marginLeft: 'auto' }}>{days < 0 ? `${-days} day${-days === 1 ? '' : 's'} overdue` : days === 0 ? 'due today' : `in ${days} day${days === 1 ? '' : 's'}`}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="ni-input" style={{ paddingLeft: 10, height: 28, flex: '1 1 180px', fontSize: 12 }} placeholder={lead.action ? lead.action.slice(0, 80) : 'What happens next?'} value={na} onChange={e => setNa(e.target.value)} disabled={readOnly || saving} aria-label="Next action" />
            <input type="date" className="ni-input" style={{ paddingLeft: 8, height: 28, width: 136, fontSize: 12, flex: 'none' }} value={naDate} onChange={e => setNaDate(e.target.value)} disabled={readOnly || saving} aria-label="Due date" />
            <button type="button" className="ni-ghost" style={{ height: 28 }} disabled={readOnly || saving || (na === (lead.next_action ?? '') && naDate === (lead.next_action_date ?? ''))} onClick={() => onPatch({ next_action: na, next_action_date: naDate })}>Set</button>
            {lead.next_action && <button type="button" className="ni-primary" style={{ height: 28 }} disabled={readOnly || saving} onClick={() => onPatch({ complete_next_action: true })} title="Mark done"><Check style={{ width: 12, height: 12 }} />Done</button>}
          </div>
          {!lead.next_action && lead.action && !na && <button type="button" onClick={() => setNa(lead.action!.slice(0, 200))} style={{ border: 'none', background: 'none', padding: 0, marginTop: 6, font: 'inherit', fontSize: 11.5, color: 'var(--accent)', cursor: 'pointer' }}>Use Fundir&rsquo;s recommended action</button>}
        </div>
      )}
      {(lead.pipeline_status === 'AWAITING_DECISION' || closed) && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 10, flex: 'none' }}>Outcome</span>
          <input className="ni-input" style={{ paddingLeft: 10, height: 28, fontSize: 12 }} placeholder="e.g. $50,000 general operating, FY27" value={outcome} onChange={e => setOutcome(e.target.value)} onBlur={() => outcome !== (lead.outcome ?? '') && onPatch({ outcome })} disabled={readOnly || saving} aria-label="Outcome" />
        </label>
      )}
      {/* notes */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="ni-input" style={{ paddingLeft: 10, height: 28, flex: 1, fontSize: 12 }} placeholder="Add a note…" value={note} onChange={e => setNote(e.target.value)} disabled={readOnly || saving} onKeyDown={e => { if (e.key === 'Enter' && note.trim()) onPatch({ notes: note.trim() }); }} aria-label="Note" />
        <button type="button" className="ni-ghost" style={{ height: 28 }} disabled={readOnly || saving || !note.trim()} onClick={() => onPatch({ notes: note.trim() })}>Save note</button>
      </div>
      {lead.actions.length > 0 && (
        <ol style={{ margin: '2px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {lead.actions.map(a => (
            <li key={a.id} className="fd-caption" style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 8, color: 'var(--text-tertiary)', fontSize: 11.5, alignItems: 'baseline' }}>
              <span className="fd-mono" style={{ fontSize: 10 }}>{fmtDate(a.created_at)}</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {a.action === 'status_change' ? `Moved to ${STATUS_LABEL[a.status as PipelineState] ?? a.status}` : a.action === 'dismiss' ? `Closed: not a fit` : a.action === 'outcome' ? `Outcome: ${STATUS_LABEL[a.status as PipelineState] ?? ''}` : a.action === 'assign' ? `Assigned to ${a.notes ?? 'someone'}` : a.action === 'next_action' ? 'Next action set' : a.action === 'note' ? '' : a.action}
                {a.notes && a.action !== 'assign' ? `${a.action === 'note' ? '' : ' — '}${a.notes}` : ''}
                {a.actor ? <span style={{ color: 'var(--text-tertiary)' }}> · {a.actor.split('@')[0]}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Thesis text with [E3] tokens turned into live citation chips. */
function Cited({ text, onCite, hi }: { text: string; onCite: (id: string) => void; hi: string | null }) {
  const parts = useMemo(() => text.split(/(\[\s*E\d+(?:\s*,\s*E\d+)*\s*\])/g), [text]);
  return <>{parts.map((p, i) => { const ids = p.match(/^\[/) ? p.match(/E\d+/g) ?? [] : null; return ids ? ids.map(id => <button key={`${i}-${id}`} type="button" className="ni-cite" data-on={hi === id} onClick={() => onCite(id)} style={{ fontFamily: MONO }}>{id}</button>) : <span key={i}>{p}</span>; })}</>;
}

export type { Explanation };
