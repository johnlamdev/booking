import type { Metadata } from 'next'

import { ScheduleCalendar } from '@/components/schedule-calendar'
import { calendarRange, type CalendarView } from '@/lib/calendar'
import { isValidDateString } from '@/lib/time'
import { listWeeklyRules } from '@/server/availability/queries'
import { listCalendarItems } from '@/server/calendar/queries'
import { listActiveServices } from '@/server/services/queries'
import { listActiveStudentOptions } from '@/server/students/queries'
import { requireWorkspaceContext } from '@/server/workspace/context'

export const metadata: Metadata = { title: '日曆' }

function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireWorkspaceContext()
  const query = await searchParams
  const today = todayInZone(ctx.timezone)
  const requestedView = typeof query.view === 'string' ? query.view : 'week'
  const view: CalendarView = ['day', 'week', 'month'].includes(requestedView)
    ? (requestedView as CalendarView)
    : 'week'
  const requestedDate = typeof query.date === 'string' ? query.date : today
  const focusDate = isValidDateString(requestedDate) ? requestedDate : today
  const { startDate, endDate } = calendarRange(focusDate, view)

  const [{ bookings, timeOff }, services, weeklyRules, students] = await Promise.all([
    listCalendarItems({
      workspaceId: ctx.workspaceId,
      instructorId: ctx.instructorProfileId,
      timeZone: ctx.timezone,
      startDate,
      endDate,
    }),
    listActiveServices(ctx.workspaceId),
    listWeeklyRules(ctx.instructorProfileId),
    listActiveStudentOptions(ctx.workspaceId),
  ])

  return (
    <ScheduleCalendar
      view={view}
      focusDate={focusDate}
      today={today}
      startDate={startDate}
      endDate={endDate}
      bookings={bookings}
      timeOff={timeOff}
      weeklyRules={weeklyRules.map((rule) => ({
        weekday: rule.weekday,
        startTime: rule.startTime,
        endTime: rule.endTime,
      }))}
      services={services.map((service) => ({ id: service.id, name: service.name }))}
      students={students.map((student) => ({
        id: student.id,
        displayName: student.displayName,
        phone: student.phone!,
      }))}
      timezoneLabel={ctx.timezone === 'Asia/Hong_Kong' ? '香港時間' : ctx.timezone}
    />
  )
}
