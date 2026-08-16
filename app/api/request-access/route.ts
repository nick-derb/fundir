import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 20;

// Where access requests are delivered. Overridable via env; defaults to Nick.
const TO   = process.env.REQUEST_ACCESS_TO   || 'nickderbis@gmail.com';
// Resend requires a verified sender domain for production. Until fundir.ai is
// verified in Resend, `onboarding@resend.dev` works for delivery to the Resend
// account owner's own address (nickderbis@gmail.com).
const FROM = process.env.REQUEST_ACCESS_FROM || 'Fundir <onboarding@resend.dev>';

const clean = (v: unknown, max: number) => (v == null ? '' : String(v)).trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function POST(req: NextRequest) {
  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const first = clean(raw.first, 120);
  const last  = clean(raw.last, 120);
  const email = clean(raw.email, 200);
  const org   = clean(raw.org, 200);
  const role  = clean(raw.role, 160);
  const size  = clean(raw.size, 40);
  const notes = clean(raw.notes, 2000);

  if (!first || !last || !email || !org || !isEmail(email)) {
    return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
  }

  const subject = `Fundir access request — ${org || email}`;
  const text = [
    `Name: ${`${first} ${last}`.trim()}`,
    `Email: ${email}`,
    `Organization: ${org}`,
    `Role: ${role || '—'}`,
    `Team size: ${size || '—'}`,
    '',
    'Notes:',
    notes || '—',
  ].join('\n');

  // Safety net: always log the submission so it's recoverable from Vercel logs
  // even if email delivery is not configured or fails.
  console.log('[request-access]', JSON.stringify({ first, last, email, org, role, size, notes }));

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[request-access] RESEND_API_KEY not set — request logged but no email sent.');
    // Report success to the optimistic form; the submission is captured in logs.
    return NextResponse.json({ ok: true, delivered: false });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('[request-access] Resend error', res.status, detail);
      return NextResponse.json({ ok: false, error: 'Email delivery failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error('[request-access] send failed', err);
    return NextResponse.json({ ok: false, error: 'Email delivery failed' }, { status: 502 });
  }
}
