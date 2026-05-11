'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Trash2 } from 'lucide-react';

interface Org {
  id: string;
  org_code: string;
  name: string;
  ein: string | null;
  city: string | null;
  state: string | null;
  fiscal_year_start: string | null;
  fiscal_year_end: string | null;
  created_at: string | null;
}

interface OrgTableRowProps {
  org: Org;
  isFirst: boolean;
  fiscalLabel: string;
  timeAgo: string;
}

export function OrgTableRow({ org, isFirst, fiscalLabel, timeAgo }: OrgTableRowProps) {
  const [hovering, setHovering] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    setDeleting(true);
    try {
      await fetch(`/api/admin/organizations/${org.id}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <tr
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setConfirming(false); }}
      style={{
        borderTop: isFirst ? 'none' : '1px solid rgba(255,255,255,0.04)',
        background: hovering ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Organization name */}
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', flexShrink: 0,
            background: 'rgba(13,148,136,0.1)',
            border: '1px solid rgba(13,148,136,0.2)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0d9488' }}>
              {(org.name ?? '?').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org.name}
          </p>
        </div>
      </td>

      {/* EIN */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace', color: '#64748b' }}>
          {org.ein ?? '—'}
        </span>
      </td>

      {/* Location */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {org.city && org.state ? `${org.city}, ${org.state}` : '—'}
        </span>
      </td>

      {/* Org code */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '3px 9px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '5px',
          fontSize: '11px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#94a3b8',
        }}>
          {org.org_code}
        </span>
      </td>

      {/* Fiscal year */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{fiscalLabel}</span>
      </td>

      {/* Joined */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: '12px', color: '#475569' }}>{timeAgo}</span>
      </td>

      {/* Actions */}
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => navigator.clipboard.writeText(org.org_code)}
            style={{
              padding: '5px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              fontSize: '11px', fontWeight: 500, color: '#64748b',
              cursor: 'pointer',
            }}
          >
            Copy
          </button>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '5px 10px',
              background: 'rgba(13,148,136,0.08)',
              border: '1px solid rgba(13,148,136,0.2)',
              borderRadius: '6px',
              fontSize: '11px', fontWeight: 600, color: '#0d9488',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={10} />
            View
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '5px 10px',
              background: confirming ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${confirming ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '6px',
              fontSize: '11px', fontWeight: confirming ? 700 : 500,
              color: confirming ? '#ef4444' : '#64748b',
              cursor: deleting ? 'wait' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Trash2 size={10} />
            {deleting ? 'Deleting…' : confirming ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}
