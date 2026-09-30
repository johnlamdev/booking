import 'server-only'

import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'

import { generateStatusToken, hashStatusToken } from '@/lib/token'
import { db } from '@/server/db'
import { bookingInquiries, inquiryStatusEvents, rescheduleProposals, services, workspaces } from '@/server/db/schema'
import { getAvailableSlots, getWorkspacePreviewProfile } from '@/server/public/queries'

type Result = { ok: true; token?: string; conflictCount?: number } | { ok: false; error: string }

function pgCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } }
  return value.code ?? value.cause?.code
}

/** 兩方提出改期時，原課堂維持 CONFIRMED；只有另一方接受才更改時間。 */
export async function proposeReschedule(params: {
  workspaceId: string
  bookingId: string
  proposedStartAt: Date
  initiatedBy: 'STUDENT' | 'INSTRUCTOR'
}): Promise<Result> {
  const { workspaceId, bookingId, proposedStartAt, initiatedBy } = params
  if (Number.isNaN(proposedStartAt.getTime()) || proposedStartAt <= new Date()) {
    return { ok: false, error: '請選擇尚未開始的時間。' }
  }

  const [booking] = await db.select({
    id: bookingInquiries.id,
    status: bookingInquiries.status,
    startAt: bookingInquiries.startAt,
    endAt: bookingInquiries.endAt,
  }).from(bookingInquiries).where(and(
    eq(bookingInquiries.id, bookingId), eq(bookingInquiries.workspaceId, workspaceId),
  )).limit(1)
  if (!booking || booking.status !== 'CONFIRMED' || booking.startAt <= new Date()) {
    return { ok: false, error: '這筆預約已無法改期。' }
  }
  if (booking.startAt.getTime() === proposedStartAt.getTime()) {
    return { ok: false, error: '新時間與原本相同。' }
  }

  const profile = await getWorkspacePreviewProfile(workspaceId)
  if (!profile) return { ok: false, error: '找不到課堂資料。' }
  const durationMinutes = (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000

  const slots = await getAvailableSlots({ profile, durationMinutes, excludeBookingId: bookingId })
  if (!slots.some((slot) => slot.startAt.getTime() === proposedStartAt.getTime())) {
    return { ok: false, error: '這個時間已不能預約，請重新選擇。' }
  }

  const token = generateStatusToken()
  const proposedEndAt = new Date(proposedStartAt.getTime() + durationMinutes * 60_000)
  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: bookingInquiries.status, startAt: bookingInquiries.startAt, endAt: bookingInquiries.endAt })
        .from(bookingInquiries).where(and(
          eq(bookingInquiries.id, bookingId), eq(bookingInquiries.workspaceId, workspaceId),
        )).for('update').limit(1)
      if (!locked || locked.status !== 'CONFIRMED' || locked.startAt <= new Date() || locked.startAt.getTime() !== booking.startAt.getTime() || locked.endAt.getTime() !== booking.endAt.getTime()) {
        return { ok: false as const, error: '這筆預約已無法改期。' }
      }

      await tx.insert(rescheduleProposals).values({
        bookingInquiryId: bookingId,
        proposedStartAt,
        proposedEndAt,
        initiatedBy,
        responseTokenHash: hashStatusToken(token),
      })
      return { ok: true as const, token }
    })
  } catch (error) {
    if (pgCode(error) === '23505') return { ok: false, error: '這堂課已有待回覆的改期提案。' }
    throw error
  }
}

