import { zonedWallClockToUtc } from './time'

/**
 * 由開放規則推導可預約時段。
 *
 * 老師設定的是「開放時間」，不是一節一節的課。可預約時段在查詢時即時算出，
 * 不預先建立資料列。見 docs/DESIGN.md §4。
 *
 *   可預約時段 = 開放時間
 *              − 已確認的預約
 *              − 早於「最短預約通知」的時間
 *              以「起始間隔」列舉起點，只保留能完整容納所選服務時長者
 *
 * 純函式：不碰資料庫、不讀系統時間（`now` 由呼叫端傳入），因此完全可測。
 */

/** 0 = 星期日 … 6 = 星期六，與 JS `Date.getDay()` 一致。 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type WeeklyRule = {
  weekday: number
  /** HH:MM 或 HH:MM:SS（資料庫的 time 型別會帶秒） */
  startTime: string
  endTime: string
}

export type DateException = {
  /** YYYY-MM-DD */
  date: string
  isClosed: boolean
  startTime: string | null
  endTime: string | null
}

export type TimeRange = { startAt: Date; endAt: Date }

export type DeriveInput = {
  /** 起算日期（老師時區的日曆日），YYYY-MM-DD */
  fromDate: string
  /** 推導幾天。必須有上限，否則會一路算到無限遠。 */
  days: number
  timeZone: string
  rules: WeeklyRule[]
  exceptions: DateException[]
  /** 已確認的預約，候選時段與其重疊者會被排除 */
  booked: TimeRange[]
  durationMinutes: number
  slotIntervalMinutes: number
  minNoticeMinutes: number
  now: Date
}

export const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 半開區間 [start, end)：相接不算重疊（規格 §11.8）。 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt
}

/** 'HH:MM' 或 'HH:MM:SS' → 自午夜起算的分鐘數。 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/**
 * 同一天的牆上時間範圍是否互相重疊。
 * 相接（例如 10:00–12:00、12:00–14:00）不算重疊。
 */
export function hasOverlappingWallClockRanges(
  ranges: { startTime: string; endTime: string }[],
): boolean {
  const sorted = [...ranges].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  )

  for (let i = 1; i < sorted.length; i++) {
    if (timeToMinutes(sorted[i]!.startTime) < timeToMinutes(sorted[i - 1]!.endTime)) {
      return true
    }
  }

  return false
}

/** 自午夜起算的分鐘數 → 'HH:MM'。 */
export function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * 取日曆日期的星期幾。
 *
 * 以 UTC 建構純日期來計算：一個日曆日期的「星期幾」是該日期本身的屬性，
 * 與時區無關，用 UTC 可避免跨日邊界的偏移錯誤。
 */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
}

/** 日曆日期加 n 天，回傳 YYYY-MM-DD。 */
export function addDays(date: string, n: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year!, month! - 1, day! + n))
  return next.toISOString().slice(0, 10)
}

/** 某一天實際開放的時間區間（牆上時間，分鐘）。日期覆寫優先於每週規則。 */
export function windowsForDate(
  date: string,
  rules: WeeklyRule[],
  exceptions: DateException[],
): { startMinutes: number; endMinutes: number }[] {
  const exception = exceptions.find((e) => e.date === date)

  if (exception) {
    // 休假：當天整天不開放，忽略每週規則
    if (exception.isClosed || !exception.startTime || !exception.endTime) return []

    return [
      {
        startMinutes: timeToMinutes(exception.startTime),
        endMinutes: timeToMinutes(exception.endTime),
      },
    ]
  }

  const weekday = weekdayOf(date)

  return rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({
      startMinutes: timeToMinutes(r.startTime),
      endMinutes: timeToMinutes(r.endTime),
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes)
}

export type DerivedSlot = TimeRange & {
  /** 老師時區的牆上時間，供顯示，例如 09:00 */
  startTime: string
  /** YYYY-MM-DD */
  date: string
}

export function deriveAvailableSlots(input: DeriveInput): DerivedSlot[] {
  const {
    fromDate,
    days,
    timeZone,
    rules,
    exceptions,
    booked,
    durationMinutes,
    slotIntervalMinutes,
    minNoticeMinutes,
    now,
  } = input

  if (durationMinutes <= 0 || slotIntervalMinutes <= 0 || days <= 0) return []

  const earliest = new Date(now.getTime() + minNoticeMinutes * 60_000)
  const slots: DerivedSlot[] = []

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const date = addDays(fromDate, dayOffset)

    for (const window of windowsForDate(date, rules, exceptions)) {
      // 只列舉能完整容納整堂課的起點：放不下就不出現。
      // 開放至 21:00、90 分鐘課 → 最後一個起點是 19:30，20:00 不會出現。
      const lastStart = window.endMinutes - durationMinutes

      for (
        let startMinutes = window.startMinutes;
        startMinutes <= lastStart;
        startMinutes += slotIntervalMinutes
      ) {
        const startTime = minutesToTime(startMinutes)
        const startAt = zonedWallClockToUtc(date, startTime, timeZone)
        const endAt = new Date(startAt.getTime() + durationMinutes * 60_000)

        // 太接近現在的時段不開放
        if (startAt < earliest) continue

        // 與已確認的預約重疊者排除
        if (booked.some((b) => rangesOverlap({ startAt, endAt }, b))) continue

        slots.push({ date, startTime, startAt, endAt })
      }
    }
  }

  return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
}

/** 依日期分組，供公開頁與後台顯示。 */
export function groupSlotsByDate(slots: DerivedSlot[]): { date: string; slots: DerivedSlot[] }[] {
  const grouped = new Map<string, DerivedSlot[]>()

  for (const slot of slots) {
    const list = grouped.get(slot.date) ?? []
    list.push(slot)
    grouped.set(slot.date, list)
  }

  return [...grouped.entries()].map(([date, items]) => ({ date, slots: items }))
}
