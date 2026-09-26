import 'server-only'

import { and, asc, desc, eq, gt, lt, lte, or, sql } from 'drizzle-orm'

import { hashStatusToken } from '@/lib/token'
import { db } from '@/server/db'
import {
  bookingInquiries,
  inquiryStatusEvents,
  instructorProfiles,
  services,
  workspaces,
} from '@/server/db/schema'

export type InquiryStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'REJECTED_CONFLICT'
  | 'EXPIRED'
  | 'CANCELLED'

export type InboxItem = {
  id: string
  status: InquiryStatus
  startAt: Date
  endAt: Date
  serviceName: string
  durationMinutes: number
  studentName: string
  studentEmail: string | null
  studentPhone: string | null
  studentNote: string | null
  rejectionReason: string | null
  cancellationReason: string | null
  submittedAt: Date
  decidedAt: Date | null
  cancelledAt: Date | null
  /** 目標時間已過。顯示狀態由時間推導，不依賴排程（docs/DESIGN.md §3.5）。 */
  isPast: boolean
}

const INBOX_PAGE_SIZE = 50

/**
 * 老師的查詢收件匣。
 *
 * 預設先顯示待處理，按提交時間由舊至新（規格 §7.4.2）——先到先處理。
 * 已確認按上課時間排列，方便老師依日曆順序尋找；其他狀態以最近提交排前。
 */
export async function listInquiries(params: {
  workspaceId: string
  status?: InquiryStatus | 'ALL'
  inquiryId?: string
}): Promise<InboxItem[]> {
  const { workspaceId, status = 'PENDING', inquiryId } = params
  const now = new Date()

  const statusFilter =
    inquiryId || status === 'ALL'
      ? undefined
      : status === 'PENDING'
        ? and(eq(bookingInquiries.status, 'PENDING'), gt(bookingInquiries.startAt, now))
        : status === 'EXPIRED'
          ? or(
              eq(bookingInquiries.status, 'EXPIRED'),
              and(eq(bookingInquiries.status, 'PENDING'), lte(bookingInquiries.startAt, now)),
            )
          : eq(bookingInquiries.status, status)

  const rows = await db
    .select({
      id: bookingInquiries.id,
      status: bookingInquiries.status,
      startAt: bookingInquiries.startAt,
      endAt: bookingInquiries.endAt,
      serviceName: services.name,
      durationMinutes: services.durationMinutes,
      studentName: bookingInquiries.studentName,
      studentEmail: bookingInquiries.studentEmail,
      studentPhone: bookingInquiries.studentPhone,
      studentNote: bookingInquiries.studentNote,
      rejectionReason: bookingInquiries.rejectionReason,
      cancellationReason: bookingInquiries.cancellationReason,
      submittedAt: bookingInquiries.submittedAt,
      decidedAt: bookingInquiries.decidedAt,
      cancelledAt: bookingInquiries.cancelledAt,
    })
    .from(bookingInquiries)
    .innerJoin(services, eq(services.id, bookingInquiries.serviceId))
    .where(
      and(
        eq(bookingInquiries.workspaceId, workspaceId),
        inquiryId ? eq(bookingInquiries.id, inquiryId) : undefined,
        statusFilter,
      ),
    )
    .orderBy(
      status === 'PENDING'
        ? asc(bookingInquiries.submittedAt)
        : status === 'CONFIRMED'
          ? asc(bookingInquiries.startAt)
        : desc(bookingInquiries.submittedAt),
    )
    .limit(INBOX_PAGE_SIZE)

  const nowMs = now.getTime()
  return rows.map((row) => {
    const isPast = row.startAt.getTime() <= nowMs
    return {
      ...row,
      status: row.status === 'PENDING' && isPast ? ('EXPIRED' as const) : row.status,
      isPast,
    }
  })
}

export async function countPendingInquiries(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookingInquiries)
    .where(
      and(
        eq(bookingInquiries.workspaceId, workspaceId),
        eq(bookingInquiries.status, 'PENDING'),
        gt(bookingInquiries.startAt, new Date()),
      ),
    )

  return row?.count ?? 0
}

export type UpcomingAppointment = {
  id: string
  startAt: Date
  endAt: Date
  serviceName: string
  studentName: string
}

