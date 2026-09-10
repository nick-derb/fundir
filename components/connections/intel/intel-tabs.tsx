'use client';

// The Connections console root: seven tabs on one strip with a sliding
// indicator, the lead drawer mounted once above everything, and the URL as
// the source of truth (?tab=, ?lead=, ?focus=) so any view is linkable.

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LeadRow, InsightRow } from '@/lib/network/queries';
import { ConnectionsView, type CnPerson, type CnKpis } from '@/components/connections/connections-view';
import { NetworkView, type NwState } from '@/components/connections/network-view';
import { CSS, useConsoleFonts, MONO } from './shared';
import { DiscoverView, DEFAULT_FILTERS, applyFilters, type DiscoverFilters } from './discover-view';
import { WarmPathsView } from './warm-paths-view';
import { OrganizationsView } from './organizations-view';
import { RelationshipsView } from './relationships-view';
import { MapView, type MapFocus } from './map-view';
import { LeadDrawer } from './lead-drawer';
import { PipelineView, type TeamMember } from './pipeline-view';
import { PeopleView } from './people-view';
import { PersonPeek } from './person-peek';

type TabKey = 'discover' | 'pipeline' | 'paths' | 'people' | 'map' | 'organizations' | 'relationships' | 'network' | 'funders';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'discover', label: 'Discover' }, { key: 'pipeline', label: 'Pipeline' }, { key: 'paths', label: 'Warm paths' }, { key: 'people', label: 'People' }, { key: 'map', label: 'Map' },
  { key: 'organizations', label: 'Organizations' }, { key: 'relationships', label: 'Relationships' },
  { key: 'network', label: 'CYC network' }, { key: 'funders', label: 'Funder boards' },
];

export interface IntelProps { people: CnPerson[]; kpis: CnKpis; network: NwState; leads: LeadRow[]; insights: InsightRow[]; readOnly?: boolean }

export function IntelTabs(props: IntelProps) {
  return <Suspense fallback={<div style={{ padding: 26 }} />}><IntelInner {...props} /></Suspense>;
}

