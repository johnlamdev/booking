import 'server-only'

import { and, asc, eq, gte } from 'drizzle-orm'

import type { DateException, WeeklyRule } from '@/lib/availability'
import { db } from '@/server/db'
import { availabilityExceptions, availabilityRules } from '@/server/db/schema'

/** 'HH:MM:SS' → 'HH:MM'。資料庫的 time 型別會帶秒，介面只需到分。 */
function trimSeconds(time: string): string {
  return time.slice(0, 5)
}

export type ScheduleRule = WeeklyRule & { id: string }
export type ScheduleException = DateException & { id: string; note: string | null }

export async function listWeeklyRules(instructorId: string): Promise<ScheduleRule[]> {
  const rows = await db
    .select({
      id: availabilityRules.id,
      weekday: availabilityRules.weekday,
      startTime: availabilityRules.startTime,
      endTime: availabilityRules.endTime,
    })
    .from(availabilityRules)
    .where(eq(availabilityRules.instructorId, instructorId))
    .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime))

  return rows.map((r) => ({
    ...r,
    startTime: trimSeconds(r.startTime),
    endTime: trimSeconds(r.endTime),
  }))
}

/**
 * 列出日期覆寫。
 *
 * 只回傳今天及之後的：過期的覆寫對推導已無影響，留在畫面上只會累積雜訊。
 * 資料本身不刪除。
 */
export async function listUpcomingExceptions(
  instructorId: string,
  todayInZone: string,
): Promise<ScheduleException[]> {
  const rows = await db
    .select({
      id: availabilityExceptions.id,
      date: availabilityExceptions.date,
      isClosed: availabilityExceptions.isClosed,
      startTime: availabilityExceptions.startTime,
      endTime: availabilityExceptions.endTime,
      note: availabilityExceptions.note,
    })
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.instructorId, instructorId),
        gte(availabilityExceptions.date, todayInZone),
      ),
    )
    .orderBy(asc(availabilityExceptions.date))

  return rows.map((r) => ({
    ...r,
    startTime: r.startTime ? trimSeconds(r.startTime) : null,
    endTime: r.endTime ? trimSeconds(r.endTime) : null,
  }))
}
