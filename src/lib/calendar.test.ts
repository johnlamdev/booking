import { describe, expect, it } from 'vitest'

import { calendarRange, datesInRange, shiftCalendarDate, startOfWeek } from './calendar'

describe('calendar helpers', () => {
  it('uses Monday as the first day of the week', () => {
    expect(startOfWeek('2026-08-11')).toBe('2026-08-10')
    expect(calendarRange('2026-08-11', 'week')).toEqual({
      startDate: '2026-08-10',
      endDate: '2026-08-16',
    })
  })

  it('pads a month to complete Monday-to-Sunday weeks', () => {
    expect(calendarRange('2026-08-11', 'month')).toEqual({
      startDate: '2026-07-27',
      endDate: '2026-09-06',
    })
  })

  it('navigates each view by its natural period', () => {
    expect(shiftCalendarDate('2026-08-11', 'day', 1)).toBe('2026-08-12')
    expect(shiftCalendarDate('2026-08-11', 'week', -1)).toBe('2026-08-04')
    expect(shiftCalendarDate('2026-08-11', 'month', 1)).toBe('2026-09-01')
  })

  it('returns inclusive dates', () => {
    expect(datesInRange('2026-08-10', '2026-08-12')).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ])
  })
})
