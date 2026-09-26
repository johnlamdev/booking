import { describe, expect, it } from 'vitest'

import {
  addDays,
  deriveAvailableSlots,
  hasOverlappingWallClockRanges,
  rangesOverlap,
  weekdayOf,
  windowsForDate,
  type DeriveInput,
} from './availability'

const HK = 'Asia/Hong_Kong'

/** 2026-09-01 是星期二 */
const TUESDAY = '2026-09-01'

/** 固定「現在」為 2026-08-01，令所有測試日期都在未來且不受最短通知影響 */
const NOW = new Date('2026-08-01T00:00:00Z')

function derive(overrides: Partial<DeriveInput> = {}) {
  return deriveAvailableSlots({
    fromDate: TUESDAY,
    days: 1,
    timeZone: HK,
    rules: [{ weekday: 2, startTime: '10:00:00', endTime: '21:00:00' }],
    exceptions: [],
    booked: [],
    durationMinutes: 60,
    slotIntervalMinutes: 30,
    minNoticeMinutes: 120,
    now: NOW,
    ...overrides,
  })
}

describe('weekdayOf', () => {
  it('正確判斷星期幾', () => {
    expect(weekdayOf('2026-09-01')).toBe(2) // 星期二
    expect(weekdayOf('2026-09-06')).toBe(0) // 星期日
    expect(weekdayOf('2026-09-07')).toBe(1) // 星期一
  })
})

