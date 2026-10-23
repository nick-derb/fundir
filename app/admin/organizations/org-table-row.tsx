'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Copy, Check } from 'lucide-react';
import { Pill, MONO } from '@/components/admin/ui';

interface Org {
  id: string; org_code: string; name: string; ein: string | null; city: string | null; state: string | null;
  fiscal_year_start: string | null; fiscal_year_end: string | null; created_at: string | null; userCount: number;
}

const BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
  fontSize: 11, fontWeight: 500, color: '#94a3b8', cursor: 'pointer',
};

export function OrgTableRow({ org, fiscalLabel, timeAgo }: { org: Org; fiscalLabel: string; timeAgo: string }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setDeleting(false); setConfirming(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(org.org_code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  return (
    <tr className="adm-row" onMouseLeave={() => setConfirming(false)}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, flexShrink: 0, background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#0d9488' }}>
            {(org.name ?? '?').slice(0, 2).toUpperCase()}
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name}</span>
        </div>
      </td>
      <td style={{ ...MONO, fontSize: 12, color: '#94a3b8' }}>{org.ein ?? '—'}</td>
      <td style={{ fontSize: 12, color: '#94a3b8' }}>{org.city && org.state ? `${org.city}, ${org.state}` : '—'}</td>
      <td><Pill tone="neutral">{org.org_code}</Pill></td>
      <td style={{ fontWeight: 600, color: org.userCount ? '#e2e8f0' : '#475569' }}>{org.userCount}</td>
      <td style={{ fontSize: 12, color: '#94a3b8' }}>{fiscalLabel}</td>
      <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{timeAgo}</td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={copy} style={BTN} title="Copy org code">{copied ? <Check size={10} /> : <Copy size={10} />}{copied ? 'Copied' : 'Copy code'}</button>
          <button type="button" onClick={handleDelete} disabled={deleting} style={{ ...BTN, background: confirming ? 'rgba(220,38,38,0.15)' : BTN.background, border: `1px solid ${confirming ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.1)'}`, color: confirming ? '#ef4444' : '#94a3b8', fontWeight: confirming ? 700 : 500, cursor: deleting ? 'wait' : 'pointer' }}>
            <Trash2 size={10} />{deleting ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}
