import 'server-only'

import { and, eq, ne, sql } from 'drizzle-orm'
import { formatInTimeZone } from 'date-fns-tz'

import { db } from '@/server/db'
import { availabilityExceptions, bookingInquiries, inquiryStatusEvents, workspaces } from '@/server/db/schema'

/**
 * 確認 / 拒絕查詢的核心邏輯。
 *
 * 刻意與 Server Action 分開：這裡不碰 auth，因此整合測試可以直接呼叫，
 * 驗證併發行為而毋須模擬登入。授權由呼叫端（actions）負責。
 */

export type DecisionResult = { ok: true; conflictCount: number } | { ok: false; error: string }

/** Postgres exclusion_violation：同一老師已有時間重疊的已確認預約。 */
const EXCLUSION_VIOLATION = '23P01'

function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } }
  return e.code ?? e.cause?.code
}

/**
 * 確認一筆查詢。
 *
 * 正確性由三層共同保證（規格 §11.1、§11.5、docs/DESIGN.md §4.3）：
 *
 * 1. `FOR UPDATE` 鎖住該筆查詢，序列化對同一筆的重複操作。
 * 2. UPDATE 帶 `status = 'PENDING'` 條件——已離開 PENDING 者不會被再次處理。
 * 3. `booking_inquiries_no_confirmed_overlap` exclusion constraint 是真正的
 *    序列化點：兩個併發確認落在重疊時間時，資料庫只讓一個成功，
 *    另一個收到 23P01。**這一層才是併發下的最終防線。**
 */