/** 老師首頁只需最近幾節已確認課堂，避免把完整收件匣搬到概覽。 */
export async function listUpcomingAppointments(
  workspaceId: string,
  limit = 3,
): Promise<UpcomingAppointment[]> {
  return db
    .select({
      id: bookingInquiries.id,
      startAt: bookingInquiries.startAt,
      endAt: bookingInquiries.endAt,
      serviceName: services.name,
      studentName: bookingInquiries.studentName,
    })
    .from(bookingInquiries)
    .innerJoin(services, eq(services.id, bookingInquiries.serviceId))
    .where(
      and(
        eq(bookingInquiries.workspaceId, workspaceId),
        eq(bookingInquiries.status, 'CONFIRMED'),
        gt(bookingInquiries.endAt, new Date()),
      ),
    )
    .orderBy(asc(bookingInquiries.startAt))
    .limit(limit)
}

export type StatusPageView = {
  status: InquiryStatus
  startAt: Date
  endAt: Date
  serviceName: string
  instructorName: string
  workspaceSlug: string
  timezone: string
  rejectionReason: string | null
  cancellationReason: string | null
  submittedAt: Date
  /** 遮罩後的聯絡方式，僅供學生確認自己填對了 */
  maskedContact: string
}

/** 只顯示足以辨認的部分，避免狀態頁成為個資外洩管道（規格 §8.8）。 */
function maskContact(email: string | null, phone: string | null): string {
  if (email) {
    const [local, domain] = email.split('@')
    const head = local!.slice(0, 2)
    return `${head}${'*'.repeat(Math.max(local!.length - 2, 1))}@${domain}`
  }

  if (phone) {
    return `${'*'.repeat(Math.max(phone.length - 3, 0))}${phone.slice(-3)}`
  }

  return ''
}

/**
 * 以明文 token 取得查詢狀態。
 *
 * token 只以 hash 儲存，故用 hash 索引。查無一律回傳 null，
 * 由呼叫端顯示一般化 404——不透露該查詢是否存在（規格 §8.8、§13.2）。
 */
export async function getInquiryByStatusToken(token: string): Promise<StatusPageView | null> {
  if (!token) return null

  const [row] = await db
    .select({
      status: bookingInquiries.status,
      startAt: bookingInquiries.startAt,
      endAt: bookingInquiries.endAt,
      serviceName: services.name,
      instructorName: instructorProfiles.displayName,
      workspaceSlug: workspaces.slug,
      timezone: workspaces.timezone,
      rejectionReason: bookingInquiries.rejectionReason,
      cancellationReason: bookingInquiries.cancellationReason,
      submittedAt: bookingInquiries.submittedAt,
      studentEmail: bookingInquiries.studentEmail,
      studentPhone: bookingInquiries.studentPhone,
    })
    .from(bookingInquiries)
    .innerJoin(services, eq(services.id, bookingInquiries.serviceId))
    .innerJoin(instructorProfiles, eq(instructorProfiles.id, bookingInquiries.instructorId))
    .innerJoin(workspaces, eq(workspaces.id, bookingInquiries.workspaceId))
    .where(eq(bookingInquiries.statusTokenHash, hashStatusToken(token)))
    .limit(1)

  if (!row) return null

  const { studentEmail, studentPhone, ...view } = row

  return {
    ...view,
    // 待確認但時間已過的，對學生顯示為已過期（實體狀態由排程補上）
    status: view.status === 'PENDING' && view.startAt <= new Date() ? 'EXPIRED' : view.status,
    maskedContact: maskContact(studentEmail, studentPhone),
  }
}

/**
 * 把已過期的待確認查詢實體化為 EXPIRED。
 *
 * 顯示層本來就由時間推導，所以此函式不執行也不影響正確性，
 * 只影響資料整潔度與 inbox 的篩選結果（docs/DESIGN.md §3.5）。
 */
export async function reconcileExpiredInquiries(): Promise<number> {
  const now = new Date()

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(bookingInquiries)
      .set({ status: 'EXPIRED', updatedAt: now })
      .where(and(eq(bookingInquiries.status, 'PENDING'), lt(bookingInquiries.startAt, now)))
      .returning({ id: bookingInquiries.id })

    if (updated.length > 0) {
      await tx.insert(inquiryStatusEvents).values(
        updated.map((inquiry) => ({
          bookingInquiryId: inquiry.id,
          fromStatus: 'PENDING' as const,
          toStatus: 'EXPIRED' as const,
          actorType: 'SYSTEM' as const,
        })),
      )
    }

    return updated.length
  })
}
