export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { getPeerNetwork } from '@/lib/network/peer-network';
import { peerStaffStatus } from '@/lib/network/peer-staff';
import { PeerNetworkView } from '@/components/peers/peer-network-view';

// Peer Network — the development and executive staff at CYC's peer
// organizations, kept apart from CYC's own contacts (Connections). Every
// person carries the reasons they might matter to CYC and a suggested move.
export default async function PeersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const db = createServerClient();
  const [network, status] = await Promise.all([getPeerNetwork(db, ctx.orgId), peerStaffStatus(ctx.orgId)]);
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <PeerNetworkView peers={network.peers} people={network.people} status={status} isAdmin={ctx.isAdmin && !ctx.impersonating} />
    </AppShell>
  );
}
