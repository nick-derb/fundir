'use client';

// The rail: a warm path drawn as the chain it is — CYC → the board member →
// the room they shared → the trustee → the funder. Every hop is a real node
// with an id; the connector between hops carries the evidence grade.

import type { PathNode } from '@/lib/network/queries';
import { Avatar, OrgMark, MONO, SLATE, AMBER } from './shared';

export function PathRail({ path, confidence, compact, onNode }: { path: PathNode[]; confidence?: string | null; compact?: boolean; onNode?: (n: PathNode) => void }) {
  if (!path.length) return null;
  const tone = confidence === 'High' ? 'var(--accent)' : confidence === 'Medium' ? SLATE : AMBER;
  const dash = confidence === 'High' ? 'solid' : confidence === 'Medium' ? 'dashed' : 'dotted';
  const size = compact ? 22 : 32;
  return (
    <div style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: 0, minWidth: 0, overflowX: 'auto', paddingBottom: compact ? 0 : 2 }} aria-label="Introduction path">
      {path.map((n, i) => {
        const clickable = !!onNode && !!n.id;
        return (
          <div key={`${n.kind}-${n.id ?? n.label}-${i}`} style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', minWidth: 0, flex: i === path.length - 1 ? '0 1 auto' : '0 0 auto' }}>
            <button type="button" onClick={clickable ? () => onNode!(n) : undefined} disabled={!clickable} title={n.label} style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'flex-start', gap: compact ? 6 : 6, border: 'none', background: 'none', padding: 0, cursor: clickable ? 'pointer' : 'default', color: 'inherit', textAlign: 'left', minWidth: 0, maxWidth: compact ? 170 : 140 }}>
              {n.kind === 'person' ? <Avatar name={n.label} size={size} own={n.own} /> : <OrgMark name={n.label} size={size} accent={n.own || i === path.length - 1} />}
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: compact ? 11.5 : 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-.005em' }}>{n.label}</b>
                {!compact && n.sub && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{n.sub}</span>}
              </span>
            </button>
            {i < path.length - 1 && (
              <span aria-hidden style={{ display: 'flex', alignItems: 'center', height: size, padding: `0 ${compact ? 8 : 12}px`, flex: 'none' }}>
                <span style={{ width: compact ? 18 : 28, borderTop: `1.5px ${dash} ${tone}`, opacity: .9 }} />
                <span style={{ width: 0, height: 0, borderTop: '3.5px solid transparent', borderBottom: '3.5px solid transparent', borderLeft: `5px solid ${tone}`, marginLeft: -1 }} />
              </span>
            )}
          </div>
        );
      })}
      {!compact && confidence && (
        <span className="fd-mono" style={{ alignSelf: 'center', marginLeft: 14, fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', color: tone, whiteSpace: 'nowrap', fontFamily: MONO }}>{confidence === 'High' ? 'documented' : confidence === 'Medium' ? 'documented, gaps' : 'inferred'}</span>
      )}
    </div>
  );
}
