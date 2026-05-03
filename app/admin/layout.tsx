import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AdminNav } from '@/components/admin-nav';

export const metadata = { title: 'Admin Console · Fundir' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase();

  // If not authenticated, send to login
  if (!session) redirect('/login?next=/admin');

  // If ADMIN_EMAIL is configured, enforce it; redirect to dashboard (not /login) to avoid loop
  if (adminEmail && session.user.email?.toLowerCase() !== adminEmail) {
    redirect('/dashboard');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#070d1a' }}>
      <AdminNav userEmail={session.user.email!} />
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}
