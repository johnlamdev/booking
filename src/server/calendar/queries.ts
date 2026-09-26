import 'server-only'

import { and, asc, between, eq, gt, gte, inArray, lt } from 'drizzle-orm'

import { addDays } from '@/lib/availability'
import {
  buildDashboardDaySummaries,
  type DashboardDaySummary,
} from '@/lib/dashboard-summary'
import { formatInZone, zonedWallClockToUtc } from '@/lib/time'
import { db } from '@/server/db'
import {
  availabilityExceptions,
  availabilityRules,
  bookingInquiries,
  services,
} from '@/server/db/schema'

export type CalendarBooking = {
  id: string
  date: string
  startTime: string
  endTime: string
  status: 'PENDING' | 'CONFIRMED'
  source: 'STUDENT' | 'INSTRUCTOR'
  studentName: string
  serviceName: string
  sameTimePendingCount: number
  overlappingPendingCount: number
  hasConfirmedConflict: boolean
}

export type CalendarTimeOff = {
  id: string
  date: string
  note: string | null
}

export async function listDashboardDaySummaries(params: {
  workspaceId: string
  instructorId: string
  timeZone: string
  fromDate: string
  days?: number
  slotIntervalMinutes: number
  minNoticeMinutes: number
}): Promise<DashboardDaySummary[]> {
  const days = params.days ?? 7
  const rangeStart = zonedWallClockToUtc(params.fromDate, '00:00', params.timeZone)
  const rangeEnd = zonedWallClockToUtc(addDays(params.fromDate, days), '00:00', params.timeZone)

  const [rules, exceptions, bookings] = await Promise.all([
    db
      .select({
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
      })
      .from(availabilityRules)
      .where(eq(availabilityRules.instructorId, params.instructorId)),
    db
      .select({
        date: availabilityExceptions.date,
        isClosed: availabilityExceptions.isClosed,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
      })
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.instructorId, params.instructorId),
          between(
            availabilityExceptions.date,
            params.fromDate,
            addDays(params.fromDate, days - 1),
          ),
        ),
      ),
    db
      .select({
        status: bookingInquiries.status,
        startAt: bookingInquiries.startAt,
        endAt: bookingInquiries.endAt,
      })
      .from(bookingInquiries)
      .where(
        and(
          eq(bookingInquiries.workspaceId, params.workspaceId),
          inArray(bookingInquiries.status, ['PENDING', 'CONFIRMED']),
          gte(bookingInquiries.startAt, rangeStart),
          lt(bookingInquiries.startAt, rangeEnd),
        ),
      ),
  ])

  return buildDashboardDaySummaries({
    fromDate: params.fromDate,
    days,
    timeZone: params.timeZone,
    rules,
    exceptions,
    bookings: bookings.map((booking) => ({
      ...booking,
      status: booking.status as 'PENDING' | 'CONFIRMED',
    })),
    durationMinutes: 60,
    slotIntervalMinutes: params.slotIntervalMinutes,
    minNoticeMinutes: params.minNoticeMinutes,
    now: new Date(),
  })
}

export async function listCalendarItems(params: {
  workspaceId: string
  instructorId: string
  timeZone: string
  startDate: string
  endDate: string
}): Promise<{ bookings: CalendarBooking[]; timeOff: CalendarTimeOff[] }> {
  const { workspaceId, instructorId, timeZone, startDate, endDate } = params
  const rangeStart = zonedWallClockToUtc(startDate, '00:00', timeZone)
  const rangeEnd = zonedWallClockToUtc(addDays(endDate, 1), '00:00', timeZone)

  const [bookings, timeOff] = await Promise.all([
    db
      .select({
        id: bookingInquiries.id,
        startAt: bookingInquiries.startAt,
        endAt: bookingInquiries.endAt,
        status: bookingInquiries.status,
        source: bookingInquiries.source,
        studentName: bookingInquiries.studentName,
        serviceName: services.name,
      })
      .from(bookingInquiries)
      .innerJoin(services, eq(services.id, bookingInquiries.serviceId))
      .where(
        and(
          eq(bookingInquiries.workspaceId, workspaceId),
          inArray(bookingInquiries.status, ['PENDING', 'CONFIRMED']),
          lt(bookingInquiries.startAt, rangeEnd),
          gt(bookingInquiries.endAt, rangeStart),
        ),
      )
      .orderBy(asc(bookingInquiries.startAt)),
    db
      .select({
        id: availabilityExceptions.id,
        date: availabilityExceptions.date,
        note: availabilityExceptions.note,
      })
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.instructorId, instructorId),
          eq(availabilityExceptions.isClosed, true),
          between(availabilityExceptions.date, startDate, endDate),
        ),
      )
      .orderBy(asc(availabilityExceptions.date)),
  ])

  const normalizedBookings = bookings.map((booking) => ({
      ...booking,
      status: booking.status as 'PENDING' | 'CONFIRMED',
      date: formatInZone(booking.startAt, timeZone, 'yyyy-MM-dd'),
      startTime: formatInZone(booking.startAt, timeZone, 'HH:mm'),
      endTime: formatInZone(booking.endAt, timeZone, 'HH:mm'),
  }))

  return {
    bookings: normalizedBookings.map((booking) => {
      if (booking.status !== 'PENDING') {
        return {
          ...booking,
          sameTimePendingCount: 0,
          overlappingPendingCount: 0,
          hasConfirmedConflict: false,
        }
      }

      const overlapping = normalizedBookings.filter(
        (other) =>
          other.id !== booking.id &&
          other.startAt < booking.endAt &&
          booking.startAt < other.endAt,
      )
      const overlappingPending = overlapping.filter((other) => other.status === 'PENDING')

      return {
        ...booking,
        sameTimePendingCount: overlappingPending.filter(
          (other) =>
            other.startAt.getTime() === booking.startAt.getTime() &&
            other.endAt.getTime() === booking.endAt.getTime(),
        ).length,
        overlappingPendingCount: overlappingPending.length,
        hasConfirmedConflict: overlapping.some((other) => other.status === 'CONFIRMED'),
      }
    }),
    timeOff,
  }
}
