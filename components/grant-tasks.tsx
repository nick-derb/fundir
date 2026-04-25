'use client';

import { useState, useTransition, useRef } from 'react';
import { addTask, toggleTask, deleteTask } from '@/actions/tasks';
import type { Task } from '@/actions/tasks';
import { Plus, Trash2, Circle, CheckCircle2, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';

const PRIORITY_CONFIG = {
  high:   { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'High' },
  medium: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Medium' },
  low:    { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'Low' },
};

interface GrantTasksProps {
  grantId: string;
  initialTasks: Task[];
}

export function GrantTasks({ grantId, initialTasks }: GrantTasksProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newDue, setNewDue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const pending  = tasks.filter(t => !t.completed);
  const done     = tasks.filter(t => t.completed);

  function handleToggle(task: Task) {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
    startTransition(async () => {
      await toggleTask(task.id, !task.completed, grantId);
    });
  }

  function handleDelete(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    startTransition(async () => {
      await deleteTask(taskId, grantId);
    });
  }

  function handleAdd() {
    if (!newTitle.trim()) return;
    const optimistic: Task = {
      id: `optimistic-${Date.now()}`,
      grant_id: grantId,
      title: newTitle.trim(),
      completed: false,
      due_date: newDue || null,
      priority: newPriority,
      created_at: new Date().toISOString(),
    };
    setTasks(prev => [...prev, optimistic]);
    setNewTitle('');
    setNewDue('');
    setNewPriority('medium');
    setShowAddForm(false);

    startTransition(async () => {
      const result = await addTask(grantId, optimistic.title, optimistic.priority, optimistic.due_date ?? undefined);
      if (result.success && result.task) {
        setTasks(prev => prev.map(t => t.id === optimistic.id ? result.task! : t));
      } else {
        setTasks(prev => prev.filter(t => t.id !== optimistic.id));
      }
    });
  }

  function TaskRow({ task }: { task: Task }) {
    const cfg = PRIORITY_CONFIG[task.priority];
    const isOverdue = task.due_date && !task.completed && new Date(task.due_date) < new Date();
    return (
      <div className={`flex items-start gap-3 px-4 py-3 group hover:bg-[#f8fafc] transition-colors ${task.completed ? 'opacity-60' : ''}`}>
        <button
          onClick={() => handleToggle(task)}
          className="mt-0.5 flex-shrink-0 text-[#94a3b8] hover:text-[#0d9488] transition-colors"
        >
          {task.completed
            ? <CheckCircle2 className="w-4.5 h-4.5 text-[#0d9488]" />
            : <Circle className="w-4.5 h-4.5" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-medium ${task.completed ? 'line-through text-[#94a3b8]' : 'text-[#0f172a]'}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
              {cfg.label}
            </span>
            {task.due_date && (
              <span className={`flex items-center gap-0.5 text-[10px] font-medium ${isOverdue ? 'text-red-500' : 'text-[#64748b]'}`}>
                {isOverdue && <AlertCircle className="w-3 h-3" />}
                Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => handleDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 text-[#94a3b8] hover:text-red-500 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[#0f172a]">Application Tasks</h2>
          <p className="text-[11px] text-[#64748b] mt-0.5">{pending.length} pending · {done.length} completed</p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d9488] text-white rounded-lg text-[12px] font-semibold hover:bg-[#0f766e] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add task
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f0fdfa]">
          <div className="flex gap-2 mb-2">
            <input
              ref={inputRef}
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAddForm(false); }}
              placeholder="Task description…"
              className="flex-1 px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all bg-white"
            />
            <div className="relative">
              <select
                value={newPriority}
                onChange={e => setNewPriority(e.target.value as 'high' | 'medium' | 'low')}
                className="appearance-none pl-3 pr-7 py-2 border border-[#e2e8f0] rounded-lg text-[12px] font-medium bg-white focus:outline-none focus:border-[#0d9488] transition-all cursor-pointer"
                style={{ color: PRIORITY_CONFIG[newPriority].color }}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-[#94a3b8] pointer-events-none" />
            </div>
            <input
              type="date"
              value={newDue}
              onChange={e => setNewDue(e.target.value)}
              className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] text-[#475569] bg-white focus:outline-none focus:border-[#0d9488] transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newTitle.trim() || isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d9488] text-white rounded-lg text-[12px] font-semibold hover:bg-[#0f766e] disabled:opacity-40 transition-colors">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-[12px] text-[#64748b] hover:text-[#0f172a] transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Pending tasks */}
      {pending.length === 0 && done.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="w-8 h-8 text-[#cbd5e1] mx-auto mb-3" />
          <p className="text-[13px] text-[#64748b]">No tasks yet. Add application milestones, review steps, and deadlines.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="divide-y divide-[#f8fafc]">
              {pending.map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
          {done.length > 0 && (
            <>
              <div className="px-5 py-2 border-t border-[#f1f5f9] bg-[#f8fafc]">
                <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide">Completed ({done.length})</p>
              </div>
              <div className="divide-y divide-[#f8fafc]">
                {done.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
