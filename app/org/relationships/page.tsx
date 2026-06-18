export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Landmark } from 'lucide-react';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { FunderRelationshipsEditor } from '@/components/funder-relationships-editor';
import { listRelationships } from '@/actions/funder-relationships';

export default async function FunderRelationshipsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const { rows } = await listRelationships();

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <div className="bg-canvas-0 border-b border-canvas-3">
        <div className="px-4 sm:px-6 md:px-8 py-5 max-w-4xl mx-auto">
          <Link href="/org" className="inline-flex items-center gap-1.5 text-caption text-ink-2 hover:text-ink-0 mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Organization profile
          </Link>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-sm bg-action-soft text-action flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-h1 font-semibold text-ink-0 leading-tight">Funder relationships</h1>
              <p className="text-body text-ink-1 mt-1">
                Tag the funders {ctx.orgName} already works with as Existing — they&apos;ll render
                as Deepen on the CRA panel. Prospects with peer-funding signal render as Open
                (warm). Declined are hidden. Dormant get flagged for re-engagement.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 py-6 max-w-4xl mx-auto">
        <FunderRelationshipsEditor initialRows={rows} />
      </div>
    </AppShell>
  );
}
