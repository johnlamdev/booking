import 'server-only'

import { sql } from 'drizzle-orm'

import { addDays } from '@/lib/availability'
import {
  buildDashboardDaySummaries,
  type DashboardDaySummary,
} from '@/lib/dashboard-summary'
import { zonedWallClockToUtc } from '@/lib/time'
import { db } from '@/server/db'
import {
  availabilityExceptions,
  availabilityRules,
  bookingInquiries,
  services,
} from '@/server/db/schema'

type OverviewRule = {
  weekday: number
  startTime: string
  endTime: string
}

type OverviewException = {
  date: string
  isClosed: boolean
  startTime: string | null
  endTime: string | null
}

type OverviewBooking = {
  status: 'PENDING' | 'CONFIRMED'
  startAt: string
  endAt: string
}

type OverviewRow = {
  active_service_count: number
  pending_count: number
  rules: OverviewRule[]
  exceptions: OverviewException[]
  bookings: OverviewBooking[]
}

export type DashboardOverview = {
  activeServiceCount: number
  openWeekdays: number
  pendingCount: number
  daySummaries: DashboardDaySummary[]
}

/**
 * 一次取得「今日」頁所需資料。
 *
 * 舊流程由頁面及日摘要函式合共發出六個 SQL query。即使 query 本身很快，
 * serverless function 每次往返 Supabase 的延遲仍會累積；正式環境雖已與
 * Supabase 同置於 syd1，往返成本依然存在。
 * 此查詢以獨立子查詢保留原有語意，但只經過一次 database round-trip。
 */
export async function getDashboardOverview(params: {
  workspaceId: string
  instructorId: string
  timeZone: string
  fromDate: string
  days?: number
  slotIntervalMinutes: number
  minNoticeMinutes: number
}): Promise<DashboardOverview> {
  const days = params.days ?? 7
  const rangeStart = zonedWallClockToUtc(params.fromDate, '00:00', params.timeZone)
  const rangeEnd = zonedWallClockToUtc(addDays(params.fromDate, days), '00:00', params.timeZone)
  // Serverless bundle 內的 postgres driver 不接受 Date 作 raw SQL
  // parameter；使用 ISO 字串並明確 cast，亦可避免依賴連線時區解析。
  const rangeStartIso = rangeStart.toISOString()
  const rangeEndIso = rangeEnd.toISOString()

  const rows = await db.execute(sql<OverviewRow>`
    select
      (
        select count(*)::int
        from ${services} s
        where s.workspace_id = ${params.workspaceId}
          and s.status = 'ACTIVE'
      ) as active_service_count,
      (
        select count(*)::int
        from ${bookingInquiries} pending
        where pending.workspace_id = ${params.workspaceId}
          and pending.status = 'PENDING'
          and pending.start_at > now()
      ) as pending_count,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'weekday', rule.weekday,
            'startTime', to_char(rule.start_time, 'HH24:MI'),
            'endTime', to_char(rule.end_time, 'HH24:MI')
          )
          order by rule.weekday, rule.start_time
        )
        from ${availabilityRules} rule
        where rule.instructor_id = ${params.instructorId}
      ), '[]'::jsonb) as rules,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'date', to_char(exception.date, 'YYYY-MM-DD'),
            'isClosed', exception.is_closed,
            'startTime', case
              when exception.start_time is null then null
              else to_char(exception.start_time, 'HH24:MI')
            end,
            'endTime', case
              when exception.end_time is null then null
              else to_char(exception.end_time, 'HH24:MI')
            end
          )
          order by exception.date
        )
        from ${availabilityExceptions} exception
        where exception.instructor_id = ${params.instructorId}
          and exception.date between ${params.fromDate}::date and ${addDays(params.fromDate, days - 1)}::date
      ), '[]'::jsonb) as exceptions,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'status', booking.status,
            'startAt', booking.start_at,
            'endAt', booking.end_at
          )
          order by booking.start_at
        )
        from ${bookingInquiries} booking
        where booking.workspace_id = ${params.workspaceId}
          and booking.status in ('PENDING', 'CONFIRMED')
          and booking.start_at >= ${rangeStartIso}::timestamptz
          and booking.start_at < ${rangeEndIso}::timestamptz
      ), '[]'::jsonb) as bookings
  `)

  const row = rows[0]
  if (!row) throw new Error('無法取得 dashboard overview')

  const rules = Array.isArray(row.rules) ? row.rules : []
  const exceptions = Array.isArray(row.exceptions) ? row.exceptions : []
  const bookings = Array.isArray(row.bookings) ? row.bookings : []

  return {
    activeServiceCount: Number(row.active_service_count),
    openWeekdays: new Set(rules.map((rule) => rule.weekday)).size,
    pendingCount: Number(row.pending_count),
    daySummaries: buildDashboardDaySummaries({
      fromDate: params.fromDate,
      days,
      timeZone: params.timeZone,
      rules,
      exceptions,
      bookings: bookings.map((booking) => ({
        status: booking.status,
        startAt: new Date(booking.startAt),
        endAt: new Date(booking.endAt),
      })),
      durationMinutes: 60,
      slotIntervalMinutes: params.slotIntervalMinutes,
      minNoticeMinutes: params.minNoticeMinutes,
      now: new Date(),
    }),
  }
}
