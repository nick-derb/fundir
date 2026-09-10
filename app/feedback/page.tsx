import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { FeedbackView } from '@/components/feedback-view';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const { page } = await searchParams;
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <FeedbackView initialPage={page ? page.slice(0, 300) : null} isAdmin={ctx.isAdmin} orgName={ctx.orgName} />
    </AppShell>
  );
}
