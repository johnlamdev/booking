import { describe, expect, it } from 'vitest'

import { zonedWallClockToUtc } from './time'
import { buildDashboardDaySummaries, type SummaryBooking } from './dashboard-summary'

const TIME_ZONE = 'Asia/Hong_Kong'

function booking(
  date: string,
  time: string,
  status: SummaryBooking['status'],
): SummaryBooking {
  const startAt = zonedWallClockToUtc(date, time, TIME_ZONE)
  return {
    status,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60_000),
  }
}

describe('buildDashboardDaySummaries', () => {
  it('顯示容量、已確認、尚可預約及待處理查詢', () => {
    const summaries = buildDashboardDaySummaries({
      fromDate: '2026-08-14',
      days: 1,
      timeZone: TIME_ZONE,
      rules: [{ weekday: 5, startTime: '09:00', endTime: '19:00' }],
      exceptions: [],
      bookings: [
        booking('2026-08-14', '10:00', 'CONFIRMED'),
        booking('2026-08-14', '14:00', 'CONFIRMED'),
        booking('2026-08-14', '11:00', 'PENDING'),
        booking('2026-08-14', '12:00', 'PENDING'),
        booking('2026-08-14', '12:00', 'PENDING'),
      ],
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      minNoticeMinutes: 0,
      now: zonedWallClockToUtc('2026-08-14', '00:00', TIME_ZONE),
    })

    expect(summaries[0]).toEqual({
      date: '2026-08-14',
      state: 'OPEN',
      capacity: 10,
      confirmedCount: 2,
      availableCount: 8,
      pendingCount: 3,
    })
  })

  it('今日已過及早於最短通知的時段不計入尚可預約', () => {
    const [summary] = buildDashboardDaySummaries({
      fromDate: '2026-08-14',
      days: 1,
      timeZone: TIME_ZONE,
      rules: [{ weekday: 5, startTime: '09:00', endTime: '19:00' }],
      exceptions: [],
      bookings: [],
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      minNoticeMinutes: 120,
      now: zonedWallClockToUtc('2026-08-14', '12:30', TIME_ZONE),
    })

    expect(summary?.capacity).toBe(10)
    expect(summary?.availableCount).toBe(4)
  })

  it('特別休假優先於每週開放時間', () => {
    const [summary] = buildDashboardDaySummaries({
      fromDate: '2026-08-14',
      days: 1,
      timeZone: TIME_ZONE,
      rules: [{ weekday: 5, startTime: '09:00', endTime: '19:00' }],
      exceptions: [
        { date: '2026-08-14', isClosed: true, startTime: null, endTime: null },
      ],
      bookings: [],
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      minNoticeMinutes: 0,
      now: zonedWallClockToUtc('2026-08-14', '00:00', TIME_ZONE),
    })

    expect(summary).toMatchObject({ state: 'CLOSED', capacity: 0, availableCount: 0 })
  })

  it('不開放日仍保留既有課堂及查詢數目供介面提示', () => {
    const [summary] = buildDashboardDaySummaries({
      fromDate: '2026-08-16', days: 1, timeZone: TIME_ZONE,
      rules: [{ weekday: 0, startTime: '09:00', endTime: '21:00' }],
      exceptions: [{ date: '2026-08-16', isClosed: true, startTime: null, endTime: null }],
      bookings: [booking('2026-08-16', '09:00', 'CONFIRMED'), booking('2026-08-16', '11:00', 'PENDING')],
      durationMinutes: 60, slotIntervalMinutes: 60, minNoticeMinutes: 0,
      now: zonedWallClockToUtc('2026-08-16', '00:00', TIME_ZONE),
    })
    expect(summary).toMatchObject({ state: 'CLOSED', confirmedCount: 1, pendingCount: 1 })
  })
})
