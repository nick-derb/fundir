import { redirect } from 'next/navigation';

// "Users" and "People" listed the same accounts. People carries everything
// Users did (org, role, joined, last sign-in) plus profile, onboarding and
// calendar status, so this route now lands there.
export default function AdminUsersPage() {
  redirect('/admin/people');
}
