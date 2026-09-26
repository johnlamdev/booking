'use client'

import Link from 'next/link'
import { useState } from 'react'

export type PublicSlotDay = {
  date: string
  shortDate: string
  weekday: string
  slots: { iso: string; time: string; period: 'morning' | 'afternoon' | 'evening' }[]
}

const PERIODS = [
  { value: 'morning', label: '早上' },
  { value: 'afternoon', label: '下午' },
  { value: 'evening', label: '晚上' },
] as const

export function PublicSlotPicker({
  days,
  slug,
  serviceId,
  noticeText,
}: {
  days: PublicSlotDay[]
  slug: string
  serviceId: string
  noticeText?: string
}) {
  const [page, setPage] = useState(0)
  const [selectedDate, setSelectedDate] = useState(days[0]?.date ?? '')
  const [selectedStart, setSelectedStart] = useState('')
  const [period, setPeriod] = useState<'morning' | 'afternoon' | 'evening'>(() =>
    days[0]?.slots[0]?.period ?? 'morning',
  )

  const visibleDays = days.slice(page * 5, page * 5 + 5)
  const selectedDay = days.find((day) => day.date === selectedDate) ?? visibleDays[0]
  const availablePeriods = PERIODS.filter((item) =>
    selectedDay?.slots.some((slot) => slot.period === item.value),
  )
  const visibleSlots = selectedDay?.slots.filter((slot) => slot.period === period) ?? []
  const selectedSlot = selectedDay?.slots.find((slot) => slot.iso === selectedStart)
  const canGoBack = page > 0
  const canGoForward = (page + 1) * 5 < days.length

  function selectDay(day: PublicSlotDay) {
    setSelectedDate(day.date)
    setSelectedStart('')
    setPeriod(day.slots[0]?.period ?? 'morning')
  }

  function changePage(nextPage: number) {
    const first = days[nextPage * 5]
    setPage(nextPage)
    if (first) selectDay(first)
  }

  return (
    <div className="pb-24">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">選擇日期</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => changePage(page - 1)}
            disabled={!canGoBack}
            aria-label="較早日期"
            className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-ink disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => changePage(page + 1)}
            disabled={!canGoForward}
            aria-label="較後日期"
            className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-ink disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {visibleDays.map((day, index) => {
          const active = day.date === selectedDay?.date
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={active}
              onClick={() => selectDay(day)}
              className={`min-h-18 rounded-2xl border px-1.5 py-2 text-center transition-colors ${
                active
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink hover:border-brand/50'
              }`}
            >
              <span className={`block text-[10px] ${active ? 'text-white/75' : 'text-ink-subtle'}`}>
                {page === 0 && index === 0 ? '最快' : day.shortDate.split('月')[0] + '月'}
              </span>
              <strong className="mt-0.5 block text-lg leading-none">{day.shortDate.split('月')[1]?.replace('日', '')}</strong>
              <span className={`mt-1 block text-[10px] ${active ? 'text-white/80' : 'text-ink-subtle'}`}>{day.weekday}</span>
            </button>
          )
        })}
      </div>

      {selectedDay && (
        <section aria-labelledby="public-times-heading" className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="public-times-heading" className="text-base font-semibold text-ink">可選時間</h2>
            <span className="text-xs text-ink-subtle">{selectedDay.shortDate}（{selectedDay.weekday}）</span>
          </div>

          {noticeText && (
            <div className="mb-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-medium leading-5 text-amber-950">
              <span aria-hidden="true">⏱</span>
              <p>{noticeText}</p>
            </div>
          )}

          <div className="mb-3 flex gap-2" role="tablist" aria-label="時段">
            {availablePeriods.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={period === item.value}
                onClick={() => setPeriod(item.value)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                  period === item.value ? 'bg-brand-soft text-brand-strong' : 'bg-surface text-ink-muted'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleSlots.map((slot) => {
              const active = selectedStart === slot.iso
              return (
                <button
                  key={slot.iso}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedStart(slot.iso)}
                  className={`min-h-12 rounded-xl border text-sm font-semibold transition-colors ${
                    active
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-surface text-ink hover:border-brand hover:text-brand-strong'
                  }`}
                >
                  {slot.time}
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] text-ink-subtle">你的選擇</span>
            <strong className="block truncate text-sm text-ink">
              {selectedSlot ? `${selectedDay?.shortDate} · ${selectedSlot.time}` : '請選擇一個時間'}
            </strong>
          </div>
          {selectedSlot ? (
            <Link
              href={`/book/${slug}/inquiry?service=${serviceId}&start=${encodeURIComponent(selectedSlot.iso)}`}
              className="inline-flex min-h-12 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-sm"
            >
              下一步
            </Link>
          ) : (
            <span aria-disabled="true" className="inline-flex min-h-12 items-center rounded-xl bg-line px-5 text-sm font-semibold text-ink-subtle">下一步</span>
          )}
        </div>
      </div>
    </div>
  )
}
