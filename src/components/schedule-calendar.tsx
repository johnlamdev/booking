'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { datesInRange, shiftCalendarDate, type CalendarView } from '@/lib/calendar'
import {
  createManualBookingAction,
  createTimeOffAction,
  type CalendarActionState,
} from '@/server/calendar/actions'
import type { CalendarBooking, CalendarTimeOff } from '@/server/calendar/queries'

import { Alert, Button, Field, Select } from './ui'

const ALL_HOURS = Array.from({ length: 24 }, (_, index) => index)
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const DEFAULT_START_HOUR = 9
const DEFAULT_END_HOUR = 18
const MIN_VISIBLE_HOURS = 6

function dateValue(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('zh-HK', { ...options, timeZone: 'UTC' }).format(dateValue(date))
}

function calendarHref(view: CalendarView, date: string): string {
  return `/dashboard/availability?view=${view}&date=${date}`
}

function viewTitle(view: CalendarView, focusDate: string, startDate: string, endDate: string) {
  if (view === 'month') return dateLabel(focusDate, { year: 'numeric', month: 'long' })
  if (view === 'day') {
    return dateLabel(focusDate, { month: 'long', day: 'numeric', weekday: 'long' })
  }
  return `${dateLabel(startDate, { month: 'numeric', day: 'numeric' })} – ${dateLabel(endDate, { month: 'numeric', day: 'numeric' })}`
}

function BookingChip({
  booking,
  compact = false,
  fillCell = false,
}: {
  booking: CalendarBooking
  compact?: boolean
  fillCell?: boolean
}) {
  const pending = booking.status === 'PENDING'
  const conflictLabel = booking.hasConfirmedConflict
    ? '撞已確認課堂'
    : booking.sameTimePendingCount > 0
      ? `同時段另有 ${booking.sameTimePendingCount} 筆查詢`
      : booking.overlappingPendingCount > 0
        ? `另有 ${booking.overlappingPendingCount} 筆重疊查詢`
        : null
  return (
    <Link
      href={`/dashboard/inquiries?inquiry=${booking.id}`}
      title={`${booking.startTime} ${booking.studentName} · ${booking.serviceName}${conflictLabel ? ` · 警告：${conflictLabel}` : ''}`}
      className={`block overflow-hidden border px-2 text-left text-[11px] leading-4 ${
        fillCell ? 'h-full rounded-none py-2' : 'rounded-lg py-1'
      } ${
        pending
          ? conflictLabel
            ? 'border-danger border-dashed bg-danger-soft text-danger'
            : 'border-amber-300 border-dashed bg-amber-50 text-amber-900'
          : 'border-brand/30 bg-brand text-white'
      }`}
    >
      <strong className="block truncate">
        {conflictLabel && <span aria-label={`警告：${conflictLabel}`}>⚠ </span>}
        {booking.startTime} {booking.studentName}
      </strong>
      {!compact && (
        <span className={`block truncate ${pending ? conflictLabel ? 'text-danger' : 'text-amber-800' : 'text-white/80'}`}>
          {conflictLabel ? `⚠ ${conflictLabel}` : pending ? '待確認' : booking.serviceName}
        </span>
      )}
    </Link>
  )
}

