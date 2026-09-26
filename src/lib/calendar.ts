import { addDays } from './availability'

export type CalendarView = 'day' | 'week' | 'month'

function utcDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!))
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function startOfWeek(date: string): string {
  const value = utcDate(date)
  const mondayOffset = (value.getUTCDay() + 6) % 7
  return addDays(date, -mondayOffset)
}

export function calendarRange(focusDate: string, view: CalendarView) {
  if (view === 'day') return { startDate: focusDate, endDate: focusDate }

  if (view === 'week') {
    const startDate = startOfWeek(focusDate)
    return { startDate, endDate: addDays(startDate, 6) }
  }

  const value = utcDate(focusDate)
  const first = dateString(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)))
  const last = dateString(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)))
  const startDate = startOfWeek(first)
  const lastDay = utcDate(last).getUTCDay()
  const endDate = addDays(last, lastDay === 0 ? 0 : 7 - lastDay)
  return { startDate, endDate }
}

export function datesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) dates.push(date)
  return dates
}

export function shiftCalendarDate(date: string, view: CalendarView, direction: -1 | 1): string {
  if (view === 'day') return addDays(date, direction)
  if (view === 'week') return addDays(date, direction * 7)

  const value = utcDate(date)
  return dateString(
    new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + direction, 1)),
  )
}
