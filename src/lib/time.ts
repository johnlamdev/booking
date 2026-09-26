import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

/**
 * 時區處理的唯一入口。
 *
 * 規則（docs/DESIGN.md §3.6）：儲存一律 UTC，只在邊界轉換。
 * 老師輸入的是所在時區的「牆上時間」，顯示時再換算回去。
 * 絕不以固定偏移（UTC+8）代替 IANA timezone。
 */

/** `HH:mm`，24 小時制。 */
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** `YYYY-MM-DD`。 */
export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function isValidTimeString(value: string): boolean {
  return TIME_PATTERN.test(value)
}

export function isValidDateString(value: string): boolean {
  return DATE_PATTERN.test(value)
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** `HH:mm` → 自午夜起算的分鐘數。輸入須先通過 isValidTimeString。 */
export function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

/** 自午夜起算的分鐘數 → `HH:mm`。跨日（>= 1440）會回捲，呼叫端須自行避免。 */
export function minutesToTimeString(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * 把某時區的牆上時間（日期 + 時間）轉為 UTC 時間點。
 *
 * 例：2026-08-10 09:00 在 Asia/Hong_Kong → 2026-08-10T01:00:00Z
 */
export function zonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, timeZone)
}

/** 以指定時區格式化 UTC 時間點，供顯示使用。 */
export function formatInZone(instant: Date, timeZone: string, pattern: string): string {
  return formatInTimeZone(instant, timeZone, pattern)
}

/** 例：2026年8月10日（星期一） */
export function formatDateInZone(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, 'yyyy年M月d日')
}

/** 例：09:00 */
export function formatTimeInZone(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, 'HH:mm')
}

/** 例：09:00–10:00 */
export function formatTimeRangeInZone(start: Date, end: Date, timeZone: string): string {
  return `${formatTimeInZone(start, timeZone)}–${formatTimeInZone(end, timeZone)}`
}
