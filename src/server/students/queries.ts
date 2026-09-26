import 'server-only'

import { and, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'

import { db } from '@/server/db'
import { bookingInquiries, services, students } from '@/server/db/schema'

export const STUDENTS_PAGE_SIZE = 20
export const HISTORY_PAGE_SIZE = 20

/** 日曆快速代約只需要輕量資料；封存或未有 WhatsApp 的學生不列入。 */
export async function listActiveStudentOptions(workspaceId: string) {
  return db
    .select({
      id: students.id,
      displayName: students.displayName,
      phone: students.phone,
    })
    .from(students)
    .where(
      and(
        eq(students.workspaceId, workspaceId),
        isNull(students.archivedAt),
        isNotNull(students.phone),
      ),
    )
    .orderBy(students.displayName)
}

export async function listStudents(workspaceId: string, options: { search?: string; page?: number; archived?: boolean } = {}) {
  const term = options.search?.trim()
  const page = Math.max(1, options.page ?? 1)
  const where = and(
    eq(students.workspaceId, workspaceId),
    options.archived ? isNotNull(students.archivedAt) : isNull(students.archivedAt),
    term ? or(ilike(students.displayName, `%${term}%`), ilike(students.phone, `%${term}%`)) : undefined,
  )
  const [[totalRow], rows] = await Promise.all([
    db.select({ value: count() }).from(students).where(where),
    db.select().from(students).where(where).orderBy(students.displayName).limit(STUDENTS_PAGE_SIZE).offset((page - 1) * STUDENTS_PAGE_SIZE),
  ])
  if (rows.length === 0) return { rows: [], total: totalRow?.value ?? 0, page, pages: Math.max(1, Math.ceil((totalRow?.value ?? 0) / STUDENTS_PAGE_SIZE)) }
  const bookings = await db.select({ studentId: bookingInquiries.studentId, status: bookingInquiries.status, startAt: bookingInquiries.startAt, endAt: bookingInquiries.endAt }).from(bookingInquiries).where(and(eq(bookingInquiries.workspaceId, workspaceId), inArray(bookingInquiries.studentId, rows.map((row) => row.id))))
  const now = new Date()
  return {
    rows: rows.map((student) => {
      const own = bookings.filter((booking) => booking.studentId === student.id)
      return { ...student, pendingCount: own.filter((b) => b.status === 'PENDING').length, upcomingConfirmedCount: own.filter((b) => b.status === 'CONFIRMED' && b.endAt > now).length, totalCount: own.length, nextClassAt: own.filter((b) => b.status === 'CONFIRMED' && b.endAt > now).map((b) => b.startAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null }
    }),
    total: totalRow?.value ?? 0,
    page,
    pages: Math.max(1, Math.ceil((totalRow?.value ?? 0) / STUDENTS_PAGE_SIZE)),
  }
}

const bookingSelect = { id: bookingInquiries.id, status: bookingInquiries.status, startAt: bookingInquiries.startAt, endAt: bookingInquiries.endAt, studentNote: bookingInquiries.studentNote, serviceName: services.name }
export async function getStudentDetail(workspaceId: string, studentId: string, historyPage = 1) {
  const [student] = await db.select().from(students).where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId))).limit(1)
  if (!student) return null
  const now = new Date()
  const base = and(eq(bookingInquiries.workspaceId, workspaceId), eq(bookingInquiries.studentId, studentId))
  const activeWhere = and(base, gt(bookingInquiries.endAt, now), or(eq(bookingInquiries.status, 'PENDING'), eq(bookingInquiries.status, 'CONFIRMED')))
  const historyWhere = and(base, or(lte(bookingInquiries.endAt, now), and(isNotNull(bookingInquiries.status), or(eq(bookingInquiries.status, 'REJECTED'), eq(bookingInquiries.status, 'REJECTED_CONFLICT'), eq(bookingInquiries.status, 'EXPIRED'), eq(bookingInquiries.status, 'CANCELLED')))))
  const [active, history, [historyCount], [totalCount], [pendingCount], [futureCount]] = await Promise.all([
    db.select(bookingSelect).from(bookingInquiries).innerJoin(services, and(eq(services.id, bookingInquiries.serviceId), eq(services.workspaceId, workspaceId))).where(activeWhere).orderBy(bookingInquiries.startAt),
    db.select(bookingSelect).from(bookingInquiries).innerJoin(services, and(eq(services.id, bookingInquiries.serviceId), eq(services.workspaceId, workspaceId))).where(historyWhere).orderBy(desc(bookingInquiries.startAt)).limit(HISTORY_PAGE_SIZE).offset((Math.max(1, historyPage) - 1) * HISTORY_PAGE_SIZE),
    db.select({ value: count() }).from(bookingInquiries).where(historyWhere),
    db.select({ value: count() }).from(bookingInquiries).where(base),
    db.select({ value: count() }).from(bookingInquiries).where(and(base, eq(bookingInquiries.status, 'PENDING'))),
    db.select({ value: count() }).from(bookingInquiries).where(and(base, eq(bookingInquiries.status, 'CONFIRMED'), gt(bookingInquiries.endAt, now))),
  ])
  return { student, active, history, counts: { total: totalCount?.value ?? 0, pending: pendingCount?.value ?? 0, future: futureCount?.value ?? 0 }, historyPage: Math.max(1, historyPage), historyPages: Math.max(1, Math.ceil((historyCount?.value ?? 0) / HISTORY_PAGE_SIZE)) }
}
