// Shared: Google Calendar helper functions

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export async function getAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  return data.access_token || null
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string
    description: string
    start: string // ISO datetime
    end: string   // ISO datetime
    timeZone: string
  }
): Promise<string | null> {
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start, timeZone: event.timeZone },
      end: { dateTime: event.end, timeZone: event.timeZone },
    }),
  })

  const data = await res.json()
  return data.id || null
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  )
  return res.ok
}
