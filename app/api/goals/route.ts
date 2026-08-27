import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

// Organization-wide FY goals for the dashboard card + edit modal. Service-role
// writes keyed by the session's org. GET lists; PUT replaces the whole set.

export interface Goal {
  id?: string;
  label: string;
  current: number;
  target: number;
  unit: 'percent' | 'count' | 'currency';
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const db = createServerClient();
  const { data } = await db
    .from('org_goals')
    .select('id, label, current, target, unit')
    .eq('org_id', ctx.orgId)
    .order('sort', { ascending: true });

  return NextResponse.json({ goals: data ?? [] });
}

const UNITS = new Set(['percent', 'count', 'currency']);

export async function PUT(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { goals?: Goal[] };
  const goals = Array.isArray(body.goals) ? body.goals : [];

  const rows = goals
    .filter(g => String(g.label ?? '').trim())
    .slice(0, 24)
    .map((g, i) => ({
      org_id:  ctx.orgId,
      label:   String(g.label).trim().slice(0, 160),
      current: Number(g.current) || 0,
      target:  Number(g.target) || 0,
      unit:    UNITS.has(g.unit) ? g.unit : 'count',
      sort:    i,
      updated_at: new Date().toISOString(),
    }));

  const db = createServerClient();
  // Replace-all: the modal is authoritative for the whole set.
  const del = await db.from('org_goals').delete().eq('org_id', ctx.orgId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });
  if (rows.length) {
    const ins = await db.from('org_goals').insert(rows);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
