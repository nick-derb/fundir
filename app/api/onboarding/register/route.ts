import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface LocationItem {
  state: string;
  county: string | null;
}

interface RegisterBody {
  inviteCode: string;
  email: string;
  password: string;
  orgName: string;
  ein: string;
  city: string;
  state: string;
  locations: LocationItem[];
  fiscalYearStart: string;
  fiscalYearEnd: string;
}

function generateOrgCode(orgName: string): string {
  const year = new Date().getFullYear();
  const prefix = orgName
    .replace(/[^a-zA-Z\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');
  return `${prefix}${year}`;
}

function formatEin(ein: string): string {
  const digits = ein.replace(/\D/g, '');
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return ein;
}

export async function POST(req: NextRequest) {
  let body: RegisterBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { inviteCode, email, password, orgName, ein, city, state, locations, fiscalYearStart, fiscalYearEnd } = body;
  const normalizedCode = (inviteCode ?? '').trim().toUpperCase();
  const supabase = createServerClient();

  // ── 1. Validate invite code ────────────────────────────────────────────────
  // Check env-var codes first (always valid, no use-limit)
  const envCodes = (process.env.FUNDIR_INVITE_CODES ?? '')
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

  let dbCodeId: string | null = null;
  let dbUsesCount = 0;

  if (envCodes.includes(normalizedCode)) {
    // Env-var code — always valid
  } else {
    // Check the invite_codes DB table
    const { data: dbCode, error: codeErr } = await supabase
      .from('invite_codes')
      .select('id, active, uses_count, max_uses, expires_at')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (codeErr || !dbCode) {
      return NextResponse.json(
        { error: 'Invalid invite code. Please check your invite and try again.' },
        { status: 403 },
      );
    }
    if (!dbCode.active) {
      return NextResponse.json({ error: 'This invite code has been deactivated.' }, { status: 403 });
    }
    if (dbCode.uses_count >= dbCode.max_uses) {
      return NextResponse.json({ error: 'This invite code has reached its usage limit.' }, { status: 403 });
    }
    if (dbCode.expires_at && new Date(dbCode.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite code has expired.' }, { status: 403 });
    }

    dbCodeId = dbCode.id;
    dbUsesCount = dbCode.uses_count;
  }

  // ── 2. Basic validation ────────────────────────────────────────────────────
  if (!email || !password || !orgName) {
    return NextResponse.json(
      { error: 'Email, password, and organization name are required.' },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  // ── 3. Create auth user ────────────────────────────────────────────────────
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    const msg = authError?.message ?? 'Failed to create account.';
    const status = msg.toLowerCase().includes('already') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  const userId = authData.user.id;

  // ── 4. Generate unique org code ────────────────────────────────────────────
  let orgCode = generateOrgCode(orgName);
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('org_code', orgCode)
    .maybeSingle();

  if (existing) {
    orgCode = `${orgCode.slice(0, 3)}${Math.floor(100 + Math.random() * 900)}`;
  }

  // ── 5. Create organization record ──────────────────────────────────────────
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      org_code: orgCode,
      name: orgName,
      ein: formatEin(ein),
      city: city ?? '',
      state: state ?? '',
      locations: locations ?? [],
      fiscal_year_start: fiscalYearStart ?? '01-01',
      fiscal_year_end: fiscalYearEnd ?? '12-31',
    })
    .select('id, org_code')
    .single();

  if (orgError || !org) {
    await supabase.auth.admin.deleteUser(userId);
    console.error('[onboarding/register] org insert error:', orgError);
    return NextResponse.json({ error: 'Failed to create organization. Please try again.' }, { status: 500 });
  }

  // ── 6. Link user to org ────────────────────────────────────────────────────
  const { error: uoError } = await supabase
    .from('user_organizations')
    .insert({ user_id: userId, org_id: org.id, role: 'admin' });

  if (uoError) {
    console.error('[onboarding/register] user_organizations insert error:', uoError);
  }

  // ── 7. Increment DB code usage ─────────────────────────────────────────────
  if (dbCodeId !== null) {
    await supabase
      .from('invite_codes')
      .update({ uses_count: dbUsesCount + 1 })
      .eq('id', dbCodeId);
  }

  return NextResponse.json({ success: true, orgCode: org.org_code });
}