/** 接受改期時資料庫 exclusion constraint 保證不會撞上另一堂已確認課。 */
export async function acceptReschedule(params: {
  proposalId: string
  actorType: 'STUDENT' | 'USER'
  actorUserId?: string
}): Promise<Result> {
  const { proposalId, actorType, actorUserId } = params
  const [candidate] = await db.select({
    workspaceId: bookingInquiries.workspaceId,
    bookingId: bookingInquiries.id,
    proposedStartAt: rescheduleProposals.proposedStartAt,
    originalStartAt: bookingInquiries.startAt,
    originalEndAt: bookingInquiries.endAt,
  }).from(rescheduleProposals)
    .innerJoin(bookingInquiries, eq(bookingInquiries.id, rescheduleProposals.bookingInquiryId))
    .where(eq(rescheduleProposals.id, proposalId)).limit(1)
  if (!candidate) return { ok: false, error: '找不到這項改期。' }
  const profile = await getWorkspacePreviewProfile(candidate.workspaceId)
  if (!profile) return { ok: false, error: '找不到課堂資料。' }
  const durationMinutes = (candidate.originalEndAt.getTime() - candidate.originalStartAt.getTime()) / 60_000
  const slots = await getAvailableSlots({ profile, durationMinutes, excludeBookingId: candidate.bookingId })
  if (!slots.some((slot) => slot.startAt.getTime() === candidate.proposedStartAt.getTime())) {
    return { ok: false, error: '新時段已不能預約，請重新提出。' }
  }
  try {
    return await db.transaction(async (tx) => {
      // 與 confirmInquiry 採用同一把 instructor 鎖、同一取得順序，
      // 避免改期與確認另一筆重疊查詢時互相等待。
      const [target] = await tx.select({ instructorId: bookingInquiries.instructorId })
        .from(rescheduleProposals)
        .innerJoin(bookingInquiries, eq(bookingInquiries.id, rescheduleProposals.bookingInquiryId))
        .where(eq(rescheduleProposals.id, proposalId)).limit(1)
      if (!target) return { ok: false as const, error: '找不到這項改期。' }
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${target.instructorId}, 0))`)

      const [proposal] = await tx.select().from(rescheduleProposals)
        .where(eq(rescheduleProposals.id, proposalId)).for('update').limit(1)
      if (!proposal || proposal.status !== 'PENDING') return { ok: false as const, error: '這項改期已處理。' }
      if (proposal.proposedStartAt <= new Date()) return { ok: false as const, error: '建議時間已過，請重新提出。' }

      const [booking] = await tx.select().from(bookingInquiries)
        .where(eq(bookingInquiries.id, proposal.bookingInquiryId)).for('update').limit(1)
      if (!booking || booking.status !== 'CONFIRMED' || booking.startAt <= new Date()) {
        return { ok: false as const, error: '原本的預約已無法改期。' }
      }

      await tx.update(bookingInquiries).set({
        startAt: proposal.proposedStartAt,
        endAt: proposal.proposedEndAt,
      }).where(eq(bookingInquiries.id, booking.id))
      await tx.update(rescheduleProposals).set({ status: 'ACCEPTED', resolvedAt: new Date() })
        .where(eq(rescheduleProposals.id, proposal.id))
      await tx.insert(inquiryStatusEvents).values({
        bookingInquiryId: booking.id,
        fromStatus: 'CONFIRMED', toStatus: 'CONFIRMED', actorType, actorUserId,
        reason: `改期至 ${proposal.proposedStartAt.toISOString()}`,
      })

      const conflicts = await tx.update(bookingInquiries)
        .set({ status: 'REJECTED_CONFLICT', decidedAt: new Date() })
        .where(and(
          eq(bookingInquiries.instructorId, booking.instructorId),
          eq(bookingInquiries.status, 'PENDING'),
          ne(bookingInquiries.id, booking.id),
          sql`tstzrange(${bookingInquiries.startAt}, ${bookingInquiries.endAt}, '[)') && tstzrange(${proposal.proposedStartAt.toISOString()}::timestamptz, ${proposal.proposedEndAt.toISOString()}::timestamptz, '[)')`,
        )).returning({ id: bookingInquiries.id })
      if (conflicts.length) await tx.insert(inquiryStatusEvents).values(conflicts.map((item) => ({
        bookingInquiryId: item.id,
        fromStatus: 'PENDING' as const,
        toStatus: 'REJECTED_CONFLICT' as const,
        actorType: 'SYSTEM' as const,
      })))

      return { ok: true as const, conflictCount: conflicts.length }
    })
  } catch (error) {
    if (pgCode(error) === '23P01') return { ok: false, error: '新時段已有其他課堂，請重新選擇。' }
    throw error
  }
}

export async function declineReschedule(proposalId: string): Promise<Result> {
  const [row] = await db.update(rescheduleProposals)
    .set({ status: 'DECLINED', resolvedAt: new Date() })
    .where(and(eq(rescheduleProposals.id, proposalId), eq(rescheduleProposals.status, 'PENDING')))
    .returning({ id: rescheduleProposals.id })
  return row ? { ok: true } : { ok: false, error: '這項改期已處理。' }
}

export async function getRescheduleByToken(token: string) {
  if (!token) return null
  const [row] = await db.select({
    id: rescheduleProposals.id,
    status: rescheduleProposals.status,
    initiatedBy: rescheduleProposals.initiatedBy,
    proposedStartAt: rescheduleProposals.proposedStartAt,
    proposedEndAt: rescheduleProposals.proposedEndAt,
    originalStartAt: bookingInquiries.startAt,
    originalEndAt: bookingInquiries.endAt,
    bookingStatus: bookingInquiries.status,
    serviceName: services.name,
    timezone: workspaces.timezone,
  }).from(rescheduleProposals)
    .innerJoin(bookingInquiries, eq(bookingInquiries.id, rescheduleProposals.bookingInquiryId))
    .innerJoin(services, eq(services.id, bookingInquiries.serviceId))
    .innerJoin(workspaces, eq(workspaces.id, bookingInquiries.workspaceId))
    .where(eq(rescheduleProposals.responseTokenHash, hashStatusToken(token)))
    .limit(1)
  return row ?? null
}

export async function getPendingRescheduleForBooking(bookingId: string) {
  const [row] = await db.select().from(rescheduleProposals).where(and(
    eq(rescheduleProposals.bookingInquiryId, bookingId),
    eq(rescheduleProposals.status, 'PENDING'),
  )).orderBy(desc(rescheduleProposals.createdAt)).limit(1)
  return row ?? null
}

export async function listPendingReschedulesForBookings(bookingIds: string[]) {
  if (bookingIds.length === 0) return []
  return db.select().from(rescheduleProposals).where(and(
    inArray(rescheduleProposals.bookingInquiryId, bookingIds),
    eq(rescheduleProposals.status, 'PENDING'),
  ))
}
