'use server';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';

export interface Task {
  id: string;
  grant_id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  created_at: string;
}

export async function getTasks(grantId: string): Promise<Task[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];
  const supabase = createServerClient();
  const { data } = await supabase
    .from('grant_tasks')
    .select('*')
    .eq('grant_id', grantId)
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: true });
  return (data || []) as Task[];
}

export async function addTask(
  grantId: string,
  title: string,
  priority: 'high' | 'medium' | 'low' = 'medium',
  dueDate?: string,
): Promise<{ success: boolean; task?: Task; error?: string }> {
  if (!title.trim()) return { success: false, error: 'Title is required' };
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: 'Not authenticated' };
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('grant_tasks')
    .insert({
      grant_id: grantId,
      org_id:   ctx.orgId,
      title:    title.trim(),
      priority,
      due_date: dueDate || null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  revalidatePath(`/grant/${grantId}`);
  return { success: true, task: data as Task };
}

export async function toggleTask(taskId: string, completed: boolean, grantId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  const supabase = createServerClient();
  await supabase
    .from('grant_tasks')
    .update({ completed, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('org_id', ctx.orgId);
  revalidatePath(`/grant/${grantId}`);
}

export async function deleteTask(taskId: string, grantId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  const supabase = createServerClient();
  await supabase
    .from('grant_tasks')
    .delete()
    .eq('id', taskId)
    .eq('org_id', ctx.orgId);
  revalidatePath(`/grant/${grantId}`);
}

export async function updateTaskTitle(taskId: string, title: string, grantId: string): Promise<void> {
  if (!title.trim()) return;
  const ctx = await getAuthContext();
  if (!ctx) return;
  const supabase = createServerClient();
  await supabase
    .from('grant_tasks')
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('org_id', ctx.orgId);
  revalidatePath(`/grant/${grantId}`);
}

// Fetch all incomplete tasks across the authed user's org (for dashboard / tasks page)
export async function getAllPendingTasks(): Promise<(Task & { grant_title: string })[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];
  const supabase = createServerClient();
  const { data } = await supabase
    .from('grant_tasks')
    .select('*, grant:grant_opportunities(title)')
    .eq('org_id', ctx.orgId)
    .eq('completed', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50);
  return (data || []).map((t: Record<string, unknown>) => ({
    ...(t as unknown as Task),
    grant_title: (t.grant as { title?: string })?.title || 'Unknown Grant',
  }));
}
