'use client';

// The map card as it sits on the Network page, fed specimen data.

import { useState } from 'react';
import type { GraphNode } from '@/lib/network/queries';
import { MapGraph } from '@/components/connections/intel/map-graph';
import { CSS } from '@/components/connections/intel/shared';
import { LAB_GRAPH } from '@/lib/lab-fixtures';
import { OrgShort } from '@/components/org-context';

export function LabMap() {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  return (
    <div className="ni-root" style={{ padding: '22px 24px 60px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="fd-page-head">
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}><OrgShort /> · Network</p>
          <h1>Map</h1>
          <p className="fd-lede">Your organization at the top, every warm path hanging beneath it. Hover a card to light its path; open a person&rsquo;s profile from the card.</p>
        </div>
      </div>
      <div className="fd-card" style={{ overflow: 'hidden', position: 'relative', minHeight: 560 }}>
        <MapGraph data={LAB_GRAPH} height={640} selectedId={selected?.id ?? null} onSelect={setSelected} onActivate={() => {}} onOpenLead={() => {}} onOpenPerson={() => {}} />
      </div>
    </div>
  );
}
