export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { PeerListEditor } from '@/components/peer-list-editor';
import { listPeers } from '@/actions/peers';

export default async function PeersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const { rows } = await listPeers();

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <div className="bg-canvas-0 border-b border-canvas-3">
        <div className="px-4 sm:px-6 md:px-8 py-5 max-w-4xl mx-auto">
          <Link href="/org" className="inline-flex items-center gap-1.5 text-caption text-ink-2 hover:text-ink-0 mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Organization profile
          </Link>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-sm bg-action-soft text-action flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-h1 font-semibold text-ink-0 leading-tight">Peer organizations</h1>
              <p className="text-body text-ink-1 mt-1">
                {ctx.orgName}&apos;s peer set drives funder-prospect ranking. Peer-funding overlap is
                the strongest signal we have that a funder is a credible match for you.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 py-6 max-w-4xl mx-auto">
        <PeerListEditor initialRows={rows} />
      </div>
    </AppShell>
  );
}
