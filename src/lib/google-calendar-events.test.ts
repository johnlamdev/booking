import { describe, expect, it, vi } from 'vitest'

import { deleteGoogleBookingEvent, googleBookingEventId, putGoogleBookingEvent } from './google-calendar-events'

const event = {
  id: googleBookingEventId('550e8400-e29b-41d4-a716-446655440000'),
  summary: '私人課 · 學生',
  start: { dateTime: '2027-01-01T10:00:00.000Z' },
  end: { dateTime: '2027-01-01T11:00:00.000Z' },
  description: '測試',
}

describe('Google Calendar event sync', () => {
  it('使用固定且可重試的事件 ID', () => {
    expect(event.id).toBe('b550e8400e29b41d4a716446655440000')
    expect(event.id).toMatch(/^[0-9a-v]+$/)
  })

  it('已有事件時更新；找不到事件時才建立', async () => {
    const updated = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200 } as Response)
    await putGoogleBookingEvent({ calendarId: 'primary', accessToken: 'token', event, fetcher: updated })
    expect(updated).toHaveBeenCalledTimes(1)
    expect(updated.mock.calls[0]?.[1]?.method).toBe('PUT')

    const create = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    await putGoogleBookingEvent({ calendarId: 'primary', accessToken: 'token', event, fetcher: create })
    expect(create.mock.calls.map((call) => call[1]?.method)).toEqual(['PUT', 'POST'])
    expect(JSON.parse(String(create.mock.calls[1]?.[1]?.body)).id).toBe(event.id)
  })

  it('取消時刪除事件，重試時 404 仍視為成功', async () => {
    const remove = vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 404 } as Response)
    await expect(deleteGoogleBookingEvent({ calendarId: 'primary', accessToken: 'token', eventId: event.id, fetcher: remove })).resolves.toBeUndefined()
    expect(remove.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('另一個同步先建立相同事件時，重新寫入最新時間', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 409 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    await putGoogleBookingEvent({ calendarId: 'primary', accessToken: 'token', event, fetcher })
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['PUT', 'POST', 'PUT'])
  })
})
