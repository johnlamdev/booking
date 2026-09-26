import {
  addDays,
  deriveAvailableSlots,
  windowsForDate,
  type DateException,
  type TimeRange,
  type WeeklyRule,
} from './availability'
import { formatInZone } from './time'

export type SummaryBooking = TimeRange & { status: 'PENDING' | 'CONFIRMED' }

export type DashboardDaySummary = {
  date: string
  state: 'OPEN' | 'CLOSED' | 'NO_SCHEDULE'
  capacity: number
  confirmedCount: number
  availableCount: number
  pendingCount: number
}

type Input = {
  fromDate: string
  days: number
  timeZone: string
  rules: WeeklyRule[]
  exceptions: DateException[]
  bookings: SummaryBooking[]
  durationMinutes: number
  slotIntervalMinutes: number
  minNoticeMinutes: number
  now: Date
}

/**
 * 建立首頁未來數天摘要。
 *
 * capacity 是未扣除已確認課堂前的理論容量；availableCount 則使用與公開頁相同的
 * 推導邏輯，扣除已確認課堂、已過去時段及最短通知時間。
 */
export function buildDashboardDaySummaries(input: Input): DashboardDaySummary[] {
  const confirmed = input.bookings.filter((booking) => booking.status === 'CONFIRMED')

  const capacitySlots = deriveAvailableSlots({
    ...input,
    booked: [],
    // 以足夠早的時間計算完整日容量，不讓「現在」排除任何候選時段。
    now: new Date(0),
    minNoticeMinutes: 0,
  })
  const availableSlots = deriveAvailableSlots({
    ...input,
    booked: confirmed,
  })

  return Array.from({ length: input.days }, (_, offset) => {
    const date = addDays(input.fromDate, offset)
    const exception = input.exceptions.find((item) => item.date === date)
    const hasWindows = windowsForDate(date, input.rules, input.exceptions).length > 0
    const bookingsOnDate = input.bookings.filter(
      (booking) => formatInZone(booking.startAt, input.timeZone, 'yyyy-MM-dd') === date,
    )

    return {
      date,
      state: exception?.isClosed ? 'CLOSED' : hasWindows ? 'OPEN' : 'NO_SCHEDULE',
      capacity: capacitySlots.filter((slot) => slot.date === date).length,
      confirmedCount: bookingsOnDate.filter((booking) => booking.status === 'CONFIRMED').length,
      availableCount: availableSlots.filter((slot) => slot.date === date).length,
      pendingCount: bookingsOnDate.filter((booking) => booking.status === 'PENDING').length,
    }
  })
}