describe('addDays', () => {
  it('可跨月與跨年', () => {
    expect(addDays('2026-09-01', 1)).toBe('2026-09-02')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('hasOverlappingWallClockRanges', () => {
  it('偵測同一天被拆成多個 payload 項目後的重疊範圍', () => {
    expect(
      hasOverlappingWallClockRanges([
        { startTime: '10:00', endTime: '13:00' },
        { startTime: '12:00', endTime: '14:00' },
      ]),
    ).toBe(true)
  })

  it('相接與分離的範圍合法', () => {
    expect(
      hasOverlappingWallClockRanges([
        { startTime: '10:00', endTime: '12:00' },
        { startTime: '12:00', endTime: '14:00' },
        { startTime: '15:00', endTime: '18:00' },
      ]),
    ).toBe(false)
  })
})

describe('windowsForDate', () => {
  const rules = [
    { weekday: 2, startTime: '10:00:00', endTime: '13:00:00' },
    { weekday: 2, startTime: '14:00:00', endTime: '18:00:00' },
  ]

  it('同一天可有多段開放時間（表達午休）', () => {
    expect(windowsForDate(TUESDAY, rules, [])).toEqual([
      { startMinutes: 600, endMinutes: 780 },
      { startMinutes: 840, endMinutes: 1080 },
    ])
  })

  it('沒有對應規則的星期幾不開放', () => {
    // 2026-09-02 是星期三，規則只涵蓋星期二
    expect(windowsForDate('2026-09-02', rules, [])).toEqual([])
  })

  it('休假覆寫令當天完全不開放', () => {
    const exceptions = [{ date: TUESDAY, isClosed: true, startTime: null, endTime: null }]
    expect(windowsForDate(TUESDAY, rules, exceptions)).toEqual([])
  })

  it('日期覆寫取代當天的每週規則', () => {
    const exceptions = [
      { date: TUESDAY, isClosed: false, startTime: '19:00:00', endTime: '21:00:00' },
    ]
    expect(windowsForDate(TUESDAY, rules, exceptions)).toEqual([
      { startMinutes: 1140, endMinutes: 1260 },
    ])
  })
})

describe('deriveAvailableSlots', () => {
  it('以起始間隔列舉起點', () => {
    const slots = derive({ rules: [{ weekday: 2, startTime: '10:00', endTime: '12:00' }] })

    expect(slots.map((s) => s.startTime)).toEqual(['10:00', '10:30', '11:00'])
  })

  it('放不下整堂課的起點不會出現（本次改動的核心需求）', () => {
    // 開放至 21:00，90 分鐘課 → 最後一個起點是 19:30；20:00 放不下
    const slots = derive({ durationMinutes: 90 })
    const starts = slots.map((s) => s.startTime)

    expect(starts.at(-1)).toBe('19:30')
    expect(starts).not.toContain('20:00')
    expect(starts).not.toContain('20:30')
  })

  it('同一段開放時間可同時供 60 與 90 分鐘課使用', () => {
    const sixty = derive({ durationMinutes: 60 })
    const ninety = derive({ durationMinutes: 90 })

    // 開放時間不綁定服務，兩種時長都能用，只是可選起點不同
    expect(sixty.length).toBeGreaterThan(0)
    expect(ninety.length).toBeGreaterThan(0)
    expect(sixty.map((s) => s.startTime).at(-1)).toBe('20:00')
    expect(ninety.map((s) => s.startTime).at(-1)).toBe('19:30')
  })

  it('香港 10:00 換算為 02:00 UTC', () => {
    const slots = derive({ rules: [{ weekday: 2, startTime: '10:00', endTime: '11:00' }] })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startAt.toISOString()).toBe('2026-09-01T02:00:00.000Z')
    expect(slots[0]!.endAt.toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })

  it('午休不會產生跨越休息時間的時段', () => {
    const slots = derive({
      rules: [
        { weekday: 2, startTime: '10:00', endTime: '12:00' },
        { weekday: 2, startTime: '14:00', endTime: '16:00' },
      ],
    })

    const starts = slots.map((s) => s.startTime)
    expect(starts).toEqual(['10:00', '10:30', '11:00', '14:00', '14:30', '15:00'])
    // 12:00–14:00 是休息，不應有任何起點落在其中
    expect(starts).not.toContain('12:00')
    expect(starts).not.toContain('13:00')
  })

  it('與已確認預約重疊的時段會被排除', () => {
    const booked = [
      {
        startAt: new Date('2026-09-01T02:00:00Z'), // 香港 10:00
        endAt: new Date('2026-09-01T03:00:00Z'), // 香港 11:00
      },
    ]

    const slots = derive({
      rules: [{ weekday: 2, startTime: '10:00', endTime: '13:00' }],
      booked,
    })

    const starts = slots.map((s) => s.startTime)
    // 10:00 與 10:30 都會撞到已確認的 10:00–11:00
    expect(starts).not.toContain('10:00')
    expect(starts).not.toContain('10:30')
    // 11:00 起與之相接，不算重疊，仍可預約
    expect(starts).toContain('11:00')
  })

  it('最短預約通知內的時段不開放', () => {
    // 現在是香港 2026-09-01 09:00（UTC 01:00），最短通知 120 分鐘 → 11:00 前不可約
    const slots = derive({
      now: new Date('2026-09-01T01:00:00Z'),
      minNoticeMinutes: 120,
      rules: [{ weekday: 2, startTime: '10:00', endTime: '14:00' }],
    })

    const starts = slots.map((s) => s.startTime)
    expect(starts).not.toContain('10:00')
    expect(starts).not.toContain('10:30')
    expect(starts[0]).toBe('11:00')
  })

  it('休假日不產生任何時段', () => {
    const slots = derive({
      exceptions: [{ date: TUESDAY, isClosed: true, startTime: null, endTime: null }],
    })

    expect(slots).toEqual([])
  })

  it('日期覆寫會取代該日的每週規則', () => {
    const slots = derive({
      exceptions: [
        { date: TUESDAY, isClosed: false, startTime: '19:00', endTime: '21:00' },
      ],
    })

    expect(slots.map((s) => s.startTime)).toEqual(['19:00', '19:30', '20:00'])
  })

  it('可跨多日推導，並依時間排序', () => {
    const slots = derive({
      fromDate: '2026-08-31', // 星期一
      days: 3, // 一、二、三
      rules: [
        { weekday: 1, startTime: '10:00', endTime: '11:00' },
        { weekday: 2, startTime: '15:00', endTime: '16:00' },
      ],
    })

    expect(slots.map((s) => `${s.date} ${s.startTime}`)).toEqual([
      '2026-08-31 10:00',
      '2026-09-01 15:00',
    ])

    // 星期三沒有規則，故不出現
    expect(slots.some((s) => s.date === '2026-09-02')).toBe(false)
  })

  it('沒有任何規則時回傳空陣列', () => {
    expect(derive({ rules: [] })).toEqual([])
  })

  it('拒絕不合法的參數而非拋出例外', () => {
    expect(derive({ durationMinutes: 0 })).toEqual([])
    expect(derive({ slotIntervalMinutes: 0 })).toEqual([])
    expect(derive({ days: 0 })).toEqual([])
  })

  it('起始間隔大於課堂長度時仍正確', () => {
    const slots = derive({
      rules: [{ weekday: 2, startTime: '10:00', endTime: '13:00' }],
      durationMinutes: 30,
      slotIntervalMinutes: 60,
    })

    expect(slots.map((s) => s.startTime)).toEqual(['10:00', '11:00', '12:00'])
  })
})

describe('rangesOverlap（半開區間）', () => {
  const range = (from: string, to: string) => ({
    startAt: new Date(from),
    endAt: new Date(to),
  })

  it('相接不算重疊', () => {
    expect(
      rangesOverlap(
        range('2026-09-01T02:00:00Z', '2026-09-01T03:00:00Z'),
        range('2026-09-01T03:00:00Z', '2026-09-01T04:00:00Z'),
      ),
    ).toBe(false)
  })

  it('部分重疊、完全包含皆算重疊', () => {
    expect(
      rangesOverlap(
        range('2026-09-01T02:00:00Z', '2026-09-01T03:00:00Z'),
        range('2026-09-01T02:30:00Z', '2026-09-01T03:30:00Z'),
      ),
    ).toBe(true)

    expect(
      rangesOverlap(
        range('2026-09-01T02:00:00Z', '2026-09-01T05:00:00Z'),
        range('2026-09-01T03:00:00Z', '2026-09-01T04:00:00Z'),
      ),
    ).toBe(true)
  })

  it('完全分離不算重疊', () => {
    expect(
      rangesOverlap(
        range('2026-09-01T02:00:00Z', '2026-09-01T03:00:00Z'),
        range('2026-09-01T06:00:00Z', '2026-09-01T07:00:00Z'),
      ),
    ).toBe(false)
  })
})
