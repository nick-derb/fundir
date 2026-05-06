'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function switchAdminOrg(orgCode: string) {
  const cookieStore = await cookies();
  cookieStore.set('admin_org', orgCode, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  revalidatePath('/', 'layout');
}