export async function confirmInquiry(params: {
  workspaceId: string
  userId: string
  inquiryId: string
  now?: Date
}): Promise<DecisionResult> {
  const { workspaceId, userId, inquiryId } = params
  const now = params.now ?? new Date()

  try {
    return await db.transaction(async (tx) => {
      /*
       * 先以 instructor 為鍵取 advisory lock，令同一位老師的確認操作排隊。
       *
       * 沒有這道鎖會 deadlock：交易 A 鎖住查詢 A 後要更新同時段的 B，
       * 交易 B 鎖住 B 後要更新 A，兩者互相等待。先取一把共同的鎖，
       * 鎖的取得順序就固定了。
       *
       * 用 xact 版本（交易結束自動釋放），在 transaction pooler 下仍安全。
       * instructor_id 不會變動，所以這次先行讀取即使不加鎖也安全。
       */
      const [target] = await tx
        .select({ instructorId: bookingInquiries.instructorId, timezone: workspaces.timezone })
        .from(bookingInquiries)
        .innerJoin(workspaces, eq(workspaces.id, bookingInquiries.workspaceId))
        .where(
          and(
            eq(bookingInquiries.id, inquiryId),
            // 一併以 workspaceId 限定，無法處理別人 workspace 的查詢
            eq(bookingInquiries.workspaceId, workspaceId),
          ),
        )
        .limit(1)

      if (!target) return { ok: false as const, error: '找不到指定的查詢' }

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${target.instructorId}, 0))`,
      )

      const [inquiry] = await tx
        .select({
          id: bookingInquiries.id,
          status: bookingInquiries.status,
          startAt: bookingInquiries.startAt,
          endAt: bookingInquiries.endAt,
          instructorId: bookingInquiries.instructorId,
        })
        .from(bookingInquiries)
        .where(
          and(
            eq(bookingInquiries.id, inquiryId),
            eq(bookingInquiries.workspaceId, workspaceId),
          ),
        )
        .for('update')
        .limit(1)

      if (!inquiry) return { ok: false as const, error: '找不到指定的查詢' }

      if (inquiry.status !== 'PENDING') {
        return { ok: false as const, error: '這筆查詢已經處理過了。' }
      }

      if (inquiry.startAt <= now) {
        return { ok: false as const, error: '這個時段已經開始或已過去，無法再確認。' }
      }

      const localDate = formatInTimeZone(inquiry.startAt, target.timezone, 'yyyy-MM-dd')
      const [closedDay] = await tx
        .select({ id: availabilityExceptions.id })
        .from(availabilityExceptions)
        .where(
          and(
            eq(availabilityExceptions.workspaceId, workspaceId),
            eq(availabilityExceptions.instructorId, inquiry.instructorId),
            eq(availabilityExceptions.date, localDate),
            eq(availabilityExceptions.isClosed, true),
          ),
        )
        .limit(1)

      if (closedDay) {
        return { ok: false as const, error: '這一天已設為不開放，不能確認查詢。請拒絕或回覆學生另選時間。' }
      }

      const updated = await tx
        .update(bookingInquiries)
        .set({ status: 'CONFIRMED', decidedAt: now, decidedByUserId: userId })
        .where(and(eq(bookingInquiries.id, inquiry.id), eq(bookingInquiries.status, 'PENDING')))
        .returning({ id: bookingInquiries.id })

      if (updated.length === 0) {
        return { ok: false as const, error: '這筆查詢已經處理過了。' }
      }

      await tx.insert(inquiryStatusEvents).values({
        bookingInquiryId: inquiry.id,
        fromStatus: 'PENDING',
        toStatus: 'CONFIRMED',
        actorType: 'USER',
        actorUserId: userId,
      })

      // 同一老師、時間重疊的其餘待確認查詢自動拒絕（規格 §7.2.9）
      const conflicts = await tx
        .update(bookingInquiries)
        .set({ status: 'REJECTED_CONFLICT', decidedAt: now })
        .where(
          and(
            eq(bookingInquiries.instructorId, inquiry.instructorId),
            eq(bookingInquiries.status, 'PENDING'),
            ne(bookingInquiries.id, inquiry.id),
            // 在原始 SQL 片段中必須傳字串：postgres.js 不會在此位置轉換 Date
            sql`tstzrange(${bookingInquiries.startAt}, ${bookingInquiries.endAt}, '[)')
                && tstzrange(${inquiry.startAt.toISOString()}::timestamptz, ${inquiry.endAt.toISOString()}::timestamptz, '[)')`,
          ),
        )
        .returning({ id: bookingInquiries.id })

      if (conflicts.length > 0) {
        await tx.insert(inquiryStatusEvents).values(
          conflicts.map((c) => ({
            bookingInquiryId: c.id,
            fromStatus: 'PENDING' as const,
            toStatus: 'REJECTED_CONFLICT' as const,
            actorType: 'SYSTEM' as const,
          })),
        )
      }

      return { ok: true as const, conflictCount: conflicts.length }
    })
  } catch (error) {
    if (pgCode(error) === EXCLUSION_VIOLATION) {
      return { ok: false, error: '這個時段已經有另一筆已確認的預約，無法重複確認。' }
    }
    throw error
  }
}

/** 主動拒絕。狀態轉換為條件式，非 PENDING 者不受影響（規格 §11.5）。 */
export async function rejectInquiry(params: {
  workspaceId: string
  userId: string
  inquiryId: string
  reason: string | null
}): Promise<DecisionResult> {
  const { workspaceId, userId, inquiryId, reason } = params

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(bookingInquiries)
      .set({
        status: 'REJECTED',
        rejectionReason: reason,
        decidedAt: new Date(),
        decidedByUserId: userId,
      })
      .where(
        and(
          eq(bookingInquiries.id, inquiryId),
          eq(bookingInquiries.workspaceId, workspaceId),
          eq(bookingInquiries.status, 'PENDING'),
        ),
      )
      .returning({ id: bookingInquiries.id })

    if (updated.length === 0) {
      return { ok: false as const, error: '這筆查詢已經處理過了，或找不到該筆查詢。' }
    }

    await tx.insert(inquiryStatusEvents).values({
      bookingInquiryId: inquiryId,
      fromStatus: 'PENDING',
      toStatus: 'REJECTED',
      actorType: 'USER',
      actorUserId: userId,
      reason,
    })

    return { ok: true as const, conflictCount: 0 }
  })
}

/**
 * 老師取消一筆已確認預約。
 *
 * 狀態離開 CONFIRMED 後，資料庫的 partial exclusion constraint 不再包含這筆紀錄，
 * 因此原本的時間會立即重新開放。保留原本確認資料及另寫取消欄位，方便追蹤歷史。
 */
export async function cancelConfirmedInquiry(params: {
  workspaceId: string
  userId: string
  inquiryId: string
  reason: string | null
}): Promise<DecisionResult> {
  const { workspaceId, userId, inquiryId, reason } = params
  const now = new Date()

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(bookingInquiries)
      .set({
        status: 'CANCELLED',
        cancellationReason: reason,
        cancelledAt: now,
        cancelledByUserId: userId,
      })
      .where(
        and(
          eq(bookingInquiries.id, inquiryId),
          eq(bookingInquiries.workspaceId, workspaceId),
          eq(bookingInquiries.status, 'CONFIRMED'),
        ),
      )
      .returning({ id: bookingInquiries.id })

    if (updated.length === 0) {
      return { ok: false as const, error: '這筆預約已經取消、尚未確認，或找不到該筆預約。' }
    }

    await tx.insert(inquiryStatusEvents).values({
      bookingInquiryId: inquiryId,
      fromStatus: 'CONFIRMED',
      toStatus: 'CANCELLED',
      actorType: 'USER',
      actorUserId: userId,
      reason,
    })

    return { ok: true as const, conflictCount: 0 }
  })
}
