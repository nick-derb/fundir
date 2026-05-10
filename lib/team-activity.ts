'use client';

// Fire-and-forget activity logger. Import in any client component.
// Does not block the user interaction — errors are silently discarded.
export function logActivity(params: {
  action: string;
  entityType?: string;
  entityId?: string;
  entityTitle?: string;
  metadata?: Record<string, unknown>;
}) {
  fetch('/api/team/activity', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  }).catch(() => {});
}
