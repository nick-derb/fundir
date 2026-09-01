import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ConnectionsView, type CnPerson, type CnKpis } from '@/components/connections/connections-view';

export const dynamic = 'force-dynamic';

const norm = (v: string | null | undefined) =>
  (v ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|foundation|inc|incorporated|trust|fund|funds|philanthropies|family|charitable|company|co|llc)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();

const isWarm = (v: string | null | undefined) => {
  const s = (v ?? '').trim().toLowerCase();
  return s !== '' && !['unknown', 'no', 'none', 'not started'].includes(s);
};
const isAwaiting = (v: string | null | undefined) => {
  const s = (v ?? '').trim().toLowerCase();
  return s === '' || s === 'not started';
};
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—';
function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || !n) return '';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + n;
}

export default async function ConnectionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const db = createServerClient();
  const org = ctx.orgId;

  const [boardRes, cultRes, subRes] = await Promise.all([
    db.from('funder_board_members').select('foundation_name, member_name, title, connection_to_cyc, connection_type, who_knows_them, outreach_status').eq('org_id', org).order('foundation_name'),
    db.from('cyc_cultivation').select('foundation_name, funder_type, total_assets, funding_focus, notes').eq('org_id', org),
    db.from('cyc_grant_submissions').select('funder_name, outcome, amount_awarded, status').eq('org_id', org),
  ]);

  // Foundation facts keyed by normalized name.
  const cultMap = new Map<string, { funderType: string; assets: string; focus: string; notes: string }>();
  for (const c of cultRes.data ?? []) {
    cultMap.set(norm(c.foundation_name), {
      funderType: c.funder_type ?? '', assets: money(c.total_assets), focus: c.funding_focus ?? '', notes: c.notes ?? '',
    });
  }
  // CYC's funding relationship per funder (from real Instrumentl history).
  const fundMap = new Map<string, { awarded: number; applied: number; amount: number }>();
  for (const s of subRes.data ?? []) {
    const k = norm(s.funder_name);
    if (!k) continue;
    const f = fundMap.get(k) ?? { awarded: 0, applied: 0, amount: 0 };
    if (s.outcome === 'awarded') { f.awarded++; f.amount += Number(s.amount_awarded) || 0; }
    else f.applied++;
    fundMap.set(k, f);
  }

  const board = boardRes.data ?? [];
  const people: CnPerson[] = board.map((b, i) => {
    const key = norm(b.foundation_name);
    const cult = cultMap.get(key);
    const fund = fundMap.get(key);
    return {
      id: String(i),
      name: b.member_name || '—',
      initials: initialsOf(b.member_name || ''),
      foundation: b.foundation_name || '—',
      title: b.title || '',
      connectionToCyc: b.connection_to_cyc || '',
      connectionType: b.connection_type || '',
      whoKnows: b.who_knows_them || '',
      outreachStatus: b.outreach_status || '',
      warm: isWarm(b.connection_to_cyc),
      awaiting: isAwaiting(b.outreach_status),
      funderType: cult?.funderType || '',
      assets: cult?.assets || '',
      fundingFocus: cult?.focus || '',
      notes: cult?.notes || '',
      cycFunded: fund ? (fund.awarded > 0 ? 'awarded' : 'applied') : null,
      cycAmount: fund?.amount ? money(fund.amount) : '',
    };
  });

  const kpis: CnKpis = {
    board: people.length,
    foundations: new Set(board.map(b => norm(b.foundation_name)).filter(Boolean)).size,
    warm: people.filter(p => p.warm).length,
    awaiting: people.filter(p => p.awaiting).length,
  };

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ConnectionsView people={people} kpis={kpis} />
    </AppShell>
  );
}