export function ScheduleCalendar({
  view,
  focusDate,
  today,
  startDate,
  endDate,
  bookings,
  timeOff,
  weeklyRules,
  services,
  students,
  timezoneLabel,
}: {
  view: CalendarView
  focusDate: string
  today: string
  startDate: string
  endDate: string
  bookings: CalendarBooking[]
  timeOff: CalendarTimeOff[]
  weeklyRules: { weekday: number; startTime: string; endTime: string }[]
  services: { id: string; name: string }[]
  students: { id: string; displayName: string; phone: string }[]
  timezoneLabel: string
}) {
  const [composer, setComposer] = useState<'closed' | 'choose' | 'booking' | 'timeoff'>('closed')
  const [selectedDate, setSelectedDate] = useState(focusDate < today ? today : focusDate)
  const [selectedTime, setSelectedTime] = useState('10:00')
  const [showFullDay, setShowFullDay] = useState(false)
  const [bookingState, bookingAction, bookingPending] = useActionState<CalendarActionState, FormData>(
    createManualBookingAction,
    null,
  )
  const [timeOffState, timeOffAction, timeOffPending] = useActionState<CalendarActionState, FormData>(
    createTimeOffAction,
    null,
  )
  const days = datesInRange(startDate, endDate)
  const visibleDays = view === 'day' ? [focusDate] : days
  const timeOffByDate = new Map(timeOff.map((item) => [item.date, item]))
  const visibleWeekdays = new Set(visibleDays.map((date) => dateValue(date).getUTCDay()))
  const relevantRules = weeklyRules.filter((rule) => visibleWeekdays.has(rule.weekday))
  const startCandidates = [
    ...bookings.map((booking) => Number(booking.startTime.slice(0, 2))),
    ...relevantRules.map((rule) => Number(rule.startTime.slice(0, 2))),
  ]
  const endCandidates = [
    ...bookings.map((booking) => {
      const [hour, minute] = booking.endTime.split(':').map(Number)
      return hour! + (minute! > 0 ? 1 : 0)
    }),
    ...relevantRules.map((rule) => {
      const [hour, minute] = rule.endTime.split(':').map(Number)
      return hour! + (minute! > 0 ? 1 : 0)
    }),
  ]
  let adaptiveStart = startCandidates.length > 0
    ? Math.max(0, Math.min(...startCandidates) - 1)
    : DEFAULT_START_HOUR
  let adaptiveEnd = endCandidates.length > 0
    ? Math.min(24, Math.max(...endCandidates) + 1)
    : DEFAULT_END_HOUR
  if (adaptiveEnd - adaptiveStart < MIN_VISIBLE_HOURS) {
    const missing = MIN_VISIBLE_HOURS - (adaptiveEnd - adaptiveStart)
    adaptiveStart = Math.max(0, adaptiveStart - Math.ceil(missing / 2))
    adaptiveEnd = Math.min(24, adaptiveStart + MIN_VISIBLE_HOURS)
    adaptiveStart = Math.max(0, adaptiveEnd - MIN_VISIBLE_HOURS)
  }
  const displayedHours = showFullDay
    ? ALL_HOURS
    : ALL_HOURS.slice(adaptiveStart, adaptiveEnd)

  function openComposer(date = selectedDate, time = selectedTime) {
    setSelectedDate(date < today ? today : date)
    setSelectedTime(time)
    setComposer('choose')
  }

  const previousDate = shiftCalendarDate(focusDate, view, -1)
  const nextDate = shiftCalendarDate(focusDate, view, 1)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand">課堂與查詢</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">日曆</h1>
            <p className="mt-1 text-xs text-ink-subtle">{timezoneLabel} · 第一版課堂固定為整點開始、60 分鐘</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/availability/settings" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink">
              設定常規時間
            </Link>
            <Button type="button" onClick={() => openComposer()}>＋ 新增</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-2 shadow-sm">
          <div className="flex items-center gap-1">
            <Link href={calendarHref(view, today)} className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-sm font-semibold text-ink">今天</Link>
            <Link aria-label="上一段日期" href={calendarHref(view, previousDate)} className="grid size-10 place-items-center rounded-xl text-xl text-ink hover:bg-canvas">‹</Link>
            <Link aria-label="下一段日期" href={calendarHref(view, nextDate)} className="grid size-10 place-items-center rounded-xl text-xl text-ink hover:bg-canvas">›</Link>
            <strong className="ml-1 text-sm text-ink sm:text-base">{viewTitle(view, focusDate, startDate, endDate)}</strong>
          </div>
          <div className="grid grid-cols-3 rounded-xl bg-canvas p-1 text-xs font-semibold">
            {(['day', 'week', 'month'] as const).map((item) => (
              <Link key={item} href={calendarHref(item, focusDate)} aria-current={view === item ? 'page' : undefined} className={`rounded-lg px-3 py-2 ${view === item ? 'bg-surface text-brand shadow-sm' : 'text-ink-muted'}`}>
                {{ day: '日', week: '週', month: '月' }[item]}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 text-xs text-ink-muted" aria-label="日曆圖例">
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-brand" />已確認</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm border border-dashed border-amber-500 bg-amber-50" />待確認</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-slate-200" />不開放</span>
        {view !== 'month' && (
          <button
            type="button"
            onClick={() => setShowFullDay((current) => !current)}
            className="ml-auto font-semibold text-brand underline underline-offset-2"
          >
            {showFullDay ? '只顯示有安排的時間' : '顯示完整一天'}
          </button>
        )}
      </div>

      {view === 'month' ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <div className="grid min-w-[720px] grid-cols-7 border-b border-line bg-canvas">
            {WEEKDAYS.map((day) => <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-ink-muted">週{day}</div>)}
          </div>
          <div className="grid min-w-[720px] grid-cols-7">
            {days.map((date) => {
              const dayBookings = bookings.filter((booking) => booking.date === date)
              const closed = timeOffByDate.get(date)
              const closedWithBookings = Boolean(closed && dayBookings.length > 0)
              const outsideMonth = date.slice(0, 7) !== focusDate.slice(0, 7)
              return (
                <div key={date} className={`min-h-32 border-b border-r border-line p-1.5 ${outsideMonth ? 'bg-canvas/60' : 'bg-surface'}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link href={calendarHref('day', date)} className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${date === today ? 'bg-brand text-white' : outsideMonth ? 'text-ink-subtle' : 'text-ink'}`}>{Number(date.slice(-2))}</Link>
                    {date >= today && <button type="button" aria-label={`在 ${date} 新增`} onClick={() => openComposer(date, '10:00')} className="grid size-7 place-items-center rounded-lg text-brand hover:bg-brand-soft">＋</button>}
                  </div>
                  <div className="flex flex-col gap-1">
                    {closed && <div className={`rounded-md px-1.5 py-1 text-[10px] font-semibold ${closedWithBookings ? 'border border-danger/30 bg-danger-soft text-danger' : 'bg-slate-200 text-slate-700'}`}>{closedWithBookings ? `⚠ 不開放 · 仍有 ${dayBookings.length} 項` : `不開放${closed.note ? ` · ${closed.note}` : ''}`}</div>}
                    {dayBookings.slice(0, 3).map((booking) => <BookingChip key={booking.id} booking={booking} compact />)}
                    {dayBookings.length > 3 && <Link href={calendarHref('day', date)} className="text-[10px] font-medium text-brand">另外 {dayBookings.length - 3} 項</Link>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <div className={`grid ${view === 'week' ? 'min-w-[760px] grid-cols-[4rem_repeat(7,minmax(6rem,1fr))]' : 'grid-cols-[4rem_1fr]'}`}>
            <div className="border-b border-r border-line bg-canvas" />
            {visibleDays.map((date) => {
              const closedDayBookings = bookings.filter((booking) => booking.date === date)
              const closedWithBookings = timeOffByDate.has(date) && closedDayBookings.length > 0
              return (
              <div key={date} className="border-b border-r border-line bg-canvas px-2 py-2 text-center">
                <Link href={calendarHref('day', date)} className="text-xs font-semibold text-ink">
                  {dateLabel(date, { weekday: 'short' })} <span className={date === today ? 'ml-1 rounded-full bg-brand px-2 py-1 text-white' : 'ml-1'}>{Number(date.slice(-2))}</span>
                </Link>
                {timeOffByDate.has(date) && <div className={`mt-2 rounded-md px-1 py-1 text-[10px] font-semibold ${closedWithBookings ? 'border border-danger/30 bg-danger-soft text-danger' : 'bg-slate-200 text-slate-700'}`}>{closedWithBookings ? `⚠ 不開放 · 仍有 ${closedDayBookings.length} 項` : '全日不開放'}</div>}
              </div>
              )
            })}

            {displayedHours.flatMap((hour) => {
              const time = `${String(hour).padStart(2, '0')}:00`
              return [
                <div key={`time-${hour}`} className="min-h-20 border-b border-r border-line bg-canvas px-2 py-2 text-right text-[11px] text-ink-subtle">{time}</div>,
                ...visibleDays.map((date) => {
                  const cellBookings = bookings.filter((booking) => booking.date === date && Number(booking.startTime.slice(0, 2)) === hour)
                  const isClosed = timeOffByDate.has(date)
                  return (
                    <div key={`${date}-${hour}`} className={`relative min-h-20 border-b border-r border-line ${isClosed ? 'bg-slate-100' : 'bg-surface'}`}>
                      {!isClosed && date >= today && (
                        <button type="button" aria-label={`在 ${date} ${time} 新增`} onClick={() => openComposer(date, time)} className="absolute inset-0 z-0 size-full text-transparent hover:bg-brand-soft/40">新增</button>
                      )}
                      <div
                        className="pointer-events-none absolute inset-0 z-10 grid gap-px"
                        style={{ gridTemplateColumns: `repeat(${Math.max(cellBookings.length, 1)}, minmax(0, 1fr))` }}
                      >
                        {cellBookings.map((booking) => <span key={booking.id} className="pointer-events-auto min-w-0"><BookingChip booking={booking} fillCell /></span>)}
                      </div>
                    </div>
                  )
                }),
              ]
            })}
          </div>
        </div>
      )}

      {bookings.length === 0 && timeOff.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="text-sm font-semibold text-ink">這段時間還沒有課堂或待處理查詢。</p>
          <p className="mt-1 text-xs text-ink-muted">點日曆空白位置可以代學生新增課堂或設定休假。</p>
        </div>
      )}

      {composer !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="新增日曆項目">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-brand">{selectedDate} · {selectedTime}</p>
                <h2 className="mt-1 text-xl font-bold text-ink">新增日曆項目</h2>
              </div>
              <button type="button" onClick={() => setComposer('closed')} aria-label="關閉" className="grid size-10 place-items-center rounded-xl bg-canvas text-xl text-ink">×</button>
            </div>

            {composer === 'choose' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setComposer('booking')} className="rounded-2xl border border-line p-4 text-left hover:border-brand hover:bg-brand-soft">
                  <strong className="text-sm text-ink">代學生新增課堂</strong>
                  <span className="mt-1 block text-xs leading-5 text-ink-muted">直接建立一節已確認的 60 分鐘課堂。</span>
                </button>
                <button type="button" onClick={() => setComposer('timeoff')} className="rounded-2xl border border-line p-4 text-left hover:border-brand hover:bg-brand-soft">
                  <strong className="text-sm text-ink">設為不開放／放假</strong>
                  <span className="mt-1 block text-xs leading-5 text-ink-muted">關閉一天或一段連續日期。</span>
                </button>
              </div>
            )}

            {composer === 'booking' && (
              bookingState?.success ? (
                <div className="flex flex-col gap-3"><Alert tone="success">{bookingState.success}</Alert><Button type="button" onClick={() => setComposer('closed')}>完成</Button></div>
              ) : (
                <form action={bookingAction} className="flex flex-col gap-4" noValidate>
                  {bookingState?.error && <Alert tone="error">{bookingState.error}</Alert>}
                  {students.length > 0 ? (
                    <Select label="學生" name="studentId" required defaultValue="" disabled={bookingPending}>
                      <option value="" disabled>選擇學生</option>
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.displayName} · {student.phone}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Alert tone="notice">
                      學生名冊暫時未有可選學生。請先到「學生」新增姓名及 WhatsApp 號碼。
                    </Alert>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="日期" name="date" type="date" min={today} required defaultValue={selectedDate} disabled={bookingPending} />
                    <Select label="開始時間" name="time" defaultValue={selectedTime} disabled={bookingPending}>
                      {ALL_HOURS.map((hour) => { const value = `${String(hour).padStart(2, '0')}:00`; return <option key={value} value={value}>{value}</option> })}
                    </Select>
                  </div>
                  {services.length > 0 ? (
                    <Select label="課堂" name="serviceId" disabled={bookingPending} hint="第一版所有課堂固定為 60 分鐘。">
                      {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                    </Select>
                  ) : (
                    <Alert tone="notice">請先到「服務」建立一項課堂。</Alert>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={bookingPending || services.length === 0 || students.length === 0}>{bookingPending ? '新增中…' : '新增已確認課堂'}</Button>
                    <Button type="button" variant="secondary" onClick={() => setComposer('choose')} disabled={bookingPending}>返回</Button>
                  </div>
                </form>
              )
            )}

            {composer === 'timeoff' && (
              timeOffState?.success ? (
                <div className="flex flex-col gap-3"><Alert tone="success">{timeOffState.success}</Alert><Button type="button" onClick={() => setComposer('closed')}>完成</Button></div>
              ) : (
                <form action={timeOffAction} className="flex flex-col gap-4" noValidate>
                  {timeOffState?.error && <Alert tone="error">{timeOffState.error}</Alert>}
                  {timeOffState?.warning && <Alert tone="notice">⚠ {timeOffState.warning}</Alert>}
                  {timeOffState?.requiresConfirmation && <input type="hidden" name="confirmExisting" value={timeOffState.confirmationKey} />}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="開始日期" name="startDate" type="date" min={today} required defaultValue={selectedDate} disabled={timeOffPending} />
                    <Field label="結束日期" name="endDate" type="date" min={today} required defaultValue={selectedDate} disabled={timeOffPending} />
                  </div>
                  <Field label="備註" name="note" maxLength={120} disabled={timeOffPending} hint="選填，例如旅行、私人安排" />
                  <p className="text-xs text-ink-muted">不開放會覆蓋該日的每週常規時間；已有的已確認課堂不會被取消。</p>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={timeOffPending}>{timeOffPending ? '儲存中…' : timeOffState?.requiresConfirmation ? '保留現有安排，仍然設為不開放' : '設為不開放'}</Button>
                    <Button type="button" variant="secondary" onClick={() => setComposer('choose')} disabled={timeOffPending}>返回</Button>
                  </div>
                </form>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
