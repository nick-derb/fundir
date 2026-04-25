import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-500';
}

export function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 40) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

export function getDeadlineColor(days: number | null): string {
  if (days === null) return 'text-gray-500';
  if (days < 0) return 'text-gray-400';
  if (days < 14) return 'text-red-600 font-semibold';
  if (days < 30) return 'text-amber-600';
  return 'text-gray-600';
}

export function getRiskColor(risk: string): string {
  switch (risk) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-300';
    case 'elevated': return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'low': return 'bg-green-100 text-green-800 border-green-300';
    default: return 'bg-gray-100 text-gray-800';
  }
}
