/** Google Calendar accepts client-generated event IDs using base32hex characters. */
export function googleBookingEventId(bookingId: string): string {
  return `b${bookingId.replaceAll('-', '')}`
}

export type GoogleBookingEvent = {
  id: string
  summary: string
  start: { dateTime: string }
  end: { dateTime: string }
  description: string
}

export async function putGoogleBookingEvent(params: {
  calendarId: string
  accessToken: string
  event: GoogleBookingEvent
  fetcher?: typeof fetch
}): Promise<void> {
  const { calendarId, accessToken, event, fetcher = fetch } = params
  const collection = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const body = JSON.stringify(event)
  const updated = await fetcher(`${collection}/${event.id}`, {
    method: 'PUT', headers, body, cache: 'no-store', signal: AbortSignal.timeout(8000),
  })
  if (updated.status === 404) {
    const created = await fetcher(collection, {
      method: 'POST', headers, body, cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    if (created.status === 409) {
      // Another sync may have created the fixed ID after our PUT returned 404.
      // Apply this booking's current data instead of treating the conflict as done.
      const retried = await fetcher(`${collection}/${event.id}`, {
        method: 'PUT', headers, body, cache: 'no-store', signal: AbortSignal.timeout(8000),
      })
      if (!retried.ok) throw new Error(`Google event update after insert conflict failed (${retried.status})`)
    } else if (!created.ok) throw new Error(`Google event insert failed (${created.status})`)
  } else if (!updated.ok) throw new Error(`Google event update failed (${updated.status})`)
}

export async function deleteGoogleBookingEvent(params: {
  calendarId: string
  accessToken: string
  eventId: string
  fetcher?: typeof fetch
}): Promise<void> {
  const { calendarId, accessToken, eventId, fetcher = fetch } = params
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
  const removed = await fetcher(url, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
  })
  if (!removed.ok && removed.status !== 404) throw new Error(`Google event delete failed (${removed.status})`)
}
