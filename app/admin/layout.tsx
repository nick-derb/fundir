import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AdminNav } from '@/components/admin-nav';
import { ADMIN_CSS } from '@/components/admin/ui';
import { isAdminEmail, adminEmailCount } from '@/lib/admin-emails';

export const metadata = { title: 'Admin Console · Fundir' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // If not authenticated, send to login
  if (!session) redirect('/login?next=/admin');

  // ADMIN_EMAIL accepts a comma-separated list. When at least one admin
  // is configured, enforce membership; redirect to /dashboard (not
  // /login) to avoid a loop on accidental non-admin access.
  if (adminEmailCount() > 0 && !isAdminEmail(session.user.email)) {
    redirect('/dashboard');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#070d1a', color: '#e2e8f0' }}>
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
      <AdminNav userEmail={session.user.email!} />
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}
