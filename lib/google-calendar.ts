import type { CalendarEvent } from '@/lib/microsoft-graph';

/**
 * Upcoming events from the user's primary Google Calendar over the next `days`,
 * mapped to the shared CalendarEvent shape so the dashboard can merge Microsoft
 * and Google events uniformly. Uses the per-user Google token.
 */
export async function getGoogleUpcomingEvents(token: string, days = 7): Promise<CalendarEvent[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();
  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    '&singleEvents=true&orderBy=startTime&maxResults=50';

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return ((data.items ?? []) as Array<{
    id: string; summary?: string; location?: string; hangoutLink?: string;
    conferenceData?: unknown;
    start?: { dateTime?: string; date?: string };
    end?:   { dateTime?: string; date?: string };
  }>).map(e => ({
    id:       e.id,
    subject:  e.summary || '(no title)',
    start:    e.start?.dateTime || e.start?.date || '',
    end:      e.end?.dateTime || e.end?.date || '',
    isAllDay: !!e.start?.date,
    location: e.location || null,
    online:   !!(e.hangoutLink || e.conferenceData),
  }));
}
