'use client';

// Two faces of the same page: the funder-side board seats CYC is pursuing, and
// CYC's own network mapped from its board's LinkedIn careers. The strip reuses
// the prospecting workbook's tab treatment (bottom accent bar, mono counts).

import { useState } from 'react';
import { ConnectionsView, type CnPerson, type CnKpis } from '@/components/connections/connections-view';
import { NetworkView, type NwState } from '@/components/connections/network-view';

export function ConnectionsTabs({
  people, kpis, network,
}: { people: CnPerson[]; kpis: CnKpis; network: NwState }) {
  const [tab, setTab] = useState<'funders' | 'network'>('funders');

  const tabs = [
    { key: 'funders' as const, label: 'Funder boards', count: people.length },
    { key: 'network' as const, label: 'CYC network', count: network.totals.leads },
  ];

  return (
    <div style={{ background: 'var(--bg-page)' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', padding: '0 26px', overflowX: 'auto' }}>
        {tabs.map(t => {
          const on = t.key === tab;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 'none', border: 'none', background: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '11px 15px', whiteSpace: 'nowrap', fontSize: 12.5,
                fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
                ...(on
                  ? { borderBottom: '2px solid var(--accent)', color: 'var(--text-primary)', fontWeight: 500 }
                  : { borderBottom: '2px solid transparent', color: 'var(--text-tertiary)' }),
              }}>
                {t.label}
                <i style={{ fontStyle: 'normal', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--text-tertiary)', opacity: on ? 1 : 0.7 }}>{t.count}</i>
              </span>
            </button>
          );
        })}
      </div>
      {tab === 'funders'
        ? <ConnectionsView people={people} kpis={kpis} />
        : <NetworkView initial={network} />}
    </div>
  );
}
