'use server';

import { createServerClient } from '@/lib/supabase';
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
  const supabase = createServerClient();
  const { data } = await supabase
    .from('grant_tasks')
    .select('*')
    .eq('grant_id', grantId)
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
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('grant_tasks')
    .insert({ grant_id: grantId, title: title.trim(), priority, due_date: dueDate || null })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  revalidatePath(`/grant/${grantId}`);
  return { success: true, task: data as Task };
}

export async function toggleTask(taskId: string, completed: boolean, grantId: string): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from('grant_tasks')
    .update({ completed, updated_at: new Date().toISOString() })
    .eq('id', taskId);
  revalidatePath(`/grant/${grantId}`);
}

export async function deleteTask(taskId: string, grantId: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('grant_tasks').delete().eq('id', taskId);
  revalidatePath(`/grant/${grantId}`);
}

export async function updateTaskTitle(taskId: string, title: string, grantId: string): Promise<void> {
  if (!title.trim()) return;
  const supabase = createServerClient();
  await supabase
    .from('grant_tasks')
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq('id', taskId);
  revalidatePath(`/grant/${grantId}`);
}

// Fetch all incomplete tasks across all grants (for dashboard / tasks page)
export async function getAllPendingTasks(): Promise<(Task & { grant_title: string })[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('grant_tasks')
    .select('*, grant:grant_opportunities(title)')
    .eq('completed', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50);
  return (data || []).map((t: Record<string, unknown>) => ({
    ...(t as unknown as Task),
    grant_title: (t.grant as { title?: string })?.title || 'Unknown Grant',
  }));
}
