import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ComingSoon } from '@/components/coming-soon';

export const dynamic = 'force-dynamic';

interface BoardMember {
  foundation_name: string | null;
  member_name: string | null;
  title: string | null;
  connection_to_cyc: string | null;
  connection_type: string | null;
  who_knows_them: string | null;
  outreach_status: string | null;
}

// A connection is "warm" when someone at CYC actually has a relationship —
// i.e. connection_to_cyc is set to something other than unknown/none.
function isWarm(v: string | null): boolean {
  const s = (v ?? '').trim().toLowerCase();
  return s !== '' && s !== 'unknown' && s !== 'no' && s !== 'none' && s !== 'not started';
}

export default async function ConnectionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const db = createServerClient();
  const { data } = await db
    .from('funder_board_members')
    .select('foundation_name, member_name, title, connection_to_cyc, connection_type, who_knows_them, outreach_status')
    .eq('org_id', ctx.orgId)
    .order('foundation_name');
  const members = (data ?? []) as BoardMember[];

  const shell = (children: React.ReactNode) => (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      {children}
    </AppShell>
  );

  if (members.length === 0) {
    return shell(
      <ComingSoon title="Connections" blurb="Board and relationship network mapping. Load your board-member data to see warm paths from CYC to the funders you want to reach." />,
    );
  }

  // Group by foundation.
  const byFoundation = new Map<string, BoardMember[]>();
  for (const m of members) {
    const key = m.foundation_name ?? 'Unknown foundation';
    (byFoundation.get(key) ?? byFoundation.set(key, []).get(key)!).push(m);
  }
  const foundations = [...byFoundation.entries()].sort((a, b) => {
    const wa = a[1].some(m => isWarm(m.connection_to_cyc)) ? 1 : 0;
    const wb = b[1].some(m => isWarm(m.connection_to_cyc)) ? 1 : 0;
    return wb - wa || a[0].localeCompare(b[0]);
  });

  const warmCount = members.filter(m => isWarm(m.connection_to_cyc)).length;
  const warmFoundations = foundations.filter(([, ms]) => ms.some(m => isWarm(m.connection_to_cyc))).length;

  return shell(
    <div className="px-4 sm:px-6 md:px-8 py-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <p className="text-eyebrow uppercase text-tertiary mb-2">Network mapping</p>
        <h1 className="text-primary" style={{ fontSize: 'clamp(1.5rem,2.4vw,2rem)', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Board connections
        </h1>
        <p className="text-secondary mt-2 text-body">
          {members.length} board members across {foundations.length} funders · {warmCount} warm connection{warmCount === 1 ? '' : 's'} to CYC across {warmFoundations} funder{warmFoundations === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {foundations.map(([foundation, ms]) => {
          const warm = ms.some(m => isWarm(m.connection_to_cyc));
          return (
            <div key={foundation} className="rounded-lg border border-hairline bg-surface overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: warm ? 'var(--accent, #0C6B5A)' : 'var(--hairline, #D8DFDB)' }} />
                <span className="text-body-strong text-primary flex-1 min-w-0 truncate">{foundation}</span>
                {warm && <span className="text-eyebrow uppercase text-accent">Warm path</span>}
              </div>
              <div className="divide-y divide-hairline">
                {ms.map((m, i) => (
                  <div key={i} className="px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-body-strong text-primary">{m.member_name}</span>
                    {m.title && <span className="text-caption text-tertiary">{m.title}</span>}
                    <span className="flex-1" />
                    {isWarm(m.connection_to_cyc)
                      ? <span className="text-caption text-accent">
                          {m.connection_to_cyc}{m.who_knows_them ? ` · via ${m.who_knows_them}` : ''}
                        </span>
                      : <span className="text-caption text-tertiary">No known connection</span>}
                    {m.outreach_status && m.outreach_status.toLowerCase() !== 'not started' && (
                      <span className="text-eyebrow uppercase text-secondary">{m.outreach_status}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
  );
}