function IntelInner({ people, kpis, network, leads: initialLeads, insights: initialInsights, readOnly }: IntelProps) {
  useConsoleFonts();
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  const tab = (TABS.find(t => t.key === sp.get('tab'))?.key ?? 'discover') as TabKey;
  const leadId = sp.get('lead');
  const personId = sp.get('person');
  const focusParam = sp.get('focus');
  const focus: MapFocus | null = useMemo(() => { const m = focusParam?.match(/^(person|org):(.+)$/); return m ? { kind: m[1] as 'person' | 'org', id: m[2] } : null; }, [focusParam]);

  const [leads, setLeads] = useState(initialLeads);
  const [insights, setInsights] = useState(initialInsights);
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [team, setTeam] = useState<TeamMember[]>([]);
  useEffect(() => { fetch('/api/network/team').then(r => r.json()).then(b => setTeam(b.team ?? [])).catch(() => {}); }, []);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  }, [router, pathname, sp]);

  const reload = useCallback(async () => { try { const b = await fetch('/api/network/leads').then(r => r.json()); if (!b.error) { setLeads(b.leads); setInsights(b.insights); } } catch { /* keep */ } }, []);

  // Drawer navigation walks the list as currently filtered on Discover, or all leads elsewhere.
  const ordered = useMemo(() => (tab === 'discover' ? applyFilters(leads, filters) : tab === 'paths' ? leads.filter(l => l.via) : tab === 'pipeline' ? [...leads].sort((a, b) => a.pipeline_status.localeCompare(b.pipeline_status) || b.score - a.score) : leads), [tab, leads, filters]);
  const position = useMemo(() => { const i = ordered.findIndex(l => l.id === leadId); return i >= 0 ? { index: i, total: ordered.length } : null; }, [ordered, leadId]);
  const step = useCallback((dir: -1 | 1) => { if (!position) return; const n = ordered[position.index + dir]; if (n) setParams({ lead: n.id }); }, [ordered, position, setParams]);
  const openLead = useCallback((id: string) => setParams({ lead: id, person: null }), [setParams]);
  const openPerson = useCallback((id: string) => setParams({ person: id, lead: null }), [setParams]);
  const openMap = useCallback((f: MapFocus) => setParams({ tab: 'map', focus: `${f.kind}:${f.id}`, lead: null, person: null }), [setParams]);
  const saveUrl = useCallback(async (id: string, url: string): Promise<string | null> => {
    const res = await fetch('/api/network', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, linkedinUrl: url }) });
    const b = await res.json().catch(() => ({}));
    return res.ok ? null : (b?.error ?? 'Could not save');
  }, []);

  // Sliding indicator: measured after layout and positioned directly on the element (no render round-trip).
  const stripRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const placeIndicator = useCallback(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`), ind = indRef.current;
    if (el && ind) { ind.style.transform = `translateX(${el.offsetLeft}px)`; ind.style.width = `${el.offsetWidth}px`; ind.style.opacity = '1'; }
  }, [tab]);
  useLayoutEffect(() => { placeIndicator(); }, [placeIndicator, leads.length]);
  useEffect(() => { window.addEventListener('resize', placeIndicator); return () => window.removeEventListener('resize', placeIndicator); }, [placeIndicator]);

  const counts: Partial<Record<TabKey, number>> = { discover: leads.filter(l => !['NOT_A_FIT', 'LOST'].includes(l.pipeline_status)).length, pipeline: leads.filter(l => !['NEW', 'NOT_A_FIT', 'LOST', 'WON'].includes(l.pipeline_status)).length, paths: leads.filter(l => l.via && !['NOT_A_FIT', 'LOST'].includes(l.pipeline_status)).length, network: network.totals.leads, funders: people.length };

  return (
    <div style={{ background: 'var(--bg-page)' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={stripRef} role="tablist" aria-label="Connections views" style={{ position: 'relative', display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', padding: '0 26px', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" data-tab={t.key} aria-selected={t.key === tab} className="ni-tab" onClick={() => setParams({ tab: t.key, lead: t.key === 'discover' || t.key === 'paths' || t.key === 'pipeline' ? leadId : null, person: t.key === 'people' ? personId : null })}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 14px', whiteSpace: 'nowrap', fontSize: 12.5, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>
              {t.label}
              {counts[t.key] !== undefined && <i style={{ fontStyle: 'normal', fontFamily: MONO, fontSize: 9, color: 'var(--text-tertiary)', opacity: t.key === tab ? 1 : 0.7 }}>{counts[t.key]}</i>}
            </span>
          </button>
        ))}
        <span ref={indRef} aria-hidden className="ni-indicator" style={{ left: 0, width: 0, opacity: 0 }} />
      </div>

      {tab === 'discover' && <DiscoverView leads={leads} insights={insights} filters={filters} onFilters={setFilters} selectedId={leadId} onOpen={openLead} onInsight={i => (i.lead_id ? openLead(i.lead_id) : i.path.find(p => p.id && p.kind === 'org') ? openMap({ kind: 'org', id: i.path.find(p => p.id && p.kind === 'org')!.id! }) : undefined)} />}
      {tab === 'pipeline' && <PipelineView leads={leads} team={team} selectedId={leadId} onOpen={openLead} onChanged={reload} readOnly={readOnly} />}
      {tab === 'paths' && <WarmPathsView leads={leads} selectedId={leadId} onOpen={openLead} onPerson={id => openMap({ kind: 'person', id })} />}
      {tab === 'people' && <PeopleView selectedId={personId} onOpen={openPerson} onOpenLead={openLead} onFocus={openMap} />}
      {tab === 'map' && <MapView focus={focus} onFocus={f => setParams({ focus: f ? `${f.kind}:${f.id}` : null })} onOpenLead={openLead} />}
      {tab === 'organizations' && <OrganizationsView onOpenLead={openLead} onFocus={openMap} />}
      {tab === 'relationships' && <RelationshipsView onFocus={openMap} />}
      {tab === 'network' && <NetworkView initial={network} />}
      {tab === 'funders' && <ConnectionsView people={people} kpis={kpis} />}

      <LeadDrawer leadId={leadId} onClose={() => setParams({ lead: null })} onStep={step} onOpenMap={openMap} onChanged={reload} readOnly={readOnly} position={position} />
      <PersonPeek personId={personId} onClose={() => setParams({ person: null })} onOpenLead={openLead} onOpenMap={openMap} onSaveUrl={saveUrl} readOnly={readOnly} />
    </div>
  );
}
